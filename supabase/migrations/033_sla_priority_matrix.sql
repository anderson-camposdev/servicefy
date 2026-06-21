-- ============================================================
-- Flowfy ITSM — Migration 033
-- Motor de SLA (2/5): MATRIZ DE PRIORIDADE ITIL + POLÍTICAS
-- multi-tenant + ANALISTAS HÍBRIDOS (Allied vs Cliente) +
-- TRIGGER DE GOVERNANÇA que projeta os prazos consumindo o
-- calendário útil da Migration 032.
--
-- Totalmente idempotente. Depende de:
--   - public.sla_calendars / sla_add_business_minutes (032)
--   - public.companies.default_sla_calendar_id (032)
--
-- Convenção de prioridade numérica: 1 = mais crítico .. 5 = mais baixo.
-- ============================================================

-- ─── 1. ANALISTAS HÍBRIDOS (Allied vs Cliente) ───────────────
-- profile_role diferencia consultoria (allied) do time interno do
-- cliente. NULL = não-analista (solicitante/end user).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_role TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'profiles_profile_role_chk'
       AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_profile_role_chk
      CHECK (profile_role IS NULL OR profile_role IN ('allied_analyst', 'client_analyst'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.profile_role IS
  'Escopo do analista: allied_analyst (consultoria) | client_analyst (time interno do cliente) | NULL (não-analista).';

-- ─── 2. POLÍTICAS DE SLA POR TENANT (sla_policies) ───────────
-- Pode existir uma tabela LEGADA com formato incompatível (priority
-- como enum + response_time_mins). Ela não é usada por nenhum código
-- da aplicação, então recriamos no formato do motor (prioridade
-- numérica 1..5). DROP + CREATE mantém a migration re-executável.
DROP TABLE IF EXISTS public.sla_policies CASCADE;
CREATE TABLE public.sla_policies (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  priority                 INT  NOT NULL CHECK (priority BETWEEN 1 AND 5),
  response_time_minutes    INT  NOT NULL,
  resolution_time_minutes  INT  NOT NULL,
  active                   BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_company_priority
  ON public.sla_policies(company_id, priority);

-- ─── 3. MATRIZ DE PRIORIDADE ITIL (sla_priority_matrix) ──────
-- Dado mestre GLOBAL (3x3 Impacto × Urgência → prioridade 1..5).
CREATE TABLE IF NOT EXISTS public.sla_priority_matrix (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impact             TEXT NOT NULL CHECK (impact  IN ('low', 'medium', 'high')),
  urgency            TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
  resulting_priority INT  NOT NULL CHECK (resulting_priority BETWEEN 1 AND 5),
  UNIQUE (impact, urgency)
);

-- Seed ITIL padrão das 9 combinações (1 = mais crítico).
INSERT INTO public.sla_priority_matrix (impact, urgency, resulting_priority) VALUES
  ('high',   'high',   1),
  ('high',   'medium', 2),
  ('high',   'low',    3),
  ('medium', 'high',   2),
  ('medium', 'medium', 3),
  ('medium', 'low',    4),
  ('low',    'high',   3),
  ('low',    'medium', 4),
  ('low',    'low',    5)
ON CONFLICT (impact, urgency) DO UPDATE
  SET resulting_priority = EXCLUDED.resulting_priority;

-- Seed de políticas padrão por empresa (idempotente). Minutos úteis.
INSERT INTO public.sla_policies (company_id, priority, response_time_minutes, resolution_time_minutes)
SELECT c.id, p.priority, p.resp, p.resol
  FROM public.companies c
  CROSS JOIN (VALUES
    (1, 15,  240),
    (2, 30,  480),
    (3, 60,  1440),
    (4, 240, 2880),
    (5, 480, 5760)
  ) AS p(priority, resp, resol)
ON CONFLICT (company_id, priority) DO NOTHING;

-- ─── 4. OVERRIDES NO CATÁLOGO DE SERVIÇOS ────────────────────
-- Nós-finais ativos: catalog_service_symptoms (incidentes) e
-- request_items (requisições). Permitem forçar calendário e/ou
-- prioridade fixa (ex.: VIP/Diretoria).
ALTER TABLE public.catalog_service_symptoms
  ADD COLUMN IF NOT EXISTS sla_calendar_id UUID
    REFERENCES public.sla_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fixed_priority INT;

ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS sla_calendar_id UUID
    REFERENCES public.sla_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fixed_priority INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'css_fixed_priority_chk'
       AND conrelid = 'public.catalog_service_symptoms'::regclass
  ) THEN
    ALTER TABLE public.catalog_service_symptoms
      ADD CONSTRAINT css_fixed_priority_chk
      CHECK (fixed_priority IS NULL OR fixed_priority BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'request_items_fixed_priority_chk'
       AND conrelid = 'public.request_items'::regclass
  ) THEN
    ALTER TABLE public.request_items
      ADD CONSTRAINT request_items_fixed_priority_chk
      CHECK (fixed_priority IS NULL OR fixed_priority BETWEEN 1 AND 5);
  END IF;
END $$;

-- ─── 5. COLUNAS DE SLA PROJETADO EM incidents ────────────────
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS priority_level           INT,
  ADD COLUMN IF NOT EXISTS sla_response_deadline     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_resolution_deadline   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_managed_by_client     BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.incidents.priority_level IS
  'Prioridade numérica resultante (1..5) calculada pela matriz/override. Migration 033.';
COMMENT ON COLUMN public.incidents.sla_managed_by_client IS
  'TRUE quando o assignee é client_analyst — relógio da Allied congelado (não penaliza métricas).';

-- ─── 6. TRIGGER DE GOVERNANÇA (tg_calculate_ticket_sla) ──────
CREATE OR REPLACE FUNCTION public.tg_calculate_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_impact         TEXT;
  v_urgency        TEXT;
  v_level          INT;
  v_fixed          INT;
  v_calendar       UUID;
  v_resp_mins      INT;
  v_resol_mins     INT;
  v_anchor         TIMESTAMPTZ;
  v_assignee_scope TEXT;
BEGIN
  -- Recalcula apenas na criação ou quando impacto/urgência/assignee mudam.
  IF TG_OP = 'UPDATE'
     AND NEW.impact         IS NOT DISTINCT FROM OLD.impact
     AND NEW.urgency        IS NOT DISTINCT FROM OLD.urgency
     AND NEW.assigned_to_id IS NOT DISTINCT FROM OLD.assigned_to_id THEN
    RETURN NEW;
  END IF;

  -- (a) Override do nó-final do catálogo (prioridade fixa + calendário).
  IF NEW.symptom_id IS NOT NULL THEN
    SELECT fixed_priority, sla_calendar_id
      INTO v_fixed, v_calendar
      FROM public.catalog_service_symptoms
     WHERE id = NEW.symptom_id;
  ELSIF NEW.request_item_id IS NOT NULL THEN
    SELECT fixed_priority, sla_calendar_id
      INTO v_fixed, v_calendar
      FROM public.request_items
     WHERE id = NEW.request_item_id;
  END IF;

  -- (b) Prioridade resultante: fixa OU cruzamento da matriz ITIL.
  IF v_fixed IS NOT NULL THEN
    v_level := v_fixed;
  ELSE
    v_impact  := lower(COALESCE(NEW.impact,  'Medium'));
    v_urgency := lower(COALESCE(NEW.urgency, 'Medium'));
    -- 'critical' não existe na matriz 3x3 → tratado como 'high'.
    IF v_impact  = 'critical' THEN v_impact  := 'high'; END IF;
    IF v_urgency = 'critical' THEN v_urgency := 'high'; END IF;

    SELECT resulting_priority INTO v_level
      FROM public.sla_priority_matrix
     WHERE impact = v_impact AND urgency = v_urgency
     LIMIT 1;
    v_level := COALESCE(v_level, 3);
  END IF;
  NEW.priority_level := v_level;

  -- (c) Calendário: override do item → padrão da empresa.
  IF v_calendar IS NULL THEN
    SELECT default_sla_calendar_id INTO v_calendar
      FROM public.companies WHERE id = NEW.company_id;
  END IF;

  -- (d) REGRA DE OURO DA ALLIED: de quem é a responsabilidade atual?
  IF NEW.assigned_to_id IS NOT NULL THEN
    SELECT profile_role INTO v_assignee_scope
      FROM public.profiles WHERE id = NEW.assigned_to_id;
  END IF;
  NEW.sla_managed_by_client := (v_assignee_scope = 'client_analyst');

  -- (e) Métricas da política de SLA do tenant para a prioridade.
  SELECT response_time_minutes, resolution_time_minutes
    INTO v_resp_mins, v_resol_mins
    FROM public.sla_policies
   WHERE company_id = NEW.company_id
     AND priority = v_level
     AND active = true
   LIMIT 1;

  -- (f) Ticket sob gestão do CLIENTE: congela o relógio da Allied.
  -- Registra a condição (flag) e NÃO move os prazos já projetados,
  -- evitando penalizar as métricas da consultoria.
  IF NEW.sla_managed_by_client THEN
    RETURN NEW;
  END IF;

  -- (g) Projeta os prazos consumindo minutos ÚTEIS (Migration 032).
  v_anchor := COALESCE(NEW.created_at, now());
  IF v_resp_mins IS NOT NULL THEN
    NEW.sla_response_deadline   := public.sla_add_business_minutes(v_calendar, v_anchor, v_resp_mins);
  END IF;
  IF v_resol_mins IS NOT NULL THEN
    NEW.sla_resolution_deadline := public.sla_add_business_minutes(v_calendar, v_anchor, v_resol_mins);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_calculate_ticket_sla ON public.incidents;
CREATE TRIGGER tg_calculate_ticket_sla
  BEFORE INSERT OR UPDATE OF impact, urgency, assigned_to_id, symptom_id, request_item_id
  ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_calculate_ticket_sla();

-- ─── 7. RLS + GRANTs ─────────────────────────────────────────
ALTER TABLE public.sla_policies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_priority_matrix ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_policies        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_priority_matrix TO authenticated;

-- sla_policies: leitura por tenant; escrita por admin do tenant ou MSP.
DROP POLICY IF EXISTS select_sla_policies ON public.sla_policies;
CREATE POLICY select_sla_policies ON public.sla_policies
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_sla_policies ON public.sla_policies;
CREATE POLICY write_sla_policies ON public.sla_policies
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- sla_priority_matrix: dado mestre global → leitura p/ autenticados,
-- escrita só MSP/sysadmin.
DROP POLICY IF EXISTS select_sla_priority_matrix ON public.sla_priority_matrix;
CREATE POLICY select_sla_priority_matrix ON public.sla_priority_matrix
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS write_sla_priority_matrix ON public.sla_priority_matrix;
CREATE POLICY write_sla_priority_matrix ON public.sla_priority_matrix
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR public.get_current_user_role() = 'sysadmin')
  WITH CHECK (public.is_current_user_msp_admin() OR public.get_current_user_role() = 'sysadmin');

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT impact, urgency, resulting_priority FROM public.sla_priority_matrix ORDER BY resulting_priority;
--   SELECT company_id, priority, response_time_minutes, resolution_time_minutes
--     FROM public.sla_policies ORDER BY company_id, priority;
--   -- inspecionar projeção em um chamado:
--   SELECT number, priority_level, sla_managed_by_client,
--          sla_response_deadline, sla_resolution_deadline
--     FROM public.incidents ORDER BY created_at DESC LIMIT 5;
-- ────────────────────────────────────────────────────────────
