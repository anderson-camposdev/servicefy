-- ServiceFY — RPC de convite em lote (batch_invite_users)
--
-- src/lib/services.ts (profilesService.batchInvite) chama
-- supabase.rpc('batch_invite_users', { p_payload }) desde a introdução do
-- fluxo de importação CSV em UserImportZone.tsx, mas nenhuma migration
-- jamais criou essa função — toda tentativa de bulk-import falhava em
-- runtime com "function batch_invite_users does not exist". Esta migration
-- implementa a RPC faltante seguindo o padrão já estabelecido pelas RPCs
-- administrativas do repo (save_channel_connection, write_admin_audit):
-- escopo por company_id, checagem de admin via is_settings_admin,
-- SECURITY DEFINER com search_path fixo.
--
-- Cada convite é processado em sua própria subtransação (BEGIN/EXCEPTION),
-- para que uma falha isolada (role inválida, e-mail duplicado, limite de
-- licenças de analistas via tg_enforce_analyst_license_limit) não aborte o
-- lote inteiro — o resultado é um resumo {created, skipped, errors[]}.

CREATE OR REPLACE FUNCTION public.batch_invite_users(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_invite     jsonb;
  v_email      text;
  v_name       text;
  v_role       text;
  v_dept_id    uuid;
  v_dept_name  text;
  v_created    int := 0;
  v_skipped    int := 0;
  v_errors     jsonb := '[]'::jsonb;
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
    v_email     := NULLIF(lower(trim(v_invite->>'email')), '');
    v_name      := NULLIF(trim(v_invite->>'name'), '');
    v_role      := NULLIF(trim(v_invite->>'role'), '');
    v_dept_id   := NULLIF(v_invite->>'department_id', '')::uuid;
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

    -- Duplicado dentro do próprio tenant: não é erro de sistema, só um
    -- convite redundante — conta como "skipped", não como falha.
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE company_id = v_company_id AND lower(email) = v_email
    ) THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('email', v_email, 'reason', 'usuário já existe nesta empresa');
      CONTINUE;
    END IF;

    -- department_id é resolvido para o nome em public.departments — o
    -- schema atual de profiles guarda apartamento como texto livre
    -- (profiles.department), não como FK. Escopado por company_id para
    -- não vazar nomes de departamento de outro tenant; se não encontrado,
    -- o convite segue sem departamento em vez de falhar o lote.
    IF v_dept_id IS NOT NULL THEN
      SELECT name INTO v_dept_name FROM public.departments
      WHERE id = v_dept_id AND company_id = v_company_id;
    END IF;

    BEGIN
      INSERT INTO public.profiles (company_id, name, email, role, department, active)
      VALUES (v_company_id, v_name, v_email, v_role::public.user_role, v_dept_name, true);
      v_created := v_created + 1;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_errors := v_errors || jsonb_build_object('email', v_email, 'reason', format('role inválida: %s', v_role));
      WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('email', v_email, 'reason', SQLERRM);
    END;
  END LOOP;

  PERFORM public.write_admin_audit(
    v_company_id, 'profile.batch_invited', 'profile', NULL, NULL,
    jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors)
  );

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

REVOKE ALL ON FUNCTION public.batch_invite_users(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_invite_users(jsonb) TO authenticated;
