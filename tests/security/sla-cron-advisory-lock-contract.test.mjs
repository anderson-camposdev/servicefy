import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration156 = read('supabase/migrations/20260720000600_156_sla_manager_escalation.sql')
const migration171 = read('supabase/migrations/20260723000600_171_sla_cron_advisory_lock.sql')

// Pente fino de 2026-07-23: check_sla_breaches()/check_sla_warnings() rodam
// a cada minuto via pg_cron fazendo select-depois-update sem nenhuma trava
// — overlap de execução (plausível sob carga) podia notificar/disparar
// automação em duplicidade. Fix: pg_try_advisory_xact_lock no início de
// cada função; se o lock já está ocupado, a chamada retorna sem processar
// nada. Verificado ao vivo contra o Supabase local com duas sessões
// concorrentes de verdade: durante a contenção, check_sla_breaches()
// retornou sem tocar o ticket de teste; sem contenção, completou
// normalmente; nenhum advisory lock ficou preso depois (pg_locks vazio).

test('migration 156 original não tinha nenhuma trava contra execução concorrente', () => {
  const breachesFn = migration156.split('CREATE OR REPLACE FUNCTION public.check_sla_breaches')[1].split('CREATE OR REPLACE FUNCTION public.check_sla_warnings')[0]
  const warningsFn = migration156.split('CREATE OR REPLACE FUNCTION public.check_sla_warnings')[1].split('-- Bug pré-existente')[0]
  assert.doesNotMatch(breachesFn, /advisory_lock/)
  assert.doesNotMatch(warningsFn, /advisory_lock/)
})

test('migration 171: check_sla_breaches adquire lock transacional e retorna cedo se ocupado', () => {
  const fn = migration171.split('CREATE OR REPLACE FUNCTION public.check_sla_breaches')[1]
  assert.match(fn, /IF NOT pg_try_advisory_xact_lock\(87201001\) THEN\s*\n\s*RETURN;/)
})

test('migration 171: check_sla_warnings adquire lock transacional com chave própria (distinta da de breaches) e retorna cedo se ocupado', () => {
  const fn = migration171.split('CREATE OR REPLACE FUNCTION public.check_sla_warnings')[1]
  assert.match(fn, /IF NOT pg_try_advisory_xact_lock\(87201002\) THEN\s*\n\s*RETURN;/)
})

test('migration 171: usa lock xact (auto-libera no fim da transação), não session-level manual', () => {
  assert.doesNotMatch(migration171, /pg_advisory_lock\(/)
  assert.doesNotMatch(migration171, /pg_advisory_unlock\(/)
})

test('Contrato de lock do cron de SLA participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/sla-cron-advisory-lock-contract\.test\.mjs/)
})
