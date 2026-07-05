-- ============================================================
-- Flowfy ITSM — Migration 071
-- RBAC real no banco + governança transacional do CAB.
--
-- Objetivos:
--   1. end_user enxerga/interage somente com os próprios chamados;
--   2. comentários e históricos ficam imutáveis após o INSERT;
--   3. operações técnicas exigem papel de equipe;
--   4. aceite de solução e votos do CAB são RPCs atômicas;
--   5. votos do CAB não confiam em user_id/nome enviados pelo browser.
-- ============================================================

-- ─── 1. Helpers de autorização ──────────────────────────────

-- A implementação anterior consultava profiles.id = auth.uid(). O modelo
-- atual usa profiles.auth_id = auth.uid(); sem isso, o acesso MSP real podia
-- falhar ou depender de IDs artificialmente iguais.
CREATE OR REPLACE FUNCTION public.is_current_user_msp_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(bool_or(
    c.is_provider_tenant = true
    AND p.active = true
    AND p.role::text <> 'end_user'
  ), false)
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.auth_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_ticket_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role() IN (
    'sysadmin', 'company_admin', 'agent', 'technician',
    'area_manager', 'it_manager'
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_change_reader()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role() IN (
    'sysadmin', 'company_admin', 'agent', 'technician',
    'area_manager', 'it_manager', 'client_manager', 'cio'
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_current_user_ticket_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_current_user_change_reader() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_ticket_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_change_reader() TO authenticated;

-- ─── 1.1 Perfis: impedir autoelevação de papel/tenant ───────

DROP POLICY IF EXISTS select_profile_policy ON public.profiles;
DROP POLICY IF EXISTS write_profile_policy ON public.profiles;
DROP POLICY IF EXISTS insert_profile_admin ON public.profiles;
DROP POLICY IF EXISTS delete_profile_admin ON public.profiles;

CREATE POLICY select_profile_policy ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND (
        public.get_current_user_role() <> 'end_user'
        OR auth_id = auth.uid()
      )
    )
  );

CREATE POLICY insert_profile_admin ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
    )
  );

CREATE POLICY delete_profile_admin ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
    )
  );

REVOKE UPDATE ON public.profiles FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.update_profile_secure(
  p_profile_id UUID,
  p_patch JSONB
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles;
  v_target public.profiles;
  v_is_admin BOOLEAN;
BEGIN
  SELECT * INTO v_actor FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  SELECT * INTO v_target FROM public.profiles
   WHERE id = p_profile_id FOR UPDATE;

  IF v_actor.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_current_user_msp_admin()
    OR (v_actor.company_id = v_target.company_id
        AND v_actor.role::text IN ('sysadmin', 'company_admin'));

  IF v_actor.id IS DISTINCT FROM v_target.id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Sem permissão para editar este perfil' USING ERRCODE = '42501';
  END IF;

  -- Nunca aceitamos company_id, auth_id, id ou timestamps do cliente.
  -- O próprio usuário edita somente dados pessoais; governança exige admin.
  UPDATE public.profiles
     SET name = CASE WHEN p_patch ? 'name' THEN COALESCE(NULLIF(trim(p_patch->>'name'), ''), name) ELSE name END,
         phone = CASE WHEN p_patch ? 'phone' THEN NULLIF(trim(p_patch->>'phone'), '') ELSE phone END,
         avatar_url = CASE WHEN p_patch ? 'avatar_url' THEN NULLIF(trim(p_patch->>'avatar_url'), '') ELSE avatar_url END,
         email = CASE WHEN v_is_admin AND p_patch ? 'email' THEN COALESCE(NULLIF(lower(trim(p_patch->>'email')), ''), email) ELSE email END,
         department = CASE WHEN v_is_admin AND p_patch ? 'department' THEN NULLIF(trim(p_patch->>'department'), '') ELSE department END,
         role = CASE WHEN v_is_admin AND p_patch ? 'role' THEN (p_patch->>'role')::public.user_role ELSE role END,
         active = CASE WHEN v_is_admin AND p_patch ? 'active' THEN (p_patch->>'active')::BOOLEAN ELSE active END,
         updated_at = now()
   WHERE id = p_profile_id
   RETURNING * INTO v_target;

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.update_profile_secure(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profile_secure(UUID, JSONB) TO authenticated;

-- ─── 2. Incidentes ──────────────────────────────────────────

DROP POLICY IF EXISTS dev_open ON public.incidents;
DROP POLICY IF EXISTS select_incident_policy ON public.incidents;
DROP POLICY IF EXISTS write_incident_policy ON public.incidents;
DROP POLICY IF EXISTS insert_incident_policy ON public.incidents;
DROP POLICY IF EXISTS update_incident_staff_policy ON public.incidents;
DROP POLICY IF EXISTS delete_incident_admin_policy ON public.incidents;

CREATE POLICY select_incident_policy ON public.incidents
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND (
        public.get_current_user_role() <> 'end_user'
        OR caller_id = public.get_current_profile_id()
      )
    )
  );

