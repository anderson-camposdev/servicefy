-- ============================================================
-- Flowfy ITSM — Migration 012
-- ETAPA 5 — Estrutura Modular: Provisionamento de Tenants
--
-- Função única e segura para plugar novos clientes sem editar
-- código. Cria/atualiza a empresa (idempotente por slug) com seu
-- branding white-label. Apenas o provedor MSP / sysadmin pode
-- executar (guarda interna via is_current_user_msp_admin()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_slug              TEXT,
  p_name              TEXT,
  p_domain            TEXT,
  p_primary_color     TEXT DEFAULT '#10b981',
  p_accent_color      TEXT DEFAULT '#00a3e0',
  p_bg_color          TEXT DEFAULT '#f8fafc',
  p_logo_url          TEXT DEFAULT NULL,
  p_welcome_title     TEXT DEFAULT NULL,
  p_welcome_subtitle  TEXT DEFAULT NULL,
  p_concurrent_licenses INT DEFAULT 10,
  p_license_plan      TEXT DEFAULT 'starter'
)
RETURNS public.companies AS $$
DECLARE
  v_company public.companies;
  v_slug    TEXT := lower(regexp_replace(p_slug, '[^a-z0-9-]', '', 'g'));
BEGIN
  -- Governança: somente o provedor MSP / sysadmin provisiona.
  IF NOT public.is_current_user_msp_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o provedor MSP pode provisionar tenants.'
      USING ERRCODE = '42501';
  END IF;

  IF v_slug IS NULL OR length(v_slug) = 0 THEN
    RAISE EXCEPTION 'Slug inválido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.companies (
    name, domain, slug,
    primary_color, accent_color, bg_color, logo_url,
    welcome_title, welcome_subtitle,
    allow_local_login, sso_providers,
    concurrent_licenses, license_plan,
    active, is_provider_tenant
  )
  VALUES (
    p_name, lower(p_domain), v_slug,
    p_primary_color, p_accent_color, p_bg_color, p_logo_url,
    COALESCE(p_welcome_title, p_name),
    COALESCE(p_welcome_subtitle, 'Portal de Serviços de TI'),
    true, '[]'::jsonb,
    p_concurrent_licenses, p_license_plan,
    true, false
  )
  ON CONFLICT (slug) DO UPDATE SET
    name             = EXCLUDED.name,
    domain           = EXCLUDED.domain,
    primary_color    = EXCLUDED.primary_color,
    accent_color     = EXCLUDED.accent_color,
    bg_color         = EXCLUDED.bg_color,
    logo_url         = EXCLUDED.logo_url,
    welcome_title    = EXCLUDED.welcome_title,
    welcome_subtitle = EXCLUDED.welcome_subtitle,
    concurrent_licenses = EXCLUDED.concurrent_licenses,
    license_plan     = EXCLUDED.license_plan,
    updated_at       = now()
  RETURNING * INTO v_company;

  RETURN v_company;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões: usuários autenticados podem chamar (a guarda interna
-- restringe ao provedor). Anônimo não pode.
REVOKE ALL ON FUNCTION public.provision_tenant(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.provision_tenant IS
  'Provisiona (cria/atualiza) um tenant cliente. Idempotente por slug. Restrito ao provedor MSP.';
