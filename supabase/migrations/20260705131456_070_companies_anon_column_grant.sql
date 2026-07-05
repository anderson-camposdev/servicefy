DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'companies'
     AND column_name NOT IN (
       'license_plan', 'concurrent_licenses', 'license_expires_at', 'license_alert_threshold',
       'sso_providers', 'allow_local_login', 'branding_settings'
     );

  EXECUTE 'REVOKE SELECT ON public.companies FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON public.companies TO anon', v_cols);
END $$;;
