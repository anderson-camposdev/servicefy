-- ============================================================
-- Flowfy ITSM — Migration 032
-- Motor de SLA (1/5): CALENDÁRIO ÚTIL por cliente.
--
-- Fundação de que todo o restante do motor depende. Substitui o
-- conceito de "relógio de parede" por um calendário customizável
-- por tenant (24/7 OU horário comercial), com turnos e feriados.
--
-- Entrega:
--   1. Tabelas sla_calendars / sla_calendar_shifts / sla_calendar_holidays
--   2. companies.default_sla_calendar_id (calendário padrão do cliente)
--   3. Funções núcleo:
--        sla_business_minutes_between(cal, from, to)  -> minutos úteis
--        sla_add_business_minutes(cal, from, mins)    -> instante futuro
--   4. RLS + GRANTs no padrão multi-tenant
--   5. Seed: "24x7" e "Comercial (08–18, Seg–Sex)" para cada company
--
-- Convenção de weekday: 0=Domingo .. 6=Sábado (igual a EXTRACT(DOW)).
-- ============================================================

-- ─── 1. Tabelas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sla_calendars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  is_24x7     BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sla_calendars_company ON public.sla_calendars(company_id);

-- Turnos por dia da semana (suporta turnos partidos: 2+ linhas no mesmo weekday).
CREATE TABLE IF NOT EXISTS public.sla_calendar_shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID NOT NULL REFERENCES public.sla_calendars(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_sla_calendar_shifts_cal ON public.sla_calendar_shifts(calendar_id);

-- Feriados / exceções de dia inteiro (sem expediente).
CREATE TABLE IF NOT EXISTS public.sla_calendar_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID NOT NULL REFERENCES public.sla_calendars(id) ON DELETE CASCADE,
  holiday     DATE NOT NULL,
  name        TEXT,
  UNIQUE (calendar_id, holiday)
);
CREATE INDEX IF NOT EXISTS idx_sla_calendar_holidays_cal ON public.sla_calendar_holidays(calendar_id);

-- ─── 2. Calendário padrão do cliente ─────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_sla_calendar_id UUID
    REFERENCES public.sla_calendars(id) ON DELETE SET NULL;

-- ─── 3. Funções núcleo ───────────────────────────────────────

-- Minutos ÚTEIS decorridos entre dois instantes, respeitando turnos
-- e feriados do calendário (ou wall-clock se 24x7). Retorna 0 se o
-- intervalo for vazio/invertido ou o calendário não existir.
CREATE OR REPLACE FUNCTION public.sla_business_minutes_between(
  p_calendar_id UUID,
  p_from        TIMESTAMPTZ,
  p_to          TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz          TEXT;
  v_is_24x7     BOOLEAN;
  v_total       NUMERIC := 0;
  v_day         DATE;
  v_end_day     DATE;
  v_shift       RECORD;
  v_shift_start TIMESTAMPTZ;
  v_shift_end   TIMESTAMPTZ;
  v_lo          TIMESTAMPTZ;
  v_hi          TIMESTAMPTZ;
BEGIN
  IF p_calendar_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RETURN 0;
  END IF;

  SELECT timezone, is_24x7 INTO v_tz, v_is_24x7
    FROM public.sla_calendars WHERE id = p_calendar_id;

  -- Calendário ausente: trata como 24x7 (fallback seguro).
  IF NOT FOUND OR v_is_24x7 THEN
    RETURN floor(EXTRACT(EPOCH FROM (p_to - p_from)) / 60)::INTEGER;
  END IF;

  v_day     := (p_from AT TIME ZONE v_tz)::date;
  v_end_day := (p_to   AT TIME ZONE v_tz)::date;

  WHILE v_day <= v_end_day LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.sla_calendar_holidays
       WHERE calendar_id = p_calendar_id AND holiday = v_day
    ) THEN
      FOR v_shift IN
        SELECT start_time, end_time
          FROM public.sla_calendar_shifts
         WHERE calendar_id = p_calendar_id
           AND weekday = EXTRACT(DOW FROM v_day)::int
      LOOP
        -- Converte a hora local do turno (no dia v_day) para timestamptz.
        v_shift_start := (v_day + v_shift.start_time) AT TIME ZONE v_tz;
        v_shift_end   := (v_day + v_shift.end_time)   AT TIME ZONE v_tz;

        v_lo := GREATEST(v_shift_start, p_from);
        v_hi := LEAST(v_shift_end, p_to);

        IF v_hi > v_lo THEN
          v_total := v_total + EXTRACT(EPOCH FROM (v_hi - v_lo)) / 60;
        END IF;
      END LOOP;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  RETURN floor(v_total)::INTEGER;
