import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const dashboard = read('src/pages/TicketManagementDashboard.tsx')

// Pente fino de 2026-07-23: TicketManagementDashboard mapeava
// slaBreached/slaDeadline direto de `sla_deadline`/`sla_breached` — o
// motor real de SLA (migrations 090-093, 156) calcula e mantém
// `sla_response_deadline`/`sla_resolution_deadline`/`is_response_breached`/
// `is_resolution_breached` via trigger; `sla_deadline` nunca é
// recalculado após a criação do ticket. A fila operacional ordenava e
// coloria por um prazo morto, podendo divergir do estado real de SLA.

test('mapeamento de fila usa o prazo ativo (resposta antes de responder, resolução depois), não o sla_deadline morto', () => {
  const rowMapping = dashboard.split('const rows: Row[] = realMode')[1].split('const activeClient')[0]
  assert.match(rowMapping, /slaBreached: i\.responded_at \? Boolean\(i\.is_resolution_breached\) : Boolean\(i\.is_response_breached\)/)
  assert.match(rowMapping, /slaDeadline: i\.responded_at \? i\.sla_resolution_deadline : i\.sla_response_deadline/)
  assert.doesNotMatch(rowMapping, /slaDeadline: i\.sla_deadline/)
})

test('Contrato de fonte de SLA da fila operacional participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/ticket-management-sla-source-contract\.test\.mjs/)
})
