-- ServiceFY — fecha a lacuna documentada (mas nunca implementada) na
-- migration 107: "impede auto-elevação de privilégio (company_admin virar
-- sysadmin...)". Até aqui, um company_admin comum podia promover qualquer
-- perfil do próprio tenant a sysadmin via update_profile_secure — o mesmo
-- risco já corrigido em batch_invite_users (migration 147). Papel sysadmin
-- só pode ser concedido por quem já é MSP admin (provedor ou sysadmin).

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
  v_is_admin := v_is_msp_admin
    OR (v_actor.company_id = v_target.company_id
        AND v_actor.role::text IN ('sysadmin', 'company_admin'));

  IF v_actor.id IS DISTINCT FROM v_target.id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Sem permissão para editar este perfil' USING ERRCODE = '42501';
  END IF;

  v_requested_role := p_patch->>'role';
  IF v_requested_role = 'sysadmin' AND NOT v_is_msp_admin THEN
    RAISE EXCEPTION 'Somente administradores do provedor podem conceder o papel sysadmin' USING ERRCODE = '42501';
  END IF;

  -- Nunca aceitamos company_id, auth_id, id ou timestamps do cliente.
  -- O próprio usuário edita somente dados pessoais; governança exige admin.
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
