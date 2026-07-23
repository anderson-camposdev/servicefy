-- ServiceFY — corrige bypass real de aprovação do CAB.
--
-- Achado no pente fino de 2026-07-23: uma mudança Standard só deveria
-- pular o CAB porque é, por definição ITIL, de risco baixo e bem
-- conhecido — mas nem a policy de INSERT nem schedule_standard_change()
-- verificavam `risk`, só `type`. Dois caminhos de bypass confirmados:
--
--   1. INSERT direto (via REST — é literalmente o que ChangeManagementDashboard.tsx
--      faz ao criar uma mudança nova com type='Standard': grava state='Scheduled'
--      já na criação) com risk='Critical' — nasce Scheduled sem passar pelo CAB.
--   2. Editar uma mudança Emergency/Normal de risco Crítico para type='Standard'
--      ainda em Draft (permitido: o guard de congelamento só age quando
--      state='Awaiting CAB Approval'), e chamar schedule_standard_change() —
--      que só conferia type e state, nunca risk.
--
-- Fix: mudança Standard só pode nascer/ser agendada como Scheduled com
-- risk='Low'. Qualquer outro risco precisa ir para submit_change_for_cab.

-- ─── 1. INSERT direto: exigir risco Low para nascer Scheduled ────────
DROP POLICY IF EXISTS insert_change_staff ON public.changes;
CREATE POLICY insert_change_staff ON public.changes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.is_current_user_ticket_staff()
      AND (
        state::text = 'Draft'
        OR (type::text = 'Standard' AND state::text = 'Scheduled' AND risk::text = 'Low')
      )
      AND COALESCE(cab_approvals, '{}'::jsonb) = '{}'::jsonb
    )
  );

-- ─── 2. RPC de agendamento direto: mesma trava ────────────────────────
CREATE OR REPLACE FUNCTION public.schedule_standard_change(p_change_id UUID)
RETURNS public.changes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_change public.changes;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  SELECT * INTO v_change FROM public.changes
   WHERE id = p_change_id FOR UPDATE;

  IF v_profile.id IS NULL OR v_change.id IS NULL THEN
    RAISE EXCEPTION 'Mudança ou perfil não encontrado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_current_user_msp_admin()
     AND (v_change.company_id IS DISTINCT FROM v_profile.company_id
          OR v_profile.role::text NOT IN ('sysadmin','company_admin','agent','technician','area_manager','it_manager')) THEN
    RAISE EXCEPTION 'Sem permissão para agendar a mudança' USING ERRCODE = '42501';
  END IF;
  IF v_change.type::text <> 'Standard' OR v_change.state::text NOT IN ('Draft', 'CAB Rejected') THEN
    RAISE EXCEPTION 'Somente mudança Standard em rascunho pode ser agendada diretamente';
  END IF;
  IF v_change.risk::text <> 'Low' THEN
    RAISE EXCEPTION 'Mudança Standard só pode ser agendada diretamente com risco Low; risco % exige aprovação do CAB', v_change.risk::text
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.changes SET state = 'Scheduled', updated_at = now()
   WHERE id = p_change_id RETURNING * INTO v_change;
  INSERT INTO public.change_history
    (change_id, changed_by_name, field_name, new_value, is_public)
  VALUES
    (p_change_id, v_profile.name, 'state', 'Scheduled', true);
  RETURN v_change;
END;
$$;

-- Permissões inalteradas (GRANT EXECUTE já concedido na migration 071);
-- CREATE OR REPLACE preserva GRANT/REVOKE existentes.
