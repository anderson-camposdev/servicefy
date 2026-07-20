import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const sql = read('supabase/migrations/20260720000000_150_operational_admin_rbac.sql')
const adminAccess = read('src/lib/admin-access.ts')

test('is_operational_admin inclui os 4 papeis e MSP admin, revogada de anon/public', () => {
  assert.match(sql, /ARRAY\['sysadmin', 'company_admin', 'ops_manager', 'governance_manager'\]/)
  assert.match(sql, /public\.is_current_user_msp_admin\(\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.is_operational_admin\(uuid\) FROM PUBLIC, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.is_operational_admin\(uuid\) TO authenticated;/)
})

test('policies operacionais adicionadas cobrem as 17 tabelas esperadas, sem tocar tabelas sensiveis', () => {
  const expectedTables = [
    'case_types', 'ci_classes', 'ci_relationship_types', 'configuration_items',
    'notification_templates', 'service_domains', 'assignment_groups', 'catalog_categories',
    'catalog_service_symptoms', 'catalog_services', 'departments', 'form_templates',
    'pending_reasons', 'request_categories', 'request_items', 'request_subcategories',
    'response_macros', 'sla_policies',
  ]
  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`ON public\\.${table} FOR ALL TO authenticated`), `esperava policy operacional em ${table}`)
  }
  for (const sensitive of ['channel_connections', 'company_module_entitlements', 'smtp', 'outbound_webhooks', 'plans', 'subscriptions']) {
    assert.doesNotMatch(sql, new RegExp(`CREATE POLICY \\w+_ops_write ON public\\.${sensitive}\\b`), `${sensitive} nao deveria ganhar policy de escrita operacional`)
  }
})

test('entitlements ganham SELECT operacional, sem GRANT de escrita', () => {
  assert.match(sql, /CREATE POLICY entitlement_ops_select ON public\.company_module_entitlements FOR SELECT TO authenticated/)
  assert.doesNotMatch(sql, /entitlement_ops_write/)
})

test('OPERATIONAL_SETTINGS_SECTION_KEYS exclui seguranca, licenciamento, branding e integracoes', () => {
  const match = adminAccess.match(/OPERATIONAL_SETTINGS_SECTION_KEYS:[\s\S]*?=\s*\[([\s\S]*?)\]/)
  assert.ok(match, 'array OPERATIONAL_SETTINGS_SECTION_KEYS nao encontrado')
  const keys = match[1].split(',').map(item => item.trim().replace(/'/g, '')).filter(Boolean)
  for (const forbidden of ['compliance', 'licensing', 'branding', 'developer', 'connections', 'smtp', 'routing', 'login_integration']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} nao deveria estar em OPERATIONAL_SETTINGS_SECTION_KEYS`)
  }
  for (const expected of ['departments', 'users', 'groups', 'domains', 'case_types', 'sla', 'ci']) {
    assert.ok(keys.includes(expected), `${expected} deveria estar em OPERATIONAL_SETTINGS_SECTION_KEYS`)
  }
})
