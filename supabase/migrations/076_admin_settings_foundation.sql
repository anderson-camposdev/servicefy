-- ServiceFY — Fundação administrativa, entitlements, auditoria e segredos
-- Somente company_admin do próprio tenant e sysadmin MSP podem administrar.

CREATE OR REPLACE FUNCTION public.is_settings_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.get_current_user_role() = 'sysadmin' THEN p_company_id IS NOT NULL
    WHEN public.get_current_user_role() = 'company_admin'
      THEN p_company_id = public.get_current_user_company_id()
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.is_settings_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_settings_admin(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.company_module_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'plan' CHECK (source IN ('plan','trial','override')),
  starts_at timestamptz,
  ends_at timestamptz,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_company_created
  ON public.admin_audit_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entitlements_company
  ON public.company_module_entitlements(company_id, enabled);

ALTER TABLE public.company_module_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entitlement_admin_select ON public.company_module_entitlements;
CREATE POLICY entitlement_admin_select ON public.company_module_entitlements
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

DROP POLICY IF EXISTS entitlement_sysadmin_write ON public.company_module_entitlements;
CREATE POLICY entitlement_sysadmin_write ON public.company_module_entitlements
  FOR ALL TO authenticated
  USING (public.get_current_user_role() = 'sysadmin')
  WITH CHECK (public.get_current_user_role() = 'sysadmin');

DROP POLICY IF EXISTS audit_admin_select ON public.admin_audit_events;
CREATE POLICY audit_admin_select ON public.admin_audit_events
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_events FROM authenticated;
GRANT SELECT ON public.admin_audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_module_entitlements TO authenticated;

CREATE OR REPLACE FUNCTION public.write_admin_audit(
  p_company_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_correlation_id uuid DEFAULT gen_random_uuid()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;

  v_before := COALESCE(p_before, '{}'::jsonb)
    - ARRAY['token','secret','password','credential','client_secret','private_key','webhook_secret'];
  v_after := COALESCE(p_after, '{}'::jsonb)
    - ARRAY['token','secret','password','credential','client_secret','private_key','webhook_secret'];

  INSERT INTO public.admin_audit_events(
    company_id, actor_profile_id, actor_role, action, resource_type,
    resource_id, before_data, after_data, correlation_id
  ) VALUES (
    p_company_id, public.get_current_profile_id(), public.get_current_user_role(),
    p_action, p_resource_type, p_resource_id, v_before, v_after, p_correlation_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_admin_audit(uuid,text,text,text,jsonb,jsonb,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.write_admin_audit(uuid,text,text,text,jsonb,jsonb,uuid) TO authenticated;

ALTER TABLE public.chatbot_config
  ADD COLUMN IF NOT EXISTS whatsapp_vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS whatsapp_webhook_vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS teams_vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS rotation_required boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  r record;
  v_secret_id uuid;
BEGIN
  IF to_regprocedure('vault.create_secret(text,text,text)') IS NULL THEN
    UPDATE public.chatbot_config
       SET rotation_required = true
     WHERE whatsapp_token IS NOT NULL
        OR whatsapp_webhook_secret IS NOT NULL
        OR teams_app_secret IS NOT NULL;
    RETURN;
  END IF;

  FOR r IN SELECT * FROM public.chatbot_config LOOP
    IF r.whatsapp_token IS NOT NULL AND r.whatsapp_vault_secret_id IS NULL THEN
      EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO v_secret_id
        USING r.whatsapp_token, 'servicefy_whatsapp_' || r.company_id, 'ServiceFY WhatsApp token';
      UPDATE public.chatbot_config SET whatsapp_vault_secret_id = v_secret_id, whatsapp_token = NULL WHERE id = r.id;
    END IF;
    IF r.whatsapp_webhook_secret IS NOT NULL AND r.whatsapp_webhook_vault_secret_id IS NULL THEN
      EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO v_secret_id
        USING r.whatsapp_webhook_secret, 'servicefy_whatsapp_webhook_' || r.company_id, 'ServiceFY WhatsApp webhook secret';
      UPDATE public.chatbot_config SET whatsapp_webhook_vault_secret_id = v_secret_id, whatsapp_webhook_secret = NULL WHERE id = r.id;
    END IF;
    IF r.teams_app_secret IS NOT NULL AND r.teams_vault_secret_id IS NULL THEN
      EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO v_secret_id
        USING r.teams_app_secret, 'servicefy_teams_' || r.company_id, 'ServiceFY Teams app secret';
      UPDATE public.chatbot_config SET teams_vault_secret_id = v_secret_id, teams_app_secret = NULL WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

REVOKE SELECT ON public.chatbot_config FROM authenticated;
GRANT SELECT (
  id,company_id,whatsapp_enabled,whatsapp_phone_number_id,
  teams_enabled,teams_app_id,teams_tenant_id,
  bot_name,welcome_message,unauthorized_message,
  business_hours_start,business_hours_end,business_days,outside_hours_message,
  whatsapp_vault_secret_id,whatsapp_webhook_vault_secret_id,teams_vault_secret_id,
  rotation_required,created_at,updated_at
) ON public.chatbot_config TO authenticated;

INSERT INTO public.company_module_entitlements(company_id, module_key, enabled, source)
SELECT c.id, module_key, enabled, 'plan'
FROM public.companies c
CROSS JOIN (VALUES
  ('core', true), ('itsm', true), ('automation', true), ('analytics', true),
  ('api', true), ('esm', true), ('omnichannel', true), ('knowledge', true),
  ('cmdb', true), ('compliance', true), ('identity_connectors', false),
  ('contracts', false), ('virtual_agent', false), ('cmdb_discovery', false)
) modules(module_key, enabled)
ON CONFLICT (company_id, module_key) DO NOTHING;
