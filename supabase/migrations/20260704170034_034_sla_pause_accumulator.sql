-- ============================================================
-- Flowfy ITSM — Migration 034
-- Motor de SLA (3/5): ACUMULADOR DE PAUSA.
--
-- Quando o chamado entra em estado de pausa ('On Hold'/'Pending User'),
-- o relógio de SLA congela. Ao sair da pausa, os minutos ÚTEIS que
-- ficaram congelados são (1) somados no acumulador e (2) empurrados
-- para a frente nos prazos finais — sem penalizar o atendimento.
--
-- Depende de (Migration 032):
--   - public.sla_business_minutes_between(cal, from, to)
--   - public.sla_add_business_minutes(cal, from, mins)
--   - public.sla_calendars / companies.default_sla_calendar_id
-- e das colunas de prazo da Migration 033 (sla_*_deadline).
--
-- Idempotente.
-- ============================================================

-- ─── 1. Colunas de controle de pausa em incidents ────────────
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS paused_at                       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accumulated_paused_time_minutes INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.incidents.paused_at IS
  'Instante em que o chamado entrou em pausa (On Hold/Pending User). NULL quando ativo. Migration 034.';
COMMENT ON COLUMN public.incidents.accumulated_paused_time_minutes IS
  'Total de minutos ÚTEIS já consumidos em pausa ao longo da vida do chamado. Migration 034.';

-- ─── 2. Helper: calendário efetivo do chamado ────────────────
-- Override do nó-final do catálogo (sintoma/item) → padrão da empresa.
-- Mantém a mesma regra usada pelo trigger de projeção (Migration 033).
CREATE OR REPLACE FUNCTION public.sla_calendar_for(
  p_symptom_id      UUID,
  p_request_item_id UUID,
  p_company_id      UUID
) RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_calendar UUID;
BEGIN
  IF p_symptom_id IS NOT NULL THEN
    SELECT sla_calendar_id INTO v_calendar
      FROM public.catalog_service_symptoms WHERE id = p_symptom_id;
  ELSIF p_request_item_id IS NOT NULL THEN
    SELECT sla_calendar_id INTO v_calendar
      FROM public.request_items WHERE id = p_request_item_id;
  END IF;

  IF v_calendar IS NULL THEN
    SELECT default_sla_calendar_id INTO v_calendar
      FROM public.companies WHERE id = p_company_id;
  END IF;

  RETURN v_calendar;
END;
$$;

-- ─── 3. Trigger de transição de status (tg_handle_sla_pause) ──
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
  v_was_paused := OLD.state = ANY (v_paused_states);
  v_is_paused  := NEW.state = ANY (v_paused_states);

  -- (A) ENTRANDO em pausa: carimba o instante (só na transição).
  IF v_is_paused AND NOT v_was_paused THEN
    NEW.paused_at := v_now;
    RETURN NEW;
  END IF;

  -- (B) SAINDO da pausa: desconta os minutos úteis congelados.
  IF v_was_paused AND NOT v_is_paused AND OLD.paused_at IS NOT NULL THEN
    v_calendar := public.sla_calendar_for(NEW.symptom_id, NEW.request_item_id, NEW.company_id);

    -- 1. Minutos úteis decorridos durante a pausa.
    v_paused_mins := public.sla_business_minutes_between(v_calendar, OLD.paused_at, v_now);

    -- 2. Acumula.
    NEW.accumulated_paused_time_minutes :=
      COALESCE(OLD.accumulated_paused_time_minutes, 0) + COALESCE(v_paused_mins, 0);

    -- 3. Libera o relógio.
    NEW.paused_at := NULL;

    -- 4. Posterga os prazos finais pelos minutos congelados.
    IF v_paused_mins > 0 THEN
      -- Resposta: só faz sentido postergar enquanto não respondido.
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

DROP TRIGGER IF EXISTS tg_handle_sla_pause ON public.incidents;
CREATE TRIGGER tg_handle_sla_pause
  BEFORE UPDATE OF state ON public.incidents
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.tg_handle_sla_pause();

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   -- entra em pausa → paused_at preenchido:
--   UPDATE public.incidents SET state = 'On Hold' WHERE number = 'INCxxxxxxx';
--   -- sai da pausa → acumula minutos e empurra deadlines:
--   UPDATE public.incidents SET state = 'In Progress' WHERE number = 'INCxxxxxxx';
--   SELECT number, state, paused_at, accumulated_paused_time_minutes,
--          sla_resolution_deadline
--     FROM public.incidents WHERE number = 'INCxxxxxxx';
-- ────────────────────────────────────────────────────────────