CREATE POLICY insert_incident_policy ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND (
        public.is_current_user_ticket_staff()
        OR (
          public.get_current_user_role() = 'end_user'
          AND caller_id = public.get_current_profile_id()
          AND state::text = 'New'
          AND assigned_to_id IS NULL
        )
      )
    )
  );

CREATE POLICY update_incident_staff_policy ON public.incidents
  FOR UPDATE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.is_current_user_ticket_staff()
    )
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.is_current_user_ticket_staff()
    )
  );

CREATE POLICY delete_incident_admin_policy ON public.incidents
  FOR DELETE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
    )
  );

-- Aceite do solicitante sem conceder UPDATE genérico sobre incidents.
CREATE OR REPLACE FUNCTION public.accept_incident_resolution(p_incident_id UUID)
RETURNS public.incidents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_incident public.incidents;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE auth_id = auth.uid() AND active = true
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Perfil autenticado não encontrado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_incident
  FROM public.incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF v_incident.id IS NULL
     OR v_incident.caller_id IS DISTINCT FROM v_profile.id
     OR v_incident.company_id IS DISTINCT FROM v_profile.company_id THEN
    RAISE EXCEPTION 'Chamado não pertence ao solicitante autenticado' USING ERRCODE = '42501';
  END IF;

  IF v_incident.state::text <> 'Resolved' THEN
    RAISE EXCEPTION 'Somente chamados resolvidos podem ser aceitos';
  END IF;

  UPDATE public.incidents
     SET state = 'Closed', closed_at = now()
   WHERE id = p_incident_id
   RETURNING * INTO v_incident;

  INSERT INTO public.incident_history
    (incident_id, changed_by_id, changed_by_name, field_name,
     old_value, new_value, comment, is_public)
  VALUES
    (p_incident_id, v_profile.id, v_profile.name, 'state',
     'Resolved', 'Closed', 'Solução aceita pelo solicitante.', true);

  RETURN v_incident;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_incident_resolution(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_incident_resolution(UUID) TO authenticated;

-- ─── 3. Mensagens e histórico de incidentes ─────────────────

DROP POLICY IF EXISTS select_ticket_messages ON public.ticket_messages;
DROP POLICY IF EXISTS insert_ticket_messages ON public.ticket_messages;
DROP POLICY IF EXISTS write_ticket_messages ON public.ticket_messages;

CREATE POLICY select_ticket_messages ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1
      FROM public.incidents i
      WHERE i.id = ticket_messages.incident_id
        AND i.company_id = public.get_current_user_company_id()
        AND (
          public.get_current_user_role() <> 'end_user'
          OR (i.caller_id = public.get_current_profile_id() AND ticket_messages.is_internal = false)
        )
    )
  );

CREATE POLICY insert_ticket_messages ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1
      FROM public.incidents i
      WHERE i.id = ticket_messages.incident_id
        AND i.company_id = ticket_messages.company_id
        AND i.company_id = public.get_current_user_company_id()
        AND sender_id = public.get_current_profile_id()
        AND (
          (
            public.get_current_user_role() = 'end_user'
            AND i.caller_id = public.get_current_profile_id()
            AND actor_type = 'user'
            AND is_internal = false
          )
          OR (
            public.is_current_user_ticket_staff()
            AND actor_type = 'analyst'
          )
        )
    )
  );

DROP POLICY IF EXISTS select_tenant_policy ON public.incident_history;
DROP POLICY IF EXISTS write_tenant_policy ON public.incident_history;
DROP POLICY IF EXISTS insert_incident_history_staff ON public.incident_history;

