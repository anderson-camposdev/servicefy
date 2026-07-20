-- ServiceFY — correção de mapeamento de campos na view de incidentes.
-- A view 'incidents' é a principal interface para o PostgREST (API) e para a UI,
-- mas as funções INSTEAD OF INSERT/UPDATE (tg_incidents_view_insert e tg_incidents_view_update)
-- não estavam repassando dezenas de campos críticos para a tabela base 'tickets'.
-- Isso causava falhas silenciosas onde atualizações no SLA (ex: is_response_breached),
-- pausas, mtta/mttr e catálogo eram ignoradas.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_incidents_view_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_priority public.ticket_priority;
BEGIN
  v_priority := NEW.priority;
  IF NEW.ticket_type IS NULL OR NEW.ticket_type = 'incident' THEN
    IF NEW.impact IS NOT NULL AND NEW.urgency IS NOT NULL THEN
      v_priority := public.calculate_incident_priority(NEW.impact, NEW.urgency);
    END IF;
  END IF;

  UPDATE public.tickets SET
    number = NEW.number,
    company_id = NEW.company_id,
    ticket_type = NEW.ticket_type::ticket_type_enum,
    short_description = NEW.short_description,
    description = NEW.description,
    priority = v_priority,
    state = NEW.state,
    caller_id = NEW.caller_id,
    caller_name = NEW.caller_name,
    assigned_to_id = NEW.assigned_to_id,
    assigned_to_name = NEW.assigned_to_name,
    assigned_group_id = NEW.assigned_group_id,
    assigned_group_name = NEW.assigned_group_name,
    assignment_group_id = NEW.assignment_group_id,
    sla_breached = NEW.sla_breached,
    sla_response_deadline = NEW.sla_response_deadline,
    sla_resolution_deadline = NEW.sla_resolution_deadline,
    responded_at = NEW.responded_at,
    resolved_at = NEW.resolved_at,
    closed_at = NEW.closed_at,
    close_code = NEW.close_code,
    close_notes = NEW.close_notes,
    resolution_code = NEW.resolution_code,
    resolution_notes = NEW.resolution_notes,
    kb_candidate = COALESCE(NEW.kb_candidate, false),
    updated_at = COALESCE(NEW.updated_at, NOW()),
    approval_status = NEW.approval_status,
    case_id = NEW.case_id,

    -- Novos campos MAPEADOS que estavam sendo ignorados silenciosamente:
    catalog_item_id = NEW.catalog_item_id,
    catalog_subitem_id = NEW.catalog_subitem_id,
    catalog_symptom_id = NEW.catalog_symptom_id,
    catalog_service_id = NEW.catalog_service_id,
    symptom_id = NEW.symptom_id,
    priority_level = NEW.priority_level,
    sla_managed_by_client = NEW.sla_managed_by_client,
    paused_at = NEW.paused_at,
    accumulated_paused_time_minutes = NEW.accumulated_paused_time_minutes,
    pending_reason_id = NEW.pending_reason_id,
    is_response_breached = NEW.is_response_breached,
    is_resolution_breached = NEW.is_resolution_breached,
    request_subcategory_id = NEW.request_subcategory_id,
    accumulated_reopen_time_minutes = NEW.accumulated_reopen_time_minutes,
    tags = NEW.tags,
    opened_via = NEW.opened_via,
    sla_warning_notified = NEW.sla_warning_notified,
    approval_decided_at = NEW.approval_decided_at,
    mtta_minutes = NEW.mtta_minutes,
    mttr_minutes = NEW.mttr_minutes,
    approval_paused_at = NEW.approval_paused_at
  WHERE id = OLD.id;

  IF NEW.ticket_type = 'incident' THEN
    INSERT INTO public.incident_attributes (
      ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id
    ) VALUES (
      OLD.id, NEW.company_id, COALESCE(NEW.category, 'Software'), NEW.impact, NEW.urgency, NEW.root_cause, NEW.workaround, COALESCE(NEW.is_major_incident, false), NEW.related_problem_id
    ) ON CONFLICT (ticket_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      category = EXCLUDED.category,
      impact = EXCLUDED.impact,
      urgency = EXCLUDED.urgency,
      root_cause = EXCLUDED.root_cause,
      workaround = EXCLUDED.workaround,
      is_major_incident = EXCLUDED.is_major_incident,
      related_problem_id = EXCLUDED.related_problem_id;
  ELSIF NEW.ticket_type = 'request' THEN
    INSERT INTO public.service_request_attributes (
      ticket_id, company_id, request_item_id, form_data, cost, currency
    ) VALUES (
      OLD.id, NEW.company_id, NEW.request_item_id, COALESCE(NEW.form_data, '{}'::jsonb), NEW.cost, NEW.currency
    ) ON CONFLICT (ticket_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      request_item_id = EXCLUDED.request_item_id,
      form_data = EXCLUDED.form_data,
      cost = EXCLUDED.cost,
      currency = EXCLUDED.currency;
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.tickets (
    id, number, company_id, ticket_type, short_description, description,
    priority, state, caller_id, caller_name, assigned_to_id, assigned_to_name,
    assigned_group_id, assigned_group_name, assignment_group_id, sla_breached,
    sla_response_deadline, sla_resolution_deadline, responded_at, resolved_at, closed_at,
    close_code, close_notes, resolution_code, resolution_notes, kb_candidate,
    created_at, updated_at, approval_status,
    catalog_symptom_id, catalog_item_id, catalog_subitem_id, catalog_service_id, symptom_id,
    
    priority_level, sla_managed_by_client, paused_at, accumulated_paused_time_minutes,
    pending_reason_id, is_response_breached, is_resolution_breached, request_subcategory_id,
    accumulated_reopen_time_minutes, tags, opened_via, sla_warning_notified,
    approval_decided_at, mtta_minutes, mttr_minutes, approval_paused_at, case_id
  ) VALUES (
    COALESCE(NEW.id, uuid_generate_v4()), NEW.number, NEW.company_id,
    COALESCE(NEW.ticket_type, 'incident')::ticket_type_enum, NEW.short_description, NEW.description,
    NEW.priority, NEW.state, NEW.caller_id, NEW.caller_name, NEW.assigned_to_id, NEW.assigned_to_name,
    NEW.assigned_group_id, NEW.assigned_group_name, NEW.assignment_group_id, NEW.sla_breached,
    NEW.sla_response_deadline, NEW.sla_resolution_deadline, NEW.responded_at, NEW.resolved_at, NEW.closed_at,
    NEW.close_code, NEW.close_notes, NEW.resolution_code, NEW.resolution_notes, COALESCE(NEW.kb_candidate, false),
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()), COALESCE(NEW.approval_status, 'not_required'),
    NEW.catalog_symptom_id, NEW.catalog_item_id, NEW.catalog_subitem_id, NEW.catalog_service_id, NEW.symptom_id,

    NEW.priority_level, NEW.sla_managed_by_client, NEW.paused_at, NEW.accumulated_paused_time_minutes,
    NEW.pending_reason_id, COALESCE(NEW.is_response_breached, false), COALESCE(NEW.is_resolution_breached, false), NEW.request_subcategory_id,
    NEW.accumulated_reopen_time_minutes, NEW.tags, NEW.opened_via, COALESCE(NEW.sla_warning_notified, false),
    NEW.approval_decided_at, NEW.mtta_minutes, NEW.mttr_minutes, NEW.approval_paused_at, NEW.case_id
  ) RETURNING id INTO NEW.id;

  IF COALESCE(NEW.ticket_type, 'incident') = 'incident' THEN
    INSERT INTO public.incident_attributes (
      ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id
    ) VALUES (
      NEW.id, NEW.company_id, COALESCE(NEW.category, 'Software'), NEW.impact, NEW.urgency, NEW.root_cause, NEW.workaround, COALESCE(NEW.is_major_incident, false), NEW.related_problem_id
    );
  ELSIF NEW.ticket_type = 'request' THEN
    INSERT INTO public.service_request_attributes (
      ticket_id, company_id, request_item_id, form_data, cost, currency
    ) VALUES (
      NEW.id, NEW.company_id, NEW.request_item_id, COALESCE(NEW.form_data, '{}'::jsonb), NEW.cost, NEW.currency
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
