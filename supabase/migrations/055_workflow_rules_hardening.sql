-- ============================================================
-- Flowfy ITSM — Migration 055
-- Motor de Automação (1/5): SCHEMA HARDENING.
--
-- public.workflow_rules já existe em produção (RLS ativo, 0
-- linhas) mas nunca foi criada por uma migration versionada —
-- esta migration traz a tabela sob controle de versão (idempotente,
-- replica exatamente as colunas já existentes) e adiciona o que
-- falta para o motor de execução: trigger_source, updated_at,
-- índice de lookup e RLS explícito.
--
-- Também adiciona a public.incidents.tags (usada pela ação
-- add_tag) e opened_via (usada para casar trigger_source).
--
-- Idempotente.
-- ============================================================

-- ─── 1. workflow_rules sob controle de versão ────────────────
CREATE TABLE IF NOT EXISTS public.workflow_rules (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_type    TEXT NOT NULL DEFAULT 'incident' CHECK (ticket_type IN ('incident', 'request')),
  name           TEXT NOT NULL,
  description    TEXT,
  trigger_event  TEXT NOT NULL,
  conditions     JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions        JSONB NOT NULL DEFAULT '[]'::jsonb,
  active         BOOLEAN NOT NULL DEFAULT true,
  priority_order INT NOT NULL DEFAULT 100,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_rules
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'any'
    CHECK (trigger_source IN ('any', 'portal', 'email', 'api'));
ALTER TABLE public.workflow_rules
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON TABLE public.workflow_rules IS
  'Motor de Automação: regras trigger→condições→ações. Migration 055 trouxe sob controle de versão.';
COMMENT ON COLUMN public.workflow_rules.trigger_source IS
  'Canal de origem do chamado a casar (any/portal/email/api). E-mail/API ficam inertes até esses canais de criação existirem.';

CREATE INDEX IF NOT EXISTS idx_workflow_rules_company ON public.workflow_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_lookup
  ON public.workflow_rules(company_id, trigger_event, active, priority_order);

-- ─── 2. RLS padrão (governança: escrita só admin do tenant) ───
ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_rules TO authenticated;

DROP POLICY IF EXISTS select_tenant_policy ON public.workflow_rules;
CREATE POLICY select_tenant_policy ON public.workflow_rules
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.workflow_rules;
CREATE POLICY write_admin_policy ON public.workflow_rules
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- ─── 3. incidents: tags (ação add_tag) + opened_via (canal) ───
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_incidents_tags ON public.incidents USING GIN (tags);

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS opened_via TEXT CHECK (opened_via IN ('portal', 'manual', 'email', 'api'));

COMMENT ON COLUMN public.incidents.tags IS
  'Tags livres aplicadas pelo Motor de Automação (ação add_tag). Migration 055.';
COMMENT ON COLUMN public.incidents.opened_via IS
  'Canal de abertura do chamado — casado contra workflow_rules.trigger_source. Migration 055. NULL em chamados antigos (pré-existentes à feature).';

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT column_name FROM information_schema.columns WHERE table_name='workflow_rules' ORDER BY ordinal_position;
--   SELECT policyname FROM pg_policies WHERE tablename='workflow_rules';
--   SELECT column_name FROM information_schema.columns WHERE table_name='incidents' AND column_name IN ('tags','opened_via');
-- ────────────────────────────────────────────────────────────
