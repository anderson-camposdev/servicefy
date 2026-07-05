-- ============================================================
-- Flowfy ITSM — Migration 054
-- Motor de SLA: TRATAMENTO DE REABERTURA.
--
-- Hoje existem dois caminhos de reabertura no código
-- (reopen_incident_on_user_message — Migration 018 — e o botão
-- "Reabrir Chamado" do Cockpit via incidentsService.conduct),
-- mas nenhum ajusta os prazos de SLA. Um chamado que fica
-- 3 dias "Resolvido" e é reaberto hoje mantém o prazo original
-- vencido, penalizando o analista.
--
-- Esta migration estende tg_handle_sla_pause() (Migration 034)
-- com um terceiro ramo: sair de Resolved/Closed para qualquer
-- estado aberto conta como "tempo congelado" (mesma mecânica de
-- pausa), ancorado em resolved_at (sobrevive à transição
-- automática Resolved→Closed, então captura o tempo morto
-- completo independente de quando o auto-close rodou).
--
-- Depende das Migrations 032 (calendário), 033 (deadlines),
-- 034 (paused_at/acumulador) e 035 (sla_events/ledger).
-- Idempotente.
-- ============================================================

-- ─── 1. Coluna de acumulador de reabertura (separada da pausa) ─
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS accumulated_reopen_time_minutes INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.incidents.accumulated_reopen_time_minutes IS
  'Total de minutos ÚTEIS decorridos em Resolved/Closed antes de reaberturas, ao longo da vida do chamado. Migration 054.';

-- ─── 2. sla_events: permitir o novo tipo de evento ────────────
ALTER TABLE public.sla_events DROP CONSTRAINT IF EXISTS sla_events_event_type_check;
ALTER TABLE public.sla_events ADD CONSTRAINT sla_events_event_type_check
  CHECK (event_type IN (
    'response_start', 'response_achieved', 'resolution_start',
    'paused', 'resumed', 'breached', 'reopened'
  ));

-- ─── 3. tg_handle_sla_pause(): novo ramo (C) de reabertura ────
-- NOTA: incidents.state é o enum nativo `incident_state`, não TEXT.
-- Todo state comparado contra um TEXT[] precisa de cast explícito
-- (::text) — sem isso, `enum = ANY(text[])` falha em tempo de
-- execução (operador inexistente). Corrigido aqui para os três
-- ramos (pausa, retomada, reabertura).
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

  -- (C) REABERTURA: estava Resolved/Closed, sai para qualquer estado aberto.
  -- Ancorado em resolved_at (não closed_at) — sobrevive à transição
  -- automática Resolved→Closed, capturando o tempo morto completo.
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

-- Trigger em si não muda (mesma assinatura da Migration 034) — só a função.
DROP TRIGGER IF EXISTS tg_handle_sla_pause ON public.incidents;
CREATE TRIGGER tg_handle_sla_pause
  BEFORE UPDATE OF state ON public.incidents
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.tg_handle_sla_pause();

-- ─── 4. tg_sla_events_on_update(): registra o evento 'reopened' ─
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

  IF OLD.state IS DISTINCT FROM NEW.state THEN
    -- Pausa / retomada (o BEFORE trigger da 034 já ajustou os prazos).
    -- NOTA: state é o enum incident_state — cast ::text ao chamar
    -- sla_is_paused_state(text) e nas comparações com ARRAY literal.
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
    -- Reabertura (o BEFORE trigger acima já ajustou os prazos).
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
  EXECUTE FUNCTION public.tg_sla_events_on_update();

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   UPDATE public.incidents SET state = 'Resolved', resolved_at = now() WHERE number = 'INCxxxxxxx';
--   UPDATE public.incidents SET state = 'In Progress' WHERE number = 'INCxxxxxxx';
--   SELECT number, state, accumulated_reopen_time_minutes, sla_resolution_deadline
--     FROM public.incidents WHERE number = 'INCxxxxxxx';
--   SELECT event_type, metadata FROM public.sla_events
--    WHERE incident_id = (SELECT id FROM incidents WHERE number='INCxxxxxxx')
--    ORDER BY created_at DESC LIMIT 3;
-- ────────────────────────────────────────────────────────────
