-- ServiceFY — correções da revisão de segurança das migrations 140–146.
--
-- 1) A policy service_attachments_authenticated_insert executa
--    can_upload_service_attachment como o papel da sessão (authenticated).
--    A migration 143 revogou EXECUTE também de authenticated, então todo
--    upload no bucket falharia com "permission denied for function".
--    A função continua revogada de PUBLIC e anon.
GRANT EXECUTE ON FUNCTION public.can_upload_service_attachment(text, jsonb) TO authenticated;

-- 2) batch_invite_users aceitava qualquer valor do enum user_role, permitindo
--    que um company_admin convidasse um perfil sysadmin. Convites agora só
--    concedem papéis operacionais do tenant; papéis fora da allowlist são
--    rejeitados por item, sem abortar o lote.
CREATE OR REPLACE FUNCTION public.batch_invite_users(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_invite jsonb;
  v_email text;
  v_name text;
  v_role text;
  v_dept_raw text;
  v_dept_id uuid;
  v_dept_name text;
  v_created integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_allowed_roles constant text[] :=
    ARRAY['end_user', 'agent', 'ops_manager', 'governance_manager', 'company_admin'];
BEGIN
  v_company_id := NULLIF(p_payload->>'company_id', '')::uuid;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id é obrigatório' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_settings_admin(v_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_payload->'invites') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'invites') = 0 THEN
    RAISE EXCEPTION 'invites deve conter ao menos um convite' USING ERRCODE = '22023';
  END IF;

  FOR v_invite IN SELECT * FROM jsonb_array_elements(p_payload->'invites')
  LOOP
    v_email := NULLIF(lower(btrim(v_invite->>'email')), '');
    v_name := NULLIF(btrim(v_invite->>'name'), '');
    v_role := NULLIF(btrim(v_invite->>'role'), '');
    v_dept_raw := NULLIF(v_invite->>'department_id', '');
    v_dept_id := NULL;
    v_dept_name := NULL;

    IF v_email IS NULL OR v_name IS NULL OR v_role IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'email', v_invite->>'email', 'reason', 'email, name e role são obrigatórios'
      );
      CONTINUE;
    END IF;

    IF NOT (v_role = ANY (v_allowed_roles)) THEN
      v_errors := v_errors || jsonb_build_object(
        'email', v_email, 'reason', format('papel não permitido para convite: %s', v_role)
      );
      CONTINUE;
    END IF;

    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      v_errors := v_errors || jsonb_build_object('email', v_email, 'reason', 'e-mail inválido');
      CONTINUE;
    END IF;

    IF v_dept_raw IS NOT NULL AND v_dept_raw !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_errors := v_errors || jsonb_build_object(
        'email', v_email, 'reason', 'department_id inválido'
      );
      CONTINUE;
    END IF;

    IF v_dept_raw IS NOT NULL THEN
      v_dept_id := v_dept_raw::uuid;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE company_id = v_company_id
        AND lower(btrim(email)) = v_email
    ) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'email', v_email, 'reason', 'usuário já existe nesta empresa'
      );
      CONTINUE;
    END IF;

    IF v_dept_id IS NOT NULL THEN
      SELECT name
        INTO v_dept_name
        FROM public.departments
       WHERE id = v_dept_id
         AND company_id = v_company_id;
    END IF;

    BEGIN
      INSERT INTO public.profiles (company_id, name, email, role, department, active)
      VALUES (v_company_id, v_name, v_email, v_role::public.user_role, v_dept_name, true);
      v_created := v_created + 1;
    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'email', v_email, 'reason', 'usuário já existe nesta empresa'
        );
      WHEN invalid_text_representation THEN
        v_errors := v_errors || jsonb_build_object(
          'email', v_email, 'reason', format('role inválida: %s', v_role)
        );
      WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object(
          'email', v_email, 'reason', 'não foi possível criar o usuário'
        );
    END;
  END LOOP;

  PERFORM public.write_admin_audit(
    v_company_id, 'profile.batch_invited', 'profile', NULL, NULL,
    jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors)
  );

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'errors', v_errors
  );
END
$function$;

REVOKE ALL ON FUNCTION public.batch_invite_users(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_invite_users(jsonb) TO authenticated;
