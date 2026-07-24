import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration169 = read('supabase/migrations/20260723000400_169_problem_state_transition_guard.sql')

// Pente fino de 2026-07-23: problems.state aceitava qualquer salto via
// UPDATE direto (New -> Closed sem passar por nada). Diferente de
// Incidentes e Mudanças, não existia nenhum trigger de governança.
// Decisão do usuário: máquina de estados completa estilo ITIL, com
// reabertura explícita sempre voltando para 'Under Investigation'.
// Verificado ao vivo: criação fora de New bloqueada, saltos inválidos
// bloqueados (New->Closed, Under Investigation->Closed pós-reabertura),
// fluxo completo e reabertura funcionam, UPDATE sem tocar state passa
// direto.

test('migration 169: criação só é permitida no estado New', () => {
  const fn = migration169.split('CREATE OR REPLACE FUNCTION public.guard_problem_state_transition')[1]
  assert.match(fn, /IF TG_OP = 'INSERT' THEN\s*\n\s*IF NEW\.state IS DISTINCT FROM 'New' THEN/)
})

test('migration 169: UPDATE que não muda state passa sem checar transição', () => {
  const fn = migration169.split('CREATE OR REPLACE FUNCTION public.guard_problem_state_transition')[1]
  assert.match(fn, /IF NEW\.state = OLD\.state THEN\s*\n\s*RETURN NEW;/)
})

test('migration 169: grafo de transições cobre o fluxo direto completo (New até Closed)', () => {
  const fn = migration169.split('CREATE OR REPLACE FUNCTION public.guard_problem_state_transition')[1]
  assert.match(fn, /OLD\.state = 'New' AND NEW\.state = 'Under Investigation'/)
  assert.match(fn, /OLD\.state = 'Under Investigation' AND NEW\.state IN \('Root Cause Identified', 'Known Error'\)/)
  assert.match(fn, /OLD\.state = 'Root Cause Identified' AND NEW\.state IN \('Known Error', 'Resolved'\)/)
  assert.match(fn, /OLD\.state = 'Known Error' AND NEW\.state = 'Resolved'/)
  assert.match(fn, /OLD\.state = 'Resolved' AND NEW\.state = 'Closed'/)
})

test('migration 169: reabertura explícita sempre volta para Under Investigation (nunca pula direto pra um estado avançado)', () => {
  const fn = migration169.split('CREATE OR REPLACE FUNCTION public.guard_problem_state_transition')[1]
  assert.match(fn, /OLD\.state IN \('Known Error', 'Resolved', 'Closed'\) AND NEW\.state = 'Under Investigation'/)
})

test('migration 169: dispara em INSERT e em UPDATE de state', () => {
  assert.match(migration169, /BEFORE INSERT OR UPDATE OF state ON public\.problems/)
})

test('Contrato de guarda de transição de Problema participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/problem-state-transition-guard-contract\.test\.mjs/)
})
