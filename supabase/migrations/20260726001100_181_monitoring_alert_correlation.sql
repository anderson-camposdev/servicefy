-- ============================================================
-- 181 — Correlação de alertas de monitoramento
--
-- Problema medido em 26/07/2026 lendo o caminho de entrada até o fim:
-- a chave que agrupa mensagens numa conversa é, para e-mail,
--   conversationId ?? threadId ?? references.at(-1) ?? messageId
-- Alerta de monitoramento não tem nenhum dos três primeiros — não é
-- resposta a nada — então cai em messageId, ÚNICO POR E-MAIL. Um link que
-- oscila 40 vezes na madrugada gera 40 chamados, e o e-mail de recuperação
-- abre um 41º em vez de fechar o original.
--
-- A correção não precisa de lógica nova de correlação: basta a conexão de
-- monitoramento usar o identificador do alerta (ex.: {TRIGGER.ID} do Zabbix)
-- como external_conversation_id. Aí o agrupamento passa a funcionar pelo
-- mesmo caminho de sempre. O que esta migration acrescenta é o tratamento
-- do que é específico de alerta:
--
--   • categoria carrega a severidade  — o motor de automação só avalia
--     category/department/group/priority/state/idle_hours (não lê tags nem
--     descrição), então é por category que a severidade chega até as regras.
--     Decisão do produto: não mapear severidade para prioridade de forma
--     rígida; quem decide é a automação de cada empresa.
--   • recuperação                     — comportamento configurável por
--     conexão (config->>'on_recovery'): 'resolve' fecha o chamado,
--     'notify' apenas registra e deixa para o analista. Padrão: 'notify',
--     o mais conservador.
--   • recuperação órfã                — e-mail de resolução sem chamado
--     aberto correspondente NÃO abre chamado. Abrir um chamado para
--     anunciar que algo se resolveu é ruído puro.
-- ============================================================

-- 'monitoring' como origem legítima de abertura.
-- A constraint carrega o nome legado `incidents_opened_via_check` (anterior
-- à renomeação incidents → tickets na migration 096). Derrubar só o nome
-- novo deixaria a antiga barrando — foi o que aconteceu na primeira
-- tentativa, pega pelo teste de comportamento.
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS incidents_opened_via_check;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_opened_via_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_opened_via_check
  CHECK (opened_via = ANY (ARRAY['portal'::text, 'manual'::text, 'email'::text, 'api'::text, 'monitoring'::text]));

