import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const settings = read('src/pages/SettingsGovernance.tsx')
const center = read('src/pages/SettingsCenter.tsx')
const access = read('src/lib/admin-access.ts')
const adminSql = read('supabase/migrations/20260705203006_076_admin_settings_foundation.sql')
const channelSql = read('supabase/migrations/20260705203007_077_omnichannel_gateway.sql')
const esmSql = read('supabase/migrations/20260705203008_078_esm_case_core.sql')
const cmdbSql = read('supabase/migrations/20260705203009_079_cmdb_knowledge_virtual_agent.sql')
const maturitySql = read('supabase/migrations/20260705203010_080_esm_maturity.sql')
const adapters = read('supabase/functions/_shared/omnichannel.ts')
const gateway = read('supabase/functions/omnichannel-gateway/index.ts')

test('Configurações são elegíveis somente para sysadmin e company_admin', () => {
  assert.match(app, /const isConfigEligible = activeRole === 'sysadmin' \|\| activeRole === 'company_admin'/)
  assert.match(settings, /const isAuthorized = activeRole === 'sysadmin' \|\| activeRole === 'company_admin'/)
  assert.doesNotMatch(app, /isConfigEligible = \[[^\]]*(cio|it_manager|area_manager|client_manager)/)
  assert.match(access, /role === 'sysadmin' \|\| role === 'company_admin'/)
})

test('Central cobre as dez categorias administrativas e módulos bloqueados', () => {
  for (const key of [
    'organization','service_management','sla_contracts','channels','knowledge_ai',
    'cmdb','portal_brand','security','integrations','analytics_licensing',
  ]) assert.match(center, new RegExp(key))
  assert.match(center, /Módulo não contratado/)
  assert.match(center, /Selecione o tenant/)
  assert.match(center, /servicefy\.settings\.favorites/)
})

test('RLS administrativa exige contexto de tenant e segredos são write-only', () => {
  assert.match(adminSql, /CREATE OR REPLACE FUNCTION public\.is_settings_admin/)
  assert.match(adminSql, /get_current_user_role\(\) = 'company_admin'/)
  assert.match(adminSql, /p_company_id = public\.get_current_user_company_id\(\)/)
  assert.match(adminSql, /REVOKE SELECT ON public\.chatbot_config/)
  assert.match(adminSql, /GRANT SELECT \(\s*id,company_id,whatsapp_enabled/)
  assert.match(adminSql, /vault\.create_secret/)
  assert.match(adminSql, /admin_audit_events/)
})

test('Gateway omnichannel possui deduplicação, outbox e roteamento MSP', () => {
  assert.match(channelSql, /UNIQUE \(connection_id, external_message_id\)/)
  assert.match(channelSql, /UNIQUE \(connection_id, correlation_id\)/)
  assert.match(channelSql, /scope public\.channel_scope/)
  assert.match(channelSql, /match_type.*default/)
  assert.match(gateway, /messageError\?\.code === '23505'/)
  assert.match(gateway, /chooseRoute/)
  assert.match(gateway, /x-servicefy-internal-key/)
})

test('Adaptadores normalizam todos os canais prioritários', () => {
  for (const provider of [
    'microsoft_graph','microsoft_teams','gmail','google_chat','whatsapp_cloud','imap_smtp',
  ]) assert.match(adapters, new RegExp(provider))
  assert.match(adapters, /replyToMessageId/)
  assert.match(adapters, /references/)
})

test('ESM protege casos privados sem bypass automático do company_admin', () => {
  assert.match(esmSql, /service_domain_privacy/)
  assert.match(esmSql, /CREATE OR REPLACE FUNCTION public\.can_read_case/)
  assert.match(esmSql, /case_access_grants/)
  const readCaseBody = esmSql.split('CREATE OR REPLACE FUNCTION public.can_read_case')[1].split('$$;')[0]
  assert.doesNotMatch(readCaseBody, /is_settings_admin/)
  assert.match(esmSql, /ALTER TABLE public\.incidents ADD COLUMN IF NOT EXISTS case_id/)
})

test('CMDB, KB, agente virtual e maturidade ESM possuem fundações reais', () => {
  for (const table of [
    'ci_classes','configuration_items','ci_relationships','discovery_sources',
    'reconciliation_conflicts','knowledge_articles','virtual_agent_actions',
  ]) assert.match(cmdbSql, new RegExp('CREATE TABLE public\\.' + table))
  assert.match(cmdbSql, /requires_confirmation/)
  for (const table of [
    'locations','job_titles','suppliers','service_contracts','notification_templates',
    'attachment_policies','major_incidents','status_updates',
  ]) assert.match(maturitySql, new RegExp('CREATE TABLE public\\.' + table))
})
