CREATE OR REPLACE FUNCTION public.tg_workflow_on_incident_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event   TEXT;
  v_rule    public.workflow_rules;
  v_matched BOOLEAN;
  v_depth   INT;
BEGIN
  v_depth := COALESCE(NULLIF(current_setting('flowfy.workflow_depth', true), '')::INT, 0);
  IF v_depth >= 3 THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('flowfy.workflow_depth', (v_depth + 1)::TEXT, true);

  v_event := CASE
    WHEN TG_OP = 'INSERT' THEN 'incident_created'
    WHEN NEW.state::text = 'Resolved' AND OLD.state::text IS DISTINCT FROM 'Resolved' THEN 'incident_resolved'
    WHEN NEW.state::text = 'Closed'   AND OLD.state::text IS DISTINCT FROM 'Closed'   THEN 'incident_closed'
    ELSE 'incident_updated'
  END;

  FOR v_rule IN
    SELECT * FROM public.workflow_rules
     WHERE company_id = NEW.company_id
       AND active = true
       AND trigger_event = v_event
       AND ticket_type = NEW.ticket_type
       AND (trigger_source = 'any' OR trigger_source = NEW.opened_via)
     ORDER BY priority_order ASC
  LOOP
    v_matched := public.workflow_eval_conditions(v_rule.conditions, NEW);
    IF v_matched THEN
      PERFORM public.workflow_dispatch_actions(v_rule, NEW);
    END IF;

    INSERT INTO public.workflow_execution_log
      (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
    VALUES (
      NEW.company_id, v_rule.id, v_rule.name, NEW.id, NEW.number, v_event, v_matched,
      CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
      CASE WHEN v_matched
           THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
           ELSE 'Condição não atendida'
      END
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_workflow_on_comment_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident public.incidents;
  v_rule     public.workflow_rules;
  v_matched  BOOLEAN;
  v_depth    INT;
BEGIN
  v_depth := COALESCE(NULLIF(current_setting('flowfy.workflow_depth', true), '')::INT, 0);
  IF v_depth >= 3 THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('flowfy.workflow_depth', (v_depth + 1)::TEXT, true);

  SELECT * INTO v_incident FROM public.incidents WHERE id = NEW.incident_id;
  IF v_incident.id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.workflow_rules
     WHERE company_id = v_incident.company_id
       AND active = true
       AND trigger_event = 'comment_added'
       AND ticket_type = v_incident.ticket_type
       AND (trigger_source = 'any' OR trigger_source = v_incident.opened_via)
     ORDER BY priority_order ASC
  LOOP
    v_matched := public.workflow_eval_conditions(v_rule.conditions, v_incident);
    IF v_matched THEN
      PERFORM public.workflow_dispatch_actions(v_rule, v_incident);
    END IF;

    INSERT INTO public.workflow_execution_log
      (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
    VALUES (
      v_incident.company_id, v_rule.id, v_rule.name, v_incident.id, v_incident.number, 'comment_added', v_matched,
      CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
      CASE WHEN v_matched
           THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
           ELSE 'Condição não atendida'
      END
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec  RECORD;
  v_inc  public.incidents;
  v_rule public.workflow_rules;
  v_matched BOOLEAN;
BEGIN
  FOR v_rec IN
    SELECT id FROM public.incidents
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND responded_at IS NULL
       AND is_response_breached = false
       AND sla_response_deadline IS NOT NULL
       AND sla_response_deadline < now()
  LOOP
    UPDATE public.incidents
       SET is_response_breached = true
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'response'));
  END LOOP;

  FOR v_rec IN
    SELECT id FROM public.incidents
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND resolved_at IS NULL
       AND is_resolution_breached = false
       AND sla_resolution_deadline IS NOT NULL
       AND sla_resolution_deadline < now()
  LOOP
    UPDATE public.incidents
       SET is_resolution_breached = true,
           sla_breached           = true
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'resolution'));

    SELECT * INTO v_inc FROM public.incidents WHERE id = v_rec.id;
    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id
         AND active = true
         AND trigger_event = 'sla_breached'
         AND ticket_type = v_inc.ticket_type
       ORDER BY priority_order ASC
    LOOP
      v_matched := public.workflow_eval_conditions(v_rule.conditions, v_inc);
      IF v_matched THEN
        PERFORM public.workflow_dispatch_actions(v_rule, v_inc);
      END IF;
      INSERT INTO public.workflow_execution_log
        (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
      VALUES (
        v_inc.company_id, v_rule.id, v_rule.name, v_inc.id, v_inc.number, 'sla_breached', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched
             THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
             ELSE 'Condição não atendida'
        END
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
  v_inc  public.incidents;
  v_rule public.workflow_rules;
  v_matched BOOLEAN;
BEGIN
  FOR v_inc IN
    SELECT * FROM public.incidents
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND resolved_at IS NULL
       AND sla_warning_notified = false
       AND sla_resolution_deadline IS NOT NULL
       AND sla_resolution_deadline > now()
       AND sla_resolution_deadline - now() < INTERVAL '30 minutes'
  LOOP
    UPDATE public.incidents SET sla_warning_notified = true WHERE id = v_inc.id;

    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id
         AND active = true
         AND trigger_event = 'sla_warning'
         AND ticket_type = v_inc.ticket_type
       ORDER BY priority_order ASC
    LOOP
      v_matched := public.workflow_eval_conditions(v_rule.conditions, v_inc);
      IF v_matched THEN
        PERFORM public.workflow_dispatch_actions(v_rule, v_inc);
      END IF;
      INSERT INTO public.workflow_execution_log
        (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
      VALUES (
        v_inc.company_id, v_rule.id, v_rule.name, v_inc.id, v_inc.number, 'sla_warning', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched
             THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
             ELSE 'Condição não atendida'
        END
      );
    END LOOP;
  END LOOP;
END;
$$;;
