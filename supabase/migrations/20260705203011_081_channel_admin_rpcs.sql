-- ServiceFY — RPCs administrativas write-only para conexões
CREATE OR REPLACE FUNCTION public.save_channel_connection(
  p_company_id uuid,
  p_connection_id uuid,
  p_scope public.channel_scope,
  p_provider public.channel_provider,
  p_name text,
  p_address text,
  p_enabled boolean,
  p_config jsonb DEFAULT '{}'::jsonb,
  p_secret text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.channel_connections;
  v_saved public.channel_connections;
  v_secret_id uuid;
BEGIN
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE='42501';
  END IF;

  IF p_connection_id IS NOT NULL THEN
    SELECT * INTO v_current FROM public.channel_connections
    WHERE id=p_connection_id AND company_id=p_company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conexão não encontrada' USING ERRCODE='P0002'; END IF;
  END IF;

  IF NULLIF(trim(p_secret),'') IS NOT NULL THEN
    IF to_regprocedure('vault.create_secret(text,text,text)') IS NULL THEN
      RAISE EXCEPTION 'Vault não está disponível';
    END IF;
    EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO v_secret_id
      USING p_secret, 'servicefy_channel_' || gen_random_uuid(), 'ServiceFY channel credential';
  ELSE
    v_secret_id := v_current.vault_secret_id;
  END IF;

  IF p_connection_id IS NULL THEN
    INSERT INTO public.channel_connections(
      company_id,scope,provider,name,address,enabled,status,vault_secret_id,
      config,rotation_required,created_by
    ) VALUES (
      p_company_id,p_scope,p_provider,trim(p_name),NULLIF(trim(p_address),''),
      p_enabled,CASE WHEN p_enabled THEN 'connecting' ELSE 'disconnected' END,
      v_secret_id,COALESCE(p_config,'{}'::jsonb),false,public.get_current_profile_id()
    ) RETURNING * INTO v_saved;
  ELSE
    UPDATE public.channel_connections SET
      scope=p_scope,provider=p_provider,name=trim(p_name),address=NULLIF(trim(p_address),''),
      enabled=p_enabled,status=CASE WHEN p_enabled THEN 'connecting' ELSE 'disconnected' END,
      vault_secret_id=v_secret_id,config=COALESCE(p_config,'{}'::jsonb),
      rotation_required=false,updated_at=now()
    WHERE id=p_connection_id RETURNING * INTO v_saved;
  END IF;

  PERFORM public.write_admin_audit(
    p_company_id,
    CASE WHEN p_connection_id IS NULL THEN 'connection.created' ELSE 'connection.updated' END,
    'channel_connection',v_saved.id::text,
    CASE WHEN p_connection_id IS NULL THEN NULL ELSE to_jsonb(v_current)-'vault_secret_id'-'config' END,
    to_jsonb(v_saved)-'vault_secret_id'-'config'
  );

  RETURN to_jsonb(v_saved)-'vault_secret_id'-'config'-'last_error_message';
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_channel_connection(
  p_company_id uuid,
  p_connection_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_before public.channel_connections;
BEGIN
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_before FROM public.channel_connections
  WHERE id=p_connection_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conexão não encontrada' USING ERRCODE='P0002'; END IF;

  UPDATE public.channel_connections SET
    enabled=false,status='disconnected',vault_secret_id=NULL,
    rotation_required=false,updated_at=now()
  WHERE id=p_connection_id;

  PERFORM public.write_admin_audit(
    p_company_id,'connection.revoked','channel_connection',p_connection_id::text,
    to_jsonb(v_before)-'vault_secret_id'-'config',jsonb_build_object('status','disconnected')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_channel_connection(
  uuid,uuid,public.channel_scope,public.channel_provider,text,text,boolean,jsonb,text
) FROM public,anon;
REVOKE ALL ON FUNCTION public.revoke_channel_connection(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.save_channel_connection(
  uuid,uuid,public.channel_scope,public.channel_provider,text,text,boolean,jsonb,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_channel_connection(uuid,uuid) TO authenticated;
