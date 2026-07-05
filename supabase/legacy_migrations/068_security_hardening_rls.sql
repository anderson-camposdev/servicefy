-- ============================================================
-- Flowfy ITSM — Migration 068
-- Endurecimento de segurança (RLS / multi-tenant).
--
-- Fecha vazamentos entre tenants detectados na auditoria. NÃO
-- altera nenhum fluxo legítimo: as tabelas de histórico já
-- possuíam políticas por tenant (write_tenant_policy /
-- select_tenant_policy) convivendo com uma política `dev_open`
-- sempre-verdadeira — basta remover a `dev_open`.
-- ============================================================

-- ─── 1. Remover políticas de desenvolvimento (acesso irrestrito) ──
-- As políticas corretas por tenant já existem nestas tabelas.
DROP POLICY IF EXISTS dev_open ON public.incident_history;
DROP POLICY IF EXISTS dev_open ON public.change_history;
DROP POLICY IF EXISTS dev_open ON public.problem_history;
DROP POLICY IF EXISTS dev_open ON public.request_history;
DROP POLICY IF EXISTS dev_open ON public.workflow_rules;

-- ─── 2. chatbot_blocked_attempts: remover INSERT aberto ───────────
-- A inserção real acontece via RPC log_blocked_attempt (SECURITY
-- DEFINER), que ignora RLS; a política aberta era supérflua e
-- permitia poluição da auditoria por anônimos.
DROP POLICY IF EXISTS insert_any_policy ON public.chatbot_blocked_attempts;

-- ─── 3. companies: UPDATE só do próprio tenant (ou MSP) ───────────
-- A política `update_company_branding` (USING true / CHECK true)
-- permitia que QUALQUER usuário autenticado editasse a config de
-- QUALQUER empresa. Substituída por escopo de tenant. A escrita
-- ampla de MSP continua via write_company_policy (is_current_user_msp_admin()).
DROP POLICY IF EXISTS update_company_branding ON public.companies;
DROP POLICY IF EXISTS update_own_company ON public.companies;
CREATE POLICY update_own_company ON public.companies
  FOR UPDATE TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );

-- ─── 4. companies: fechar leitura anônima de colunas sensíveis ────
-- O login/branding anônimo (getTenantBySlug/Domain) lê apenas as
-- colunas de branding — nunca licença/SSO. Revogamos do anon as
-- colunas sensíveis para bloquear reconhecimento não autenticado.
REVOKE SELECT (
  license_plan, concurrent_licenses, license_expires_at, license_alert_threshold,
  sso_providers, allow_local_login, branding_settings
) ON public.companies FROM anon;

-- ─── 5. Bucket catalog-icons: impedir enumeração anônima ──────────
-- O bucket é público: as imagens continuam sendo servidas pela URL
-- pública (independe de RLS). Restringimos a política de leitura da
-- API (list/download) a usuários autenticados — anônimos não podem
-- mais enumerar o conteúdo do bucket.
DROP POLICY IF EXISTS catalog_icons_public_read ON storage.objects;
CREATE POLICY catalog_icons_auth_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'catalog-icons');

-- ─── 6. v_license_usage: rodar com a RLS do chamador ──────────────
-- View estava como SECURITY DEFINER (ignorava a RLS de quem
-- consultava, expondo uso de licença cross-tenant). Passa a
-- security_invoker: cada um vê apenas o que sua RLS permite.
ALTER VIEW public.v_license_usage SET (security_invoker = on);

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT tablename, policyname FROM pg_policies WHERE policyname IN ('dev_open','insert_any_policy','update_company_branding'); -- vazio
--   SELECT has_column_privilege('anon','public.companies','license_plan','SELECT'); -- false
--   SELECT has_column_privilege('anon','public.companies','primary_color','SELECT'); -- true (branding do login)
-- ────────────────────────────────────────────────────────────
