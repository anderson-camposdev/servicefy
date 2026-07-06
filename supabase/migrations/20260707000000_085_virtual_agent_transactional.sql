-- ServiceFY — Agente Virtual transacional: NLU por regras, confirmação e
-- transferência para humano.
--
-- Fecha a fundação da 079 (virtual_agent_actions/executions só tinham schema)
-- e corrige um vazamento de segurança real: as 4 tabelas legadas de chatbot
-- (migration 004) nunca tiveram RLS ativada.
--
-- Reutiliza: is_settings_admin/get_current_user_company_id/get_current_profile_id/
-- write_admin_audit (076); modelo de dados omnichannel — conversations/
-- channel_messages/external_identities (077) — via uma conexão sintética
-- provider='api' por tenant, em vez de inventar tabela de "sessão de chat".

-- ─── 1. Fix de segurança: RLS nas 4 tabelas legadas de chatbot ──────────────
ALTER TABLE public.chatbot_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_blocked_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chatbot_whitelist_admin ON public.chatbot_whitelist;
CREATE POLICY chatbot_whitelist_admin ON public.chatbot_whitelist FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));

DROP POLICY IF EXISTS chatbot_messages_admin ON public.chatbot_messages;
CREATE POLICY chatbot_messages_admin ON public.chatbot_messages FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));

DROP POLICY IF EXISTS chatbot_config_admin ON public.chatbot_config;
CREATE POLICY chatbot_config_admin ON public.chatbot_config FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));

-- chatbot_blocked_attempts não tem company_id (registro pode ser de remetente
-- desconhecido) — só sysadmin (auditoria de segurança cross-tenant) lê/escreve.
DROP POLICY IF EXISTS chatbot_blocked_sysadmin ON public.chatbot_blocked_attempts;
CREATE POLICY chatbot_blocked_sysadmin ON public.chatbot_blocked_attempts FOR ALL TO authenticated
  USING (public.get_current_user_role() = 'sysadmin') WITH CHECK (public.get_current_user_role() = 'sysadmin');

-- ─── 2. Amplia result_status para representar "aguardando confirmação" ──────
ALTER TABLE public.virtual_agent_executions
  DROP CONSTRAINT virtual_agent_executions_result_status_check;
ALTER TABLE public.virtual_agent_executions
  ADD CONSTRAINT virtual_agent_executions_result_status_check
  CHECK (result_status IN ('success','failed','transferred','blocked','pending'));

-- ─── 3. Leitura do catálogo de ações pelo usuário final ─────────────────────
-- Hoje só admin lê (migration 079); sem isso o widget não consegue nem saber
-- que ações existem. Escrita continua admin-only (agent_actions_admin).
DROP POLICY IF EXISTS virtual_agent_actions_tenant_read ON public.virtual_agent_actions;
CREATE POLICY virtual_agent_actions_tenant_read ON public.virtual_agent_actions FOR SELECT TO authenticated
  USING (
    enabled = true
    AND (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin())
  );

-- Execuções: o próprio dono da conversa também precisa ler/confirmar as suas
-- (hoje só admin lê — agent_executions_admin). Nova policy complementar.
DROP POLICY IF EXISTS virtual_agent_executions_owner_read ON public.virtual_agent_executions;
CREATE POLICY virtual_agent_executions_owner_read ON public.virtual_agent_executions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.external_identities ei
       WHERE ei.id = virtual_agent_executions.identity_id
         AND ei.profile_id = public.get_current_profile_id()
    )
  );

