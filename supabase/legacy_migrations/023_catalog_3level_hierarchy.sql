-- ============================================================
-- Flowfy ITSM — Migration 023
-- Catálogo de Serviços ITSM em 3 NÍVEIS:
--   Categoria (catalog_categories) > Serviço (catalog_services)
--   > Sintoma (system_symptoms via junção catalog_service_symptoms)
-- A junção carrega a GOVERNANÇA: sla_hours, assignment_group_id, active.
-- Sem campos financeiros.
-- ============================================================

-- ─── Nível 2: Serviços ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.catalog_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '🧩',
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_services_company  ON public.catalog_services(company_id);
CREATE INDEX IF NOT EXISTS idx_catalog_services_category ON public.catalog_services(category_id);

-- ─── Tabela mestre: Sintomas universais (global) ──────────────
CREATE TABLE IF NOT EXISTS public.system_symptoms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  icon       TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO public.system_symptoms (name, icon, sort_order) VALUES
  ('Erro / Falha',                     '⚠️', 1),
  ('Lentidão / Performance',           '🐢', 2),
  ('Indisponibilidade / Fora do Ar',   '🔌', 3),
  ('Falha de Acesso / Permissão',      '🔑', 4),
  ('Comportamento Inesperado',         '❓', 5),
  ('Quebra / Dano Físico',             '🔨', 6)
ON CONFLICT (name) DO NOTHING;

-- ─── Nível 3: Junção Serviço × Sintoma (governança) ───────────
CREATE TABLE IF NOT EXISTS public.catalog_service_symptoms (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id          UUID NOT NULL REFERENCES public.catalog_services(id) ON DELETE CASCADE,
  symptom_id          UUID NOT NULL REFERENCES public.system_symptoms(id) ON DELETE CASCADE,
  sla_hours           INT  NOT NULL DEFAULT 24,
  assignment_group_id UUID REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, symptom_id)
);
CREATE INDEX IF NOT EXISTS idx_css_service ON public.catalog_service_symptoms(service_id);
CREATE INDEX IF NOT EXISTS idx_css_company ON public.catalog_service_symptoms(company_id);

-- ─── incidents: rastreio do roteamento do catálogo ───────────
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS catalog_service_id UUID REFERENCES public.catalog_services(id) ON DELETE SET NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS symptom_id         UUID REFERENCES public.system_symptoms(id) ON DELETE SET NULL;

-- ─── Remoção de campos financeiros (legado) ──────────────────
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS cost;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS currency;

-- ─── RLS + GRANTs ────────────────────────────────────────────
-- system_symptoms: leitura global p/ autenticados (dado mestre).
ALTER TABLE public.system_symptoms ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.system_symptoms TO authenticated;
DROP POLICY IF EXISTS select_system_symptoms ON public.system_symptoms;
CREATE POLICY select_system_symptoms ON public.system_symptoms
  FOR SELECT TO authenticated USING (true);

-- catalog_services
ALTER TABLE public.catalog_services ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_services TO authenticated;
DROP POLICY IF EXISTS select_catalog_services ON public.catalog_services;
CREATE POLICY select_catalog_services ON public.catalog_services
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_catalog_services ON public.catalog_services;
CREATE POLICY write_catalog_services ON public.catalog_services
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- catalog_service_symptoms
ALTER TABLE public.catalog_service_symptoms ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_service_symptoms TO authenticated;
DROP POLICY IF EXISTS select_css ON public.catalog_service_symptoms;
CREATE POLICY select_css ON public.catalog_service_symptoms
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_css ON public.catalog_service_symptoms;
CREATE POLICY write_css ON public.catalog_service_symptoms
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));
