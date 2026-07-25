import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration174 = read('supabase/migrations/20260724000000_174_sla_breached_event_idempotency.sql')

// Achado de 2026-07-24: a linha do tempo de SLA exibia milhares de entradas
// "SLA estourado" repetidas — 27.378 linhas de 'breached' para 37 estouros
// reais, uma por minuto (o intervalo do cron). A causa raiz já havia sido
// fechada em b3b3a595 (o trigger da view incidents não mapeava
// is_response_breached/is_resolution_breached, então a flag nunca persistia
// e o chamado voltava na consulta do cron). Faltavam duas coisas: limpar o
// histórico corrompido e impedir estruturalmente a reincidência — o lock da
// migration 171 cobre execuções SIMULTÂNEAS, não reinserção sequencial.
//
// Verificado ao vivo contra o Postgres local (transação com ROLLBACK):
// limpeza levou 27.378 → 37 preservando sempre o PRIMEIRO evento de cada
// estouro; re-log do mesmo estouro é ignorado; estouro de outro 'kind'
// entra; estouro após reabertura entra; 'paused'/'resumed' nunca são
// filtrados.

test('migration 174: limpeza é restrita a breached — paused/resumed repetem legitimamente e não podem ser deduplicados', () => {
  const del = migration174.split('DELETE FROM public.sla_events')[1].split(';')[0]
  assert.match(del, /event_type = 'breached'/)
})

test('migration 174: limpeza preserva o PRIMEIRO evento (instante real do estouro), não o último', () => {
  const del = migration174.split('DELETE FROM public.sla_events')[1].split(';')[0]
  assert.match(del, /ORDER BY created_at, id/)
  assert.match(del, /rn > 1/)
  assert.doesNotMatch(del, /created_at DESC/)
})

test('migration 174: sla_log_event ignora re-log de um estouro já registrado', () => {
  const fn = migration174.split('CREATE OR REPLACE FUNCTION public.sla_log_event')[1]
  assert.match(fn, /IF p_event_type = 'breached' AND EXISTS/)
  assert.match(fn, /RETURN;/)
})

test('migration 174: a guarda distingue por kind — estouro de resposta e de resolução são marcos separados', () => {
  const fn = migration174.split('CREATE OR REPLACE FUNCTION public.sla_log_event')[1]
  assert.match(fn, /metadata->>'kind' IS NOT DISTINCT FROM/)
})

test('migration 174: reabertura reabre a janela — novo estouro após reopened é legítimo e deve ser registrado', () => {
  const fn = migration174.split('CREATE OR REPLACE FUNCTION public.sla_log_event')[1]
  assert.match(fn, /e\.created_at > COALESCE\(/)
  assert.match(fn, /r\.event_type\s*=\s*'reopened'/)
})

test('migration 174: guarda é condicional na função, não UNIQUE rígida (que bloquearia re-estouro após reabertura)', () => {
  assert.doesNotMatch(migration174, /UNIQUE INDEX/)
})

test('migration 174: eventos que não são breached passam direto pela guarda', () => {
  const fn = migration174.split('CREATE OR REPLACE FUNCTION public.sla_log_event')[1]
  const guard = fn.split('IF p_event_type')[1].split('END IF;')[0]
  assert.match(guard, /'breached'/)
  // A guarda inteira está sob a condição de event_type = 'breached'.
  assert.match(fn, /IF p_event_type = 'breached' AND EXISTS/)
})

test('migration 174: preserva SECURITY DEFINER e search_path fixo da função original', () => {
  const fn = migration174.split('CREATE OR REPLACE FUNCTION public.sla_log_event')[1]
  assert.match(fn, /SECURITY DEFINER/)
  assert.match(fn, /SET search_path TO 'public'/)
})

test('Contrato de idempotência do estouro de SLA participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/sla-breached-event-idempotency-contract\.test\.mjs/)
})
