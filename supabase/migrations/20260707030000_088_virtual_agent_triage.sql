-- ServiceFY — Agente condutor de triagem: persistência de estado + auditoria.
--
-- O "cérebro" do condutor (máquina de estados) roda no cliente (triage-conductor.ts)
-- e a criação do chamado reusa os serviços governados existentes (openRequest/
-- openServiceRequest → RLS + triggers de número/prioridade/SLA/aprovação). Esta
-- migração adiciona apenas o lado servidor de persistência/auditoria:
--  1. virtual_agent_triage_sync  — grava a transcrição (channel_messages) e o
--     estado do wizard em conversations.metadata->'triage', permitindo retomar.
--  2. virtual_agent_triage_complete — registra a abertura em
--     virtual_agent_executions (para o histórico do admin).
--  3. Seed idempotente de uma ação 'triage_open' (para o histórico/catálogo).
--
-- Reusa: get_current_user_company_id/get_current_profile_id,
-- ensure_virtual_agent_connection (085), external_identities (077), e o índice
-- único parcial uq_va_actions_company_key_nodomain (086).

-- ─── 1. Seed idempotente da ação triage_open (histórico/admin) ───────────────
DO $$
DECLARE v_company record;
BEGIN
  FOR v_company IN SELECT id FROM public.companies LOOP
    INSERT INTO public.virtual_agent_actions(company_id, action_key, name, enabled, requires_confirmation, min_confidence, config)
    VALUES (v_company.id, 'triage_open', 'Abertura guiada de chamado (triagem)', true, false, 0.000,
            jsonb_build_object('keywords', jsonb_build_array('abrir','chamado','incidente','solicitação','problema')))
    ON CONFLICT (company_id, action_key) WHERE service_domain_id IS NULL DO NOTHING;
  END LOOP;
END $$;

-- ─── 2. RPC: sincroniza transcrição + estado do wizard ──────────────────────
CREATE OR REPLACE FUNCTION public.virtual_agent_triage_sync(
  p_conversation_id uuid,
  p_state jsonb,
  p_inbound text,
  p_outbound text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id      uuid := public.get_current_user_company_id();
  v_profile_id      uuid := public.get_current_profile_id();
  v_profile_name    text;
  v_connection_id   uuid;
  v_identity_id     uuid;
  v_conversation_id uuid;
  v_external_conv   text;
BEGIN
  IF v_company_id IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant/perfil resolvido' USING ERRCODE = '42501';
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

  -- Conversa: valida posse quando informada; caso contrário, upsert por usuário.
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

  IF coalesce(btrim(p_inbound), '') <> '' THEN
    INSERT INTO public.channel_messages(
      company_id, conversation_id, connection_id, external_message_id,
      direction, sender_identity_id, body_text, occurred_at
    ) VALUES (
      v_company_id, v_conversation_id, v_connection_id, gen_random_uuid()::text,
      'inbound', v_identity_id, left(p_inbound, 4000), now()
    );
  END IF;

  IF coalesce(btrim(p_outbound), '') <> '' THEN
    INSERT INTO public.channel_messages(
      company_id, conversation_id, connection_id, external_message_id,
      direction, body_text, occurred_at
    ) VALUES (
      v_company_id, v_conversation_id, v_connection_id, gen_random_uuid()::text,
      'outbound', left(p_outbound, 4000), now()
    );
  END IF;

  UPDATE public.conversations
     SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{triage}', coalesce(p_state, '{}'::jsonb), true),
         last_message_at = now(),
         updated_at = now()
   WHERE id = v_conversation_id;

  RETURN v_conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.virtual_agent_triage_sync(uuid, jsonb, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.virtual_agent_triage_sync(uuid, jsonb, text, text) TO authenticated;

-- ─── 3. RPC: registra a abertura concluída (auditoria/histórico) ────────────
CREATE OR REPLACE FUNCTION public.virtual_agent_triage_complete(
  p_conversation_id uuid,
  p_incident_id uuid,
  p_summary jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_current_user_company_id();
  v_profile_id uuid := public.get_current_profile_id();
  v_identity_id uuid;
  v_action_id uuid;
BEGIN
  IF v_company_id IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant/perfil resolvido' USING ERRCODE = '42501';
  END IF;

  -- A conversa precisa ser do próprio chamador.
  SELECT c.requester_identity_id INTO v_identity_id
    FROM public.conversations c
    JOIN public.external_identities ei ON ei.id = c.requester_identity_id
   WHERE c.id = p_conversation_id AND ei.profile_id = v_profile_id;
  IF v_identity_id IS NULL THEN
    RAISE EXCEPTION 'Conversa não pertence ao usuário' USING ERRCODE = '42501';
  END IF;

  -- O incidente precisa ser do mesmo tenant (não confia no id vindo do browser).
  IF NOT EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = p_incident_id AND i.company_id = v_company_id) THEN
    RAISE EXCEPTION 'Chamado inválido para este tenant' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_action_id FROM public.virtual_agent_actions
   WHERE company_id = v_company_id AND action_key = 'triage_open' AND service_domain_id IS NULL LIMIT 1;

  INSERT INTO public.virtual_agent_executions(
    company_id, conversation_id, action_id, identity_id, intent, confidence,
    confirmation_status, result_status, safe_input, safe_output
  ) VALUES (
    v_company_id, p_conversation_id, v_action_id, v_identity_id, 'triage_open', 1.000,
    'not_required', 'success', '{}'::jsonb, coalesce(p_summary, '{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.virtual_agent_triage_complete(uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.virtual_agent_triage_complete(uuid, uuid, jsonb) TO authenticated;
