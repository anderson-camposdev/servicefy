DROP POLICY IF EXISTS dev_open ON public.incident_history;
DROP POLICY IF EXISTS dev_open ON public.change_history;
DROP POLICY IF EXISTS dev_open ON public.problem_history;
DROP POLICY IF EXISTS dev_open ON public.request_history;
DROP POLICY IF EXISTS dev_open ON public.workflow_rules;

DROP POLICY IF EXISTS insert_any_policy ON public.chatbot_blocked_attempts;

DROP POLICY IF EXISTS update_company_branding ON public.companies;
DROP POLICY IF EXISTS update_own_company ON public.companies;
CREATE POLICY update_own_company ON public.companies
  FOR UPDATE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );

REVOKE SELECT (
  license_plan, concurrent_licenses, license_expires_at, license_alert_threshold,
  sso_providers, allow_local_login, branding_settings
) ON public.companies FROM anon;

DROP POLICY IF EXISTS catalog_icons_public_read ON storage.objects;
CREATE POLICY catalog_icons_auth_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'catalog-icons');

ALTER VIEW public.v_license_usage SET (security_invoker = on);;
