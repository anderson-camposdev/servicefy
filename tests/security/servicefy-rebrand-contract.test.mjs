import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const branding = readFileSync('src/tenant/applyBranding.ts', 'utf8')
const login = readFileSync('src/components/TenantLoginScreen.tsx', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')
const logo = readFileSync('src/components/brand/ServiceFyLogo.tsx', 'utf8')
const favicon = readFileSync('public/favicon.svg', 'utf8')
const tokens = readFileSync('src/index.css', 'utf8')
const resolver = readFileSync('src/tenant/resolveTenant.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260705203005_075_rebrand_servicefy.sql', 'utf8')
const worker = readFileSync('supabase/functions/run-workflow-actions/index.ts', 'utf8')

test('ServiceFY é a marca padrão do produto', () => {
  assert.match(branding, /name: 'ServiceFY'/)
  assert.match(branding, /welcomeTitle: 'Gestão de serviços para operações que não podem parar\.'/)
})

test('identidade padrão usa azul e amarelo sem verde no login', () => {
  assert.match(branding, /primaryColor: '#075985'/)
  assert.match(branding, /accentColor: '#F4C542'/)
  assert.match(tokens, /--brand-primary:\s+#075985/)
  assert.match(tokens, /--brand-accent:\s+#F4C542/)

  for (const asset of [logo, favicon]) {
    assert.match(asset, /#F4C542/)
    assert.match(asset, /#075985/)
    assert.doesNotMatch(asset, /#047857/)
  }

  assert.doesNotMatch(login, /emerald|text-resolved/)
})

test('monograma usa construção tipográfica profissional e separa S de FY', () => {
  assert.match(logo, /fontFamily="Hanken Grotesk, Arial, sans-serif"/)
  assert.match(logo, /fontWeight="850"/)
  assert.match(logo, /<rect x="0" y="0" width="46" height="56" rx="12"/)
  assert.match(logo, /<rect x="50" y="0" width="58" height="56" rx="12"/)
  assert.doesNotMatch(logo, /strokeLinecap|strokeLinejoin/)

  assert.match(favicon, /font-family="Hanken Grotesk, Arial, sans-serif"/)
  assert.match(favicon, /viewBox="0 0 64 64"/)
  assert.doesNotMatch(favicon, /stroke-linecap|stroke-linejoin/)
})

test('cabeçalho autenticado reutiliza a marca vetorial oficial', () => {
  assert.match(app, /import ServiceFyLogo from ['"]\.\/components\/brand\/ServiceFyLogo['"]/)
  assert.match(app, /<ServiceFyLogo[^>]+data-testid="servicefy-product-mark"/s)
  assert.doesNotMatch(app, /text-cyan-300/)
})

test('domínio novo preserva o domínio legado durante a transição', () => {
  assert.match(resolver, /BASE_DOMAIN = 'servicefy\.app'/)
  assert.match(resolver, /LEGACY_BASE_DOMAIN = 'flowfy\.app'/)
  assert.match(resolver, /TENANT_STORAGE_KEY = 'flowfy\.tenant'/)
})

test('migration atualiza o chatbot sem reescrever o histórico', () => {
  assert.match(migration, /SET DEFAULT 'ServiceFY Bot'/)
  assert.match(migration, /WHERE bot_name = 'FlowfyBot'/)
})

test('webhooks publicam cabeçalhos novos e legados', () => {
  assert.match(worker, /X-ServiceFY-Signature/)
  assert.match(worker, /X-Flowfy-Signature/)
})
