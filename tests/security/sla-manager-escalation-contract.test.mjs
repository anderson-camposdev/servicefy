import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260720000600_156_sla_manager_escalation.sql')
const packageJson = read('package.json')

test('notify_ticket_managers notifica ops_manager/governance_manager/company_admin do tenant, in-app e por e-mail', () => {
  assert.match(sql, /p\.role::text IN \('ops_manager', 'governance_manager', 'company_admin'\)/)
  assert.match(sql, /INSERT INTO public\.notifications \(company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type\)/)
  assert.match(sql, /'type', 'send_email'/)
})

test('check_sla_breaches e check_sla_warnings chamam notify_ticket_managers incondicionalmente (nao depende de workflow_rules)', () => {
  const breachesBody = sql.split('CREATE OR REPLACE FUNCTION public.check_sla_breaches')[1].split('CREATE OR REPLACE FUNCTION public.check_sla_warnings')[0]
  const warningsBody = sql.split('CREATE OR REPLACE FUNCTION public.check_sla_warnings')[1].split(/CREATE OR REPLACE FUNCTION public\.workflow_dispatch_actions|$/)[0]
  assert.match(breachesBody, /PERFORM public\.notify_ticket_managers\(/)
  assert.match(warningsBody, /PERFORM public\.notify_ticket_managers\(/)
  // A chamada deve vir ANTES do loop de workflow_rules, provando que nao depende dele
  assert.ok(breachesBody.indexOf('notify_ticket_managers') < breachesBody.indexOf('FOR v_rule IN'))
  assert.ok(warningsBody.indexOf('notify_ticket_managers') < warningsBody.indexOf('FOR v_rule IN'))
})

test('workflow_dispatch_actions.send_notification tambem grava company_id (bug pre-existente corrigido de passagem)', () => {
  const dispatchBody = sql.split('CREATE OR REPLACE FUNCTION public.workflow_dispatch_actions')[1]
  assert.match(dispatchBody, /INSERT INTO public\.notifications \(company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type\)/)
  assert.match(dispatchBody, /VALUES \(p_incident\.company_id, p_incident\.assigned_to_id,/)
})

test('notify_ticket_managers e revogada de anon\\/public\\/authenticated (so chamavel por outra funcao SECURITY DEFINER)', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.notify_ticket_managers\(public\.tickets, text, text, text\) FROM PUBLIC, anon, authenticated;/)
})

test('contrato participa da suite de seguranca padrao', () => {
  assert.match(packageJson, /sla-manager-escalation-contract\.test\.mjs/)
})
