import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'
const NOW = Date.now()

const INCIDENT = {
  id: 'c09d0ba8-971c-4544-8617-4aa0b2ed4174',
  number: 'INC-01003',
  short_description: 'VPN lenta após atualização',
  description: 'A conexão está instável desde a última atualização.',
  state: 'In Progress',
  priority: 'P2 - High',
  priority_level: 2,
  category: 'Rede',
  company_id: '11111111-1111-1111-1111-111111111111',
  caller_name: 'Juliana Costa',
  assigned_to_id: 'profile-test-uuid',
  assigned_to_name: 'Analista Teste',
  assigned_group_name: 'Suporte N1',
  impact: 'High',
  urgency: 'Medium',
  ticket_type: 'incident',
  created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date(NOW).toISOString(),
  responded_at: new Date(NOW - 90 * 60 * 1000).toISOString(),
  resolved_at: null,
  closed_at: null,
  paused_at: null,
  sla_response_deadline: new Date(NOW - 60 * 60 * 1000).toISOString(),
  sla_resolution_deadline: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
  is_response_breached: false,
  is_resolution_breached: false,
  history: [],
}

async function setupCockpit(page: Page, incident = INCIDENT) {
  await setupMockAuth(page)
  await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      body: JSON.stringify(incident),
    })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/pending_reasons*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'reason-1', name: 'Aguardando cliente', requires_customer_action: true, active: true },
    ]) })
  })
  await page.goto('/?preview=cockpit')
  await expect(page.getByTestId('operational-summary')).toBeVisible({ timeout: 10_000 })
}

test.describe('Cockpit do analista — resumo e ações ITSM', () => {
  test('exibe metadados e os dois SLAs uma única vez antes da conversa', async ({ page }) => {
    await setupCockpit(page)
    const summary = page.getByTestId('operational-summary')
    await expect(summary.getByText('Juliana Costa')).toBeVisible()
    await expect(summary.getByText('Suporte N1')).toBeVisible()
    await expect(page.getByText('SLA de resposta', { exact: true })).toHaveCount(1)
    await expect(page.getByText('SLA de solução', { exact: true })).toHaveCount(1)

    const summaryBox = await summary.boundingBox()
    const conversationBox = await page.getByText('Descrição & Conversa', { exact: true }).boundingBox()
    expect(summaryBox && conversationBox && summaryBox.y < conversationBox.y).toBeTruthy()
    await expect(page.getByText('Metadados do Chamado')).toHaveCount(0)
  })

  test('abre modais acessíveis exclusivos para atualizar, pendência e resolução', async ({ page }) => {
    await setupCockpit(page)

    await page.getByRole('button', { name: /Atualizar chamado/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toBeFocused()
    await expect(page.getByRole('dialog').getByText('Atualizar chamado', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('option', { name: /Pendente/i })).toHaveCount(0)
    await expect(page.getByRole('dialog').getByRole('option', { name: /Resolvido|Fechado/i })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Colocar em pendência/i }).click()
    const pendingDialog = page.getByRole('dialog')
    await expect(pendingDialog.getByText('Colocar em pendência', { exact: true })).toBeVisible()
    await expect(pendingDialog.getByText(/cronômetros de SLA serão pausados/i)).toBeVisible()
    await pendingDialog.getByRole('button', { name: /Confirmar pendência/i }).click()
    await expect(page.getByText(/selecione o Motivo da Pendência/i).first()).toBeVisible()
    await pendingDialog.getByRole('combobox').last().selectOption('reason-1')
    await pendingDialog.getByRole('button', { name: /Confirmar pendência/i }).click()
    await expect(page.getByText(/justificativa/i).first()).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Resolver chamado/i }).click()
    const resolveDialog = page.getByRole('dialog')
    await expect(resolveDialog.getByText('Resolver Chamado', { exact: true })).toBeVisible()
    await resolveDialog.getByRole('button', { name: /Confirmar Resolução/i }).click()
    await expect(page.getByText(/Selecione o Código de Encerramento/i).first()).toBeVisible()
  })

  test('preserva os fluxos de iniciar atendimento e reabrir somente pelo topo', async ({ page }) => {
    await setupCockpit(page, { ...INCIDENT, state: 'New', responded_at: null })
    await page.getByRole('button', { name: /Iniciar Atendimento/i }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Iniciar Atendimento' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.unroute(`${SUPABASE_URL}/rest/v1/incidents*`)
    await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.pgrst.object+json',
        body: JSON.stringify({ ...INCIDENT, state: 'Resolved', resolved_at: new Date(NOW).toISOString() }),
      })
    })
    await page.reload()
    await expect(page.getByTestId('operational-summary')).toBeVisible()
    await page.getByRole('button', { name: /Reabrir Chamado/i }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Reabrir Chamado' })).toBeVisible()
  })
})
