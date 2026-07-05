-- ============================================================
-- Flowfy ITSM — Migration 056
-- Motor de Automação (2/5): FILA DE AÇÕES ASSÍNCRONAS + LOG DE
-- EXECUÇÃO.
--
-- workflow_action_queue guarda ações que precisam de I/O externo
-- (send_email, webhook, delay) para a Edge Function
-- run-workflow-actions drenar — reaproveitando o padrão pg_net
-- já usado na Migration 013, não uma fila nova do zero.
--
-- workflow_execution_log substitui o ExecutionLog mockado da UI
-- (WorkflowBuilder.tsx) por histórico real.
--
-- Idempotente.
-- ============================================================

-- ─── 1. Fila de ações assíncronas ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_action_queue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id       UUID REFERENCES public.workflow_rules(id) ON DELETE CASCADE,
  incident_id   UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  action        JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  run_after     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_queue_pending
  ON public.workflow_action_queue (status, run_after) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_workflow_queue_company ON public.workflow_action_queue (company_id);

COMMENT ON TABLE public.workflow_action_queue IS
  'Fila de ações do Motor de Automação que precisam de I/O externo (send_email/webhook/delay). Drenada por run-workflow-actions via pg_net, mesmo padrão da Migration 013.';

-- ─── 2. Log de execução (substitui o ExecutionLog mockado) ────
CREATE TABLE IF NOT EXISTS public.workflow_execution_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id         UUID REFERENCES public.workflow_rules(id) ON DELETE SET NULL,
  rule_name       TEXT NOT NULL,
  incident_id     UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  incident_number TEXT,
  trigger_event   TEXT NOT NULL,
  matched         BOOLEAN NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped', 'partial')),
  actions_summary TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_log_rule ON public.workflow_execution_log (rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_log_company ON public.workflow_execution_log (company_id, created_at DESC);

COMMENT ON TABLE public.workflow_execution_log IS
  'Histórico real de execuções do Motor de Automação — substitui o MOCK_LOGS de WorkflowBuilder.tsx.';

-- ─── 3. RLS: leitura por tenant; escrita só via SECURITY DEFINER
--         (nenhuma policy de INSERT/UPDATE/DELETE para authenticated —
--         só as funções da 057/058/059 e a Edge Function via service-role).
ALTER TABLE public.workflow_action_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_execution_log  ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.workflow_action_queue  TO authenticated;
GRANT SELECT ON public.workflow_execution_log TO authenticated;

DROP POLICY IF EXISTS select_workflow_queue ON public.workflow_action_queue;
CREATE POLICY select_workflow_queue ON public.workflow_action_queue
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS select_workflow_log ON public.workflow_execution_log;
CREATE POLICY select_workflow_log ON public.workflow_execution_log
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- ─── 4. Realtime para a aba "Histórico" atualizar ao vivo ─────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_execution_log;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT policyname FROM pg_policies WHERE tablename IN ('workflow_action_queue','workflow_execution_log');
--   SELECT * FROM public.workflow_action_queue LIMIT 5;
--   SELECT * FROM public.workflow_execution_log ORDER BY created_at DESC LIMIT 5;
-- ────────────────────────────────────────────────────────────
