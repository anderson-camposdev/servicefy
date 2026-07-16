-- ServiceFY — Fase 28.1: hardening estrutural das funções legadas.
-- Não altera decisões de negócio; apenas alinha tipos compostos, locks e IDs
-- ao schema polimórfico atual e torna os tipos explícitos para plpgsql_check.

-- ticket_messages.id sempre foi UUID. A coluna bigint da migration 084 nunca
-- pôde receber NEW.id do trigger; falhamos de forma explícita se houver dado
-- impossível de converter, em vez de descartá-lo silenciosamente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channel_outbox'
      AND column_name = 'source_ticket_message_id' AND data_type <> 'uuid'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.channel_outbox WHERE source_ticket_message_id IS NOT NULL) THEN
      RAISE EXCEPTION 'channel_outbox.source_ticket_message_id contém valores bigint incompatíveis com ticket_messages.id UUID';
    END IF;
    DROP INDEX IF EXISTS public.uq_channel_outbox_source_message;
    ALTER TABLE public.channel_outbox
      ALTER COLUMN source_ticket_message_id TYPE uuid USING NULL::uuid;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_outbox_source_message
  ON public.channel_outbox(source_ticket_message_id)
  WHERE source_ticket_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.workflow_incident_department_id(p_incident public.tickets)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_incident.ticket_type = 'incident' THEN
      (SELECT cc.department_id
         FROM public.catalog_services cs
         JOIN public.catalog_categories cc ON cc.id = cs.category_id
        WHERE cs.id = p_incident.catalog_service_id)
    ELSE
      (SELECT rc.department_id
         FROM public.service_request_attributes sra
         JOIN public.request_items ri ON ri.id = sra.request_item_id
         JOIN public.request_categories rc ON rc.id = ri.request_category_id
        WHERE sra.ticket_id = p_incident.id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.workflow_eval_condition(
  p_condition jsonb,
  p_incident public.tickets
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_field  text := p_condition->>'field';
  v_op     text := p_condition->>'operator';
  v_value  text := p_condition->>'value';
  v_actual text;
BEGIN
  v_actual := CASE v_field
    WHEN 'priority' THEN p_incident.priority::text
    WHEN 'category' THEN (
      SELECT ia.category FROM public.incident_attributes ia
       WHERE ia.ticket_id = p_incident.id
    )
    WHEN 'state' THEN p_incident.state::text
    WHEN 'group' THEN p_incident.assigned_group_name
    WHEN 'department' THEN (
      SELECT d.name FROM public.departments d
       WHERE d.id = public.workflow_incident_department_id(p_incident)
    )
    WHEN 'idle_hours' THEN (EXTRACT(EPOCH FROM (now() - p_incident.updated_at)) / 3600)::text
    ELSE NULL
  END;

  RETURN CASE v_op
    WHEN 'equals'       THEN v_actual = v_value
    WHEN 'not_equals'   THEN v_actual IS DISTINCT FROM v_value
    WHEN 'contains'     THEN v_actual ILIKE '%' || v_value || '%'
    WHEN 'greater_than' THEN v_actual::numeric > v_value::numeric
    WHEN 'less_than'    THEN v_actual::numeric < v_value::numeric
    ELSE false
  END;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.workflow_eval_conditions(
  p_conditions jsonb,
  p_incident public.tickets
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_result boolean;
  v_first boolean := true;
BEGIN
  IF p_conditions IS NULL OR jsonb_typeof(p_conditions) <> 'array'
     OR jsonb_array_length(p_conditions) = 0 THEN
    RETURN true;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    IF v_first THEN
      v_result := public.workflow_eval_condition(v_item, p_incident);
      v_first := false;
    ELSIF (v_item->>'logicOp') = 'OR' THEN
      v_result := v_result OR public.workflow_eval_condition(v_item, p_incident);
    ELSE
      v_result := v_result AND public.workflow_eval_condition(v_item, p_incident);
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.workflow_dispatch_actions(
  p_rule public.workflow_rules,
  p_incident public.tickets
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action jsonb;
  v_type text;
  v_params jsonb;
  v_run_after timestamptz := now();
  v_chain_id uuid := gen_random_uuid();
  v_sequence_no integer := 0;
  v_queue_rest boolean := false;
  v_incident public.tickets := p_incident;
  v_sync_types constant text[] := ARRAY[
    'assign_group', 'change_priority', 'change_state', 'set_field',
    'add_tag', 'send_notification', 'escalate'
  ];
  v_async_types constant text[] := ARRAY['send_email', 'webhook'];
BEGIN
  FOR v_action IN SELECT * FROM jsonb_array_elements(p_rule.actions) LOOP
    v_type := v_action->>'type';
    v_params := COALESCE(v_action->'params', '{}'::jsonb);

    IF v_type = 'delay' THEN
      IF COALESCE((v_params->>'minutes')::integer, 0) < 0 THEN
        RAISE EXCEPTION 'delay não aceita minutos negativos';
      END IF;
      v_run_after := v_run_after + make_interval(mins => COALESCE((v_params->>'minutes')::integer, 0));
      v_queue_rest := true;
    ELSIF v_type = ANY(v_sync_types) AND NOT v_queue_rest AND v_run_after <= now() THEN
      PERFORM public.workflow_execute_sync_action(p_rule, v_incident, v_action);
      SELECT * INTO v_incident FROM public.tickets WHERE id = p_incident.id;
    ELSIF v_type = ANY(v_sync_types) OR v_type = ANY(v_async_types) THEN
      v_sequence_no := v_sequence_no + 1;
      INSERT INTO public.workflow_action_queue
        (company_id, rule_id, incident_id, action, run_after, chain_id, sequence_no)
      VALUES
        (p_incident.company_id, p_rule.id, p_incident.id, v_action, v_run_after, v_chain_id, v_sequence_no);
      v_queue_rest := true;
    ELSE
      RAISE EXCEPTION 'Tipo de ação desconhecido: %', COALESCE(v_type, '(nulo)');
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.workflow_run_queued_sync(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.workflow_action_queue;
  v_rule public.workflow_rules;
  v_incident public.tickets;
BEGIN
  SELECT * INTO v_queue FROM public.workflow_action_queue
   WHERE id = p_queue_id AND status = 'processing' FOR UPDATE;
  IF v_queue.id IS NULL THEN RAISE EXCEPTION 'Item de fila não está em processing'; END IF;

  SELECT * INTO v_rule FROM public.workflow_rules WHERE id = v_queue.rule_id;
  SELECT * INTO v_incident FROM public.tickets WHERE id = v_queue.incident_id;
  IF v_rule.id IS NULL OR v_incident.id IS NULL THEN
    RAISE EXCEPTION 'Regra ou chamado da fila não existe mais';
  END IF;

  PERFORM public.workflow_execute_sync_action(v_rule, v_incident, v_queue.action);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_inc public.tickets;
  v_rule public.workflow_rules;
  v_matched boolean;
BEGIN
  FOR v_rec IN
    SELECT t.id FROM public.tickets t
     WHERE t.state::text NOT IN ('Resolved', 'Closed')
       AND t.paused_at IS NULL AND t.responded_at IS NULL
       AND t.is_response_breached = false
       AND t.sla_response_deadline IS NOT NULL
       AND t.sla_response_deadline < now()
  LOOP
    UPDATE public.incidents SET is_response_breached = true WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'response'));
  END LOOP;

  FOR v_rec IN
    SELECT t.id FROM public.tickets t
     WHERE t.state::text NOT IN ('Resolved', 'Closed')
       AND t.paused_at IS NULL AND t.resolved_at IS NULL
       AND t.is_resolution_breached = false
       AND t.sla_resolution_deadline IS NOT NULL
       AND t.sla_resolution_deadline < now()
  LOOP
    UPDATE public.incidents
       SET is_resolution_breached = true, sla_breached = true
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'resolution'));

    SELECT * INTO v_inc FROM public.tickets WHERE id = v_rec.id;
    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id AND active = true
         AND trigger_event = 'sla_breached' AND ticket_type = v_inc.ticket_type
       ORDER BY priority_order ASC
    LOOP
      v_matched := public.workflow_eval_conditions(v_rule.conditions, v_inc);
      IF v_matched THEN
        PERFORM public.workflow_dispatch_actions(v_rule, v_inc);
      END IF;
      INSERT INTO public.workflow_execution_log
        (company_id, rule_id, rule_name, incident_id, incident_number,
         trigger_event, matched, status, actions_summary)
      VALUES (
        v_inc.company_id, v_rule.id, v_rule.name, v_inc.id, v_inc.number,
        'sla_breached', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched THEN 'Ações aplicadas: ' || COALESCE(
          (SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
        ELSE 'Condição não atendida' END
      );
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_sla_warnings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inc public.tickets;
  v_rule public.workflow_rules;
  v_matched boolean;
BEGIN
  FOR v_inc IN
    SELECT * FROM public.tickets
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL AND resolved_at IS NULL
       AND sla_warning_notified = false
       AND sla_resolution_deadline IS NOT NULL
       AND sla_resolution_deadline > now()
       AND sla_resolution_deadline - now() < interval '30 minutes'
  LOOP
    UPDATE public.incidents SET sla_warning_notified = true WHERE id = v_inc.id;
    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id AND active = true
         AND trigger_event = 'sla_warning' AND ticket_type = v_inc.ticket_type
       ORDER BY priority_order ASC
    LOOP
      v_matched := public.workflow_eval_conditions(v_rule.conditions, v_inc);
      IF v_matched THEN
        PERFORM public.workflow_dispatch_actions(v_rule, v_inc);
      END IF;
      INSERT INTO public.workflow_execution_log
        (company_id, rule_id, rule_name, incident_id, incident_number,
         trigger_event, matched, status, actions_summary)
      VALUES (
        v_inc.company_id, v_rule.id, v_rule.name, v_inc.id, v_inc.number,
        'sla_warning', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched THEN 'Ações aplicadas: ' || COALESCE(
          (SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
        ELSE 'Condição não atendida' END
      );
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_ticket_service(p_incident_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_ticket public.incidents;
  v_result public.tickets;
  v_original_group_id uuid;
  v_original_group_name text;
  v_started_at timestamptz;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Perfil autenticado não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_profile.role::text NOT IN
     ('sysadmin','company_admin','agent','technician','area_manager','it_manager') THEN
    RAISE EXCEPTION 'Perfil sem permissão para iniciar atendimento.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.tickets t WHERE t.id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_ticket FROM public.incidents WHERE id = p_incident_id;

  IF NOT (public.is_current_user_msp_admin() OR v_ticket.company_id = v_profile.company_id) THEN
    RAISE EXCEPTION 'Usuário sem acesso ao chamado.' USING ERRCODE = '42501';
  END IF;
  IF v_ticket.state IN ('Resolved', 'Closed') THEN
    RAISE EXCEPTION 'Chamados resolvidos ou fechados não podem iniciar atendimento.' USING ERRCODE = '22023';
  END IF;
  IF v_ticket.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'O atendimento deste chamado já foi iniciado.' USING ERRCODE = '22023';
  END IF;

  v_original_group_id := v_ticket.assignment_group_id;
  v_original_group_name := v_ticket.assigned_group_name;
  v_started_at := clock_timestamp();
  UPDATE public.incidents
     SET assigned_to_id = v_profile.id, assigned_to_name = v_profile.name,
         assignment_group_id = v_original_group_id,
         assigned_group_name = v_original_group_name, state = 'In Progress',
         responded_at = v_started_at, updated_at = v_started_at
   WHERE id = p_incident_id RETURNING * INTO v_ticket;

  IF v_ticket.assignment_group_id IS DISTINCT FROM v_original_group_id
     OR v_ticket.assigned_group_name IS DISTINCT FROM v_original_group_name THEN
    RAISE EXCEPTION 'O grupo solucionador original não pode ser alterado ao iniciar atendimento.'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.incident_history
    (incident_id, changed_by_id, changed_by_name, field_name, old_value,
     new_value, comment, is_public, created_at)
  VALUES
    (v_ticket.id, v_profile.id, v_profile.name, 'Início de Atendimento', NULL,
     v_started_at::text, format('Atendimento iniciado por %s', v_profile.name), true, v_started_at);
  SELECT * INTO v_result FROM public.tickets WHERE id = p_incident_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_incident_resolution(p_incident_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_incident public.incidents;
  v_result public.tickets;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Perfil autenticado não encontrado' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.tickets t WHERE t.id = p_incident_id FOR UPDATE;
  SELECT * INTO v_incident FROM public.incidents WHERE id = p_incident_id;
  IF v_incident.id IS NULL OR v_incident.caller_id IS DISTINCT FROM v_profile.id
     OR v_incident.company_id IS DISTINCT FROM v_profile.company_id THEN
    RAISE EXCEPTION 'Chamado não pertence ao solicitante autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_incident.state::text <> 'Resolved' THEN
    RAISE EXCEPTION 'Somente chamados resolvidos podem ser aceitos';
  END IF;
  UPDATE public.incidents SET state = 'Closed', closed_at = now()
   WHERE id = p_incident_id RETURNING * INTO v_incident;
  INSERT INTO public.incident_history
    (incident_id, changed_by_id, changed_by_name, field_name,
     old_value, new_value, comment, is_public)
  VALUES
    (p_incident_id, v_profile.id, v_profile.name, 'state',
     'Resolved', 'Closed', 'Solução aceita pelo solicitante.', true);
  SELECT * INTO v_result FROM public.tickets WHERE id = p_incident_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_approval_token(
  p_token uuid, p_decision text, p_reason text DEFAULT NULL,
  p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_row public.approval_tokens%ROWTYPE;
  v_new_state public.request_state;
BEGIN
  SELECT * INTO v_token_row FROM public.approval_tokens WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Token não encontrado'); END IF;
  IF v_token_row.used_at IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Token já utilizado'); END IF;
  IF v_token_row.expires_at < now() THEN RETURN jsonb_build_object('success', false, 'error', 'Token expirado'); END IF;
  v_new_state := CASE p_decision WHEN 'approved' THEN 'Approved'::public.request_state
                                 ELSE 'Rejected'::public.request_state END;
  UPDATE public.approval_tokens SET used_at = now(), decision = p_decision,
    rejection_reason = p_reason, ip_address = p_ip, user_agent = p_user_agent
   WHERE token = p_token;
  UPDATE public.service_requests SET state = v_new_state,
    approver_name = v_token_row.approver_name,
    approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
    rejection_reason = p_reason, updated_at = now()
   WHERE id = v_token_row.request_id;
  RETURN jsonb_build_object('success', true, 'decision', p_decision, 'request_id', v_token_row.request_id);
END;
$$;

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
  v_ticket_message_id uuid;
  v_existing_ticket_message_id uuid;
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
    FROM public.channel_messages m
    JOIN public.conversations c ON c.id = m.conversation_id AND c.company_id = m.company_id
    JOIN public.channel_connections cc ON cc.id = m.connection_id
    LEFT JOIN public.external_identities ei ON ei.id = m.sender_identity_id
   WHERE m.id = p_message_id AND m.direction = 'inbound'
   FOR UPDATE OF m, c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem de entrada não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_existing_ticket_message_id IS NOT NULL THEN
    SELECT number INTO v_incident_number FROM public.incidents WHERE id = v_incident_id;
    RETURN jsonb_build_object(
      'status','already_materialized','incidentId',v_incident_id,
      'caseId',v_case_id,'ticketMessageId',v_existing_ticket_message_id,
      'incidentNumber',v_incident_number);
  END IF;

  IF v_incident_id IS NULL THEN
    v_opened_via := CASE WHEN v_provider IN ('microsoft_graph','gmail','imap_smtp')
                         THEN 'email' ELSE 'api' END;
    INSERT INTO public.incidents(
      number, company_id, short_description, description, priority, state, category,
      caller_id, caller_name, assignment_group_id, opened_via, tags
    ) VALUES (
      '', v_company_id,
      left(COALESCE(NULLIF(trim(v_subject),''),'Contato recebido por canal digital'), 240),
      NULLIF(v_body,''), 'P3 - Moderate', 'New', 'Other',
      v_profile_id, v_sender_name, v_assignment_group_id, v_opened_via,
      ARRAY['omnichannel', v_provider::text]
    ) RETURNING id, number INTO v_incident_id, v_incident_number;
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
  UPDATE public.channel_messages SET ticket_message_id = v_ticket_message_id
   WHERE id = p_message_id AND ticket_message_id IS NULL;
  RETURN jsonb_build_object(
    'status','materialized','incidentId',v_incident_id,'caseId',v_case_id,
    'ticketMessageId',v_ticket_message_id,'incidentNumber',v_incident_number);
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_channel_message(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_channel_message(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_channel_outbox(
  p_id uuid, p_status text, p_provider_event_id text DEFAULT NULL, p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.channel_outbox;
  v_max_attempts constant integer := 6;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker omnichannel' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.channel_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item de outbox inexistente' USING ERRCODE = 'P0002'; END IF;

  IF p_status = 'sent' THEN
    UPDATE public.channel_outbox SET status = 'sent', locked_at = NULL, last_error = NULL WHERE id = p_id;
  ELSIF p_status = 'not_configured' THEN
    UPDATE public.channel_outbox SET status = 'dead_letter', locked_at = NULL,
      last_error = COALESCE(p_error, 'Integração do provedor ainda não configurada') WHERE id = p_id;
  ELSE
    IF v_row.attempt_count >= v_max_attempts THEN
      UPDATE public.channel_outbox SET status = 'dead_letter', locked_at = NULL,
        last_error = p_error WHERE id = p_id;
    ELSE
      UPDATE public.channel_outbox SET status = 'pending', locked_at = NULL,
        last_error = p_error,
        next_attempt_at = now() + (interval '1 minute' * power(2, v_row.attempt_count))
       WHERE id = p_id;
    END IF;
  END IF;

  INSERT INTO public.channel_delivery_events
    (company_id, message_id, status, provider_event_id, error_code, error_message, payload)
  SELECT v_row.company_id, cm.id,
         (CASE WHEN p_status = 'sent' THEN 'sent' ELSE 'failed' END)::public.delivery_status,
         p_provider_event_id, NULL, p_error,
         jsonb_build_object('outbox_id', p_id, 'result', p_status)
    FROM public.channel_messages cm
   WHERE cm.ticket_message_id = v_row.source_ticket_message_id
   LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_channel_outbox(uuid, text, text, text)
  FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bi_build_filter_sql(
  p_filters jsonb, p_company_id uuid, p_param_ref text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_conds text[] := ARRAY[]::text[];
  v_n integer;
  v_dim text;
  v_op text;
  v_expr text;
  v_val text;
BEGIN
  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'array' THEN RETURN 'true'; END IF;
  v_n := jsonb_array_length(p_filters);
  IF v_n = 0 THEN RETURN 'true'; END IF;
  IF v_n > 20 THEN RAISE EXCEPTION 'Máximo de 20 filtros por consulta.'; END IF;

  FOR v_filter_index IN 0 .. v_n - 1 LOOP
    v_dim := p_filters->v_filter_index->>'dim';
    v_op := COALESCE(p_filters->v_filter_index->>'op', 'eq');
    v_expr := public.bi_resolve_dimension(v_dim, p_company_id);
    v_val := format('(%s->%s->>''value'')', p_param_ref, v_filter_index);
    v_conds := array_append(v_conds, CASE v_op
      WHEN 'eq'       THEN format('%s = %s', v_expr, v_val)
      WHEN 'neq'      THEN format('%s IS DISTINCT FROM %s', v_expr, v_val)
      WHEN 'in'       THEN format('%s IN (SELECT jsonb_array_elements_text(%s->%s->''value''))', v_expr, p_param_ref, v_filter_index)
      WHEN 'not_in'   THEN format('COALESCE(%s, '''') NOT IN (SELECT jsonb_array_elements_text(%s->%s->''value''))', v_expr, p_param_ref, v_filter_index)
      WHEN 'contains' THEN format('%s ILIKE ''%%'' || %s || ''%%''', v_expr, v_val)
      WHEN 'gte'      THEN format('%s >= %s', v_expr, v_val)
      WHEN 'lte'      THEN format('%s <= %s', v_expr, v_val)
      WHEN 'is_null'  THEN format('(%s IS NULL OR %s = '''')', v_expr, v_expr)
      WHEN 'not_null' THEN format('(%s IS NOT NULL AND %s <> '''')', v_expr, v_expr)
      ELSE NULL
    END);
    IF v_conds[array_length(v_conds, 1)] IS NULL THEN
      RAISE EXCEPTION 'Operador de filtro desconhecido: %', v_op;
    END IF;
  END LOOP;
  RETURN array_to_string(v_conds, ' AND ');
END;
$$;

CREATE OR REPLACE FUNCTION public.bi_cube(
  p_company_id uuid,
  p_record_types text[] DEFAULT ARRAY['incident','request'],
  p_dimensions text[] DEFAULT ARRAY[]::text[],
  p_measures text[] DEFAULT ARRAY['count'],
  p_filters jsonb DEFAULT '[]'::jsonb,
  p_date_from timestamptz DEFAULT now() - interval '30 days',
  p_date_to timestamptz DEFAULT now(),
  p_date_field text DEFAULT 'created_at', p_limit integer DEFAULT 1000
) RETURNS TABLE(dims jsonb, measures jsonb)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_dim_pairs text[] := ARRAY[]::text[];
  v_dim_exprs text[] := ARRAY[]::text[];
  v_mea_pairs text[] := ARRAY[]::text[];
  v_first_mea text;
  v_expr text;
  v_key text;
  v_filter_sql text;
  v_sql text;
  v_limit integer;
BEGIN
  dims := NULL;
  measures := NULL;
  IF public.is_current_user_msp_admin() THEN
    v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
    IF v_company IS NULL THEN RAISE EXCEPTION 'Usuário sem tenant associado.'; END IF;
  END IF;
  IF array_length(p_dimensions, 1) > 3 THEN RAISE EXCEPTION 'Máximo de 3 dimensões por consulta.'; END IF;
  IF COALESCE(array_length(p_measures, 1), 0) = 0 OR array_length(p_measures, 1) > 8 THEN
    RAISE EXCEPTION 'Informe de 1 a 8 medidas.';
  END IF;
  IF p_date_field NOT IN ('created_at','resolved_at','closed_at') THEN
    RAISE EXCEPTION 'Campo de data inválido: %', p_date_field;
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);

  FOREACH v_key IN ARRAY COALESCE(p_dimensions, ARRAY[]::text[]) LOOP
    v_expr := public.bi_resolve_dimension(v_key, COALESCE(v_company, p_company_id));
    v_dim_pairs := array_append(v_dim_pairs, format('%L, (%s)::text', v_key, v_expr));
    v_dim_exprs := array_append(v_dim_exprs, v_expr);
  END LOOP;
  FOREACH v_key IN ARRAY p_measures LOOP
    SELECT bm.sql_expr INTO v_expr FROM public.bi_measures bm WHERE bm.key = v_key;
    IF v_expr IS NULL THEN RAISE EXCEPTION 'Medida desconhecida: %', v_key; END IF;
    v_mea_pairs := array_append(v_mea_pairs, format('%L, (%s)::numeric', v_key, v_expr));
    IF v_first_mea IS NULL THEN v_first_mea := v_expr; END IF;
  END LOOP;
  v_filter_sql := public.bi_build_filter_sql(p_filters, COALESCE(v_company, p_company_id), '$5');
  v_sql := format(
    'SELECT %s AS dims, jsonb_build_object(%s) AS measures
       FROM public.bi_tickets_unified
      WHERE ($1::uuid IS NULL OR company_id = $1)
        AND record_type = ANY($4)
        AND %I >= $2 AND %I < $3 AND (%s)
      %s ORDER BY (%s) DESC NULLS LAST LIMIT %s',
    CASE WHEN cardinality(v_dim_pairs) > 0
      THEN 'jsonb_build_object(' || array_to_string(v_dim_pairs, ', ') || ')'
      ELSE '''{}''::jsonb' END,
    array_to_string(v_mea_pairs, ', '), p_date_field, p_date_field, v_filter_sql,
    CASE WHEN cardinality(v_dim_exprs) > 0
      THEN 'GROUP BY ' || array_to_string(v_dim_exprs, ', ') ELSE '' END,
    v_first_mea, v_limit);
  RETURN QUERY EXECUTE v_sql
    USING v_company, p_date_from, p_date_to, p_record_types, p_filters;
END;
$$;

CREATE OR REPLACE FUNCTION public.bi_drilldown(
  p_company_id uuid, p_record_types text[] DEFAULT ARRAY['incident','request'],
  p_filters jsonb DEFAULT '[]'::jsonb,
  p_date_from timestamptz DEFAULT now() - interval '30 days',
  p_date_to timestamptz DEFAULT now(), p_date_field text DEFAULT 'created_at',
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid, record_type text, number text, short_description text, state text,
  priority text, group_name text, assigned_to_name text, created_at timestamptz,
  sla_breached boolean, total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_filter_sql text;
  v_sql text;
BEGIN
  id := NULL; record_type := NULL; number := NULL; short_description := NULL;
  state := NULL; priority := NULL; group_name := NULL; assigned_to_name := NULL;
  created_at := NULL; sla_breached := NULL; total_count := NULL;
  IF public.is_current_user_msp_admin() THEN v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
    IF v_company IS NULL THEN RAISE EXCEPTION 'Usuário sem tenant associado.'; END IF;
  END IF;
  IF p_date_field NOT IN ('created_at','resolved_at','closed_at') THEN
    RAISE EXCEPTION 'Campo de data inválido: %', p_date_field;
  END IF;
  v_filter_sql := public.bi_build_filter_sql(p_filters, COALESCE(v_company, p_company_id), '$4');
  v_sql := format(
    'SELECT id, record_type, number, short_description, state, priority,
            group_name, assigned_to_name, created_at, COALESCE(sla_breached, false),
            count(*) OVER () AS total_count
       FROM public.bi_tickets_unified
      WHERE ($1::uuid IS NULL OR company_id = $1) AND record_type = ANY($5)
        AND %I >= $2 AND %I < $3 AND (%s)
      ORDER BY created_at DESC LIMIT %s OFFSET %s',
    p_date_field, p_date_field, v_filter_sql,
    LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500), GREATEST(COALESCE(p_offset, 0), 0));
  RETURN QUERY EXECUTE v_sql
    USING v_company, p_date_from, p_date_to, p_filters, p_record_types;
END;
$$;

CREATE OR REPLACE FUNCTION public.bi_dimension_values(
  p_company_id uuid, p_dimension text, p_search text DEFAULT NULL,
  p_record_types text[] DEFAULT ARRAY['incident','request','problem','change']
) RETURNS TABLE(value text, occurrences bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_expr text;
  v_sql text;
BEGIN
  value := NULL;
  occurrences := NULL;
  IF public.is_current_user_msp_admin() THEN v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
    IF v_company IS NULL THEN RAISE EXCEPTION 'Usuário sem tenant associado.'; END IF;
  END IF;
  v_expr := public.bi_resolve_dimension(p_dimension, COALESCE(v_company, p_company_id));
  v_sql := format(
    'SELECT (%s)::text AS value, count(*) AS occurrences
       FROM public.bi_tickets_unified
      WHERE ($1::uuid IS NULL OR company_id = $1) AND record_type = ANY($2)
        AND (%s) IS NOT NULL AND (%s)::text <> ''''
        AND ($3::text IS NULL OR (%s)::text ILIKE ''%%'' || $3 || ''%%'')
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50', v_expr, v_expr, v_expr, v_expr);
  RETURN QUERY EXECUTE v_sql USING v_company, p_record_types, p_search;
END;
$$;
