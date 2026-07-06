-- ServiceFY — Omnichannel operacional: triagem, materialização de incidentes
-- e vínculo idempotente entre mensagens de canal e o histórico do chamado.

ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS ticket_message_id bigint
  REFERENCES public.ticket_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_messages_ticket_message
  ON public.channel_messages(ticket_message_id)
  WHERE ticket_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.channel_triage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  provider public.channel_provider NOT NULL,
  external_event_id text NOT NULL,
  external_message_id text,
  sender text,
  recipients text[] NOT NULL DEFAULT '{}',
  subject text,
  body_excerpt text,
  reason text NOT NULL CHECK (reason IN ('ambiguous_route','route_not_found','invalid_tenant')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','discarded','reprocessed')),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_triage_pending
  ON public.channel_triage_events(company_id, status, created_at DESC);

ALTER TABLE public.channel_triage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_triage_admin_read ON public.channel_triage_events;
CREATE POLICY channel_triage_admin_read ON public.channel_triage_events
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

DROP POLICY IF EXISTS channel_triage_admin_update ON public.channel_triage_events;
CREATE POLICY channel_triage_admin_update ON public.channel_triage_events
  FOR UPDATE TO authenticated
  USING (public.is_settings_admin(company_id))
  WITH CHECK (public.is_settings_admin(company_id));

GRANT SELECT,UPDATE ON public.channel_triage_events TO authenticated;

CREATE OR REPLACE FUNCTION public.materialize_channel_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_conversation_id uuid;
  v_incident_id uuid;
  v_case_id uuid;
  v_ticket_message_id bigint;
  v_existing_ticket_message_id bigint;
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
    RAISE EXCEPTION 'Acesso restrito ao gateway omnichannel' USING ERRCODE='42501';
  END IF;

  SELECT
    m.company_id, m.conversation_id, m.ticket_message_id, m.body_text,
    c.incident_id, c.case_id, c.subject, c.assigned_group_id,
    ei.profile_id, COALESCE(ei.display_name, ei.email, ei.phone_e164, 'Solicitante externo'),
    cc.provider
  INTO
    v_company_id, v_conversation_id, v_existing_ticket_message_id, v_body,
    v_incident_id, v_case_id, v_subject, v_assignment_group_id,
    v_profile_id, v_sender_name, v_provider
  FROM public.channel_messages m
  JOIN public.conversations c ON c.id = m.conversation_id AND c.company_id = m.company_id
  JOIN public.channel_connections cc ON cc.id = m.connection_id
  LEFT JOIN public.external_identities ei ON ei.id = m.sender_identity_id
  WHERE m.id = p_message_id AND m.direction = 'inbound'
  FOR UPDATE OF m, c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem de entrada não encontrada' USING ERRCODE='P0002';
  END IF;

  IF v_existing_ticket_message_id IS NOT NULL THEN
    SELECT number INTO v_incident_number FROM public.incidents WHERE id = v_incident_id;
    RETURN jsonb_build_object(
      'status','already_materialized','incidentId',v_incident_id,
      'caseId',v_case_id,'ticketMessageId',v_existing_ticket_message_id,
      'incidentNumber',v_incident_number
    );
  END IF;

  IF v_incident_id IS NULL THEN
    v_opened_via := CASE
      WHEN v_provider IN ('microsoft_graph','gmail','imap_smtp') THEN 'email'
      ELSE 'api'
    END;

    INSERT INTO public.incidents(
      number, company_id, short_description, description, priority, state, category,
      caller_id, caller_name, assignment_group_id, opened_via, tags
    ) VALUES (
      '', v_company_id,
      LEFT(COALESCE(NULLIF(trim(v_subject),''),'Contato recebido por canal digital'), 240),
      NULLIF(v_body,''), 'P3 - Moderate', 'New', 'Other',
      v_profile_id, v_sender_name, v_assignment_group_id, v_opened_via,
      ARRAY['omnichannel', v_provider::text]
    )
    RETURNING id, number INTO v_incident_id, v_incident_number;

    SELECT case_id INTO v_case_id FROM public.incidents WHERE id = v_incident_id;

    UPDATE public.conversations
    SET incident_id = v_incident_id, case_id = v_case_id, updated_at = now()
    WHERE id = v_conversation_id;
  ELSE
    SELECT number, case_id INTO v_incident_number, v_case_id
    FROM public.incidents WHERE id = v_incident_id;
  END IF;

  INSERT INTO public.ticket_messages(
    incident_id, case_id, company_id, sender_id, sender_name, actor_type, body, is_internal
  ) VALUES (
    v_incident_id, v_case_id, v_company_id, v_profile_id, v_sender_name,
    'user', COALESCE(NULLIF(v_body,''),'(mensagem recebida sem conteúdo textual)'), false
  ) RETURNING id INTO v_ticket_message_id;

  UPDATE public.channel_messages
  SET ticket_message_id = v_ticket_message_id
  WHERE id = p_message_id AND ticket_message_id IS NULL;

  RETURN jsonb_build_object(
    'status','materialized','incidentId',v_incident_id,'caseId',v_case_id,
    'ticketMessageId',v_ticket_message_id,'incidentNumber',v_incident_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_channel_message(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_channel_message(uuid) TO service_role;

COMMENT ON TABLE public.channel_triage_events IS
  'Eventos sem roteamento inequívoco, visíveis apenas à administração do tenant MSP proprietário da conexão.';
COMMENT ON FUNCTION public.materialize_channel_message(uuid) IS
  'Materializa uma mensagem inbound em incidente/caso e histórico público de forma idempotente.';
