import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const migration = readFileSync(resolve(root, 'supabase/migrations/20260705203003_073_workflow_reliability.sql'), 'utf8')
const worker = readFileSync(resolve(root, 'supabase/functions/run-workflow-actions/index.ts'), 'utf8')

test('delay agenda ações posteriores em uma cadeia ordenada', () => {
  assert.match(migration, /v_run_after := v_run_after \+ make_interval/)
  assert.match(migration, /v_queue_rest := true/)
  assert.match(migration, /chain_id, sequence_no/)
  assert.match(migration, /previous\.sequence_no < candidate\.sequence_no/)
})

test('ações desconhecidas falham em vez de virar sucesso silencioso', () => {
  assert.match(migration, /Tipo de ação desconhecido/)
  assert.match(worker, /unknown action type/)
  assert.doesNotMatch(worker, /else \{[\s\S]{0,180}result = \{ ok: true \}[\s\S]{0,80}unknown/)
})

test('fila recupera leases abandonados e respeita max_attempts', () => {
  assert.match(migration, /claimed_at < now\(\) - INTERVAL '5 minutes'/)
  assert.match(migration, /attempts \+ 1 >= max_attempts THEN 'failed'/)
  assert.match(worker, /claimed_at: null/)
})

test('escalation notifica gestão, grupo ou responsável', () => {
  assert.match(migration, /WHEN 'escalate'/)
  assert.match(migration, /role::text IN \('company_admin', 'area_manager', 'it_manager'\)/)
  assert.match(migration, /Escalonamento sem gestor, grupo ou responsável elegível/)
})

test('webhooks têm timeout e assinatura HMAC opcional', () => {
  assert.match(worker, /AbortSignal\.timeout\(10_000\)/)
  assert.match(worker, /X-ServiceFY-Signature/)
  assert.match(worker, /X-Flowfy-Signature/)
  assert.match(worker, /name: 'HMAC'/)
})
