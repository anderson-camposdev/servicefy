-- Corrige regressão da migration 127: ticket_messages.id é bigint no banco
-- efetivo, portanto as referências omnichannel também precisam ser bigint.

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'channel_messages'
       AND column_name = 'ticket_message_id'
       AND data_type <> 'bigint'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.channel_messages WHERE ticket_message_id IS NOT NULL) THEN
      RAISE EXCEPTION 'channel_messages.ticket_message_id contém valores incompatíveis com ticket_messages.id bigint';
    END IF;
    ALTER TABLE public.channel_messages
      ALTER COLUMN ticket_message_id TYPE bigint USING NULL::bigint;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'channel_outbox'
       AND column_name = 'source_ticket_message_id'
       AND data_type <> 'bigint'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.channel_outbox WHERE source_ticket_message_id IS NOT NULL) THEN
      RAISE EXCEPTION 'channel_outbox.source_ticket_message_id contém valores incompatíveis com ticket_messages.id bigint';
    END IF;
    ALTER TABLE public.channel_outbox
      ALTER COLUMN source_ticket_message_id TYPE bigint USING NULL::bigint;
  END IF;
END
$block$;

CREATE INDEX IF NOT EXISTS idx_channel_messages_ticket_message
  ON public.channel_messages(ticket_message_id)
  WHERE ticket_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_outbox_source_message
  ON public.channel_outbox(source_ticket_message_id)
  WHERE source_ticket_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.materialize_channel_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao gateway omnichannel' USING ERRCODE = '42501';
  END IF;

  SELECT m.company_id, m.conversation_id, m.ticket_message_id, m.body_text,
         c.incident_id, c.case_id, c.subject, c.assigned_group_id,
         ei.profile_id, COALESCE(ei.display_name, ei.email, ei.phone_e164, 'Solicitante externo'),
         cc.provider
    INTO v_company_id, v_conversation_id, v_existing_ticket_message_id, v_body,
         v_incident_id, v_case_id, v_subject, v_assignment_group_id,
         v_profile_id, v_sender_name, v_provider
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

  IF v_incident_id IS NULL THEN
    v_opened_via := CASE
      WHEN v_provider IN ('microsoft_graph', 'gmail', 'imap_smtp') THEN 'email'
      ELSE 'api'
    END;

    INSERT INTO public.incidents (
      number, company_id, short_description, description, priority, state, category,
      caller_id, caller_name, assignment_group_id, opened_via, tags
    ) VALUES (
      '', v_company_id,
      left(COALESCE(NULLIF(trim(v_subject), ''), 'Contato recebido por canal digital'), 240),
      NULLIF(v_body, ''), 'P3 - Moderate', 'New', 'Other',
      v_profile_id, v_sender_name, v_assignment_group_id, v_opened_via,
      ARRAY['omnichannel', v_provider::text]
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

  RETURN jsonb_build_object(
    'status', 'materialized',
    'incidentId', v_incident_id,
    'caseId', v_case_id,
    'ticketMessageId', v_ticket_message_id,
    'incidentNumber', v_incident_number
  );
END
$function$;

REVOKE ALL ON FUNCTION public.materialize_channel_message(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_channel_message(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_channel_outbox(
  p_id uuid,
  p_status text,
  p_provider_event_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.channel_outbox;
  v_max_attempts constant integer := 6;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker omnichannel' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
    FROM public.channel_outbox
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de outbox inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'sent' THEN
    UPDATE public.channel_outbox
       SET status = 'sent', locked_at = NULL, last_error = NULL
     WHERE id = p_id;
  ELSIF p_status = 'not_configured' THEN
    UPDATE public.channel_outbox
       SET status = 'dead_letter',
           locked_at = NULL,
           last_error = COALESCE(p_error, 'Integração do provedor ainda não configurada')
     WHERE id = p_id;
  ELSIF v_row.attempt_count >= v_max_attempts THEN
    UPDATE public.channel_outbox
       SET status = 'dead_letter', locked_at = NULL, last_error = p_error
     WHERE id = p_id;
  ELSE
    UPDATE public.channel_outbox
       SET status = 'pending',
           locked_at = NULL,
           last_error = p_error,
           next_attempt_at = now() + (interval '1 minute' * power(2, v_row.attempt_count))
     WHERE id = p_id;
  END IF;

  INSERT INTO public.channel_delivery_events (
    company_id, message_id, status, provider_event_id, error_code, error_message, payload
  )
  SELECT v_row.company_id,
         cm.id,
         (CASE WHEN p_status = 'sent' THEN 'sent' ELSE 'failed' END)::public.delivery_status,
         p_provider_event_id,
         NULL,
         p_error,
         jsonb_build_object('outbox_id', p_id, 'result', p_status)
    FROM public.channel_messages AS cm
   WHERE cm.ticket_message_id = v_row.source_ticket_message_id
   LIMIT 1;
END
$function$;

REVOKE ALL ON FUNCTION public.complete_channel_outbox(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_channel_outbox(uuid, text, text, text)
  TO service_role;
