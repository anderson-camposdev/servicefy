import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const migration = readFileSync(resolve(root, 'supabase/migrations/072_unified_request_approvals.sql'), 'utf8')
const services = readFileSync(resolve(root, 'src/lib/services.ts'), 'utf8')
const portal = readFileSync(resolve(root, 'src/pages/UserPortalLayout.tsx'), 'utf8')

test('aprovação moderna referencia incidents, não service_requests', () => {
  assert.match(migration, /incident_id\s+UUID NOT NULL REFERENCES public\.incidents/)
  const createTable = migration.match(/CREATE TABLE IF NOT EXISTS public\.request_approvals[\s\S]*?\n\);/)?.[0] ?? ''
  assert.ok(createTable)
  assert.doesNotMatch(createTable, /service_requests/)
})

test('item que exige aprovação precisa de grupo válido e com membros', () => {
  assert.match(migration, /requires_approval BOOLEAN NOT NULL DEFAULT false/)
  assert.match(migration, /Grupo aprovador inválido ou pertencente a outro tenant/)
  assert.match(migration, /Grupo aprovador não possui membros ativos elegíveis/)
})

test('requisição pendente não pode avançar fora do motor', () => {
  assert.match(migration, /FUNCTION public\.guard_request_approval_transition/)
  assert.match(migration, /Requisição aguardando aprovação não pode mudar de estado/)
  assert.match(migration, /flowfy\.request_approval_transition/)
})

test('decisão usa o aprovador autenticado e lock transacional', () => {
  assert.match(migration, /FUNCTION public\.decide_request_approval/)
  assert.match(migration, /WHERE auth_id = auth\.uid\(\)/)
  assert.match(migration, /WHERE id = p_approval_id FOR UPDATE/)
  assert.match(migration, /approver_id IS DISTINCT FROM v_profile\.id/)
  assert.match(services, /rpc\('decide_request_approval'/)
})

test('portal informa quando a requisição foi para aprovação', () => {
  assert.match(portal, /ticketApprovalStatus === 'pending'/)
  assert.match(portal, /enviada para aprovação/)
})
