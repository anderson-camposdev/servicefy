-- ============================================================
-- Flowfy ITSM — Migration 037
-- HOTFIX de casts de enum nos triggers de pausa/eventos.
--
-- Bug: incidents.state é do tipo ENUM public.incident_state. As funções
-- tg_handle_sla_pause (034) e tg_sla_events_on_update (035) comparavam
--   OLD.state = ANY (text[])     -- operator does not exist: incident_state = text
-- e passavam state (enum) para sla_is_paused_state(text). O Postgres NÃO
-- converte enum→text implicitamente, então o INSERT/UPDATE quebrava.
--
-- Correção: castar state::text nesses pontos. Idempotente (CREATE OR REPLACE).
-- ============================================================

-- ─── 1. tg_handle_sla_pause (migration 034) com state::text ──
CREATE OR REPLACE FUNCTION public.tg_handle_sla_pause()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused_states TEXT[] := ARRAY['On Hold', 'Pending User'];
  v_was_paused    BOOLEAN;
  v_is_paused     BOOLEAN;
  v_now           TIMESTAMPTZ := clock_timestamp();
  v_calendar      UUID;
  v_paused_mins   INT;
BEGIN
  v_was_paused := OLD.state::text = ANY (v_paused_states);
  v_is_paused  := NEW.state::text = ANY (v_paused_states);

  -- (A) ENTRANDO em pausa: carimba o instante (só na transição).
  IF v_is_paused AND NOT v_was_paused THEN
    NEW.paused_at := v_now;
    RETURN NEW;
  END IF;

  -- (B) SAINDO da pausa: desconta os minutos úteis congelados.
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

  RETURN NEW;
END;
$$;

-- ─── 2. tg_sla_events_on_update (migration 035) com state::text ──
CREATE OR REPLACE FUNCTION public.tg_sla_events_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Resposta atingida (primeira resposta do analista).
  IF OLD.responded_at IS NULL AND NEW.responded_at IS NOT NULL THEN
    PERFORM public.sla_log_event(
      NEW.id, 'response_achieved',
      jsonb_build_object('at', NEW.responded_at)
    );
  END IF;

  -- Transições de pausa (o BEFORE trigger da 034 já ajustou os prazos).
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
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Os triggers já apontam para estas funções; CREATE OR REPLACE basta.
