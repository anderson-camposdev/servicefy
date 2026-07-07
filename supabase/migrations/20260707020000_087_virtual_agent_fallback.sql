-- ServiceFY — Fix de UX: o Agente Virtual não deve transferir para humano
-- em toda mensagem não reconhecida.
--
-- O desenho da 085 deu min_confidence=0.000 ao handoff_to_human para usá-lo
-- como fallback natural. Efeito colateral: qualquer mensagem que não casa
-- nenhuma palavra-chave ("oi", "ok", "obrigado") cai direto na transferência
-- para atendente humano — comportamento ruim e caro.
--
-- Correção em virtual_agent_process_message:
--  1. Uma ação só qualifica se PELO MENOS uma palavra-chave casou
--     (confiança > 0), além de atingir o próprio min_confidence.
--  2. Quando nada casa, o bot responde com um menu amigável e a conversa
--     permanece aberta — não há transferência nem registro de execução.
--  3. handoff só ocorre quando o usuário de fato pede (as keywords de
--     handoff casam), não como catch-all silencioso.

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

  -- Casamento por palavra-chave: melhor ação habilitada cuja confiança seja
  -- > 0 (ao menos uma palavra-chave casou) E atinja o próprio min_confidence.
  -- Sem o gate de confiança > 0, uma mensagem sem nenhuma correspondência
  -- ativaria o handoff (min_confidence=0) — não é o que queremos.
  FOR v_action IN
    SELECT * FROM public.virtual_agent_actions
     WHERE company_id = v_company_id AND enabled = true
  LOOP
    v_total := GREATEST(jsonb_array_length(COALESCE(v_action.config->'keywords', '[]'::jsonb)), 1);
    SELECT count(*) INTO v_matches
      FROM jsonb_array_elements_text(COALESCE(v_action.config->'keywords', '[]'::jsonb)) kw
     WHERE p_text ILIKE '%' || kw || '%';
    v_confidence := v_matches::numeric / v_total;

    IF v_confidence > 0 AND v_confidence >= v_action.min_confidence AND v_confidence > v_best_confidence THEN
      v_best_confidence := v_confidence;
      v_best_action := v_action;
    END IF;
  END LOOP;

  IF v_best_action IS NULL THEN
    -- Nada reconhecido: menu amigável, conversa segue aberta, sem transferência.
    v_reply := 'Posso te ajudar a: consultar seus chamados, abrir uma solicitação simples, '
            || 'ou falar com um atendente humano. É só me dizer o que você precisa.';
  ELSIF v_best_action.action_key = 'handoff_to_human' THEN
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
