import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260718000300_134_ticket_group_privacy.sql')
const packageJson = read('package.json')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[parts.length - 1].split('$$;')[0]
}

test('assignment_groups ganha is_private, nascendo false (zero-regressão no deploy)', () => {
  assert.match(sql, /ALTER TABLE public\.assignment_groups\s*\n?\s*ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false/)
})

test('can_read_ticket é SECURITY DEFINER, isola por tenant e é revogada de anon/public', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_read_ticket[\s\S]*?SECURITY DEFINER/)
  const body = fnBody('can_read_ticket')
  assert.match(body, /t\.company_id = public\.get_current_user_company_id\(\) OR public\.is_current_user_msp_admin\(\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.can_read_ticket\(uuid\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.can_read_ticket\(uuid\) TO authenticated/)
})

test('can_read_ticket dá bypass a MSP admin, solicitante, atribuído e aos 4 papéis gestores', () => {
  const body = fnBody('can_read_ticket')
  assert.match(body, /public\.is_current_user_msp_admin\(\)/)
  assert.match(body, /t\.caller_id = public\.get_current_profile_id\(\)/)
  assert.match(body, /t\.assigned_to_id = public\.get_current_profile_id\(\)/)
  assert.match(body, /get_current_user_role\(\) IN \('sysadmin', 'company_admin', 'ops_manager', 'governance_manager'\)/)
})

test('can_read_ticket restringe grupo privado a membros via user_groups', () => {
  const body = fnBody('can_read_ticket')
  assert.match(body, /NOT EXISTS \(\s*SELECT 1 FROM public\.assignment_groups g\s*WHERE g\.id = t\.assignment_group_id AND g\.is_private = true\s*\)/)
  assert.match(body, /EXISTS \(\s*SELECT 1 FROM public\.user_groups ug\s*WHERE ug\.group_id = t\.assignment_group_id AND ug\.user_id = public\.get_current_profile_id\(\)\s*\)/)
})

test('select_incident_policy (migration 071, nunca removida por 096) é derrubada — senão anularia a restrição por OR de policies permissivas', () => {
  assert.match(sql, /DROP POLICY IF EXISTS select_incident_policy ON public\.tickets/)
})

test('select_ticket_policy usa can_read_ticket como única fonte de verdade para SELECT', () => {
  assert.match(sql, /DROP POLICY IF EXISTS select_ticket_policy ON public\.tickets/)
  assert.match(sql, /CREATE POLICY select_ticket_policy ON public\.tickets\s*\n?\s*FOR SELECT TO authenticated\s*\n?\s*USING \(public\.can_read_ticket\(id\)\)/)
})

test('Contrato de privacidade de tickets participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/ticket-group-privacy-contract\.test\.mjs/)
})
