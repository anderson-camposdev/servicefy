-- ============================================================
-- Flowfy ITSM — Migration 070
-- Corrige o escopo de leitura anônima de `companies`.
--
-- A 068 tentou REVOKE por coluna, mas o `anon` tinha SELECT no
-- nível da TABELA (que cobre todas as colunas e ignora revokes de
-- coluna). Aqui revogamos o SELECT de tabela e reconcedemos apenas
-- as colunas NÃO sensíveis — o login/branding anônimo continua
-- funcionando; licença/SSO/flags de auth deixam de ser legíveis
-- sem autenticação.
-- ============================================================

DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'companies'
     AND column_name NOT IN (
       'license_plan', 'concurrent_licenses', 'license_expires_at', 'license_alert_threshold',
       'sso_providers', 'allow_local_login', 'branding_settings'
     );

  EXECUTE 'REVOKE SELECT ON public.companies FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON public.companies TO anon', v_cols);
END $$;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT has_column_privilege('anon','public.companies','license_plan','SELECT');  -- false
--   SELECT has_column_privilege('anon','public.companies','sso_providers','SELECT'); -- false
--   SELECT has_column_privilege('anon','public.companies','primary_color','SELECT'); -- true
--   SELECT has_column_privilege('anon','public.companies','catalog_ui_config','SELECT'); -- true
-- ────────────────────────────────────────────────────────────