END;
$$;

COMMENT ON FUNCTION public.sla_business_minutes_between(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Minutos úteis decorridos entre dois instantes, respeitando turnos e feriados do calendário (wall-clock se 24x7).';

-- Instante absoluto que está p_mins minutos ÚTEIS após p_from, segundo
-- o calendário. Usado para projetar o "vence em" (due) do SLA.
CREATE OR REPLACE FUNCTION public.sla_add_business_minutes(
  p_calendar_id UUID,
  p_from        TIMESTAMPTZ,
  p_mins        INTEGER
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz          TEXT;
  v_is_24x7     BOOLEAN;
  v_remaining   NUMERIC;
  v_day         DATE;
  v_guard       INTEGER := 0;
  v_shift       RECORD;
  v_shift_start TIMESTAMPTZ;
  v_shift_end   TIMESTAMPTZ;
  v_lo          TIMESTAMPTZ;
  v_avail       NUMERIC;
BEGIN
  IF p_from IS NULL OR p_mins IS NULL OR p_mins <= 0 THEN
    RETURN p_from;
  END IF;

  SELECT timezone, is_24x7 INTO v_tz, v_is_24x7
    FROM public.sla_calendars WHERE id = p_calendar_id;

  IF p_calendar_id IS NULL OR NOT FOUND OR v_is_24x7 THEN
    RETURN p_from + make_interval(mins => p_mins);
  END IF;

  v_remaining := p_mins;
  v_day := (p_from AT TIME ZONE v_tz)::date;

  -- Cap de segurança: ~2 anos de dias úteis evita laço infinito caso
  -- o calendário não tenha turno algum.
  WHILE v_guard < 732 LOOP
    v_guard := v_guard + 1;

    IF NOT EXISTS (
      SELECT 1 FROM public.sla_calendar_holidays
       WHERE calendar_id = p_calendar_id AND holiday = v_day
    ) THEN
      FOR v_shift IN
        SELECT start_time, end_time
          FROM public.sla_calendar_shifts
         WHERE calendar_id = p_calendar_id
           AND weekday = EXTRACT(DOW FROM v_day)::int
         ORDER BY start_time
      LOOP
        v_shift_start := (v_day + v_shift.start_time) AT TIME ZONE v_tz;
        v_shift_end   := (v_day + v_shift.end_time)   AT TIME ZONE v_tz;

        -- Não conta tempo anterior a p_from (primeiro dia parcial).
        v_lo := GREATEST(v_shift_start, p_from);

        IF v_shift_end > v_lo THEN
          v_avail := EXTRACT(EPOCH FROM (v_shift_end - v_lo)) / 60;

          IF v_avail >= v_remaining THEN
            RETURN v_lo + make_interval(secs => v_remaining * 60);
          END IF;

          v_remaining := v_remaining - v_avail;
        END IF;
      END LOOP;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  -- Calendário sem expediente suficiente: devolve o fim da janela varrida.
  RETURN (v_day + TIME '00:00') AT TIME ZONE v_tz;
END;
$$;

COMMENT ON FUNCTION public.sla_add_business_minutes(UUID, TIMESTAMPTZ, INTEGER) IS
  'Instante N minutos úteis após p_from, segundo o calendário (wall-clock se 24x7). Projeta o prazo do SLA.';

-- ─── 4. RLS + GRANTs ─────────────────────────────────────────
ALTER TABLE public.sla_calendars         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_calendar_shifts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_calendar_holidays ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_calendars         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_calendar_shifts   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_calendar_holidays TO authenticated;

-- sla_calendars: leitura por tenant; escrita por admin do tenant ou MSP.
DROP POLICY IF EXISTS select_sla_calendars ON public.sla_calendars;
CREATE POLICY select_sla_calendars ON public.sla_calendars
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_sla_calendars ON public.sla_calendars;
CREATE POLICY write_sla_calendars ON public.sla_calendars
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- Shifts e holidays herdam a governança pelo calendário pai.
DROP POLICY IF EXISTS select_sla_calendar_shifts ON public.sla_calendar_shifts;
CREATE POLICY select_sla_calendar_shifts ON public.sla_calendar_shifts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sla_calendars c
     WHERE c.id = calendar_id
       AND (public.is_current_user_msp_admin() OR c.company_id = public.get_current_user_company_id())
  ));
