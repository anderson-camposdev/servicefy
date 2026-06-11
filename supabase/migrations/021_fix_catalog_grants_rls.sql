-- ============================================================
-- Flowfy ITSM — Migration 021
-- Correção: "Erro ao carregar o catálogo" no Portal do Usuário.
--
-- Causa provável: GRANT ausente (RLS não concede privilégio de
-- tabela → "permission denied"), ou a 019 aplicada parcialmente.
-- Este script re-afirma tabela, colunas, GRANTs e policies das
-- tabelas do catálogo. Tudo idempotente.
-- ============================================================

-- ─── catalog_categories ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '📦',
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_company ON public.catalog_categories(company_id);

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_categories TO authenticated;

DROP POLICY IF EXISTS select_catalog_categories ON public.catalog_categories;
CREATE POLICY select_catalog_categories ON public.catalog_categories
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND is_active = true)
  );

DROP POLICY IF EXISTS write_catalog_categories ON public.catalog_categories;
CREATE POLICY write_catalog_categories ON public.catalog_categories
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );

-- ─── catalog_items (colunas da 019 + grants + leitura por tenant) ─
-- A coluna `active` pode não existir na tabela base (erro
-- "column catalog_items.active does not exist") → criamos aqui.
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.catalog_categories(id) ON DELETE SET NULL;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS sla_hours INT NOT NULL DEFAULT 24;

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_items TO authenticated;

-- Leitura: equipe/solicitante do tenant veem os itens da própria empresa
-- (a vitrine filtra active=true no cliente); provedor vê tudo.
DROP POLICY IF EXISTS select_tenant_policy ON public.catalog_items;
CREATE POLICY select_tenant_policy ON public.catalog_items
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.catalog_items;
CREATE POLICY write_admin_policy ON public.catalog_items
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('catalog_categories','catalog_items') AND grantee='authenticated';
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('catalog_categories','catalog_items') ORDER BY 1,2;
-- ────────────────────────────────────────────────────────────
