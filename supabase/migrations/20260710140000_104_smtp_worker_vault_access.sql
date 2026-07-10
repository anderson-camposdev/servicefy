-- ServiceFY - Fase 9: ponte controlada entre o worker interno e o Vault.
-- O schema vault nao e exposto pelo PostgREST; somente service_role pode resolver a senha.

CREATE OR REPLACE FUNCTION public.get_tenant_smtp_delivery_credential(p_company_id uuid)
RETURNS TABLE (
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_password text,
  from_email text,
  from_name text,
  encryption_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker de e-mail' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT settings.smtp_host,
         settings.smtp_port,
         settings.smtp_user,
         secrets.decrypted_secret,
         settings.from_email,
         settings.from_name,
         settings.encryption_type
    FROM public.tenant_smtp_settings settings
    JOIN vault.decrypted_secrets secrets
      ON secrets.id = settings.smtp_vault_secret_id
   WHERE settings.company_id = p_company_id
     AND settings.rotation_required = false;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_smtp_delivery_credential(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_smtp_delivery_credential(uuid) TO service_role;
