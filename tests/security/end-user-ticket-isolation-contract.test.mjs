import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260720000300_153_end_user_ticket_isolation.sql')
const packageJson = read('package.json')

test('bypass de grupo nao-privado/membro so vale para quem nao e end_user', () => {
  assert.match(sql, /public\.get_current_user_role\(\) <> 'end_user'/)
  assert.match(sql, /NOT EXISTS \(\s*SELECT 1 FROM public\.assignment_groups g\s*WHERE g\.id = t\.assignment_group_id AND g\.is_private = true\s*\)/)
})

test('end_user continua vendo o proprio chamado (caller_id/assigned_to_id) fora do bloco restrito', () => {
  const beforeRestriction = sql.split("get_current_user_role() <> 'end_user'")[0]
  assert.match(beforeRestriction, /t\.caller_id = public\.get_current_profile_id\(\)/)
  assert.match(beforeRestriction, /t\.assigned_to_id = public\.get_current_profile_id\(\)/)
})

test('os 4 papeis gestores continuam com bypass total, fora do bloco restrito a end_user', () => {
  const beforeRestriction = sql.split("get_current_user_role() <> 'end_user'")[0]
  assert.match(beforeRestriction, /get_current_user_role\(\) IN \('sysadmin','company_admin','ops_manager','governance_manager'\)/)
})

test('funcao continua REVOKE de anon\\/public e GRANT so para authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.can_read_ticket\(uuid\) FROM public, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.can_read_ticket\(uuid\) TO authenticated;/)
})

test('contrato participa da suite de seguranca padrao', () => {
  assert.match(packageJson, /end-user-ticket-isolation-contract\.test\.mjs/)
})