CREATE POLICY select_tenant_policy ON public.incident_history
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = incident_history.incident_id
        AND i.company_id = public.get_current_user_company_id()
        AND (
          public.get_current_user_role() <> 'end_user'
          OR (i.caller_id = public.get_current_profile_id() AND incident_history.is_public = true)
        )
    )
  );

CREATE POLICY insert_incident_history_staff ON public.incident_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (
      public.is_current_user_ticket_staff()
      AND EXISTS (
        SELECT 1 FROM public.incidents i
        WHERE i.id = incident_history.incident_id
          AND i.company_id = public.get_current_user_company_id()
      )
    )
  );

-- Reforça a função de reabertura: somente uma mensagem realmente atribuída
-- ao solicitante do chamado pode produzir a transição privilegiada.
CREATE OR REPLACE FUNCTION public.reopen_incident_on_user_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reopened BOOLEAN := false;
BEGIN
  IF NEW.actor_type = 'user'
     AND EXISTS (
       SELECT 1 FROM public.incidents i
       WHERE i.id = NEW.incident_id
         AND i.company_id = NEW.company_id
         AND i.caller_id = NEW.sender_id
     ) THEN
    UPDATE public.incidents
       SET state = 'In Progress', resolved_at = NULL
     WHERE id = NEW.incident_id
       AND state::text = 'Resolved';

    GET DIAGNOSTICS v_reopened = ROW_COUNT;

    IF v_reopened THEN
      INSERT INTO public.incident_history
        (incident_id, changed_by_id, changed_by_name, field_name,
         old_value, new_value, comment, is_public)
      VALUES
        (NEW.incident_id, NEW.sender_id, COALESCE(NEW.sender_name, 'Solicitante'),
         'state', 'Resolved', 'In Progress',
         'Reaberto automaticamente por nova interação do solicitante.', true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 4. Problemas ───────────────────────────────────────────

DROP POLICY IF EXISTS select_problem_policy ON public.problems;
DROP POLICY IF EXISTS write_problem_policy ON public.problems;
DROP POLICY IF EXISTS insert_problem_staff ON public.problems;
DROP POLICY IF EXISTS update_problem_staff ON public.problems;
DROP POLICY IF EXISTS delete_problem_admin ON public.problems;

CREATE POLICY select_problem_policy ON public.problems
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_change_reader())
  );
CREATE POLICY insert_problem_staff ON public.problems
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_ticket_staff())
  );
CREATE POLICY update_problem_staff ON public.problems
  FOR UPDATE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_ticket_staff())
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_ticket_staff())
  );
CREATE POLICY delete_problem_admin ON public.problems
  FOR DELETE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );

DROP POLICY IF EXISTS select_tenant_policy ON public.problem_history;
DROP POLICY IF EXISTS write_tenant_policy ON public.problem_history;
DROP POLICY IF EXISTS insert_problem_history_staff ON public.problem_history;
CREATE POLICY select_tenant_policy ON public.problem_history
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.problems p
      WHERE p.id = problem_history.problem_id
        AND p.company_id = public.get_current_user_company_id()
        AND public.is_current_user_change_reader()
    )
  );
CREATE POLICY insert_problem_history_staff ON public.problem_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.problems p
      WHERE p.id = problem_history.problem_id
        AND p.company_id = public.get_current_user_company_id()
        AND public.is_current_user_ticket_staff()
    )
  );

-- ─── 5. Mudanças e CAB ──────────────────────────────────────

DROP POLICY IF EXISTS select_change_policy ON public.changes;
DROP POLICY IF EXISTS write_change_policy ON public.changes;
DROP POLICY IF EXISTS insert_change_staff ON public.changes;
DROP POLICY IF EXISTS update_change_staff ON public.changes;
DROP POLICY IF EXISTS delete_change_admin ON public.changes;

CREATE POLICY select_change_policy ON public.changes
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_change_reader())
  );

CREATE POLICY insert_change_staff ON public.changes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (
      company_id = public.get_current_user_company_id()
      AND public.is_current_user_ticket_staff()
      AND (
        state::text = 'Draft'
        OR (type::text = 'Standard' AND state::text = 'Scheduled')
      )
      AND COALESCE(cab_approvals, '{}'::jsonb) = '{}'::jsonb
    )
  );

