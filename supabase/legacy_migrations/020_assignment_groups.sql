-- ============================================================
-- Flowfy ITSM — Migration 020
-- Assignment Groups (Equipes Solucionadoras) + User-Group Link
-- ============================================================
-- Governança: roteamento por fila de equipe, onde um chamado
-- pode ser atribuído a um grupo sem responsável direto.
-- ============================================================

-- ─── 1. Tabela de Equipes Solucionadoras ─────────────────────

CREATE TABLE IF NOT EXISTS public.assignment_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_groups_company
  ON public.assignment_groups(company_id);

COMMENT ON TABLE public.assignment_groups
  IS 'Equipes Solucionadoras (Assignment Groups) — roteamento por fila de grupo.';

-- ─── 2. Tabela Relacional Usuário ↔ Grupo ───────────────────

CREATE TABLE IF NOT EXISTS public.user_groups (
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id  UUID NOT NULL REFERENCES public.assignment_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_user_groups_group
  ON public.user_groups(group_id);

COMMENT ON TABLE public.user_groups
  IS 'Vínculo N:N entre analistas (profiles) e equipes solucionadoras (assignment_groups).';

-- ─── 3. FK na tabela incidents ───────────────────────────────
-- A coluna assigned_group_id / assigned_group_name já existem
-- na tabela incidents (campos text/UUID livres). Vamos garantir
-- que a FK esteja presente e apontando para assignment_groups.

DO $$
BEGIN
  -- Se a coluna já existir como UUID sem FK, adiciona a FK
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'incidents'
      AND column_name = 'assignment_group_id'
  ) THEN
    RAISE NOTICE 'Coluna assignment_group_id já existe em incidents.';
  ELSE
    -- Cria a coluna com FK
    ALTER TABLE public.incidents
      ADD COLUMN assignment_group_id UUID
        REFERENCES public.assignment_groups(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ─── 4. RLS — Equipes Solucionadoras ─────────────────────────

ALTER TABLE public.assignment_groups ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado do mesmo tenant
DROP POLICY IF EXISTS ag_select_tenant ON public.assignment_groups;
CREATE POLICY ag_select_tenant ON public.assignment_groups
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_user_company_id()
    OR public.is_current_user_msp_admin()
  );

-- Escrita (INSERT/UPDATE/DELETE): apenas admins do tenant
DROP POLICY IF EXISTS ag_write_admin ON public.assignment_groups;
CREATE POLICY ag_write_admin ON public.assignment_groups
  FOR ALL TO authenticated
  USING (
    (company_id = public.get_current_user_company_id()
     AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
    OR public.is_current_user_msp_admin()
  )
  WITH CHECK (
    (company_id = public.get_current_user_company_id()
     AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
    OR public.is_current_user_msp_admin()
  );

-- ─── 5. RLS — Tabela Relacional user_groups ──────────────────

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

-- Leitura: autenticados do mesmo tenant (via join em profiles)
DROP POLICY IF EXISTS ug_select_tenant ON public.user_groups;
CREATE POLICY ug_select_tenant ON public.user_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = user_id
        AND profiles.company_id = public.get_current_user_company_id()
    )
    OR public.is_current_user_msp_admin()
  );

-- Escrita: apenas admins
DROP POLICY IF EXISTS ug_write_admin ON public.user_groups;
CREATE POLICY ug_write_admin ON public.user_groups
  FOR ALL TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = user_id
        AND profiles.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
    OR public.is_current_user_msp_admin()
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = user_id
        AND profiles.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
    OR public.is_current_user_msp_admin()
  );

-- ============================================================
-- FIM DA MIGRATION 020
-- ============================================================
