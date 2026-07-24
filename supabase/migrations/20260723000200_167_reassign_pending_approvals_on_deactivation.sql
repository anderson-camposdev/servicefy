-- ServiceFY — evita deadlock de aprovação de requisição quando o aprovador
-- é desativado.
--
-- Achado no pente fino de 2026-07-23: os tipos de aprovação dinâmica
-- 'manager' e 'department_head' (migration 095) fazem fan-out para
-- EXATAMENTE UMA linha em request_approvals, escolhida no momento da
-- criação da requisição (gestor/gestor de departamento ativo naquele
-- instante). Se essa pessoa for desativada depois, a linha continua
-- 'pending' para sempre — ninguém mais pode decidir por ela
-- (decide_request_approval exige approver_id = perfil do chamador).
--
-- Fix, decisão do usuário: ao desativar um perfil, toda aprovação
-- pendente dele é reatribuída ao gestor do departamento (profiles.department
-- -> departments.manager_id, ativo); sem gestor de departamento
-- disponível, cai para o company_admin ativo mais antigo do tenant.

CREATE OR REPLACE FUNCTION public.reassign_pending_approvals_on_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending RECORD;
  v_target_id UUID;
BEGIN
  FOR v_pending IN
    SELECT ra.id, ra.incident_id, ra.company_id
    FROM public.request_approvals ra
    JOIN public.tickets t ON t.id = ra.incident_id
    WHERE ra.approver_id = NEW.id
      AND ra.status = 'pending'
      AND t.approval_status = 'pending'
  LOOP
    v_target_id := NULL;

    -- 1. Gestor do departamento do aprovador desativado, se ativo.
    IF NEW.department IS NOT NULL THEN
      SELECT d.manager_id INTO v_target_id
      FROM public.departments d
      JOIN public.profiles p ON p.id = d.manager_id AND p.active = true
      WHERE d.name = NEW.department
        AND d.company_id = v_pending.company_id
        AND d.is_active = true
      LIMIT 1;
    END IF;

    -- 2. Sem gestor de departamento elegível: company_admin ativo mais antigo.
    IF v_target_id IS NULL OR v_target_id = NEW.id THEN
      SELECT p.id INTO v_target_id
      FROM public.profiles p
      WHERE p.company_id = v_pending.company_id
        AND p.role::text = 'company_admin'
        AND p.active = true
      ORDER BY p.created_at
      LIMIT 1;
    END IF;

    IF v_target_id IS NULL OR v_target_id = NEW.id THEN
      CONTINUE; -- Nenhum candidato elegível; permanece pendente (não regride do estado atual).
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.request_approvals
      WHERE incident_id = v_pending.incident_id AND approver_id = v_target_id
    ) THEN
      -- Alvo já tem uma linha própria para este incidente (ex.: também é
      -- membro do grupo aprovador) — só cancela a linha órfã do desativado.
      UPDATE public.request_approvals
         SET status = 'cancelled', decided_at = now()
       WHERE id = v_pending.id;
    ELSE
      UPDATE public.request_approvals
         SET approver_id = v_target_id
       WHERE id = v_pending.id;

      INSERT INTO public.notifications
        (company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link)
      VALUES (
        v_pending.company_id,
        v_target_id,
        'Aprovação reatribuída a você',
        'Uma aprovação pendente foi reatribuída porque o aprovador original foi desativado.',
        'info',
        v_pending.incident_id,
        'request',
        '/tickets/' || v_pending.incident_id::text
      );
    END IF;

    INSERT INTO public.incident_history
      (incident_id, changed_by_id, changed_by_name, field_name, new_value, comment, is_public)
    VALUES
      (v_pending.incident_id, NULL, 'Sistema', 'approval_reassigned', v_target_id::text,
       'Aprovador original desativado; aprovação reatribuída automaticamente.', false);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reassign_pending_approvals_on_deactivation ON public.profiles;
CREATE TRIGGER trg_reassign_pending_approvals_on_deactivation
  AFTER UPDATE OF active ON public.profiles
  FOR EACH ROW
  WHEN (OLD.active = true AND NEW.active = false)
  EXECUTE FUNCTION public.reassign_pending_approvals_on_deactivation();

REVOKE ALL ON FUNCTION public.reassign_pending_approvals_on_deactivation() FROM PUBLIC, anon, authenticated;
