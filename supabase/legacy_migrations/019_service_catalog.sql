-- ============================================================
-- Flowfy ITSM — Migration 019
-- Frente B: Catálogo de Serviços (ITIL — Incidente x Requisição)
--
-- NOTA: a tabela public.catalog_items JÁ EXISTE (name/description/
-- category/active/...). Aqui criamos catalog_categories, ESTENDEMOS
-- catalog_items (category_id + sla_hours) e marcamos os chamados com
-- ticket_type + catalog_item_id (modelo unificado em incidents).
-- Mapeamento: title ≈ name, is_active ≈ active (sem duplicar colunas).
-- ============================================================

-- ─── 1. Categorias do catálogo ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,            -- ex: Acessos, Equipamentos, Softwares
  description TEXT,
  icon        TEXT DEFAULT '📦',
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_company ON public.catalog_categories(company_id);

COMMENT ON TABLE public.catalog_categories IS 'Categorias da vitrine do Service Catalog (Acessos, Equipamentos, Softwares...).';

-- ─── 2. Extensão da catalog_items existente ───────────────────
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.catalog_categories(id) ON DELETE SET NULL;
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS sla_hours INT NOT NULL DEFAULT 24;

CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON public.catalog_items(category_id);

COMMENT ON COLUMN public.catalog_items.sla_hours IS 'SLA padrão (horas) do serviço ao virar requisição.';
COMMENT ON COLUMN public.catalog_items.category_id IS 'FK para catalog_categories (vitrine). category (texto) fica como legado.';

-- ─── 3. incidents: tipo de chamado + vínculo ao item ──────────
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'incident';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_ticket_type_chk') THEN
    ALTER TABLE public.incidents
      ADD CONSTRAINT incidents_ticket_type_chk CHECK (ticket_type IN ('incident', 'request'));
  END IF;
END $$;

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES public.catalog_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.incidents.ticket_type IS 'incident (falha) ou request (requisição via catálogo).';

-- ─── 4. RLS — catalog_categories ──────────────────────────────
ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_categories TO authenticated;

-- Leitura: solicitante/equipe veem categorias ATIVAS do próprio tenant;
-- o provedor MSP vê tudo. (Admins veem inativas via a policy de escrita abaixo.)
DROP POLICY IF EXISTS select_catalog_categories ON public.catalog_categories;
CREATE POLICY select_catalog_categories ON public.catalog_categories
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND is_active = true)
  );

-- Escrita (e visão completa, inclusive inativas): provedor OU admin do tenant.
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

-- (catalog_items já possui RLS de tenant/admin desde a migration 011.)

-- ────────────────────────────────────────────────────────────
-- Seed opcional (exemplo) — descomente e ajuste o company_id:
--   INSERT INTO public.catalog_categories (company_id, name, icon, sort_order) VALUES
--     ('<COMPANY_ID>', 'Acessos', '🔑', 1),
--     ('<COMPANY_ID>', 'Equipamentos', '💻', 2),
--     ('<COMPANY_ID>', 'Softwares', '🧩', 3);
-- ────────────────────────────────────────────────────────────
