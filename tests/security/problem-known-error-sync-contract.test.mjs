import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration168 = read('supabase/migrations/20260723000300_168_sync_problem_known_error_with_state.sql')
const appTsx = read('src/App.tsx')

// Pente fino de 2026-07-23: problems.known_error (boolean) e state='Known
// Error' (enum) eram campos independentes editáveis sem sincronia pela UI.
// O card KEDB (services.ts getKPIs) conta só o boolean — um problema com
// state='Known Error' e known_error=false (checkbox esquecido) sumia da
// contagem. Fix unidirecional: state='Known Error' força known_error=true
// no banco; o inverso não é forçado (problema já Resolved pode continuar
// documentado como known_error=true). Verificado ao vivo: INSERT força o
// flag, saída do estado não reverte o flag, problema normal não é afetado.

test('migration 168: trigger roda em INSERT e em UPDATE de state', () => {
  assert.match(migration168, /BEFORE INSERT OR UPDATE OF state ON public\.problems/)
})

test('migration 168: força known_error=true quando state=Known Error, sem mexer no inverso', () => {
  const fn = migration168.split('CREATE OR REPLACE FUNCTION public.sync_problem_known_error')[1]
  assert.match(fn, /IF NEW\.state = 'Known Error' THEN\s*\n\s*NEW\.known_error := true;/)
  assert.doesNotMatch(fn, /NEW\.known_error := false/)
  assert.doesNotMatch(fn, /NEW\.state :=/)
})

test('migration 168: corrige dado já existente fora de sincronia (backfill)', () => {
  assert.match(migration168, /UPDATE public\.problems SET known_error = true WHERE state = 'Known Error' AND known_error = false/)
})

test('ProblemDashboard: selecionar Known Error já marca o checkbox no formulário (UX, backend continua sendo a fonte de verdade)', () => {
  assert.match(appTsx, /state: v as ProblemState, known_error: v === 'Known Error' \? true : f\.known_error/)
})

test('Contrato de sincronia known_error/state participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/problem-known-error-sync-contract\.test\.mjs/)
})