CREATE POLICY update_change_staff ON public.changes
  FOR UPDATE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_ticket_staff())
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_ticket_staff())
  );

CREATE POLICY delete_change_admin ON public.changes
  FOR DELETE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );

-- Relações mudança ↔ incidente saem do JSON de votos e voltam para a tabela
-- relacional já existente. Escrita é exclusivamente pela RPC transacional.
DROP POLICY IF EXISTS select_change_incidents ON public.change_incidents;
DROP POLICY IF EXISTS write_change_incidents ON public.change_incidents;
CREATE POLICY select_change_incidents ON public.change_incidents
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.changes c
      WHERE c.id = change_incidents.change_id
        AND c.company_id = public.get_current_user_company_id()
        AND public.is_current_user_change_reader()
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.change_incidents FROM PUBLIC, authenticated;
GRANT SELECT ON public.change_incidents TO authenticated;

-- Estado e votos nunca podem ser escritos diretamente pelo REST autenticado.
REVOKE UPDATE ON public.changes FROM PUBLIC, authenticated;
GRANT UPDATE (
  short_description, description, justification, type, risk,
  implementation_plan, test_plan, backout_plan,
  change_window_start, change_window_end,
  requested_by_id, requested_by_name,
  implementer_id, implementer_name, related_problem_id,
  cab_approvers, updated_at
) ON public.changes TO authenticated;

-- O objeto avaliado pelo CAB fica congelado durante a votação. Sem esta
-- trava, um editor legítimo poderia incluir a si próprio como aprovador ou
-- trocar risco/planos depois que os votos começaram.
CREATE OR REPLACE FUNCTION public.guard_change_during_cab_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.state::text = 'Awaiting CAB Approval'
     AND (
       NEW.type IS DISTINCT FROM OLD.type
       OR NEW.risk IS DISTINCT FROM OLD.risk
       OR NEW.justification IS DISTINCT FROM OLD.justification
       OR NEW.implementation_plan IS DISTINCT FROM OLD.implementation_plan
       OR NEW.test_plan IS DISTINCT FROM OLD.test_plan
       OR NEW.backout_plan IS DISTINCT FROM OLD.backout_plan
       OR NEW.change_window_start IS DISTINCT FROM OLD.change_window_start
       OR NEW.change_window_end IS DISTINCT FROM OLD.change_window_end
       OR NEW.cab_approvers IS DISTINCT FROM OLD.cab_approvers
     ) THEN
    RAISE EXCEPTION 'Dados avaliados pelo CAB não podem mudar durante a votação';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_change_during_cab_vote ON public.changes;
CREATE TRIGGER trg_guard_change_during_cab_vote
  BEFORE UPDATE ON public.changes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_change_during_cab_vote();

DROP POLICY IF EXISTS select_tenant_policy ON public.change_history;
DROP POLICY IF EXISTS write_tenant_policy ON public.change_history;
CREATE POLICY select_tenant_policy ON public.change_history
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.changes c
      WHERE c.id = change_history.change_id
        AND c.company_id = public.get_current_user_company_id()
        AND public.is_current_user_change_reader()
    )
  );

-- Histórico do CAB é escrito somente pelas RPCs SECURITY DEFINER abaixo.