-- ─── 4. Helper: garante a conexão sintética do assistente por tenant ────────
-- SECURITY DEFINER: contorna a RLS admin-only de channel_connections/
-- virtual_agent_actions para o provisionamento idempotente — nunca exposta
-- diretamente ao cliente (sem GRANT a authenticated).
CREATE OR REPLACE FUNCTION public.ensure_virtual_agent_connection(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_id uuid;
BEGIN
  SELECT id INTO v_connection_id
    FROM public.channel_connections
   WHERE company_id = p_company_id AND provider = 'api' AND name = 'Assistente do Portal'
   LIMIT 1;

  IF v_connection_id IS NULL THEN
    INSERT INTO public.channel_connections(company_id, scope, provider, name, enabled, status)
    VALUES (p_company_id, 'tenant', 'api', 'Assistente do Portal', true, 'healthy')
    RETURNING id INTO v_connection_id;
  END IF;

  INSERT INTO public.virtual_agent_actions(company_id, action_key, name, enabled, requires_confirmation, min_confidence, config)
  VALUES
    (p_company_id, 'check_tickets', 'Consultar meus chamados', true, false, 0.150,
     jsonb_build_object('keywords', jsonb_build_array('chamado','chamados','ticket','status','andamento'))),
    (p_company_id, 'open_request', 'Abrir solicitação simples', true, true, 0.150,
     jsonb_build_object('keywords', jsonb_build_array('solicitar','solicitação','abrir','pedido','preciso de'))),
    (p_company_id, 'handoff_to_human', 'Transferir para atendente humano', true, false, 0.000,
     jsonb_build_object('keywords', jsonb_build_array('humano','atendente','pessoa','alguém','falar com')))
  ON CONFLICT (company_id, service_domain_id, action_key) DO NOTHING;

  RETURN v_connection_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_virtual_agent_connection(uuid) FROM public, anon, authenticated;

-- Seed imediato para tenants já existentes (idempotente).
DO $$
DECLARE v_company record;
BEGIN
  FOR v_company IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_virtual_agent_connection(v_company.id);
  END LOOP;
END $$;

-- Libera o entitlement (076 seedou 'virtual_agent' como enabled=false para
-- todos os tenants) — agora que o módulo tem implementação real e testada.
UPDATE public.company_module_entitlements
   SET enabled = true, updated_at = now()
 WHERE module_key = 'virtual_agent' AND enabled = false;

-- ─── 5. Helper: executa uma ação já decidida (sem checar confirmação) ───────
-- Usado tanto pelo fluxo direto (ações sem confirmação) quanto pela confirmação
-- explícita. Nunca exposta ao cliente.
CREATE OR REPLACE FUNCTION public.virtual_agent_run_action(
  p_action_key text,
  p_company_id uuid,
  p_profile_id uuid,
  p_caller_name text,
  p_input_text text
) RETURNS TABLE (result_status text, reply text, safe_output jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list jsonb;
  v_number text;
BEGIN
  IF p_action_key = 'check_tickets' THEN
    SELECT jsonb_agg(jsonb_build_object(
             'number', i.number, 'short_description', i.short_description,
             'state', i.state, 'priority', i.priority))
      INTO v_list
      FROM (
        SELECT * FROM public.incidents
         WHERE company_id = p_company_id AND caller_id = p_profile_id
         ORDER BY created_at DESC LIMIT 5
      ) i;

    IF v_list IS NULL THEN
      RETURN QUERY SELECT 'success', 'Você não tem chamados abertos no momento.', '{}'::jsonb;
    ELSE
      RETURN QUERY SELECT 'success',
        'Seus últimos chamados: ' || (
          SELECT string_agg(format('%s (%s)', item->>'number', item->>'state'), ', ')
            FROM jsonb_array_elements(v_list) item
        ), jsonb_build_object('tickets', v_list);
    END IF;

  ELSIF p_action_key = 'open_request' THEN
    INSERT INTO public.incidents(
      company_id, ticket_type, category, priority, state,
      caller_id, caller_name, short_description
    ) VALUES (
      p_company_id, 'request', 'Inquiry', 'P3 - Moderate', 'New',
      p_profile_id, p_caller_name, left(coalesce(nullif(btrim(p_input_text), ''), 'Solicitação via assistente virtual'), 180)
    )
    RETURNING number INTO v_number;

    RETURN QUERY SELECT 'success',
      format('Solicitação %s criada com sucesso! Um analista vai te atender em breve.', v_number),
      jsonb_build_object('number', v_number);

  ELSE
    RETURN QUERY SELECT 'failed', 'Não consegui executar essa ação.', '{}'::jsonb;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.virtual_agent_run_action(text, uuid, uuid, text, text) FROM public, anon, authenticated;

-- ─── 6. RPC principal: processa uma mensagem do usuário ─────────────────────
CREATE OR REPLACE FUNCTION public.virtual_agent_process_message(
  p_text text,
  p_conversation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id     uuid := public.get_current_user_company_id();
  v_profile_id     uuid := public.get_current_profile_id();
  v_profile_name   text;
  v_connection_id  uuid;
  v_identity_id    uuid;
  v_conversation_id uuid;
  v_external_conv  text;
  v_best_action    record;
  v_best_confidence numeric := -1;
  v_action         record;
  v_handoff_action_id uuid;
  v_matches        int;
  v_total          int;
  v_confidence     numeric;
  v_execution_id   uuid;
  v_reply          text;
  v_result_status  text;
  v_safe_output    jsonb := '{}'::jsonb;
  v_requires_confirmation boolean := false;
BEGIN
  IF v_company_id IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant/perfil resolvido' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_text), '') = '' THEN
    RAISE EXCEPTION 'Mensagem vazia' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_profile_name FROM public.profiles WHERE id = v_profile_id;
  v_connection_id := public.ensure_virtual_agent_connection(v_company_id);

  SELECT id INTO v_identity_id FROM public.external_identities
   WHERE company_id = v_company_id AND provider = 'api' AND external_id = v_profile_id::text;
  IF v_identity_id IS NULL THEN
    INSERT INTO public.external_identities(company_id, profile_id, provider, external_id, display_name, verified)
    VALUES (v_company_id, v_profile_id, 'api', v_profile_id::text, v_profile_name, true)
    RETURNING id INTO v_identity_id;
  END IF;

  -- Conversa persistente por usuário (uma por perfil na conexão sintética),
  -- a menos que o chamador informe uma conversa específica já sua.
  IF p_conversation_id IS NOT NULL THEN
    SELECT c.id INTO v_conversation_id FROM public.conversations c
     WHERE c.id = p_conversation_id AND c.requester_identity_id = v_identity_id;
    IF v_conversation_id IS NULL THEN
      RAISE EXCEPTION 'Conversa inexistente ou não pertence ao usuário' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_external_conv := 'portal-' || v_profile_id::text;
    INSERT INTO public.conversations(company_id, connection_id, external_conversation_id, subject, requester_identity_id, status)
    VALUES (v_company_id, v_connection_id, v_external_conv, 'Assistente do Portal', v_identity_id, 'open')
    ON CONFLICT (connection_id, external_conversation_id)
    DO UPDATE SET updated_at = now()
    RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.channel_messages(
    company_id, conversation_id, connection_id, external_message_id,
    direction, sender_identity_id, body_text, occurred_at
  ) VALUES (
    v_company_id, v_conversation_id, v_connection_id, gen_random_uuid()::text,
    'inbound', v_identity_id, p_text, now()
  );
  UPDATE public.conversations SET last_message_at = now() WHERE id = v_conversation_id;

  -- Casamento por palavra-chave: melhor ação habilitada cuja confiança
  -- atinja o próprio min_confidence. handoff_to_human tem min_confidence=0,
  -- funcionando como fallback natural quando nada mais qualifica.
  FOR v_action IN
    SELECT * FROM public.virtual_agent_actions
     WHERE company_id = v_company_id AND enabled = true
  LOOP
    v_total := GREATEST(jsonb_array_length(COALESCE(v_action.config->'keywords', '[]'::jsonb)), 1);
    SELECT count(*) INTO v_matches
      FROM jsonb_array_elements_text(COALESCE(v_action.config->'keywords', '[]'::jsonb)) kw
     WHERE p_text ILIKE '%' || kw || '%';
    v_confidence := v_matches::numeric / v_total;

    IF v_confidence >= v_action.min_confidence AND v_confidence > v_best_confidence THEN
      v_best_confidence := v_confidence;
      v_best_action := v_action;
    END IF;
  END LOOP;

  IF v_best_action IS NULL OR v_best_action.action_key = 'handoff_to_human' THEN
    -- Sem ação suficientemente confiante, ou pedido explícito de humano.
    UPDATE public.conversations SET status = 'handed_off' WHERE id = v_conversation_id;
    SELECT id INTO v_handoff_action_id FROM public.virtual_agent_actions
     WHERE company_id = v_company_id AND action_key = 'handoff_to_human' LIMIT 1;
    INSERT INTO public.virtual_agent_executions(
      company_id, conversation_id, action_id, identity_id, intent, confidence,
      confirmation_status, result_status, safe_input
    ) VALUES (
      v_company_id, v_conversation_id, v_handoff_action_id, v_identity_id, 'handoff',
      COALESCE(v_best_confidence, 0), 'not_required', 'transferred',
      jsonb_build_object('text', p_text)
    );
    v_reply := 'Vou te transferir para um atendente humano. Em breve alguém continua o atendimento por aqui.';
  ELSIF v_best_action.requires_confirmation THEN
    INSERT INTO public.virtual_agent_executions(
      company_id, conversation_id, action_id, identity_id, intent, confidence,
      confirmation_status, result_status, safe_input
    ) VALUES (
      v_company_id, v_conversation_id, v_best_action.id, v_identity_id,
      v_best_action.action_key, v_best_confidence, 'pending', 'pending',
      jsonb_build_object('text', p_text)
    ) RETURNING id INTO v_execution_id;
    v_requires_confirmation := true;
    v_reply := format('Confirma que deseja "%s"? Responda Sim ou Não.', v_best_action.name);
  ELSE
    SELECT result_status, reply, safe_output INTO v_result_status, v_reply, v_safe_output
      FROM public.virtual_agent_run_action(v_best_action.action_key, v_company_id, v_profile_id, COALESCE(v_profile_name, 'Usuário'), p_text);

    INSERT INTO public.virtual_agent_executions(
      company_id, conversation_id, action_id, identity_id, intent, confidence,
      confirmation_status, result_status, safe_input, safe_output
    ) VALUES (
      v_company_id, v_conversation_id, v_best_action.id, v_identity_id,
      v_best_action.action_key, v_best_confidence, 'not_required', v_result_status,
      jsonb_build_object('text', p_text), v_safe_output
    );
  END IF;

  INSERT INTO public.channel_messages(
    company_id, conversation_id, connection_id, external_message_id,
    direction, body_text, occurred_at
  ) VALUES (
    v_company_id, v_conversation_id, v_connection_id, gen_random_uuid()::text,
    'outbound', v_reply, now()
  );

  RETURN jsonb_build_object(
    'conversationId', v_conversation_id, 'reply', v_reply,
    'executionId', v_execution_id, 'requiresConfirmation', v_requires_confirmation
  );
END;
$$;
REVOKE ALL ON FUNCTION public.virtual_agent_process_message(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.virtual_agent_process_message(text, uuid) TO authenticated;

-- ─── 7. RPC: confirma ou rejeita uma ação pendente ───────────────────────────
CREATE OR REPLACE FUNCTION public.virtual_agent_confirm_action(
  p_execution_id uuid,
  p_confirmed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_current_profile_id();
  v_row record;
  v_action record;
  v_result_status text;
  v_reply text;
  v_safe_output jsonb;
  v_connection_id uuid;
BEGIN
  SELECT e.*, conv.connection_id AS conv_connection_id, ei.profile_id AS owner_profile_id
    INTO v_row
    FROM public.virtual_agent_executions e
    JOIN public.conversations conv ON conv.id = e.conversation_id
    LEFT JOIN public.external_identities ei ON ei.id = e.identity_id
   WHERE e.id = p_execution_id
   FOR UPDATE OF e;

  IF NOT FOUND OR v_row.owner_profile_id IS DISTINCT FROM v_profile_id THEN
    RAISE EXCEPTION 'Acesso negado a esta execução' USING ERRCODE = '42501';
  END IF;
  IF v_row.confirmation_status <> 'pending' THEN
    RAISE EXCEPTION 'Esta ação já foi respondida' USING ERRCODE = '22023';
  END IF;

  v_connection_id := v_row.conv_connection_id;

  IF p_confirmed THEN
    SELECT * INTO v_action FROM public.virtual_agent_actions WHERE id = v_row.action_id;
    SELECT result_status, reply, safe_output INTO v_result_status, v_reply, v_safe_output
      FROM public.virtual_agent_run_action(
        v_action.action_key, v_row.company_id, v_profile_id,
        COALESCE((SELECT name FROM public.profiles WHERE id = v_profile_id), 'Usuário'),
        COALESCE(v_row.safe_input->>'text', '')
      );
    UPDATE public.virtual_agent_executions
       SET confirmation_status = 'confirmed', result_status = v_result_status, safe_output = v_safe_output
     WHERE id = p_execution_id;
  ELSE
    v_reply := 'Tudo bem, cancelei essa ação.';
    UPDATE public.virtual_agent_executions
       SET confirmation_status = 'rejected', result_status = 'blocked'
     WHERE id = p_execution_id;
  END IF;

  INSERT INTO public.channel_messages(
    company_id, conversation_id, connection_id, external_message_id,
    direction, body_text, occurred_at
  ) VALUES (
    v_row.company_id, v_row.conversation_id, v_connection_id, gen_random_uuid()::text,
    'outbound', v_reply, now()
  );

  RETURN jsonb_build_object('reply', v_reply, 'confirmed', p_confirmed);
END;
$$;
REVOKE ALL ON FUNCTION public.virtual_agent_confirm_action(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.virtual_agent_confirm_action(uuid, boolean) TO authenticated;

-- ─── Verificação (comentada) ─────────────────────────────────────────────────
--   SELECT relrowsecurity FROM pg_class WHERE relname IN ('chatbot_whitelist','chatbot_messages','chatbot_config','chatbot_blocked_attempts');
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='virtual_agent_executions_result_status_check';
--   SELECT * FROM public.virtual_agent_process_message('quais meus chamados');
