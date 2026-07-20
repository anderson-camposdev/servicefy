import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260720000400_154_problem_incidents_ops_roles.sql')
const packageJson = read('package.json')

test('ops_manager/governance_manager ganham policy adicional em problem_incidents, escopada ao tenant do problema', () => {
  assert.match(sql, /CREATE POLICY problem_incidents_ops_write ON public\.problem_incidents FOR ALL TO authenticated/)
  assert.match(sql, /get_current_user_role\(\) = ANY \(ARRAY\['ops_manager', 'governance_manager'\]\)/)
  assert.match(sql, /problems\.company_id = public\.get_current_user_company_id\(\)/)
})

test('contrato participa da suite de seguranca padrao', () => {
  assert.match(packageJson, /problem-incidents-ops-roles-contract\.test\.mjs/)
})
