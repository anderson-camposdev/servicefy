-- ServiceFY — write_problem_incidents (migration original) autoriza
-- sysadmin/company_admin/agent a vincular incidentes a um problema, mas
-- esqueceu ops_manager/governance_manager (que já atuam com nível
-- equivalente a agent em todo o resto do fluxo operacional). Policy
-- adicional, não substitui a existente.

CREATE POLICY problem_incidents_ops_write ON public.problem_incidents FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.problems
      WHERE problems.id = problem_incidents.problem_id
        AND problems.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() = ANY (ARRAY['ops_manager', 'governance_manager'])
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.problems
      WHERE problems.id = problem_incidents.problem_id
        AND problems.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() = ANY (ARRAY['ops_manager', 'governance_manager'])
  );
