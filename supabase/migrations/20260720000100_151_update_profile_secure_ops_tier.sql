-- ServiceFY — decisão de produto (mesma da migration 150): ops_manager e
-- governance_manager passam a editar perfis de usuário do próprio tenant
-- (nome, e-mail, departamento, ativo/inativo, e atribuir papéis
-- operacionais: end_user/agent/ops_manager/governance_manager). Eles NÃO
-- podem conceder company_admin nem sysadmin — essas duas concessões
-- continuam exclusivas de quem já é tenant admin (sysadmin/company_admin)
-- ou MSP admin, respectivamente (a trava de sysadmin já existia desde a
-- migration 149; a trava de company_admin é nova nesta migration).

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
  v_is_tenant_admin BOOLEAN;
  v_is_msp_admin BOOLEAN;
  v_requested_role TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  SELECT * INTO v_target FROM public.profiles
   WHERE id = p_profile_id FOR UPDATE;

  IF v_actor.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado' USING ERRCODE = '42501';
  END IF;

  v_is_msp_admin := public.is_current_user_msp_admin();
  v_is_tenant_admin := v_actor.company_id = v_target.company_id
    AND v_actor.role::text IN ('sysadmin', 'company_admin');
  -- Tier operacional: mesmas capacidades gerais de v_is_tenant_admin, exceto
  -- conceder company_admin/sysadmin (checado abaixo, por papel solicitado).
  v_is_admin := v_is_msp_admin
    OR v_is_tenant_admin
    OR (v_actor.company_id = v_target.company_id
        AND v_actor.role::text IN ('ops_manager', 'governance_manager'));

  IF v_actor.id IS DISTINCT FROM v_target.id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Sem permissão para editar este perfil' USING ERRCODE = '42501';
  END IF;

  v_requested_role := p_patch->>'role';
  IF v_requested_role = 'sysadmin' AND NOT v_is_msp_admin THEN
    RAISE EXCEPTION 'Somente administradores do provedor podem conceder o papel sysadmin' USING ERRCODE = '42501';
  END IF;
  IF v_requested_role = 'company_admin' AND NOT (v_is_msp_admin OR v_is_tenant_admin) THEN
    RAISE EXCEPTION 'Somente administradores do tenant ou do provedor podem conceder o papel Administrador do Tenant' USING ERRCODE = '42501';
  END IF;

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