DROP POLICY IF EXISTS write_sla_calendar_shifts ON public.sla_calendar_shifts;
CREATE POLICY write_sla_calendar_shifts ON public.sla_calendar_shifts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sla_calendars c
     WHERE c.id = calendar_id
       AND (public.is_current_user_msp_admin() OR (c.company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sla_calendars c
     WHERE c.id = calendar_id
       AND (public.is_current_user_msp_admin() OR (c.company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  ));

DROP POLICY IF EXISTS select_sla_calendar_holidays ON public.sla_calendar_holidays;
CREATE POLICY select_sla_calendar_holidays ON public.sla_calendar_holidays
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sla_calendars c
     WHERE c.id = calendar_id
       AND (public.is_current_user_msp_admin() OR c.company_id = public.get_current_user_company_id())
  ));
DROP POLICY IF EXISTS write_sla_calendar_holidays ON public.sla_calendar_holidays;
CREATE POLICY write_sla_calendar_holidays ON public.sla_calendar_holidays
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sla_calendars c
     WHERE c.id = calendar_id
       AND (public.is_current_user_msp_admin() OR (c.company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sla_calendars c
     WHERE c.id = calendar_id
       AND (public.is_current_user_msp_admin() OR (c.company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  ));

-- ─── 5. Seed: calendários padrão por company ─────────────────
-- Cria "24x7" e "Comercial (08–18, Seg–Sex)" para cada empresa que
-- ainda não tenha calendário. Define o Comercial como padrão quando a
-- empresa ainda não tem default. Idempotente.
DO $$
DECLARE
  v_company   RECORD;
  v_cal_24x7  UUID;
  v_cal_comm  UUID;
  v_wd        SMALLINT;
BEGIN
  FOR v_company IN SELECT id FROM public.companies LOOP
    -- 24x7
    SELECT id INTO v_cal_24x7
      FROM public.sla_calendars
     WHERE company_id = v_company.id AND name = '24x7'
     LIMIT 1;
    IF v_cal_24x7 IS NULL THEN
      INSERT INTO public.sla_calendars (company_id, name, is_24x7)
        VALUES (v_company.id, '24x7', true)
        RETURNING id INTO v_cal_24x7;
    END IF;

    -- Comercial (08–18, Seg–Sex)
    SELECT id INTO v_cal_comm
      FROM public.sla_calendars
     WHERE company_id = v_company.id AND name = 'Comercial (08–18, Seg–Sex)'
     LIMIT 1;
    IF v_cal_comm IS NULL THEN
      INSERT INTO public.sla_calendars (company_id, name, is_24x7)
        VALUES (v_company.id, 'Comercial (08–18, Seg–Sex)', false)
        RETURNING id INTO v_cal_comm;

      FOR v_wd IN 1..5 LOOP  -- Segunda(1) a Sexta(5)
        INSERT INTO public.sla_calendar_shifts (calendar_id, weekday, start_time, end_time)
          VALUES (v_cal_comm, v_wd, TIME '08:00', TIME '18:00');
      END LOOP;
    END IF;

    -- Define padrão se ainda não houver.
    UPDATE public.companies
       SET default_sla_calendar_id = v_cal_comm
     WHERE id = v_company.id
       AND default_sla_calendar_id IS NULL;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT name, is_24x7 FROM public.sla_calendars ORDER BY company_id, name;
--   -- minutos úteis em um calendário comercial (deve ignorar fora do expediente):
--   SELECT public.sla_business_minutes_between(
--     (SELECT id FROM public.sla_calendars WHERE name LIKE 'Comercial%' LIMIT 1),
--     now(), now() + INTERVAL '2 days');
-- ────────────────────────────────────────────────────────────
