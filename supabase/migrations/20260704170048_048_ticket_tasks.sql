-- ============================================================
-- Flowfy ITSM — Migration 048
-- Ticket Tasks (Tarefas Filhas e Subtarefas)
-- ============================================================

-- ─── 1. Tabela de Tasks ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Relacionamentos Poli-hierárquicos
  incident_id         UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
  request_id          UUID REFERENCES public.service_requests(id) ON DELETE CASCADE,
  parent_task_id      UUID REFERENCES public.ticket_tasks(id) ON DELETE CASCADE,
  -- Dados Base
  number              TEXT, -- Ex: TSK-00100
  short_description   TEXT NOT NULL,
  description         TEXT,
  state               TEXT NOT NULL DEFAULT 'Pending', -- Pending, Work in Progress, Closed, Canceled
  -- Assinatura (Cross-team)
  assigned_group_id   UUID REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  assigned_to_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at           TIMESTAMPTZ,
  
  -- Restrição para garantir que pertence a apenas um tipo de pai direto
  CONSTRAINT ticket_tasks_parent_chk CHECK (
    (incident_id IS NOT NULL AND request_id IS NULL AND parent_task_id IS NULL) OR
    (incident_id IS NULL AND request_id IS NOT NULL AND parent_task_id IS NULL) OR
    (incident_id IS NULL AND request_id IS NULL AND parent_task_id IS NOT NULL) OR
    (incident_id IS NULL AND request_id IS NULL AND parent_task_id IS NULL) -- Tarefa orfã (draft)
  )
);

CREATE INDEX IF NOT EXISTS idx_ticket_tasks_company ON public.ticket_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tasks_incident ON public.ticket_tasks(incident_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tasks_request ON public.ticket_tasks(request_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tasks_parent ON public.ticket_tasks(parent_task_id);

COMMENT ON TABLE public.ticket_tasks IS 'Gestão de tarefas filhas e subtarefas para envolver múltiplos times em um mesmo chamado.';

-- ─── 2. Sequence para Number (TSK) ────────────────────────────
CREATE SEQUENCE IF NOT EXISTS ticket_tasks_seq START 1000;

-- Função para gerar o number antes do insert
CREATE OR REPLACE FUNCTION generate_ticket_task_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.number IS NULL THEN
    NEW.number := 'TSK-' || nextval('ticket_tasks_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_task_number ON public.ticket_tasks;
CREATE TRIGGER trg_ticket_task_number
  BEFORE INSERT ON public.ticket_tasks
  FOR EACH ROW
  EXECUTE FUNCTION generate_ticket_task_number();

-- ─── 3. RLS ───────────────────────────────────────────────────
ALTER TABLE public.ticket_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_ticket_tasks ON public.ticket_tasks;
CREATE POLICY select_ticket_tasks ON public.ticket_tasks
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR company_id = public.get_current_user_company_id()
  );

DROP POLICY IF EXISTS write_ticket_tasks ON public.ticket_tasks;
CREATE POLICY write_ticket_tasks ON public.ticket_tasks
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'it_agent'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'it_agent'))
  );

-- ============================================================
-- FIM DA MIGRATION 048
-- ============================================================
