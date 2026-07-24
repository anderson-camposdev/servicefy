import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration167 = read('supabase/migrations/20260723000200_167_reassign_pending_approvals_on_deactivation.sql')

// Pente fino de 2026-07-23: os tipos de aprovação dinâmica 'manager' e
// 'department_head' (migration 095) fazem fan-out para EXATAMENTE UMA
// linha em request_approvals, escolhida no momento da criação da
// requisição. Se essa pessoa for desativada depois, a linha ficava
// 'pending' para sempre — decide_request_approval exige
// approver_id = perfil do chamador, e ninguém mais tinha uma linha
// própria para decidir. Verificado ao vivo contra o Supabase local
// (transação com ROLLBACK): reatribuição ao gestor do departamento,
// fallback para company_admin, histórico/notificação registrados, e
// o gestor reatribuído conseguindo aprovar de ponta a ponta.

test('migration 167: trigger dispara só na transição active=true -> false', () => {
  assert.match(migration167, /WHEN \(OLD\.active = true AND NEW\.active = false\)/)
})

test('migration 167: prioriza o gestor do departamento (departments.manager_id ativo)', () => {
  const fn = migration167.split('CREATE OR REPLACE FUNCTION public.reassign_pending_approvals_on_deactivation')[1]
  assert.match(fn, /FROM public\.departments d\s*\n\s*JOIN public\.profiles p ON p\.id = d\.manager_id AND p\.active = true/)
})

test('migration 167: cai para o company_admin ativo mais antigo quando não há gestor de departamento elegível', () => {
  const fn = migration167.split('CREATE OR REPLACE FUNCTION public.reassign_pending_approvals_on_deactivation')[1]
  assert.match(fn, /p\.role::text = 'company_admin'\s*\n\s*AND p\.active = true\s*\n\s*ORDER BY p\.created_at/)
})

test('migration 167: só reatribui aprovação ainda pendente de um ticket ainda aguardando (não mexe em requisição já decidida)', () => {
  const fn = migration167.split('CREATE OR REPLACE FUNCTION public.reassign_pending_approvals_on_deactivation')[1]
  assert.match(fn, /ra\.status = 'pending'/)
  assert.match(fn, /t\.approval_status = 'pending'/)
})

test('migration 167: evita duplicar linha quando o alvo já é aprovador do mesmo incidente (cancela a órfã em vez de duplicar)', () => {
  const fn = migration167.split('CREATE OR REPLACE FUNCTION public.reassign_pending_approvals_on_deactivation')[1]
  assert.match(fn, /SELECT 1 FROM public\.request_approvals\s*\n\s*WHERE incident_id = v_pending\.incident_id AND approver_id = v_target_id/)
  assert.match(fn, /SET status = 'cancelled', decided_at = now\(\)/)
})

test('migration 167: reatribuição fica auditável em incident_history', () => {
  assert.match(migration167, /'approval_reassigned'/)
})

test('Contrato de reatribuição de aprovação participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/request-approval-reassignment-contract\.test\.mjs/)
})
