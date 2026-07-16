-- ============================================================================
-- Fase 29 — SSO Google/Microsoft, roteamento de tenant e JIT seguro
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS allow_local_login boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sso_providers jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.company_login_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_login_domains_domain_key UNIQUE (domain),
  CONSTRAINT company_login_domains_normalized_chk
    CHECK (domain = lower(btrim(domain))),
  CONSTRAINT company_login_domains_format_chk
    CHECK (domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS company_login_domains_one_primary_idx
  ON public.company_login_domains(company_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS company_login_domains_company_idx
  ON public.company_login_domains(company_id, domain);

DO $block$
BEGIN
  IF EXISTS (
    SELECT lower(btrim(c.domain))
      FROM public.companies AS c
     GROUP BY lower(btrim(c.domain))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem domínios de empresas duplicados após normalização.';
  END IF;
END
$block$;

INSERT INTO public.company_login_domains (company_id, domain, is_primary, verified_at)
SELECT c.id, lower(btrim(c.domain)), true, now()
  FROM public.companies AS c
 WHERE btrim(c.domain) <> ''
ON CONFLICT (domain) DO UPDATE
SET company_id = EXCLUDED.company_id,
    is_primary = true,
    verified_at = COALESCE(public.company_login_domains.verified_at, now()),
    updated_at = now();

ALTER TABLE public.company_login_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_login_domains_tenant_read ON public.company_login_domains;
CREATE POLICY company_login_domains_tenant_read
  ON public.company_login_domains
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR company_id = public.get_current_user_company_id()
  );

DROP POLICY IF EXISTS company_login_domains_msp_write ON public.company_login_domains;
CREATE POLICY company_login_domains_msp_write
  ON public.company_login_domains
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin())
  WITH CHECK (public.is_current_user_msp_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_login_domains TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_company_primary_login_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_domain text := lower(btrim(NEW.domain));
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.company_login_domains AS d
       SET domain = v_domain,
           verified_at = now(),
           updated_at = now()
     WHERE d.company_id = NEW.id
       AND d.is_primary;

    IF FOUND THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.company_login_domains (company_id, domain, is_primary, verified_at)
  VALUES (NEW.id, v_domain, true, now());
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS sync_company_primary_login_domain ON public.companies;
CREATE TRIGGER sync_company_primary_login_domain
  AFTER INSERT OR UPDATE OF domain ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.sync_company_primary_login_domain();

CREATE OR REPLACE FUNCTION public.update_company_login_policy(
  p_company_id uuid,
  p_allow_local_login boolean,
  p_sso_providers jsonb
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company public.companies;
  v_providers jsonb;
BEGIN
  IF NOT (
    public.is_current_user_msp_admin()
    OR (
      public.get_current_user_role() = 'company_admin'
      AND public.get_current_user_company_id() = p_company_id
    )
  ) THEN
    RAISE EXCEPTION 'Acesso administrativo negado.' USING ERRCODE = '42501';
  END IF;

  IF p_sso_providers IS NULL OR jsonb_typeof(p_sso_providers) <> 'array' THEN
    RAISE EXCEPTION 'Provedores SSO devem ser uma lista.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(p_sso_providers) AS provider(value)
     WHERE value NOT IN ('google', 'azure')
  ) THEN
    RAISE EXCEPTION 'Provedor SSO não suportado.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(provider ORDER BY provider), '[]'::jsonb)
    INTO v_providers
    FROM (
      SELECT DISTINCT value AS provider
        FROM jsonb_array_elements_text(p_sso_providers)
    ) AS normalized;

  IF p_allow_local_login = false AND jsonb_array_length(v_providers) = 0 THEN
    RAISE EXCEPTION 'Habilite ao menos um provedor antes de exigir SSO.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.companies AS c
     SET allow_local_login = p_allow_local_login,
         sso_providers = v_providers,
         updated_at = now()
   WHERE c.id = p_company_id
  RETURNING c.* INTO v_company;

  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_company;
END
$function$;

REVOKE ALL ON FUNCTION public.update_company_login_policy(uuid, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_company_login_policy(uuid, boolean, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company public.companies;
  v_domain text;
  v_existing_profile_id uuid;
  v_provider text := lower(COALESCE(NEW.raw_app_meta_data->>'provider', 'email'));
  v_provider_enabled boolean := false;
BEGIN
  IF NEW.email IS NULL OR position('@' IN NEW.email) < 2 THEN
    RETURN NEW;
  END IF;

  SELECT p.id
    INTO v_existing_profile_id
    FROM public.profiles AS p
   WHERE p.auth_id IS NULL
     AND lower(p.email) = lower(NEW.email)
   ORDER BY p.created_at, p.id
   LIMIT 1
   FOR UPDATE;

  IF v_existing_profile_id IS NOT NULL THEN
    UPDATE public.profiles AS p
       SET auth_id = NEW.id,
           updated_at = now()
     WHERE p.id = v_existing_profile_id;
    RETURN NEW;
  END IF;

  v_domain := lower(btrim(split_part(NEW.email, '@', 2)));

  SELECT c.*
    INTO v_company
    FROM public.company_login_domains AS d
    JOIN public.companies AS c ON c.id = d.company_id
   WHERE d.domain = v_domain
     AND d.verified_at IS NOT NULL
     AND c.active = true
   LIMIT 1;

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

  INSERT INTO public.profiles (
    id, auth_id, company_id, name, email, role, avatar_url, active
  ) VALUES (
    gen_random_uuid(),
    NEW.id,
    v_company.id,
    left(COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(NEW.email, '@', 1)
    ), 200),
    lower(NEW.email),
    'end_user'::public.user_role,
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
    true
  );

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_allow_local_login boolean;
BEGIN
  IF COALESCE((event->>'valid')::boolean, false) = false THEN
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  v_user_id := (event->>'user_id')::uuid;

  SELECT c.allow_local_login
    INTO v_allow_local_login
    FROM public.profiles AS p
    JOIN public.companies AS c ON c.id = p.company_id
   WHERE p.auth_id = v_user_id
     AND p.active = true
     AND c.active = true
   LIMIT 1;

  IF v_allow_local_login = false THEN
    RETURN jsonb_build_object(
      'decision', 'reject',
      'message', 'Sua organização exige autenticação corporativa via SSO.',
      'should_logout_user', false
    );
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
END
$function$;

REVOKE ALL ON FUNCTION public.hook_password_verification_attempt(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
