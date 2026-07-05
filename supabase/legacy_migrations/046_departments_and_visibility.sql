-- ============================================================
-- Flowfy ITSM — Migration 046
-- Catálogos Departamentais e Visibilidade (Nível 0)
-- ============================================================

-- ─── 1. Tabela de Departamentos (Nível 0 do Catálogo) ─────────
CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '🏢',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  -- Grupos (assignment_groups) que podem visualizar este departamento.
  -- Se nulo ou vazio, consideramos que a visibilidade é pública para a empresa.
  visible_to_groups UUID[] DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_company ON public.departments(company_id);

COMMENT ON TABLE public.departments IS 'Nível 0 do catálogo: Departamentos (ex: TI, RH, Financeiro).';

-- ─── 2. Vincular Departamentos às Categorias (Incident/Request)
ALTER TABLE public.catalog_categories
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE;

ALTER TABLE public.request_categories
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_cat_categories_department ON public.catalog_categories(department_id);
CREATE INDEX IF NOT EXISTS idx_req_cats_department ON public.request_categories(department_id);

-- ─── 3. RLS para Departamentos ──────────────────────────────
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Leitura:
-- Provedor (MSP) vê tudo.
-- Admin da empresa (sysadmin/company_admin) vê tudo da sua empresa.
-- Usuário comum vê se for público (visible_to_groups = '{}' ou NULL)
-- OU se ele pertencer a um dos grupos listados.
DROP POLICY IF EXISTS select_departments ON public.departments;
CREATE POLICY select_departments ON public.departments
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND (
        public.get_current_user_role() IN ('sysadmin', 'company_admin')
        OR visible_to_groups IS NULL
        OR cardinality(visible_to_groups) = 0
        OR EXISTS (
          SELECT 1 FROM public.user_groups ug
          WHERE ug.user_id = auth.uid()
            AND ug.group_id = ANY(visible_to_groups)
        )
      )
    )
  );

-- Escrita:
-- Apenas admins (msp ou company admin)
DROP POLICY IF EXISTS write_departments ON public.departments;
CREATE POLICY write_departments ON public.departments
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
-- FIM DA MIGRATION 046
-- ============================================================