CREATE OR REPLACE FUNCTION public.submit_change_for_cab(p_change_id UUID)
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
    RAISE EXCEPTION 'Sem permissão para submeter esta mudança ao CAB' USING ERRCODE = '42501';
  END IF;
  IF v_change.type::text = 'Standard' THEN
    RAISE EXCEPTION 'Mudanças Standard são pré-aprovadas e não passam pelo CAB';
  END IF;
  IF jsonb_array_length(COALESCE(v_change.cab_approvers, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Defina ao menos um aprovador do CAB';
  END IF;
  IF v_change.state::text NOT IN ('Draft', 'CAB Rejected') THEN
    RAISE EXCEPTION 'Estado atual não permite submissão ao CAB';
  END IF;

  UPDATE public.changes
     SET state = 'Awaiting CAB Approval', cab_approvals = '{}'::jsonb, updated_at = now()
   WHERE id = p_change_id
   RETURNING * INTO v_change;

  INSERT INTO public.change_history
    (change_id, changed_by_name, field_name, new_value, is_public)
  VALUES
    (p_change_id, v_profile.name, 'state', 'Awaiting CAB Approval', true);

  RETURN v_change;
END;
$$;

CREATE OR REPLACE FUNCTION public.cast_change_cab_vote(
  p_change_id UUID,
  p_approve BOOLEAN
)
RETURNS public.changes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_change public.changes;
  v_approvals JSONB;
  v_decision TEXT;
  v_new_state public.change_state;
  v_all_approved BOOLEAN;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;

  SELECT * INTO v_change FROM public.changes
   WHERE id = p_change_id FOR UPDATE;

  IF v_profile.id IS NULL OR v_change.id IS NULL
     OR v_change.company_id IS DISTINCT FROM v_profile.company_id THEN
    RAISE EXCEPTION 'Mudança não pertence ao usuário autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_profile.role::text = 'end_user'
     OR NOT (COALESCE(v_change.cab_approvers, '[]'::jsonb) ? v_profile.id::text) THEN
    RAISE EXCEPTION 'Usuário não é aprovador desta mudança' USING ERRCODE = '42501';
  END IF;
  IF v_change.state::text <> 'Awaiting CAB Approval' THEN
    RAISE EXCEPTION 'Mudança não está aguardando aprovação do CAB';
  END IF;
  IF COALESCE(v_change.cab_approvals, '{}'::jsonb) ? v_profile.id::text THEN
    RAISE EXCEPTION 'Aprovador já registrou seu voto';
  END IF;

  v_decision := CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END;
  v_approvals := COALESCE(v_change.cab_approvals, '{}'::jsonb)
                 || jsonb_build_object(v_profile.id::text, v_decision);

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(v_change.cab_approvers, '[]'::jsonb)) a(id)
    WHERE COALESCE(v_approvals->>a.id, '') <> 'Approved'
  ) INTO v_all_approved;

  v_new_state := CASE
    WHEN NOT p_approve THEN 'CAB Rejected'::public.change_state
    WHEN v_all_approved THEN 'Scheduled'::public.change_state
    ELSE v_change.state
  END;

  UPDATE public.changes
     SET cab_approvals = v_approvals, state = v_new_state, updated_at = now()
   WHERE id = p_change_id
   RETURNING * INTO v_change;

  INSERT INTO public.change_history
    (change_id, changed_by_name, field_name, new_value, is_public)
  VALUES
    (p_change_id, v_profile.name, 'cab_approval',
     v_profile.name || ' votou: ' || v_decision || '. Novo estado: ' || v_new_state::text,
     true);

  RETURN v_change;
END;
$$;

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

  UPDATE public.changes SET state = 'Scheduled', updated_at = now()
   WHERE id = p_change_id RETURNING * INTO v_change;
  INSERT INTO public.change_history
    (change_id, changed_by_name, field_name, new_value, is_public)
  VALUES
    (p_change_id, v_profile.name, 'state', 'Scheduled', true);
  RETURN v_change;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_change_incident_links(
  p_change_id UUID,
  p_incident_ids UUID[]
)
RETURNS void
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
    RAISE EXCEPTION 'Sem permissão para alterar relações da mudança' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_incident_ids, ARRAY[]::UUID[])) requested(id)
    LEFT JOIN public.incidents i ON i.id = requested.id
    WHERE i.id IS NULL OR i.company_id IS DISTINCT FROM v_change.company_id
  ) THEN
    RAISE EXCEPTION 'Incidente relacionado não existe ou pertence a outro tenant' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.change_incidents WHERE change_id = p_change_id;
  INSERT INTO public.change_incidents (change_id, incident_id)
  SELECT p_change_id, requested.id
  FROM (
    SELECT DISTINCT id
    FROM unnest(COALESCE(p_incident_ids, ARRAY[]::UUID[])) AS ids(id)
  ) requested;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_change_for_cab(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cast_change_cab_vote(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.schedule_standard_change(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_change_incident_links(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_change_for_cab(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_change_cab_vote(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_standard_change(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_change_incident_links(UUID, UUID[]) TO authenticated;

-- ─── Verificação operacional ─────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('incidents','incident_history','ticket_messages','problems','changes')
-- ORDER BY tablename, policyname;
--
-- SELECT routine_name, grantee
-- FROM information_schema.routine_privileges
-- WHERE routine_name IN ('accept_incident_resolution','submit_change_for_cab','cast_change_cab_vote');
