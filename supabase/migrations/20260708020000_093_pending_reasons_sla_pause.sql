-- Adicionar coluna pauses_sla na tabela pending_reasons se não existir
ALTER TABLE public.pending_reasons ADD COLUMN IF NOT EXISTS pauses_sla BOOLEAN NOT NULL DEFAULT true;

-- Atualizar a função tg_handle_sla_pause para respeitar a coluna pauses_sla do motivo selecionado
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
  v_pauses_sla    BOOLEAN := true;
BEGIN
  -- Verificar se o motivo de pausa atual configura pausa de SLA
  IF NEW.pending_reason_id IS NOT NULL THEN
    SELECT COALESCE(pauses_sla, true) INTO v_pauses_sla
      FROM public.pending_reasons
     WHERE id = NEW.pending_reason_id;
  END IF;

  v_was_paused := OLD.state::text = ANY (v_paused_states) AND COALESCE((
    SELECT COALESCE(pauses_sla, true)
      FROM public.pending_reasons
     WHERE id = OLD.pending_reason_id
  ), true);

  v_is_paused  := NEW.state::text = ANY (v_paused_states) AND v_pauses_sla;

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

-- Recriar o trigger com monitoramento de pending_reason_id
DROP TRIGGER IF EXISTS tg_handle_sla_pause ON public.incidents;
CREATE TRIGGER tg_handle_sla_pause
  BEFORE UPDATE OF state, pending_reason_id ON public.incidents
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state OR OLD.pending_reason_id IS DISTINCT FROM NEW.pending_reason_id)
  EXECUTE FUNCTION public.tg_handle_sla_pause();
