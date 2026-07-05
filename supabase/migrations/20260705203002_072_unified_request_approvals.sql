-- ============================================================
-- Flowfy ITSM — Migration 072
-- Aprovações de requisições no modelo unificado:
--   incidents(ticket_type='request') + request_items.
--
-- A implementação antiga approval_tokens → service_requests continua
-- disponível somente para compatibilidade histórica; novas requisições
-- usam request_approvals e identidade autenticada por profile.auth_id.
-- ============================================================

-- ─── 1. Configuração de aprovação no item de catálogo ───────

ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_group_id UUID REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_mode TEXT NOT NULL DEFAULT 'any'
    CHECK (approval_mode IN ('any', 'all'));

COMMENT ON COLUMN public.request_items.approval_group_id IS
  'Grupo cujos membros ativos podem aprovar a requisição.';
COMMENT ON COLUMN public.request_items.approval_mode IS
  'any: primeira aprovação decide; all: todos os membros precisam aprovar.';

CREATE OR REPLACE FUNCTION public.validate_request_item_approval_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.requires_approval AND NEW.approval_group_id IS NULL THEN
    RAISE EXCEPTION 'Item com aprovação obrigatória precisa de um grupo aprovador';
  END IF;
  IF NEW.approval_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.assignment_groups g
    WHERE g.id = NEW.approval_group_id
      AND g.company_id = NEW.company_id
      AND g.is_active = true
  ) THEN
    RAISE EXCEPTION 'Grupo aprovador inválido ou pertencente a outro tenant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_request_item_approval_config ON public.request_items;
CREATE TRIGGER trg_validate_request_item_approval_config
  BEFORE INSERT OR UPDATE OF requires_approval, approval_group_id, company_id
  ON public.request_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_request_item_approval_config();

-- ─── 2. Estado resumido no ticket + decisões normalizadas ───

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approval_decided_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.request_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id   UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  approver_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, approver_id)
);

CREATE INDEX IF NOT EXISTS idx_request_approvals_approver
  ON public.request_approvals (approver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_approvals_incident
  ON public.request_approvals (incident_id, created_at);

-- Define o estado de aprovação antes que o ticket seja gravado. Uma
-- configuração sem aprovadores falha de forma explícita, sem criar ticket
-- eternamente pendente.
CREATE OR REPLACE FUNCTION public.tg_prepare_request_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.request_items;
  v_approver_count INT;
BEGIN
  IF NEW.ticket_type <> 'request' OR NEW.request_item_id IS NULL THEN
    NEW.approval_status := 'not_required';
    RETURN NEW;
  END IF;

  SELECT * INTO v_item FROM public.request_items WHERE id = NEW.request_item_id;
  IF v_item.id IS NULL OR v_item.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Item de requisição inválido ou pertencente a outro tenant';
  END IF;

  IF NOT v_item.requires_approval THEN
    NEW.approval_status := 'not_required';
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_approver_count
  FROM public.user_groups ug
  JOIN public.profiles p ON p.id = ug.user_id
  WHERE ug.group_id = v_item.approval_group_id
    AND p.company_id = NEW.company_id
    AND p.active = true
    AND p.role::text <> 'end_user';

  IF v_approver_count = 0 THEN
    RAISE EXCEPTION 'Grupo aprovador não possui membros ativos elegíveis';
  END IF;

  NEW.approval_status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_prepare_request_approval ON public.incidents;
CREATE TRIGGER tg_prepare_request_approval
  BEFORE INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_prepare_request_approval();

CREATE OR REPLACE FUNCTION public.tg_create_request_approvals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  IF NEW.ticket_type = 'request' AND NEW.approval_status = 'pending' THEN
    SELECT approval_group_id INTO v_group_id
    FROM public.request_items WHERE id = NEW.request_item_id;

    INSERT INTO public.request_approvals (company_id, incident_id, approver_id)
    SELECT NEW.company_id, NEW.id, p.id
    FROM public.user_groups ug
    JOIN public.profiles p ON p.id = ug.user_id
    WHERE ug.group_id = v_group_id
      AND p.company_id = NEW.company_id
      AND p.active = true
      AND p.role::text <> 'end_user'
    ON CONFLICT (incident_id, approver_id) DO NOTHING;

    INSERT INTO public.notifications
      (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
    SELECT
      p.id,
      'Nova aprovação pendente',
      'A requisição ' || NEW.number || ' aguarda sua decisão.',
      'info',
      NEW.id,
      'request'
    FROM public.user_groups ug
    JOIN public.profiles p ON p.id = ug.user_id
    WHERE ug.group_id = v_group_id
      AND p.company_id = NEW.company_id
      AND p.active = true
      AND p.role::text <> 'end_user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_create_request_approvals ON public.incidents;
CREATE TRIGGER tg_create_request_approvals
  AFTER INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_create_request_approvals();

-- ─── 3. RLS da caixa de aprovações ──────────────────────────

ALTER TABLE public.request_approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.request_approvals TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.request_approvals FROM PUBLIC, authenticated;

DROP POLICY IF EXISTS select_request_approvals ON public.request_approvals;
CREATE POLICY select_request_approvals ON public.request_approvals
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR approver_id = public.get_current_profile_id()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.is_current_user_change_reader()
    )
  );

