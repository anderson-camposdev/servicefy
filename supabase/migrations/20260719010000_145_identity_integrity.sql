-- ServiceFY — identidade determinística e convites idempotentes
-- Remove seleção global arbitrária de perfil no JIT e trata concorrência
-- de convites como repetição segura, sem expor mensagens internas do banco.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company public.companies;
  v_domain text;
  v_email text;
  v_existing_profile_id uuid;
  v_candidate_company_id uuid;
  v_candidate_count bigint := 0;
  v_linked_count integer := 0;
  v_provider text := lower(COALESCE(NEW.raw_app_meta_data->>'provider', 'email'));
  v_provider_enabled boolean := false;
BEGIN
  IF NEW.email IS NULL OR position('@' IN NEW.email) < 2 THEN
    RETURN NEW;
  END IF;

  v_email := lower(btrim(NEW.email));
  v_domain := lower(btrim(split_part(v_email, '@', 2)));

  SELECT count(*)
    INTO v_candidate_count
    FROM public.profiles AS p
   WHERE p.auth_id IS NULL
     AND lower(btrim(p.email)) = v_email;

  -- Convites inequívocos continuam funcionando mesmo quando o tenant não
  -- configurou um domínio SSO. O tenant vem do próprio convite.
  IF v_candidate_count = 1 THEN
    SELECT p.id, p.company_id
      INTO v_existing_profile_id, v_candidate_company_id
      FROM public.profiles AS p
      JOIN public.companies AS c ON c.id = p.company_id
     WHERE p.auth_id IS NULL
       AND lower(btrim(p.email)) = v_email
       AND p.active = true
       AND c.active = true;

    SELECT c.*
      INTO v_company
      FROM public.companies AS c
     WHERE c.id = v_candidate_company_id;
  ELSE
    -- Com zero ou múltiplos candidatos, somente um domínio verificado e
    -- globalmente único pode determinar o tenant.
    SELECT c.*
      INTO v_company
      FROM public.company_login_domains AS d
      JOIN public.companies AS c ON c.id = d.company_id
     WHERE d.domain = v_domain
       AND d.verified_at IS NOT NULL
       AND c.active = true;

    IF v_candidate_count > 1 AND v_company.id IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_company.id IS NOT NULL THEN
      SELECT p.id
        INTO v_existing_profile_id
        FROM public.profiles AS p
       WHERE p.company_id = v_company.id
         AND p.auth_id IS NULL
         AND lower(btrim(p.email)) = v_email
         AND p.active = true;
    END IF;
  END IF;

  IF v_company.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_provider IN ('google', 'azure') THEN
    v_provider_enabled := v_company.sso_providers ? v_provider OR EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_company.sso_providers) AS configured(item)
       WHERE COALESCE(configured.item->>'enabled', 'true') = 'true'
         AND lower(COALESCE(configured.item->>'id', configured.item->>'type', ''))
             IN (v_provider, 'oauth_' || v_provider)
    );
  ELSIF v_provider = 'email' THEN
    v_provider_enabled := v_company.allow_local_login;
  END IF;

  IF NOT v_provider_enabled THEN
    RETURN NEW;
  END IF;

  IF v_existing_profile_id IS NOT NULL THEN
    UPDATE public.profiles AS p
       SET auth_id = NEW.id,
           updated_at = now()
     WHERE p.id = v_existing_profile_id
       AND p.auth_id IS NULL;
    GET DIAGNOSTICS v_linked_count = ROW_COUNT;

    IF v_linked_count = 1 THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.profiles (
      id, auth_id, company_id, name, email, role, avatar_url, active
    ) VALUES (
      gen_random_uuid(),
      NEW.id,
      v_company.id,
      left(COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        split_part(v_email, '@', 1)
      ), 200),
      v_email,
      'end_user'::public.user_role,
      NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
      true
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Outro fluxo pode ter criado/vinculado o mesmo perfil. O índice
      -- uq_profiles_company_email_normalized é a autoridade final.
      UPDATE public.profiles AS p
         SET auth_id = NEW.id,
             updated_at = now()
       WHERE p.company_id = v_company.id
         AND lower(btrim(p.email)) = v_email
         AND p.auth_id IS NULL;
      GET DIAGNOSTICS v_linked_count = ROW_COUNT;

      IF v_linked_count = 1 OR EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.company_id = v_company.id
          AND p.auth_id = NEW.id
      ) THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Conflito ao vincular identidade ao tenant.'
        USING ERRCODE = '23505';
  END;

  RETURN NEW;
END
$function$;

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

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.batch_invite_users(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_invite_users(jsonb) TO authenticated;
