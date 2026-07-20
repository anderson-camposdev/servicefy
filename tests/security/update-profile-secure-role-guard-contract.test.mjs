import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260719050000_149_update_profile_secure_role_guard.sql'),
  'utf8',
)

test('update_profile_secure só concede sysadmin a quem já é admin do provedor', () => {
  assert.match(migration, /v_is_msp_admin := public\.is_current_user_msp_admin\(\)/)
  assert.match(migration, /v_requested_role := p_patch->>'role'/)
  assert.match(migration, /IF v_requested_role = 'sysadmin' AND NOT v_is_msp_admin THEN/)
  assert.match(migration, /RAISE EXCEPTION 'Somente administradores do provedor podem conceder o papel sysadmin' USING ERRCODE = '42501'/)
})

test('demais campos administrativos continuam exigindo v_is_admin', () => {
  assert.match(migration, /role = CASE WHEN v_is_admin AND p_patch \? 'role' THEN \(p_patch->>'role'\)::public\.user_role ELSE role END/)
  assert.match(migration, /email = CASE WHEN v_is_admin AND p_patch \? 'email'/)
  assert.match(migration, /department = CASE WHEN v_is_admin AND p_patch \? 'department'/)
  assert.match(migration, /active = CASE WHEN v_is_admin AND p_patch \? 'active'/)
})

test('função continua REVOKE de anon/public e GRANT só para authenticated', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.update_profile_secure\(UUID, JSONB\) FROM PUBLIC, anon;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.update_profile_secure\(UUID, JSONB\) TO authenticated;/)
})
