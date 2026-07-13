import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260713010000_118_approval_workflows.sql')

function fnBody(name, closer = '\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split(closer)[0]
}

test('tickets ganha approval_paused_at (coluna própria, não reaproveita paused_at do On Hold)', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS approval_paused_at timestamptz/)
})

test('tg_incidents_view_insert volta a calcular approval_status=pending (regressão da Fase 18 corrigida)', () => {
  const body = fnBody('tg_incidents_view_insert()')
  assert.match(body, /v_approval_status := 'pending'/)
  assert.match(body, /RAISE EXCEPTION 'Aprovação necessária, mas nenhum aprovador ativo foi encontrado/)
})

test('tg_incidents_view_insert resolve assignment_group_id a partir de request_items quando o chamador não informou um', () => {
  const body = fnBody('tg_incidents_view_insert()')
  assert.match(body, /IF NEW\.assignment_group_id IS NULL AND v_item\.assignment_group_id IS NOT NULL THEN/)
  assert.match(body, /COALESCE\(NEW\.assignment_group_id, v_group_id\)/)
})

test('approval_paused_at é populado só quando approval_status nasce pending', () => {
  const body = fnBody('tg_incidents_view_insert()')
  assert.match(body, /v_approval_paused_at := CASE WHEN v_approval_status = 'pending' THEN COALESCE\(NEW\.created_at, now\(\)\) ELSE NULL END/)
})

test('tg_handle_approval_sla_pause empurra os deadlines pelos minutos úteis gastos em approval_status=pending', () => {
  const body = fnBody('tg_handle_approval_sla_pause()')
  assert.match(body, /v_paused_mins := public\.sla_business_minutes_between\(v_calendar, OLD\.approval_paused_at, clock_timestamp\(\)\)/)
  assert.match(body, /NEW\.sla_resolution_deadline := public\.sla_add_business_minutes\(v_calendar, NEW\.sla_resolution_deadline, v_paused_mins\)/)
})

test('trigger de pausa de aprovação dispara só na saída de pending (WHEN), com nome ordenado entre tg_calculate_ticket_sla e zzz_consolidate_sla_resolution', () => {
  assert.match(sql, /CREATE TRIGGER tg_handle_approval_sla_pause\s+BEFORE UPDATE OF approval_status ON public\.tickets/)
  assert.match(sql, /WHEN \(OLD\.approval_status = 'pending' AND NEW\.approval_status IS DISTINCT FROM OLD\.approval_status\)/)
})

test('tg_create_request_approvals preenche company_id e link nos dois INSERTs em notifications (colisão com a Fase 16 corrigida)', () => {
  const body = fnBody('tg_create_request_approvals()')
  const matches = body.match(/INSERT INTO public\.notifications\s*\n\s*\(company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link\)/g) ?? []
  assert.equal(matches.length, 2)
})

test('decide_request_approval trava tickets diretamente, não a view incidents (FOR UPDATE não funciona através de LEFT JOIN)', () => {
  const body = fnBody('decide_request_approval(p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)')
  assert.match(body, /FROM public\.tickets\s+WHERE id = v_approval\.incident_id FOR UPDATE/)
  assert.doesNotMatch(body, /FROM public\.incidents[\s\S]{0,40}FOR UPDATE/)
})

test('rejeição grava close_code/close_notes E resolution_code/resolution_notes juntos (satisfaz trg_guard_resolution_governance da Fase 18)', () => {
  const body = fnBody('decide_request_approval(p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)')
  assert.match(body, /close_code = CASE WHEN v_final_status = 'rejected' THEN 'Rejected' ELSE close_code END/)
  assert.match(body, /resolution_code = CASE WHEN v_final_status = 'rejected' THEN 'Rejeitado em Aprovação' ELSE resolution_code END/)
  assert.match(body, /resolution_notes = CASE WHEN v_final_status = 'rejected'/)
})

test('aprovação final não força state (permanece o que já era) — só approval_status muda', () => {
  const body = fnBody('decide_request_approval(p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)')
  assert.match(body, /state = CASE WHEN v_final_status = 'rejected'\s*\n\s*THEN 'Closed'::public\.incident_state ELSE state END/)
})

test('decide_request_approval valida posse da aprovação e estado pending antes de qualquer escrita', () => {
  const body = fnBody('decide_request_approval(p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)')
  assert.match(body, /RAISE EXCEPTION 'Aprovação não pertence ao usuário autenticado' USING ERRCODE = '42501'/)
  assert.match(body, /RAISE EXCEPTION 'Aprovação já foi decidida'/)
  assert.match(body, /RAISE EXCEPTION 'Requisição não está mais aguardando aprovação'/)
})

test('notificações de decisão final (aprovada/rejeitada) preenchem company_id e link', () => {
  const body = fnBody('decide_request_approval(p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)')
  assert.match(body, /INSERT INTO public\.notifications\s*\n\s*\(company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link\)/)
})

test('decide_request_approval é SECURITY DEFINER, revogada de anon/public, concedida a authenticated', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.decide_request_approval\(p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text\)[\s\S]*?SECURITY DEFINER/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.decide_request_approval\(uuid, boolean, text\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.decide_request_approval\(uuid, boolean, text\) TO authenticated/)
})

test('Contrato do motor de aprovações participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /approval-workflows-contract\.test\.mjs/)
})
