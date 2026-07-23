import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration071 = read('supabase/migrations/20260705203001_071_rbac_and_cab_hardening.sql')
const migration165 = read('supabase/migrations/20260723000000_165_fix_cab_bypass_standard_change_risk.sql')

// Pente fino de 2026-07-23: mudança Standard só deveria pular o CAB porque é,
// por definição ITIL, de risco baixo e bem conhecido — mas nem a policy de
// INSERT nem schedule_standard_change() verificavam `risk`, só `type`. Dois
// caminhos de bypass real, confirmados linha a linha e fechados na migration
// 165:
//   1. INSERT direto (o que ChangeManagementDashboard.tsx faz de verdade ao
//      criar uma mudança nova com type='Standard': grava state='Scheduled'
//      já na criação) com risk='Critical' — nascia Scheduled sem CAB.
//   2. Editar uma mudança Emergency/Normal de risco Crítico para
//      type='Standard' ainda em Draft (permitido — o guard de congelamento
//      só age quando state='Awaiting CAB Approval'), depois chamar
//      schedule_standard_change().
//
// Verificado ao vivo contra o Supabase local (transação com ROLLBACK, tenant
// não-provedor isolado): INSERT malicioso bloqueado pela RLS, RPC rejeita
// risco Critical, e o fluxo normal (Standard/Low direto + submit/vote CAB
// completo) continua intacto.

test('migration 071 original tinha o bug: insert_change_staff não checava risk no caminho Standard/Scheduled', () => {
  const originalPolicy = migration071.split('CREATE POLICY insert_change_staff')[1].split('CREATE POLICY update_change_staff')[0]
  assert.match(originalPolicy, /type::text = 'Standard' AND state::text = 'Scheduled'/)
  assert.doesNotMatch(originalPolicy, /risk::text = 'Low'/)
})

test('migration 071 original tinha o bug: schedule_standard_change não checava risk', () => {
  const originalFn = migration071.split('CREATE OR REPLACE FUNCTION public.schedule_standard_change')[1].split('CREATE OR REPLACE FUNCTION public.set_change_incident_links')[0]
  assert.match(originalFn, /v_change\.type::text <> 'Standard' OR v_change\.state::text NOT IN \('Draft', 'CAB Rejected'\)/)
  assert.doesNotMatch(originalFn, /v_change\.risk/)
})

test('migration 165: insert_change_staff agora exige risk=Low para nascer Scheduled como Standard', () => {
  assert.match(migration165, /DROP POLICY IF EXISTS insert_change_staff ON public\.changes/)
  const newPolicy = migration165.split('CREATE POLICY insert_change_staff')[1].split('CREATE OR REPLACE FUNCTION public.schedule_standard_change')[0]
  assert.match(newPolicy, /type::text = 'Standard' AND state::text = 'Scheduled' AND risk::text = 'Low'/)
})

test('migration 165: schedule_standard_change rejeita explicitamente risco diferente de Low', () => {
  const fn = migration165.split('CREATE OR REPLACE FUNCTION public.schedule_standard_change')[1]
  assert.match(fn, /IF v_change\.risk::text <> 'Low' THEN/)
  assert.match(fn, /RAISE EXCEPTION 'Mudança Standard só pode ser agendada diretamente com risco Low/)
})

test('migration 165 não toca no fluxo normal de CAB (submit_change_for_cab / cast_change_cab_vote continuam definidos só na 071)', () => {
  assert.doesNotMatch(migration165, /CREATE OR REPLACE FUNCTION public\.submit_change_for_cab/)
  assert.doesNotMatch(migration165, /CREATE OR REPLACE FUNCTION public\.cast_change_cab_vote/)
})

test('Contrato de risco em mudança Standard participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/change-cab-standard-risk-contract\.test\.mjs/)
})