CREATE OR REPLACE FUNCTION public.materialize_channel_message(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_conversation_id uuid;
  v_incident_id uuid;
  v_case_id uuid;
  v_ticket_message_id public.ticket_messages.id%TYPE;
  v_existing_ticket_message_id public.channel_messages.ticket_message_id%TYPE;
  v_profile_id uuid;
  v_assignment_group_id uuid;
  v_provider public.channel_provider;
  v_subject text;
  v_body text;
  v_sender_name text;
  v_incident_number text;
  v_opened_via text;
  -- Específicos de alerta
  v_alert jsonb;
  v_is_recovery boolean := false;
  v_severity text;
  v_category text;
  v_on_recovery text;
  v_state text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao gateway omnichannel' USING ERRCODE = '42501';
  END IF;

  SELECT m.company_id, m.conversation_id, m.ticket_message_id, m.body_text,
         c.incident_id, c.case_id, c.subject, c.assigned_group_id,
         ei.profile_id, COALESCE(ei.display_name, ei.email, ei.phone_e164, 'Solicitante externo'),
         cc.provider,
         m.raw_payload -> 'servicefy_alert',
         COALESCE(cc.config ->> 'on_recovery', 'notify')
    INTO v_company_id, v_conversation_id, v_existing_ticket_message_id, v_body,
         v_incident_id, v_case_id, v_subject, v_assignment_group_id,
         v_profile_id, v_sender_name, v_provider,
         v_alert, v_on_recovery
    FROM public.channel_messages AS m
    JOIN public.conversations AS c
      ON c.id = m.conversation_id AND c.company_id = m.company_id
    JOIN public.channel_connections AS cc ON cc.id = m.connection_id
    LEFT JOIN public.external_identities AS ei ON ei.id = m.sender_identity_id
   WHERE m.id = p_message_id
     AND m.direction = 'inbound'
   FOR UPDATE OF m, c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem de entrada não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing_ticket_message_id IS NOT NULL THEN
    SELECT number INTO v_incident_number
      FROM public.incidents
     WHERE id = v_incident_id;
    RETURN jsonb_build_object(
      'status', 'already_materialized',
      'incidentId', v_incident_id,
      'caseId', v_case_id,
      'ticketMessageId', v_existing_ticket_message_id,
      'incidentNumber', v_incident_number
    );
  END IF;

  IF v_provider = 'monitoring' THEN
    v_is_recovery := COALESCE((v_alert ->> 'is_recovery')::boolean, false);
    v_severity    := NULLIF(trim(COALESCE(v_alert ->> 'severity', '')), '');
    v_category    := 'Monitoramento' || COALESCE(' / ' || v_severity, '');

    -- Recuperação sem chamado aberto correspondente: registra e encerra.
    -- Abrir chamado para dizer que algo voltou ao normal seria ruído.
    IF v_is_recovery AND v_incident_id IS NULL THEN
      UPDATE public.channel_messages
         SET ticket_message_id = NULL
       WHERE id = p_message_id;
      RETURN jsonb_build_object('status', 'recovery_without_open_incident');
    END IF;
  END IF;

  IF v_incident_id IS NULL THEN
    v_opened_via := CASE
      WHEN v_provider = 'monitoring' THEN 'monitoring'
      WHEN v_provider IN ('microsoft_graph', 'gmail', 'imap_smtp') THEN 'email'
      ELSE 'api'
    END;

    INSERT INTO public.incidents (
      number, company_id, short_description, description, priority, state, category,
      caller_id, caller_name, assignment_group_id, opened_via, tags
    ) VALUES (
      '', v_company_id,
      left(COALESCE(NULLIF(trim(v_subject), ''), 'Contato recebido por canal digital'), 240),
      NULLIF(v_body, ''), 'P3 - Moderate', 'New',
      COALESCE(v_category, 'Other'),
      v_profile_id, v_sender_name, v_assignment_group_id, v_opened_via,
      CASE WHEN v_provider = 'monitoring'
           THEN ARRAY['omnichannel', 'monitoring'] || COALESCE(ARRAY[lower(v_severity)], ARRAY[]::text[])
           ELSE ARRAY['omnichannel', v_provider::text] END
    )
    RETURNING id, number INTO v_incident_id, v_incident_number;

    SELECT case_id INTO v_case_id
      FROM public.incidents
     WHERE id = v_incident_id;

    UPDATE public.conversations
       SET incident_id = v_incident_id,
           case_id = v_case_id,
           updated_at = now()
     WHERE id = v_conversation_id;
  ELSE
    SELECT number, case_id INTO v_incident_number, v_case_id
      FROM public.incidents
     WHERE id = v_incident_id;
  END IF;

  INSERT INTO public.ticket_messages (
    incident_id, case_id, company_id, sender_id, sender_name, actor_type, body, is_internal
  ) VALUES (
    v_incident_id, v_case_id, v_company_id, v_profile_id, v_sender_name,
    'user', COALESCE(NULLIF(v_body, ''), '(mensagem recebida sem conteúdo textual)'), false
  )
  RETURNING id INTO v_ticket_message_id;

  UPDATE public.channel_messages
     SET ticket_message_id = v_ticket_message_id
   WHERE id = p_message_id
     AND ticket_message_id IS NULL;

  -- Fechamento automático na recuperação, quando a conexão pede.
  -- tg_guard_resolution_governance exige código E notas — ambos fornecidos.
  IF v_provider = 'monitoring' AND v_is_recovery AND v_on_recovery = 'resolve' THEN
    SELECT state::text INTO v_state FROM public.tickets WHERE id = v_incident_id;
    IF v_state NOT IN ('Resolved', 'Closed') THEN
      UPDATE public.tickets
         SET state = 'Resolved',
             resolution_code = 'Recuperado pelo monitoramento',
             resolution_notes = COALESCE(NULLIF(v_body, ''),
               'Ferramenta de monitoramento sinalizou recuperação do alerta.'),
             resolved_at = now(),
             updated_at = now()
       WHERE id = v_incident_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_is_recovery THEN 'recovery' ELSE 'materialized' END,
    'incidentId', v_incident_id,
    'caseId', v_case_id,
    'ticketMessageId', v_ticket_message_id,
    'incidentNumber', v_incident_number,
    'resolved', (v_provider = 'monitoring' AND v_is_recovery AND v_on_recovery = 'resolve')
  );
END
$function$;
