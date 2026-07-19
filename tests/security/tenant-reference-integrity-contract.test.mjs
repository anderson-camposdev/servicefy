import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260719020000_146_tenant_reference_integrity.sql')
const preflight = read('scripts/preflight-tenant-reference-integrity.sql')
const pkg = JSON.parse(read('package.json'))

test('migration interrompe antes da instalação quando já existem referências entre tenants', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.assert_existing_tenant_references\(\)/)
  assert.match(sql, /Referência entre tenants detectada/)
  assert.match(sql, /SELECT public\.assert_existing_tenant_references\(\)/)
})

test('validador genérico compara company_id do registro com o recurso referenciado', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.validate_tenant_references\(\)/)
  assert.match(sql, /to_jsonb\(NEW\) ->> v_local_column/)
  assert.match(sql, /TG_OP = 'UPDATE'[\s\S]*to_jsonb\(OLD\) ->> v_local_column/)
  assert.match(sql, /parent\.company_id = \$2/)
  assert.match(sql, /Referência inválida entre tenants/)
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = pg_catalog, public/)
})

test('núcleo operacional recebe guardas para catálogo, tickets, aprovações, tarefas e casos', () => {
  for (const table of [
    'catalog_categories',
    'catalog_items',
    'catalog_services',
    'catalog_service_symptoms',
    'request_categories',
    'request_subcategories',
    'request_items',
    'tickets',
    'request_approvals',
    'ticket_tasks',
    'cases',
  ]) {
    assert.match(sql, new RegExp(`BEFORE INSERT OR UPDATE ON public\\.${table}`))
  }
})

test('funções internas têm superfície mínima de execução', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.validate_tenant_references\(\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.assert_existing_tenant_references\(\) FROM PUBLIC, anon, authenticated/)
})

test('preflight operacional é somente leitura e cobre as mesmas relações', () => {
  assert.match(preflight, /catalog_categories\.department_id/)
  assert.match(preflight, /tickets\.assignment_group_id/)
  assert.match(preflight, /request_approvals\.approver_id/)
  assert.match(preflight, /ticket_tasks\.parent_task_id/)
  assert.match(preflight, /cases\.service_domain_id/)
  assert.doesNotMatch(preflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i)
})

test('contrato participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /tenant-reference-integrity-contract\.test\.mjs/)
})
