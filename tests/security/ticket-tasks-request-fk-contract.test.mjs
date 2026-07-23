import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration048 = read('supabase/migrations/20260704170048_048_ticket_tasks.sql')
const migration166 = read('supabase/migrations/20260723000100_166_fix_ticket_tasks_request_id_fk.sql')
const ticketTasksPanel = read('src/components/TicketTasksPanel.tsx')

// Pente fino de 2026-07-23: ticket_tasks.request_id referenciava
// service_requests — tabela nunca migrada para o modelo unificado de tickets
// (a migration 096 renomeou incidents -> tickets; service_requests ficou
// órfã, nada além do seed de dev grava nela desde então). Toda tarefa criada
// num chamado tipo "requisição" falhava com "Referência inválida entre
// tenants" (o trigger de integridade da migration 146 valida exatamente essa
// combinação). Verificado ao vivo contra o Supabase local (transação com
// ROLLBACK): criar uma tarefa num chamado tipo requisição real da Allied IT
// agora funciona.

test('migration 048 original tinha o bug: request_id referenciava a tabela órfã service_requests', () => {
  assert.match(migration048, /request_id\s+UUID REFERENCES public\.service_requests\(id\)/)
})

test('TicketTasksPanel grava request_id com um tickets.id real (nunca um service_requests.id)', () => {
  assert.match(ticketTasksPanel, /payload\.request_id = ticketId/)
})

test('migration 166: FK de request_id reapontada para tickets(id)', () => {
  assert.match(migration166, /DROP CONSTRAINT IF EXISTS ticket_tasks_request_id_fkey/)
  assert.match(migration166, /ADD CONSTRAINT ticket_tasks_request_id_fkey\s*\n\s*FOREIGN KEY \(request_id\) REFERENCES public\.tickets\(id\)/)
})

test('migration 166: validador de referência entre tenants (146) também corrigido para request_id -> tickets', () => {
  assert.match(migration166, /\('ticket_tasks', 'request_id', 'tickets'\)/)
  assert.doesNotMatch(migration166, /'ticket_tasks', 'request_id', 'service_requests'/)
})

test('migration 166: preflight de integridade entre tenants roda antes do trigger ser recriado', () => {
  const preflightIndex = migration166.indexOf('SELECT public.assert_existing_tenant_references();')
  const triggerIndex = migration166.indexOf('CREATE TRIGGER trg_ticket_tasks_tenant_references')
  assert.ok(preflightIndex > 0 && triggerIndex > preflightIndex)
})

test('Contrato de FK de ticket_tasks.request_id participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/ticket-tasks-request-fk-contract\.test\.mjs/)
})
