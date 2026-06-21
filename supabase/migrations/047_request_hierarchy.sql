-- ============================================================
-- Flowfy ITSM — Migration 047
-- Hierarquia de Requisições (3 Níveis)
-- Categoria > Subcategoria > Serviço
-- ============================================================

-- ─── 1. Nova Tabela: Subcategorias de Requisição (Nível 2) ────
CREATE TABLE IF NOT EXISTS public.request_subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.request_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '📂',
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_subcat_company ON public.request_subcategories(company_id);
CREATE INDEX IF NOT EXISTS idx_req_subcat_category ON public.request_subcategories(category_id);

COMMENT ON TABLE public.request_subcategories IS 'Nível 2 (Subcategoria) do catálogo de requisições.';

-- ─── 2. Alterar Nível 3 (antigo Nível 2 "request_items") ──────
-- Adicionar request_subcategory_id em request_items
ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS request_subcategory_id UUID REFERENCES public.request_subcategories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_req_items_subcat ON public.request_items(request_subcategory_id);

-- O frontend usará request_subcategory_id. Mantemos request_category_id por enquanto (como legado/nullable).
ALTER TABLE public.request_items ALTER COLUMN request_category_id DROP NOT NULL;

-- ─── 3. Atualizar incidents (onde ficam os chamados) ──────────
-- A tabela incidents já possui request_item_id (Nível 3). 
-- Para compatibilidade com buscas, adicionamos request_subcategory_id.
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS request_subcategory_id UUID REFERENCES public.request_subcategories(id) ON DELETE SET NULL;

-- ─── 4. RLS para request_subcategories ────────────────────────
ALTER TABLE public.request_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_req_subcat ON public.request_subcategories;
CREATE POLICY select_req_subcat ON public.request_subcategories
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_req_subcat ON public.request_subcategories;
CREATE POLICY write_req_subcat ON public.request_subcategories
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );

-- ============================================================
-- FIM DA MIGRATION 047
-- ============================================================
