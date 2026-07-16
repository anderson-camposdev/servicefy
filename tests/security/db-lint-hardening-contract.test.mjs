import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migrationPath = new URL('../../supabase/migrations/20260716040000_127_db_lint_hardening.sql', import.meta.url)
const sql = readFileSync(migrationPath, 'utf8')

test('workflow usa o tipo base tickets e resolve atributos polimórficos sem mudar ações', () => {
  assert.match(sql, /workflow_eval_condition[\s\S]*p_incident public\.tickets/i)
  assert.match(sql, /FROM public\.incident_attributes[\s\S]*ticket_id = p_incident\.id/i)
  assert.match(sql, /FROM public\.service_request_attributes[\s\S]*ticket_id = p_incident\.id/i)
  assert.match(sql, /workflow_dispatch_actions[\s\S]*v_incident public\.tickets := p_incident/i)
  assert.match(sql, /workflow_run_queued_sync[\s\S]*v_incident public\.tickets/i)
})

test('locks de SLA usam tickets e tipos de aprovação continuam explícitos', () => {
  assert.match(sql, /start_ticket_service[\s\S]*FROM public\.tickets t[\s\S]*FOR UPDATE/i)
  assert.match(sql, /accept_incident_resolution[\s\S]*FROM public\.tickets t[\s\S]*FOR UPDATE/i)
  assert.match(sql, /v_new_state public\.request_state/i)
  assert.match(sql, /check_sla_breaches[\s\S]*v_inc public\.tickets/i)
  assert.match(sql, /check_sla_warnings[\s\S]*v_inc public\.tickets/i)
})

test('omnichannel usa UUID ponta a ponta e BI inicializa arrays e OUT params tipados', () => {
  assert.match(sql, /ALTER COLUMN source_ticket_message_id TYPE uuid/i)
  assert.match(sql, /v_ticket_message_id uuid/i)
  assert.match(sql, /v_existing_ticket_message_id uuid/i)
  assert.match(sql, /v_conds text\[\] := ARRAY\[\]::text\[\]/i)
  assert.match(sql, /dims := NULL;[\s\S]*measures := NULL;/i)
  assert.match(sql, /value := NULL;[\s\S]*occurrences := NULL;/i)
})
