import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260712100000_108_plans_and_subscriptions.sql')
const smtpForm = read('src/components/portal/SmtpSettingsForm.tsx')
const platformSettings = read('src/pages/PlatformModuleSettings.tsx')
const hook = read('src/hooks/useTenantFeatureAccess.ts')

test('plans e subscriptions têm RLS habilitado', () => {
  assert.match(sql, /ALTER TABLE public\.plans ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ALTER TABLE public\.subscriptions ENABLE ROW LEVEL SECURITY/)
})

test('plans é leitura pública para authenticated e escrita restrita a sysadmin', () => {
  assert.match(sql, /CREATE POLICY plans_authenticated_read[\s\S]*?FOR SELECT TO authenticated[\s\S]*?USING \(true\)/)
  assert.match(sql, /CREATE POLICY plans_sysadmin_write[\s\S]*?USING \(public\.get_current_user_role\(\) = 'sysadmin'\)[\s\S]*?WITH CHECK \(public\.get_current_user_role\(\) = 'sysadmin'\)/)
})

test('subscriptions é isolada por tenant (is_settings_admin) e escrita restrita a sysadmin', () => {
  assert.match(sql, /CREATE POLICY subscriptions_tenant_read[\s\S]*?USING \(public\.is_settings_admin\(company_id\)\)/)
  assert.match(sql, /CREATE POLICY subscriptions_sysadmin_write[\s\S]*?USING \(public\.get_current_user_role\(\) = 'sysadmin'\)/)
})

test('subscriptions vincula 1:1 a companies e não permite dois planos para o mesmo tenant', () => {
  assert.match(sql, /company_id uuid NOT NULL UNIQUE REFERENCES public\.companies\(id\)/)
})

test('check_tenant_feature_access é SECURITY DEFINER, revogada de anon/public e liberada só a authenticated', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.check_tenant_feature_access/)
  assert.match(sql, /SECURITY DEFINER/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.check_tenant_feature_access\(uuid, text\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.check_tenant_feature_access\(uuid, text\) TO authenticated/)
})

test('check_tenant_feature_access é NULL-safe na checagem de autorização (não faz IF NOT (algo OR NULL))', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.check_tenant_feature_access')[1].split('$$;')[0]
  // A checagem de autorização precisa passar por COALESCE(..., false) antes do
  // IF NOT — senão um chamador sem role/company_id resolvido (NULL) faz o guard
  // virar NULL, que em plpgsql não dispara o RETURN false (bypass de isolamento).
  assert.match(fnBody, /v_authorized := \(v_caller_role = 'sysadmin'\)/)
  assert.match(fnBody, /IF NOT COALESCE\(v_authorized, false\) THEN/)
  assert.doesNotMatch(fnBody, /IF NOT \(\s*public\.get_current_user_role/)
})

test('check_tenant_feature_access é fail-closed: sem assinatura/plano ativo, feature ausente ou linha nula viram false', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.check_tenant_feature_access')[1].split('$$;')[0]
  assert.match(fnBody, /COALESCE\(\(pl\.feature_flags ->> p_feature_name\)::boolean, false\)/)
  assert.match(fnBody, /AND s\.status IN \('trialing', 'active'\)/)
  assert.match(fnBody, /AND pl\.active = true/)
  assert.match(fnBody, /RETURN COALESCE\(v_has_access, false\)/)
})

test('seed preserva o comportamento atual: tenants existentes ganham professional com custom_smtp habilitado', () => {
  assert.match(sql, /'professional', 'Professional'[\s\S]*?custom_smtp[\s\S]*?true/)
  assert.match(sql, /INSERT INTO public\.subscriptions \(company_id, plan_id, status, current_period_end\)/)
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM public\.subscriptions s WHERE s\.company_id = c\.id\)/)
})

test('SmtpSettingsForm consome a RPC via props e bloqueia o formulário sem a feature', () => {
  assert.match(smtpForm, /checkingAccess: boolean/)
  assert.match(smtpForm, /hasCustomSmtpAccess: boolean/)
  assert.match(smtpForm, /Recurso Premium/)
  assert.match(smtpForm, /Faça o upgrade do seu plano/)
  // O form não deve buscar tenant_smtp_settings enquanto a checagem de acesso
  // não liberar — evita side effect e vazamento de estado carregado indevido.
  assert.match(smtpForm, /if \(checkingAccess \|\| !hasCustomSmtpAccess\)/)
})

test('PlatformModuleSettings resolve a feature uma única vez via useTenantFeatureAccess e repassa como prop', () => {
  assert.match(platformSettings, /useTenantFeatureAccess\(companyId, 'custom_smtp', moduleKey === 'smtp'\)/)
  assert.match(platformSettings, /hasCustomSmtpAccess=\{customSmtpAccess\.hasAccess\}/)
})

test('useTenantFeatureAccess chama a RPC certa e trata erro de rede separado de "sem acesso"', () => {
  assert.match(hook, /rpc\('check_tenant_feature_access', \{ p_company_id: companyId, p_feature_name: featureName \}\)/)
  assert.match(hook, /hasAccess: data === true/)
  assert.match(hook, /error: error\.message/)
})

test('Contrato de planos/assinaturas participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /plans-subscriptions-contract\.test\.mjs/)
})
