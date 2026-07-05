import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const migration = readFileSync(
  resolve(root, 'supabase/migrations/071_rbac_and_cab_hardening.sql'),
  'utf8',
)
const services = readFileSync(resolve(root, 'src/lib/services.ts'), 'utf8')

test('end_user não recebe UPDATE genérico em incidentes', () => {
  assert.match(migration, /CREATE POLICY update_incident_staff_policy/)
  assert.match(migration, /public\.is_current_user_ticket_staff\(\)/)
  assert.doesNotMatch(
    migration,
    /CREATE POLICY write_incident_policy[\s\S]*?FOR ALL TO authenticated/,
  )
})

test('perfil não permite autoelevação por UPDATE direto', () => {
  assert.match(migration, /REVOKE UPDATE ON public\.profiles FROM PUBLIC, authenticated/)
  assert.match(migration, /FUNCTION public\.update_profile_secure/)
  assert.match(migration, /v_actor\.id IS DISTINCT FROM v_target\.id AND NOT v_is_admin/)
  assert.match(migration, /role = CASE WHEN v_is_admin/)
  assert.match(services, /rpc\('update_profile_secure'/)
})

test('mensagens do solicitante exigem chamado próprio e comentário público', () => {
  assert.match(migration, /i\.caller_id = public\.get_current_profile_id\(\)/)
  assert.match(migration, /actor_type = 'user'/)
  assert.match(migration, /is_internal = false/)
  assert.match(migration, /sender_id = public\.get_current_profile_id\(\)/)
})

test('aceite da solução deriva a identidade de auth.uid()', () => {
  assert.match(migration, /FUNCTION public\.accept_incident_resolution/)
  assert.match(migration, /WHERE auth_id = auth\.uid\(\)/)
  assert.match(migration, /caller_id IS DISTINCT FROM v_profile\.id/)
  assert.match(services, /rpc\('accept_incident_resolution'/)
})

test('voto do CAB é atômico, autenticado e não aceita identidade do browser', () => {
  assert.match(migration, /FUNCTION public\.cast_change_cab_vote/)
  assert.match(migration, /WHERE id = p_change_id FOR UPDATE/)
  assert.match(migration, /cab_approvers[\s\S]*?v_profile\.id::text/)
  assert.match(migration, /Aprovador já registrou seu voto/)
  assert.match(services, /rpc\('cast_change_cab_vote'/)
  const submitApproval = services.match(
    /async submitApproval\([\s\S]*?return throwIfError\(data, error\)\n  },/,
  )?.[0] ?? ''
  assert.ok(submitApproval)
  assert.doesNotMatch(submitApproval, /userId|userName|companyId/)
})

test('estado e votos do CAB não são atualizáveis diretamente pelo REST', () => {
  assert.match(migration, /REVOKE UPDATE ON public\.changes FROM PUBLIC, authenticated/)
  const columnGrant = migration.match(/GRANT UPDATE \([\s\S]*?\) ON public\.changes TO authenticated;/)?.[0] ?? ''
  assert.ok(columnGrant)
  assert.doesNotMatch(columnGrant, /\bstate\b/)
  assert.doesNotMatch(columnGrant, /\bcab_approvals\b/)
  assert.match(migration, /FUNCTION public\.guard_change_during_cab_vote/)
  assert.match(migration, /NEW\.cab_approvers IS DISTINCT FROM OLD\.cab_approvers/)
})

test('relações de incidentes não ficam misturadas aos votos do CAB', () => {
  assert.match(migration, /FUNCTION public\.set_change_incident_links/)
  assert.match(services, /rpc\('set_change_incident_links'/)
  assert.doesNotMatch(services, /_linked_incident_ids/)
})
