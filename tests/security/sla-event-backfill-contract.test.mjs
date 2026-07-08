import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20260708010000_092_backfill_sla_event_ledger.sql', import.meta.url),
  'utf8',
)

test('backfill reconstrói os marcos principais do controle de SLA', () => {
  for (const type of ['response_start', 'resolution_start', 'response_achieved', 'resolution_achieved', 'paused', 'breached']) {
    assert.match(sql, new RegExp(`'${type}'`))
  }
})

test('backfill é idempotente e não duplica eventos existentes', () => {
  assert.match(sql, /NOT EXISTS/g)
  assert.match(sql, /e\.incident_id = i\.id/g)
  assert.match(sql, /e\.metadata ->> 'kind'/)
})

test('eventos cumpridos preservam instante e cálculo de violação', () => {
  assert.match(sql, /'at', i\.responded_at/)
  assert.match(sql, /i\.responded_at > i\.sla_response_deadline/)
  assert.match(sql, /'at', i\.resolved_at/)
  assert.match(sql, /i\.resolved_at > i\.sla_resolution_deadline/)
})
