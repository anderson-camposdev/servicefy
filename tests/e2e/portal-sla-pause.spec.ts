/**
 * portal-sla-pause.spec.ts
 *
 * Verifica visualmente a correção do controle de SLA no Portal do Usuário:
 *  - Chamado pausado (state='On Hold', paused_at setado) mostra o cartão de
 *    "Prazo Limite de Solução" como PAUSADO (congelado), não uma contagem
 *    regressiva/estourada baseada no relógio corrente.
 *  - Chamado já atendido (responded_at setado) mostra "Prazo Limite de
 *    Resposta" como CUMPRIDO, não uma contagem em andamento.
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'
const NOW = Date.now()

const PAUSED_INCIDENT = {
  id: 'inc-paused-001',
  number: 'INC-00456',
  short_description: 'Chamado pausado para teste de SLA',
  description: 'Aguardando retorno do usuário.',
  state: 'On Hold',
  ticket_type: 'incident',
  priority: 'P3 - Moderate',
  category: 'Software',
  company_id: 'company-a-uuid',
  caller_id: 'profile-test-uuid',
  caller_name: 'Analista Teste',
  assigned_to_name: null,
  assigned_group_name: 'Suporte N1',
  impact: 'Medium',
  urgency: 'Medium',
  created_at: new Date(NOW - 4 * 3600 * 1000).toISOString(),
  updated_at: new Date(NOW - 30 * 60 * 1000).toISOString(),
  responded_at: new Date(NOW - 3 * 3600 * 1000).toISOString(),
  resolved_at: null,
  closed_at: null,
  paused_at: new Date(NOW - 30 * 60 * 1000).toISOString(),
  sla_response_deadline: new Date(NOW - 3.5 * 3600 * 1000).toISOString(),
  sla_resolution_deadline: new Date(NOW + 2 * 3600 * 1000).toISOString(),
  is_response_breached: false,
  is_resolution_breached: false,
  sla_breached: false,
  form_data: null,
}

// Capturadas durante os testes para verificar que o cliente pede ordem
// decrescente ao Postgrest (os mocks abaixo não executam ORDER BY de
// verdade — só a query string prova que o pedido saiu correto).
let historyRequestUrl = ''
let slaEventsRequestUrl = ''

async function setupMocks(page: Page) {
  await setupMockAuth(page)
  historyRequestUrl = ''
  slaEventsRequestUrl = ''

  await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'x' }]) })
      return
    }
    const accept = route.request().headers()['accept'] ?? ''
    if (accept.includes('vnd.pgrst.object+json')) {
      await route.fulfill({ status: 200, contentType: 'application/vnd.pgrst.object+json', body: JSON.stringify(PAUSED_INCIDENT) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PAUSED_INCIDENT]) })
    }
  })

  await page.route(`${SUPABASE_URL}/rest/v1/ticket_messages*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/sla_events*`, async route => {
    slaEventsRequestUrl = route.request().url()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLA_EVENTS) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/csat_surveys*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/incident_history*`, async route => {
    historyRequestUrl = route.request().url()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACTION_HISTORY) })
  })
}

// Já em ordem decrescente (mais recente primeiro) — como o backend real
// devolveria com order=created_at.desc — para validar que a UI não reordena
// (nem inverte) o que a query já traz.
const SLA_EVENTS = [
  { id: 'ev-2', incident_id: PAUSED_INCIDENT.id, event_type: 'resolution_achieved', metadata: { at: new Date(NOW - 10 * 60 * 1000).toISOString(), breached: false }, created_at: new Date(NOW - 10 * 60 * 1000).toISOString() },
  { id: 'ev-1', incident_id: PAUSED_INCIDENT.id, event_type: 'resolution_start', metadata: { deadline: PAUSED_INCIDENT.sla_resolution_deadline, priority_level: 3 }, created_at: PAUSED_INCIDENT.created_at },
]
const ACTION_HISTORY = [
  { id: 'h-3', incident_id: PAUSED_INCIDENT.id, changed_by_id: null, changed_by_name: 'Suporte N1', field_name: 'state', old_value: 'In Progress', new_value: 'On Hold', comment: null, is_public: true, created_at: PAUSED_INCIDENT.paused_at },
  { id: 'h-2', incident_id: PAUSED_INCIDENT.id, changed_by_id: 'agent-1', changed_by_name: 'Suporte N1', field_name: 'comment', old_value: null, new_value: null, comment: 'Já estamos verificando o problema.', is_public: true, created_at: PAUSED_INCIDENT.responded_at },
  { id: 'h-1', incident_id: PAUSED_INCIDENT.id, changed_by_id: null, changed_by_name: 'Analista Teste', field_name: 'Criação', old_value: null, new_value: null, comment: 'Chamado registrado pelo portal.', is_public: true, created_at: PAUSED_INCIDENT.created_at },
]

async function openPortalTicketDetail(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(3_000)

  const portalBtn = page.locator('button').filter({ hasText: /Portal do Usuário|Portal/i }).first()
  if (await portalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await portalBtn.click()
    await page.waitForTimeout(2_000)
  }

  await page.getByText(/Meus Chamados/i).first().click()
  await page.waitForTimeout(1_500)

  await page.getByText(/INC-00456/i).first().click()
  await page.waitForTimeout(1_500)
}

test.describe('Portal — Controle de SLA', () => {
  test('chamado pausado mostra o prazo de solução congelado, não uma contagem ao vivo', async ({ page }) => {
    await setupMocks(page)
    await openPortalTicketDetail(page)

    await expect(page.getByText(/Prazo Limite de Solução/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/^Pausado/i)).toBeVisible({ timeout: 6_000 })
  })

  test('chamado já atendido mostra o prazo de resposta como cumprido', async ({ page }) => {
    await setupMocks(page)
    await openPortalTicketDetail(page)

    await expect(page.getByText(/Prazo Limite de Resposta/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/Cumprido em/i)).toBeVisible({ timeout: 6_000 })
  })

  test('aba "Histórico de Ação Técnica" mostra só o histórico de ações; aba "Controle de SLA" mostra só o SLA', async ({ page }) => {
    await setupMocks(page)
    await openPortalTicketDetail(page)

    // Aba de histórico de ações — sem o cartão de Controle de SLA
    await page.getByText(/^📋 Histórico de Ação Técnica$/).click()
    await page.waitForTimeout(800)
    await expect(page.getByText(/Histórico de Ações/i)).toBeVisible({ timeout: 6_000 })
    await expect(page.getByText(/Chamado registrado pelo portal/i)).toBeVisible({ timeout: 6_000 })
    await expect(page.getByText(/Já estamos verificando o problema/i)).toBeVisible({ timeout: 6_000 })
    await expect(page.getByText(/^Controle de SLA$/i)).toHaveCount(0)

    // Aba dedicada de Controle de SLA — sem o histórico de ações
    await page.getByText(/^⏳ Controle de SLA$/).click()
    await page.waitForTimeout(800)
    await expect(page.getByText(/^Controle de SLA$/i)).toBeVisible({ timeout: 6_000 })
    await expect(page.getByText(/SLA de Solução Cumprido/i)).toBeVisible({ timeout: 6_000 })
    await expect(page.getByText(/dentro do prazo/i)).toBeVisible({ timeout: 6_000 })
    await expect(page.getByText(/Histórico de Ações/i)).toHaveCount(0)
  })

  test('histórico de ações e controle de SLA pedem ordem decrescente e renderizam do mais recente para o mais antigo', async ({ page }) => {
    await setupMocks(page)
    await openPortalTicketDetail(page)

    // Histórico de ações: h-2 (mais recente) aparece ACIMA de h-1 (mais antigo)
    await page.getByText(/^📋 Histórico de Ação Técnica$/).click()
    await page.waitForTimeout(800)
    await expect(page.getByText(/Já estamos verificando o problema/i)).toBeVisible({ timeout: 6_000 })
    expect(historyRequestUrl).toMatch(/order=created_at\.desc/)
    const h2Box = await page.getByText(/Já estamos verificando o problema/i).boundingBox()
    const h1Box = await page.getByText(/Chamado registrado pelo portal/i).boundingBox()
    expect(h2Box).not.toBeNull()
    expect(h1Box).not.toBeNull()
    expect(h2Box!.y).toBeLessThan(h1Box!.y)

    // Controle de SLA: ev-2 "Cumprido" (mais recente) aparece ACIMA de ev-1 "Iniciado" (mais antigo)
    await page.getByText(/^⏳ Controle de SLA$/).click()
    await page.waitForTimeout(800)
    await expect(page.getByText(/SLA de Solução Cumprido/i)).toBeVisible({ timeout: 6_000 })
    expect(slaEventsRequestUrl).toMatch(/order=created_at\.desc/)
    const ev2Box = await page.getByText(/SLA de Solução Cumprido/i).boundingBox()
    const ev1Box = await page.getByText(/SLA de Solução Iniciado/i).boundingBox()
    expect(ev2Box).not.toBeNull()
    expect(ev1Box).not.toBeNull()
    expect(ev2Box!.y).toBeLessThan(ev1Box!.y)
  })
})
