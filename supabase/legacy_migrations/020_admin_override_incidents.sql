-- ============================================================
-- Flowfy ITSM — Migration 020
-- God Mode / Override administrativo na escrita de incidents
--
-- As travas de governança (read-only pós-resolução) são de UI.
-- No banco, garantimos explicitamente que provedor MSP e
-- admin/sysadmin podem editar QUALQUER chamado (inclusive
-- Resolved/Closed), e que a equipe/solicitante do tenant também
-- escrevem nos chamados da própria empresa (aceite/reabertura).
-- Idempotente.
-- ============================================================

GRANT UPDATE ON public.incidents TO authenticated;

DROP POLICY IF EXISTS write_incident_policy ON public.incidents;
CREATE POLICY write_incident_policy ON public.incidents
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()                                   -- provedor MSP
    OR public.get_current_user_role() IN ('sysadmin', 'company_admin')   -- God Mode (override)
    OR company_id = public.get_current_user_company_id()                 -- equipe/solicitante do tenant
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR public.get_current_user_role() IN ('sysadmin', 'company_admin')
    OR company_id = public.get_current_user_company_id()
  );

-- incident_history: solicitante e equipe do tenant registram aceite/reabertura;
-- provedor/admin sempre podem (já coberto pela policy da migration 011, reafirmado).
DROP POLICY IF EXISTS write_tenant_policy ON public.incident_history;
CREATE POLICY write_tenant_policy ON public.incident_history
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR public.get_current_user_role() IN ('sysadmin', 'company_admin')
    OR EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = incident_history.incident_id
        AND i.company_id = public.get_current_user_company_id()
    )
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR public.get_current_user_role() IN ('sysadmin', 'company_admin')
    OR EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = incident_history.incident_id
        AND i.company_id = public.get_current_user_company_id()
    )
  );
