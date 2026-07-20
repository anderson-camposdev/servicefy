import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260720000100_151_update_profile_secure_ops_tier.sql'),
  'utf8',
)

test('ops_manager/governance_manager editam perfis do proprio tenant', () => {
  assert.match(migration, /v_actor\.role::text IN \('ops_manager', 'governance_manager'\)/)
})

test('conceder company_admin exige ja ser tenant admin ou MSP admin', () => {
  assert.match(migration, /IF v_requested_role = 'company_admin' AND NOT \(v_is_msp_admin OR v_is_tenant_admin\) THEN/)
  assert.match(migration, /RAISE EXCEPTION 'Somente administradores do tenant ou do provedor podem conceder o papel Administrador do Tenant' USING ERRCODE = '42501';/)
})

test('conceder sysadmin continua exigindo MSP admin (trava da migration 149 preservada)', () => {
  assert.match(migration, /IF v_requested_role = 'sysadmin' AND NOT v_is_msp_admin THEN/)
})

test('funcao continua REVOKE de anon\\/public e GRANT so para authenticated', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.update_profile_secure\(UUID, JSONB\) FROM PUBLIC, anon;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.update_profile_secure\(UUID, JSONB\) TO authenticated;/)
})
