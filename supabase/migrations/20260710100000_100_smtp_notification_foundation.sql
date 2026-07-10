-- ServiceFY - Fase 9: custodia SMTP e politica de fallback por tenant.
-- Credenciais SMTP deixam de residir em uma coluna acessivel ao cliente.

ALTER TABLE public.tenant_smtp_settings
  ADD COLUMN IF NOT EXISTS smtp_vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS rotation_required boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  setting_row record;
  secret_id uuid;
BEGIN
  IF to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Vault nao esta disponivel para migrar credenciais SMTP';
  END IF;

  FOR setting_row IN
    SELECT id, company_id, smtp_password_encrypted
      FROM public.tenant_smtp_settings
     WHERE smtp_vault_secret_id IS NULL
  LOOP
    SELECT vault.create_secret(
      convert_from(setting_row.smtp_password_encrypted, 'UTF8'),
      'servicefy_smtp_' || setting_row.company_id || '_' || setting_row.id,
      'ServiceFY tenant SMTP password',
      NULL
    ) INTO secret_id;

    UPDATE public.tenant_smtp_settings
       SET smtp_vault_secret_id = secret_id,
           rotation_required = false
     WHERE id = setting_row.id;
  END LOOP;
END $$;

ALTER TABLE public.tenant_smtp_settings
  DROP COLUMN IF EXISTS smtp_password_encrypted;

DROP POLICY IF EXISTS tenant_smtp_settings_tenant_isolation ON public.tenant_smtp_settings;
CREATE POLICY tenant_smtp_settings_admin_read
  ON public.tenant_smtp_settings
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

REVOKE ALL ON public.tenant_smtp_settings FROM authenticated;
GRANT SELECT (
  id,company_id,smtp_host,smtp_port,smtp_user,from_email,from_name,encryption_type,created_at,updated_at
) ON public.tenant_smtp_settings TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_smtp_settings FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_tenant_smtp_settings(
  p_company_id uuid,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_user text,
  p_from_email text,
  p_from_name text,
  p_encryption_type text,
  p_password text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.tenant_smtp_settings;
  v_saved public.tenant_smtp_settings;
  v_secret_id uuid;
BEGIN
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(trim(p_smtp_host), '') IS NULL
     OR p_smtp_port NOT BETWEEN 1 AND 65535
     OR NULLIF(trim(p_smtp_user), '') IS NULL
     OR NULLIF(trim(p_from_email), '') IS NULL
     OR NULLIF(trim(p_from_name), '') IS NULL
     OR p_encryption_type NOT IN ('tls', 'ssl', 'none') THEN
    RAISE EXCEPTION 'Configuracao SMTP invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
    FROM public.tenant_smtp_settings
   WHERE company_id = p_company_id
   FOR UPDATE;

  IF NULLIF(p_password, '') IS NOT NULL THEN
    IF to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NULL THEN
      RAISE EXCEPTION 'Vault nao esta disponivel para armazenar a credencial SMTP';
    END IF;

    IF v_current.smtp_vault_secret_id IS NULL THEN
      SELECT vault.create_secret(
        p_password,
        'servicefy_smtp_' || p_company_id || '_' || gen_random_uuid(),
        'ServiceFY tenant SMTP password',
        NULL
      ) INTO v_secret_id;
    ELSE
      PERFORM vault.update_secret(
        v_current.smtp_vault_secret_id,
        p_password,
        'servicefy_smtp_' || p_company_id || '_' || v_current.id,
        'ServiceFY tenant SMTP password',
        NULL
      );
      v_secret_id := v_current.smtp_vault_secret_id;
    END IF;
  ELSE
    v_secret_id := v_current.smtp_vault_secret_id;
  END IF;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Informe a senha SMTP para salvar a configuracao' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_smtp_settings(
    company_id, smtp_host, smtp_port, smtp_user, smtp_vault_secret_id,
    from_email, from_name, encryption_type, rotation_required, updated_at
  ) VALUES (
    p_company_id, trim(p_smtp_host), p_smtp_port, trim(p_smtp_user), v_secret_id,
    trim(p_from_email), trim(p_from_name), p_encryption_type, false, now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    smtp_host = EXCLUDED.smtp_host,
    smtp_port = EXCLUDED.smtp_port,
    smtp_user = EXCLUDED.smtp_user,
    smtp_vault_secret_id = EXCLUDED.smtp_vault_secret_id,
    from_email = EXCLUDED.from_email,
    from_name = EXCLUDED.from_name,
    encryption_type = EXCLUDED.encryption_type,
    rotation_required = false,
    updated_at = now()
  RETURNING * INTO v_saved;

  PERFORM public.write_admin_audit(
    p_company_id,
    'smtp.settings.saved',
    'tenant_smtp_settings',
    v_saved.id::text,
    NULL,
    to_jsonb(v_saved) - 'smtp_vault_secret_id'
  );

  RETURN to_jsonb(v_saved) - 'smtp_vault_secret_id';
END;
$$;

REVOKE ALL ON FUNCTION public.save_tenant_smtp_settings(uuid,text,integer,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_smtp_settings(uuid,text,integer,text,text,text,text,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.tenant_email_delivery_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('ticket_opened', 'status_changed', 'assignment_changed', 'ticket_closed', 'public_comment')),
  allow_global_fallback boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_tenant_email_delivery_policies_company
  ON public.tenant_email_delivery_policies(company_id);

ALTER TABLE public.tenant_email_delivery_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_email_delivery_policies_admin_read
  ON public.tenant_email_delivery_policies
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

REVOKE ALL ON public.tenant_email_delivery_policies FROM authenticated;
GRANT SELECT ON public.tenant_email_delivery_policies TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_email_delivery_policies FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_tenant_email_delivery_policy(
  p_company_id uuid,
  p_event_type text,
  p_allow_global_fallback boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.tenant_email_delivery_policies;
  v_saved public.tenant_email_delivery_policies;
BEGIN
  IF public.get_current_user_role() <> 'sysadmin' THEN
    RAISE EXCEPTION 'Apenas o MSP pode alterar a politica de fallback' USING ERRCODE = '42501';
  END IF;

  IF p_event_type NOT IN ('ticket_opened', 'status_changed', 'assignment_changed', 'ticket_closed', 'public_comment') THEN
    RAISE EXCEPTION 'Evento de notificacao invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before
    FROM public.tenant_email_delivery_policies
   WHERE company_id = p_company_id AND event_type = p_event_type
   FOR UPDATE;

  INSERT INTO public.tenant_email_delivery_policies(
    company_id, event_type, allow_global_fallback, updated_by, updated_at
  ) VALUES (
    p_company_id, p_event_type, p_allow_global_fallback, public.get_current_profile_id(), now()
  )
  ON CONFLICT (company_id, event_type) DO UPDATE SET
    allow_global_fallback = EXCLUDED.allow_global_fallback,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING * INTO v_saved;

  PERFORM public.write_admin_audit(
    p_company_id,
    'smtp.fallback_policy.saved',
    'tenant_email_delivery_policy',
    v_saved.id::text,
    CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    to_jsonb(v_saved)
  );

  RETURN to_jsonb(v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.save_tenant_email_delivery_policy(uuid,text,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_email_delivery_policy(uuid,text,boolean) TO authenticated;
