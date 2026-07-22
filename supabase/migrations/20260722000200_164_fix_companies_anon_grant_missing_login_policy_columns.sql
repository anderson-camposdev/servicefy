-- ServiceFY — corrige bug real encontrado ao verificar o mecanismo de
-- quebra-vidro (item 2 do plano de ação de QA E2E): a tela de login
-- estava sempre caindo no branding genérico com login local liberado
-- por padrão, mesmo para empresas com allow_local_login = false.
--
-- Causa raiz: a migration 070 (companies_anon_column_grant) concede ao
-- papel anon SELECT coluna-a-coluna em public.companies, excluindo
-- explicitamente uma lista de colunas sensíveis de licenciamento
-- ('license_plan', 'concurrent_licenses', 'license_expires_at',
-- 'license_alert_threshold', 'sso_providers', 'allow_local_login',
-- 'branding_settings'). Essa lista, corretamente, protege dados de
-- faturamento — mas incluiu por engano duas colunas que NÃO são
-- sensíveis e que a própria tela de login (TenantContext.tsx →
-- Login.tsx) precisa ler ANTES da autenticação para decidir quais
-- botões de SSO mostrar e se o formulário de e-mail/senha deve
-- aparecer: allow_local_login e sso_providers.
--
-- Em Postgres, um GRANT SELECT coluna-a-coluna exige que TODAS as
-- colunas referenciadas em uma consulta estejam concedidas — falta de
-- permissão em uma única coluna derruba a consulta inteira com
-- "permission denied for table companies" (42501), mesmo que as
-- outras 30 colunas estivessem liberadas. Como TenantContext sempre
-- seleciona allow_local_login e sso_providers junto com o resto do
-- branding, a busca do tenant SEMPRE falhava pré-autenticação — o
-- catch silencioso em TenantContext.tsx (status='error') fazia a tela
-- cair no branding padrão do ServiceFY com `allowLocalLogin={tenant?.
-- allow_local_login ?? true}`, ou seja, **aberto por padrão**. Uma
-- empresa que configurou "exigir SSO" nunca teve essa exigência
-- de fato aplicada para um visitante anônimo.
--
-- Correção: adicionar as duas colunas à lista liberada para anon.
-- branding_settings e as 4 colunas de licenciamento continuam
-- protegidas — não fazem parte do que a tela de login precisa exibir.

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
       'license_plan', 'concurrent_licenses', 'license_expires_at',
       'license_alert_threshold', 'branding_settings'
     );

  EXECUTE 'REVOKE SELECT ON public.companies FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON public.companies TO anon', v_cols);
END $$;
