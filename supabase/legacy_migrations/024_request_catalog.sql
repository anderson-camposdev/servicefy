-- ============================================================
-- Flowfy ITSM — Migration 024
-- Esteira de REQUISIÇÕES de Serviço (catálogo de 2 níveis):
--   request_categories (Nível 1) > request_items (Nível 2)
-- O item carrega o form dinâmico (form_fields) e o roteamento
-- (assignment_group_id). Sem campos financeiros.
-- ============================================================

-- ─── Nível 1: Categorias de Requisição ────────────────────────
CREATE TABLE IF NOT EXISTS public.request_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,            -- URL do ícone profissional (ou emoji)
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_categories_company ON public.request_categories(company_id);

-- ─── Nível 2: Itens de Requisição ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.request_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_category_id UUID NOT NULL REFERENCES public.request_categories(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  icon                TEXT,                          -- URL do ícone profissional
  form_fields         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- campos customizados
  assignment_group_id UUID REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  active              BOOLEAN NOT NULL DEFAULT true,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_items_company  ON public.request_items(company_id);
CREATE INDEX IF NOT EXISTS idx_request_items_category ON public.request_items(request_category_id);

-- ─── incidents: rastreio da requisição + respostas do formulário ─
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS request_item_id UUID REFERENCES public.request_items(id) ON DELETE SET NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS form_data JSONB;

-- ─── RLS + GRANTs ────────────────────────────────────────────
ALTER TABLE public.request_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_categories TO authenticated;
DROP POLICY IF EXISTS select_request_categories ON public.request_categories;
CREATE POLICY select_request_categories ON public.request_categories
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_request_categories ON public.request_categories;
CREATE POLICY write_request_categories ON public.request_categories
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_items TO authenticated;
DROP POLICY IF EXISTS select_request_items ON public.request_items;
CREATE POLICY select_request_items ON public.request_items
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_request_items ON public.request_items;
CREATE POLICY write_request_items ON public.request_items
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));
