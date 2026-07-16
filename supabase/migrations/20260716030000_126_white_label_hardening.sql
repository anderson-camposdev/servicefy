-- ServiceFY — Fase 28: Motor White-Label.
-- Consolida schema, restringe a escrita em companies e provisiona os assets.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS background_url text;

UPDATE public.companies
   SET brand_name = COALESCE(brand_name, name),
       secondary_color = COALESCE(secondary_color, accent_color, '#00a3e0')
 WHERE brand_name IS NULL OR secondary_color IS NULL;

-- O bucket é público somente para leitura. Escritas continuam sob RLS.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding_assets',
  'branding_assets',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS branding_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS branding_assets_admin_insert ON storage.objects;
DROP POLICY IF EXISTS branding_assets_admin_update ON storage.objects;
DROP POLICY IF EXISTS branding_assets_admin_delete ON storage.objects;

CREATE POLICY branding_assets_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'branding_assets');

CREATE POLICY branding_assets_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding_assets'
    AND (storage.foldername(name))[1] = 'brands'
    AND storage.filename(name) IN ('logo', 'background')
    AND (
      public.is_current_user_msp_admin()
      OR (
        (storage.foldername(name))[2] = public.get_current_user_company_id()::text
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
      )
    )
  );

CREATE POLICY branding_assets_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding_assets'
    AND (storage.foldername(name))[1] = 'brands'
    AND storage.filename(name) IN ('logo', 'background')
    AND (
      public.is_current_user_msp_admin()
      OR (
        (storage.foldername(name))[2] = public.get_current_user_company_id()::text
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'branding_assets'
    AND (storage.foldername(name))[1] = 'brands'
    AND storage.filename(name) IN ('logo', 'background')
    AND (
      public.is_current_user_msp_admin()
      OR (
        (storage.foldername(name))[2] = public.get_current_user_company_id()::text
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
      )
    )
  );

CREATE POLICY branding_assets_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding_assets'
    AND (storage.foldername(name))[1] = 'brands'
    AND storage.filename(name) IN ('logo', 'background')
    AND (
      public.is_current_user_msp_admin()
      OR (
        (storage.foldername(name))[2] = public.get_current_user_company_id()::text
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
      )
    )
  );

-- Policies permissivas são OR-combinadas. Todas as antigas precisam sair para
-- que company_admin não consiga alterar is_provider_tenant/licenças/auth.
DROP POLICY IF EXISTS write_company_policy ON public.companies;
DROP POLICY IF EXISTS update_company_branding ON public.companies;
DROP POLICY IF EXISTS update_own_company ON public.companies;
DROP POLICY IF EXISTS companies_msp_update ON public.companies;

CREATE POLICY companies_msp_update ON public.companies
  FOR UPDATE TO authenticated
  USING (public.is_current_user_msp_admin())
  WITH CHECK (public.is_current_user_msp_admin());