-- approval_status e transições de ticket pendente só podem ocorrer nas
-- funções desta migration.
CREATE OR REPLACE FUNCTION public.guard_request_approval_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_authorized BOOLEAN := COALESCE(
    current_setting('flowfy.request_approval_transition', true), ''
  ) = 'on';
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NOT v_authorized THEN
    RAISE EXCEPTION 'approval_status só pode ser alterado pelo motor de aprovações';
  END IF;
  IF OLD.approval_status = 'pending'
     AND NEW.state IS DISTINCT FROM OLD.state
     AND NOT v_authorized THEN
    RAISE EXCEPTION 'Requisição aguardando aprovação não pode mudar de estado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_request_approval_transition ON public.incidents;
CREATE TRIGGER trg_guard_request_approval_transition
  BEFORE UPDATE OF approval_status, state ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_request_approval_transition();

-- ─── 4. Decisão transacional ────────────────────────────────

CREATE OR REPLACE FUNCTION public.decide_request_approval(
  p_approval_id UUID,
  p_approve BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS public.request_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_approval public.request_approvals;
  v_incident public.incidents;
  v_mode TEXT;
  v_final_status TEXT;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  SELECT * INTO v_approval FROM public.request_approvals
   WHERE id = p_approval_id FOR UPDATE;

  IF v_profile.id IS NULL OR v_approval.id IS NULL
     OR v_approval.approver_id IS DISTINCT FROM v_profile.id THEN
    RAISE EXCEPTION 'Aprovação não pertence ao usuário autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Aprovação já foi decidida';
  END IF;

  SELECT * INTO v_incident FROM public.incidents
   WHERE id = v_approval.incident_id FOR UPDATE;
  IF v_incident.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Requisição não está mais aguardando aprovação';
  END IF;

  SELECT approval_mode INTO v_mode
  FROM public.request_items WHERE id = v_incident.request_item_id;

  UPDATE public.request_approvals
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decision_note = NULLIF(trim(p_note), ''),
         decided_at = now()
   WHERE id = p_approval_id
   RETURNING * INTO v_approval;

  IF NOT p_approve THEN
    v_final_status := 'rejected';
  ELSIF v_mode = 'any' THEN
    v_final_status := 'approved';
    UPDATE public.request_approvals
       SET status = 'cancelled', decided_at = now()
     WHERE incident_id = v_incident.id AND status = 'pending';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.request_approvals
    WHERE incident_id = v_incident.id AND status = 'pending'
  ) THEN
    v_final_status := 'approved';
  END IF;

  IF v_final_status IS NOT NULL THEN
    PERFORM set_config('flowfy.request_approval_transition', 'on', true);
    UPDATE public.incidents
       SET approval_status = v_final_status,
           approval_decided_at = now(),
           state = CASE WHEN v_final_status = 'rejected'
                        THEN 'Closed'::public.incident_state ELSE state END,
           closed_at = CASE WHEN v_final_status = 'rejected' THEN now() ELSE closed_at END,
           close_code = CASE WHEN v_final_status = 'rejected' THEN 'Rejected' ELSE close_code END,
           close_notes = CASE WHEN v_final_status = 'rejected'
                              THEN COALESCE(NULLIF(trim(p_note), ''), 'Requisição rejeitada na aprovação.')
                              ELSE close_notes END
     WHERE id = v_incident.id;

    INSERT INTO public.incident_history
      (incident_id, changed_by_id, changed_by_name, field_name, new_value, comment, is_public)
    VALUES
      (v_incident.id, v_profile.id, v_profile.name, 'approval_status',
       v_final_status, NULLIF(trim(p_note), ''), true);

    IF v_incident.caller_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
      VALUES
        (v_incident.caller_id,
         CASE WHEN v_final_status = 'approved' THEN 'Requisição aprovada' ELSE 'Requisição rejeitada' END,
         'A requisição ' || v_incident.number || ' foi ' ||
           CASE WHEN v_final_status = 'approved' THEN 'aprovada.' ELSE 'rejeitada.' END,
         CASE WHEN v_final_status = 'approved' THEN 'success' ELSE 'warning' END,
         v_incident.id,
         'request');
    END IF;
  END IF;

  RETURN v_approval;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_request_approval(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_request_approval(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─── 5. Legado explicitamente congelado ─────────────────────
-- Impede novas gravações diretas em approval_tokens. Dados antigos seguem
-- legíveis para auditoria; a esteira atual usa request_approvals.
DROP POLICY IF EXISTS write_admin_policy ON public.approval_tokens;
REVOKE INSERT, UPDATE, DELETE ON public.approval_tokens FROM PUBLIC, authenticated;
