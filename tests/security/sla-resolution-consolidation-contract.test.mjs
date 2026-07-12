import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260712235959_116_sla_resolution_consolidation.sql')

function fnBody() {
  return sql.split('CREATE OR REPLACE FUNCTION public.tg_consolidate_sla_resolution()')[1].split('\n$$;')[0]
}

test('tg_consolidate_sla_resolution é SECURITY DEFINER com search_path fixo', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tg_consolidate_sla_resolution\(\)[\s\S]*?SECURITY DEFINER/)
  assert.match(sql, /SET search_path = public/)
})

test('só consolida na PRIMEIRA transição para estado terminal (Resolved/Closed), não em reaberturas', () => {
  const body = fnBody()
  assert.match(body, /IF NEW\.state::text IN \('Resolved', 'Closed'\)\s*\n\s*AND OLD\.state::text NOT IN \('Resolved', 'Closed'\) THEN/)
})

test('resolved_at é preenchido via COALESCE (não sobrescreve valor já gravado pelo app)', () => {
  const body = fnBody()
  assert.match(body, /v_resolved_at := COALESCE\(NEW\.resolved_at, clock_timestamp\(\)\)/)
  assert.match(body, /IF NEW\.resolved_at IS NULL THEN\s*\n\s*NEW\.resolved_at := v_resolved_at;/)
})

test('veredito de estouro compara resolved_at contra sla_resolution_deadline (já ajustado por pausa), sem reconstruir tempo pausado', () => {
  const body = fnBody()
  assert.match(body, /NEW\.is_resolution_breached := v_resolved_at > NEW\.sla_resolution_deadline/)
  assert.match(body, /NEW\.sla_breached := NEW\.is_resolution_breached/)
  assert.doesNotMatch(body, /accumulated_paused_time_minutes/)
})

test('só grava o evento de auditoria quando realmente houve estouro (evita ruído de eventos "breached=false")', () => {
  const body = fnBody()
  assert.match(body, /IF NEW\.is_resolution_breached THEN\s*\n\s*PERFORM public\.sla_log_event\(/)
})

test('trigger nomeado com prefixo "zzz_" para disparar por último entre os BEFORE UPDATE de tickets (depois de tg_calculate_ticket_sla e tg_handle_sla_pause já terem produzido o deadline final)', () => {
  assert.match(sql, /CREATE TRIGGER zzz_consolidate_sla_resolution\s+BEFORE UPDATE OF state ON public\.tickets/)
})

test('WHEN clause replica exatamente a condição de primeira-transição-para-terminal da função (defesa em profundidade, evita disparo desnecessário)', () => {
  assert.match(sql, /WHEN \(NEW\.state::text IN \('Resolved', 'Closed'\) AND OLD\.state::text NOT IN \('Resolved', 'Closed'\)\)/)
})

test('Contrato de consolidação de SLA de resolução participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /sla-resolution-consolidation-contract\.test\.mjs/)
})
