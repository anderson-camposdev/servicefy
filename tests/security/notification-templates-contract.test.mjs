import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const dispatcher = read('supabase/functions/dispatch-ticket-email-outbox/index.ts')
const renderer = read('supabase/functions/_shared/notification-template-renderer.mjs')
const settingsUi = read('src/pages/PlatformModuleSettings.tsx')
const foundation = read('supabase/migrations/20260705203010_080_esm_maturity.sql')
const operationalRbac = read('supabase/migrations/20260720000000_150_operational_admin_rbac.sql')
const migration = read('supabase/migrations/20260727000000_183_seed_notification_templates.sql')

test('o worker consulta o template no escopo exato do tenant, evento, canal e idioma suportado', () => {
  assert.match(dispatcher, /from\('notification_templates'\)/)
  assert.match(dispatcher, /\.eq\('company_id', row\.company_id\)/)
  assert.match(dispatcher, /\.eq\('key', row\.event_type\)/)
  assert.match(dispatcher, /\.eq\('channel', 'email'\)/)
  assert.match(dispatcher, /\.eq\('locale', 'pt-BR'\)/)
  assert.match(dispatcher, /\.eq\('enabled', true\)/)
  assert.match(dispatcher, /\.maybeSingle\(\)/)
})

test('o worker usa o renderer compartilhado que os testes exercitam', () => {
  assert.match(dispatcher, /notification-template-renderer\.mjs/)
  assert.match(dispatcher, /renderTenantTemplate/)
  assert.doesNotMatch(dispatcher, /function applyTemplate/)
})

test('template e payload são tratados como texto, sem executar HTML do administrador ou do chamado', () => {
  assert.match(renderer, /escapeHtml\(bodyText\)/)
  assert.match(renderer, /interpolateText/)
  assert.doesNotMatch(dispatcher, /html:\s*applyTemplate\(template\.body_template/)
})

test('assunto remove caracteres de controle e cai no padrão quando vazio', () => {
  assert.match(renderer, /\[\\u0000-\\u001f\\u007f\]/)
  assert.match(renderer, /normalized \|\| fallbackSubject/)
})

test('sem template, a notificação continua saindo com o texto padrão seguro', () => {
  assert.match(dispatcher, /function renderDefault/)
  assert.match(dispatcher, /if \(!template\?\.body_template\?\.trim\(\)\) return fallback/)
})

test('as duas rotas de envio aguardam a renderização do template', () => {
  assert.equal((dispatcher.match(/await renderMessage\(/g) ?? []).length, 2)
})

test('a tela oferece somente eventos reais, e não uma chave livre', () => {
  assert.match(settingsUi, /export const NOTIFICATION_EVENTS/)
  assert.match(settingsUi, /key: 'key', label: 'Evento que dispara', type: 'select'/)
  const block = settingsUi.split('  templates: {')[1].split('  ci: {')[0]
  assert.doesNotMatch(block, /type: 'auto_key'/)
})

test('a tela não promete canais ou idiomas que o worker ainda não entrega', () => {
  const block = settingsUi.split('  templates: {')[1].split('  ci: {')[0]
  assert.match(block, /options: \['email'\]/)
  assert.match(block, /options: \['pt-BR'\]/)
  assert.doesNotMatch(block, /options: \['email', 'portal'/)
  assert.doesNotMatch(block, /options: \['pt-BR', 'en-US'/)
})

test('salvar preserva o catálogo de variáveis do evento em vez de gravar lista vazia', () => {
  const block = settingsUi.split('  templates: {')[1].split('  ci: {')[0]
  assert.match(block, /variables:\s*\[\.\.\.\(NOTIFICATION_EVENTS\.find/)
  assert.doesNotMatch(block, /variables:\s*\[\]/)
})

test('a interface explica que o corpo é texto simples e a marca pode ser alterada por tenant', () => {
  assert.match(settingsUi, /texto simples/i)
  assert.match(settingsUi, /marca.*tenant/i)
})

test('migration semeia os cinco eventos com ServiceFY apenas como padrão editável', () => {
  for (const key of ['ticket_opened', 'status_changed', 'assignment_changed', 'ticket_closed', 'public_comment']) {
    assert.match(migration, new RegExp(`'${key}'`), `evento não semeado: ${key}`)
  }
  assert.match(migration, /\[ServiceFY\]/)
  assert.match(migration, /editáve(?:l|is) por tenant/i)
  assert.match(migration, /\{\{ticket_number\}\}/)
  assert.match(migration, /\{\{comment_body\}\}/)
})

test('seed HTML legado é convertido somente quando o corpo ainda é um default exato', () => {
  assert.match(migration, /UPDATE public\.notification_templates AS template/)
  assert.match(migration, /md5\(template\.body_template\) = catalog\.legacy_body_md5/)
  assert.match(migration, /body_template = format\(catalog\.plain_body/)
  assert.doesNotMatch(migration, /SET subject_template/)
})

test('escopo lógico já é único na tabela base e a migration não cria índice redundante', () => {
  const table = foundation.split('CREATE TABLE public.notification_templates')[1]
    .split('CREATE TABLE public.attachment_policies')[0]
  assert.match(table, /UNIQUE\(company_id,key,channel,locale\)/)
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX/)
})

test('seed é idempotente no mesmo escopo lógico do índice', () => {
  assert.match(migration, /ON CONFLICT \(company_id, key, channel, locale\) DO NOTHING/)
})

test('edição permanece isolada pelo company_id validado pelas políticas RLS', () => {
  assert.match(foundation, /ALTER TABLE %s ENABLE ROW LEVEL SECURITY/)
  assert.match(foundation, /templates_admin ON public\.notification_templates/)
  assert.match(foundation, /WITH CHECK \(public\.is_settings_admin\(company_id\)\)/)
  assert.match(operationalRbac, /notification_templates_ops_write ON public\.notification_templates/)
  assert.match(operationalRbac, /WITH CHECK \(public\.is_operational_admin\(company_id\)\)/)
})

test('funções SECURITY DEFINER têm search_path seguro e não são executáveis por usuários da aplicação', () => {
  assert.equal((migration.match(/SET search_path = pg_catalog, public/g) ?? []).length, 2)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.seed_notification_templates\(uuid\)\s+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.tg_seed_notification_templates\(\)\s+FROM PUBLIC, anon, authenticated/)
})

test('empresa nova nasce com templates editáveis do próprio tenant', () => {
  assert.match(migration, /CREATE TRIGGER trg_seed_notification_templates/)
  assert.match(migration, /AFTER INSERT ON public\.companies/)
})

test('contrato e renderer participam das suítes padrão', () => {
  assert.match(packageJson, /tests\/security\/notification-templates-contract\.test\.mjs/)
  assert.match(packageJson, /tests\/unit\/notification-template-renderer\.test\.mjs/)
})
