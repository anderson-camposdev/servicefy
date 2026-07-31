import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const branding = readFileSync('src/tenant/applyBranding.ts', 'utf8')
const resolver = readFileSync('src/tenant/resolveTenant.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260705203005_075_rebrand_servicefy.sql', 'utf8')
const worker = readFileSync('supabase/functions/run-workflow-actions/index.ts', 'utf8')

test('ServiceFY é a marca padrão do produto', () => {
  assert.match(branding, /name: 'ServiceFY'/)
  assert.match(branding, /welcomeTitle: 'Gestão de serviços para operações que não podem parar\.'/)
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