CREATE OR REPLACE FUNCTION public.update_company_branding(
  p_company_id uuid,
  p_settings jsonb
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company public.companies;
  v_unknown_key text;
  v_allowed_keys constant text[] := ARRAY[
    'primary_color', 'secondary_color', 'title_size', 'logo_url',
    'background_url', 'brand_name', 'welcome_title', 'welcome_subtitle',
    'bg_color', 'greeting_prefix', 'greeting_color', 'catalog_ui_config'
  ];
  v_url_pattern constant text := '^(https://|http://(localhost|127\.0\.0\.1|\[::1\])([:/]|$))';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_current_user_msp_admin()
     AND NOT (
       p_company_id = public.get_current_user_company_id()
       AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
     ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o branding deste tenant.' USING ERRCODE = '42501';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'Configuração de branding inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT key INTO v_unknown_key
    FROM jsonb_object_keys(p_settings) AS keys(key)
   WHERE NOT (key = ANY(v_allowed_keys))
   LIMIT 1;
  IF v_unknown_key IS NOT NULL THEN
    RAISE EXCEPTION 'Campo de branding não permitido: %', v_unknown_key USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'primary_color'
     AND COALESCE(p_settings->>'primary_color', '') NOT IN (
       'Ocean', 'Midnight', 'Emerald', 'Ruby', 'Amethyst', 'Sunset',
       'CorporateBlue', 'Graphite', 'Crimson', 'Forest', 'Pearl',
       'Breeze', 'Meadow', 'Blush', 'Stone'
     ) THEN
    RAISE EXCEPTION 'Tema primário inválido.' USING ERRCODE = '22023';
  END IF;

  IF length(COALESCE(p_settings->>'brand_name', '')) > 120
     OR length(COALESCE(p_settings->>'welcome_title', '')) > 160
     OR length(COALESCE(p_settings->>'welcome_subtitle', '')) > 300
     OR length(COALESCE(p_settings->>'greeting_prefix', '')) > 80
     OR length(COALESCE(p_settings->>'bg_color', '')) > 1000 THEN
    RAISE EXCEPTION 'Texto de branding excede o limite permitido.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'greeting_color'
     AND p_settings->>'greeting_color' IS NOT NULL
     AND p_settings->>'greeting_color' !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor da saudação inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'secondary_color'
     AND p_settings->>'secondary_color' IS NOT NULL
     AND p_settings->>'secondary_color' !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor secundária inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'title_size'
     AND COALESCE(p_settings->>'title_size', '') NOT IN ('compact', 'standard', 'large', 'display') THEN
    RAISE EXCEPTION 'Escala tipográfica inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'bg_color'
     AND p_settings->>'bg_color' IS NOT NULL
     AND p_settings->>'bg_color' !~ '^#[0-9A-Fa-f]{6}$'
     AND p_settings->>'bg_color' !~* v_url_pattern
     AND p_settings->>'bg_color' !~* '^(linear|radial)-gradient\(' THEN
    RAISE EXCEPTION 'Fundo da tela de login inválido.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'logo_url'
     AND p_settings->>'logo_url' IS NOT NULL
     AND p_settings->>'logo_url' !~* v_url_pattern THEN
    RAISE EXCEPTION 'URL do logotipo inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'background_url'
     AND p_settings->>'background_url' IS NOT NULL
     AND p_settings->>'background_url' !~* v_url_pattern THEN
    RAISE EXCEPTION 'URL do background inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'catalog_ui_config'
     AND jsonb_typeof(p_settings->'catalog_ui_config') <> 'object' THEN
    RAISE EXCEPTION 'Configuração do catálogo inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_settings ? 'catalog_ui_config'
     AND octet_length((p_settings->'catalog_ui_config')::text) > 16384 THEN
    RAISE EXCEPTION 'Configuração do catálogo excede o limite permitido.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.companies
     SET primary_color = CASE WHEN p_settings ? 'primary_color' THEN p_settings->>'primary_color' ELSE primary_color END,
         secondary_color = CASE WHEN p_settings ? 'secondary_color' THEN p_settings->>'secondary_color' ELSE secondary_color END,
         title_size = CASE WHEN p_settings ? 'title_size' THEN p_settings->>'title_size' ELSE title_size END,
         logo_url = CASE WHEN p_settings ? 'logo_url' THEN p_settings->>'logo_url' ELSE logo_url END,
         background_url = CASE WHEN p_settings ? 'background_url' THEN p_settings->>'background_url' ELSE background_url END,
         brand_name = CASE WHEN p_settings ? 'brand_name' THEN p_settings->>'brand_name' ELSE brand_name END,
         welcome_title = CASE WHEN p_settings ? 'welcome_title' THEN COALESCE(p_settings->>'welcome_title', welcome_title) ELSE welcome_title END,
         welcome_subtitle = CASE WHEN p_settings ? 'welcome_subtitle' THEN COALESCE(p_settings->>'welcome_subtitle', welcome_subtitle) ELSE welcome_subtitle END,
         bg_color = CASE WHEN p_settings ? 'bg_color' THEN COALESCE(p_settings->>'bg_color', bg_color) ELSE bg_color END,
         greeting_prefix = CASE WHEN p_settings ? 'greeting_prefix' THEN p_settings->>'greeting_prefix' ELSE greeting_prefix END,
         greeting_color = CASE WHEN p_settings ? 'greeting_color' THEN p_settings->>'greeting_color' ELSE greeting_color END,
         catalog_ui_config = CASE WHEN p_settings ? 'catalog_ui_config' THEN p_settings->'catalog_ui_config' ELSE catalog_ui_config END,
         updated_at = now()
   WHERE id = p_company_id
   RETURNING * INTO v_company;

  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_company;
END;
$$;

REVOKE ALL ON FUNCTION public.update_company_branding(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_company_branding(uuid, jsonb) TO authenticated;
