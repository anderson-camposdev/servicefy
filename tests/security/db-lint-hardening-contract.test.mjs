import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migrationPath = new URL('../../supabase/migrations/20260716040000_127_db_lint_hardening.sql', import.meta.url)
const sql = readFileSync(migrationPath, 'utf8')
const omnichannelRepairPath = new URL('../../supabase/migrations/20260718001100_142_omnichannel_message_id_type_repair.sql', import.meta.url)
const omnichannelRepair = readFileSync(omnichannelRepairPath, 'utf8')

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

test('omnichannel acompanha o bigint real de ticket_messages e BI inicializa arrays e OUT params tipados', () => {
  assert.match(omnichannelRepair, /ALTER COLUMN source_ticket_message_id TYPE bigint/i)
  assert.match(omnichannelRepair, /ALTER COLUMN ticket_message_id TYPE bigint/i)
  assert.match(omnichannelRepair, /v_ticket_message_id public\.ticket_messages\.id%TYPE/i)
  assert.match(omnichannelRepair, /v_existing_ticket_message_id public\.channel_messages\.ticket_message_id%TYPE/i)
  assert.match(omnichannelRepair, /cm\.ticket_message_id = v_row\.source_ticket_message_id/i)
  assert.match(sql, /v_conds text\[\] := ARRAY\[\]::text\[\]/i)
  assert.match(sql, /dims := NULL;[\s\S]*measures := NULL;/i)
  assert.match(sql, /value := NULL;[\s\S]*occurrences := NULL;/i)
})
