-- ============================================================
-- Flowfy ITSM — Migration 021
-- Privacidade de Logs Internos no incident_history
-- ============================================================
-- Cenário A (Equipe): provedor MSP ou mesma empresa (exceto end_user) vê todos os logs.
-- Cenário B (Solicitante): vê apenas logs onde is_public = true.

DROP POLICY IF EXISTS select_tenant_policy ON public.incident_history;

CREATE POLICY select_tenant_policy ON public.incident_history
  FOR SELECT TO authenticated
  USING (
    -- Cenário A — Equipe Técnica (MSP admin ou técnico da mesma empresa)
    (
      (public.is_current_user_msp_admin() OR EXISTS (
        SELECT 1 FROM public.incidents i
         WHERE i.id = incident_history.incident_id
           AND i.company_id = public.get_current_user_company_id()
      ))
      AND public.get_current_user_role() <> 'end_user'
    )
    OR
    -- Cenário B — Solicitante final (vê apenas logs públicos do mesmo tenant)
    (
      is_public = true
      AND EXISTS (
        SELECT 1 FROM public.incidents i
         WHERE i.id = incident_history.incident_id
           AND i.company_id = public.get_current_user_company_id()
      )
    )
  );
