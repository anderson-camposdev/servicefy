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

async function setupMocks(page: Page) {
  await setupMockAuth(page)

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
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/csat_surveys*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

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
})
