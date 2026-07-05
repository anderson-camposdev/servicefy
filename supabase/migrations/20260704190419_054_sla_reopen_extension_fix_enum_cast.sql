CREATE OR REPLACE FUNCTION public.tg_handle_sla_pause()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused_states TEXT[] := ARRAY['On Hold', 'Pending User'];
  v_closed_states TEXT[] := ARRAY['Resolved', 'Closed'];
  v_was_paused    BOOLEAN;
  v_is_paused     BOOLEAN;
  v_was_closed    BOOLEAN;
  v_is_closed     BOOLEAN;
  v_now           TIMESTAMPTZ := clock_timestamp();
  v_calendar      UUID;
  v_paused_mins   INT;
  v_reopen_mins   INT;
BEGIN
  v_was_paused := OLD.state::text = ANY (v_paused_states);
  v_is_paused  := NEW.state::text = ANY (v_paused_states);

  IF v_is_paused AND NOT v_was_paused THEN
    NEW.paused_at := v_now;
    RETURN NEW;
  END IF;

  IF v_was_paused AND NOT v_is_paused AND OLD.paused_at IS NOT NULL THEN
    v_calendar := public.sla_calendar_for(NEW.symptom_id, NEW.request_item_id, NEW.company_id);

    v_paused_mins := public.sla_business_minutes_between(v_calendar, OLD.paused_at, v_now);

    NEW.accumulated_paused_time_minutes :=
      COALESCE(OLD.accumulated_paused_time_minutes, 0) + COALESCE(v_paused_mins, 0);

    NEW.paused_at := NULL;

    IF v_paused_mins > 0 THEN
      IF NEW.sla_response_deadline IS NOT NULL AND NEW.responded_at IS NULL THEN
        NEW.sla_response_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_response_deadline, v_paused_mins);
      END IF;

      IF NEW.sla_resolution_deadline IS NOT NULL THEN
        NEW.sla_resolution_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_resolution_deadline, v_paused_mins);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  v_was_closed := OLD.state::text = ANY (v_closed_states);
  v_is_closed  := NEW.state::text = ANY (v_closed_states);

  IF v_was_closed AND NOT v_is_closed AND OLD.resolved_at IS NOT NULL THEN
    v_calendar := public.sla_calendar_for(NEW.symptom_id, NEW.request_item_id, NEW.company_id);

    v_reopen_mins := public.sla_business_minutes_between(v_calendar, OLD.resolved_at, v_now);

    NEW.accumulated_reopen_time_minutes :=
      COALESCE(OLD.accumulated_reopen_time_minutes, 0) + COALESCE(v_reopen_mins, 0);

    IF v_reopen_mins > 0 THEN
      IF NEW.sla_response_deadline IS NOT NULL AND NEW.responded_at IS NULL THEN
        NEW.sla_response_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_response_deadline, v_reopen_mins);
      END IF;

      IF NEW.sla_resolution_deadline IS NOT NULL THEN
        NEW.sla_resolution_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_resolution_deadline, v_reopen_mins);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_handle_sla_pause ON public.incidents;
CREATE TRIGGER tg_handle_sla_pause
  BEFORE UPDATE OF state ON public.incidents
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.tg_handle_sla_pause();

CREATE OR REPLACE FUNCTION public.tg_sla_events_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.responded_at IS NULL AND NEW.responded_at IS NOT NULL THEN
    PERFORM public.sla_log_event(
      NEW.id, 'response_achieved',
      jsonb_build_object('at', NEW.responded_at)
    );
  END IF;

  IF OLD.state IS DISTINCT FROM NEW.state THEN
    IF public.sla_is_paused_state(NEW.state::text) AND NOT public.sla_is_paused_state(OLD.state::text) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'paused',
        jsonb_build_object('state', NEW.state, 'reason_id', NEW.pending_reason_id, 'at', NEW.paused_at)
      );
    ELSIF public.sla_is_paused_state(OLD.state::text) AND NOT public.sla_is_paused_state(NEW.state::text) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'resumed',
        jsonb_build_object(
          'state', NEW.state,
          'accumulated_paused_minutes', NEW.accumulated_paused_time_minutes,
          'resolution_deadline', NEW.sla_resolution_deadline
        )
      );
    ELSIF OLD.state::text = ANY (ARRAY['Resolved','Closed']) AND NOT (NEW.state::text = ANY (ARRAY['Resolved','Closed'])) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'reopened',
        jsonb_build_object(
          'from_state', OLD.state,
          'to_state', NEW.state,
          'elapsed_minutes', NEW.accumulated_reopen_time_minutes - COALESCE(OLD.accumulated_reopen_time_minutes, 0),
          'resolution_deadline', NEW.sla_resolution_deadline
        )
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_sla_events_on_update ON public.incidents;
CREATE TRIGGER tg_sla_events_on_update
  AFTER UPDATE OF state, responded_at ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sla_events_on_update();;
