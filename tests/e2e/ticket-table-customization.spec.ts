/**
 * ticket-table-customization.spec.ts
 *
 * Cobre a customização da tabela de incidentes (TicketDataTable):
 *  0. Classificação tipada e reordenação persistente por drag-and-drop.
 *  1. Colunas customizáveis — abre "Colunas", desmarca uma coluna default
 *     e marca uma nova, salva, e confirma que a tabela reflete a mudança
 *     e persiste após reload (localStorage).
 *  2. Filtro por coluna — filtra por Prioridade e confirma que a lista
 *     reduz aos chamados que batem.
 *  3. Agrupamento por coluna — agrupa por Prioridade e confirma os
 *     cabeçalhos de grupo com contagem.
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth, SUPABASE_URL } from './helpers/mockAuth'


const MOCK_INCIDENTS = [
  {
    id: 'inc-001', number: 'INC-00101', short_description: 'Servidor de arquivos fora do ar',
    description: 'Ninguém consegue acessar os arquivos compartilhados.', state: 'New',
    priority: 'P1 - Critical', category: 'Hardware', company_id: 'company-a-uuid',
    caller_id: 'user-1', caller_name: 'Ana Souza', assigned_to_id: null, assigned_to_name: null,
    assigned_group_id: null, assigned_group_name: 'Infraestrutura', sla_breached: false,
    sla_deadline: new Date(Date.now() + 3_600_000).toISOString(), ticket_type: 'incident',
    impact: 'High', urgency: 'High', tags: [], opened_via: 'portal', close_code: null,
    created_at: '2026-06-10T18:33:37.000Z', updated_at: '2026-06-10T18:33:37.000Z',
    resolved_at: null, closed_at: null,
  },
  {
    id: 'inc-002', number: 'INC-00102', short_description: 'VPN não conecta para ninguém',
    description: 'Erro de autenticação ao tentar conectar na VPN corporativa.', state: 'In Progress',
    priority: 'P1 - Critical', category: 'Network', company_id: 'company-a-uuid',
    caller_id: 'user-2', caller_name: 'Bruno Lima', assigned_to_id: 'agent-1', assigned_to_name: 'Analista Teste',
    assigned_group_id: null, assigned_group_name: 'Redes', sla_breached: false,
    sla_deadline: new Date(Date.now() + 3_600_000 * 2).toISOString(), ticket_type: 'incident',
    impact: 'High', urgency: 'Medium', tags: [], opened_via: 'portal', close_code: null,
    created_at: '2026-06-06T16:19:37.000Z', updated_at: '2026-06-06T16:19:37.000Z',
    resolved_at: null, closed_at: null,
  },
  {
    id: 'inc-003', number: 'INC-00103', short_description: 'Impressora do 3º andar sem tinta',
    description: 'Impressora HP parou de imprimir.', state: 'New',
    priority: 'P3 - Moderate', category: 'Hardware', company_id: 'company-a-uuid',
    caller_id: 'user-3', caller_name: 'Carla Dias', assigned_to_id: null, assigned_to_name: null,
    assigned_group_id: null, assigned_group_name: 'Suporte N1', sla_breached: false,
    sla_deadline: new Date(Date.now() + 3_600_000 * 24).toISOString(), ticket_type: 'incident',
    impact: 'Low', urgency: 'Low', tags: [], opened_via: 'portal', close_code: null,
    created_at: '2026-06-08T09:15:00.000Z', updated_at: '2026-06-08T09:15:00.000Z',
    resolved_at: null, closed_at: null,
  },
]

async function setupMocks(page: Page) {
  await setupMockAuth(page)

  await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'x' }]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INCIDENTS) })
  })
}

async function openIncidentQueue(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (document.body.textContent ?? '').length > 100, { timeout: 15_000 })
  const incidentesNav = page.locator('button').filter({ hasText: 'Incidentes' }).first()
  await expect(incidentesNav).toBeVisible({ timeout: 10_000 })
  await incidentesNav.click()
  await page.waitForTimeout(1_500)
  await expect(page.getByText(/INC-00101/i).first()).toBeVisible({ timeout: 10_000 })
}

test.describe('Tabela de incidentes — colunas, filtro e agrupamento', () => {
  test('classifica texto e data nas duas direcoes', async ({ page }) => {
    await setupMocks(page)
    await openIncidentQueue(page)

    const ticketIds = () => page.locator('[data-testid="ticket-table-scroll"] tbody tr td:nth-child(2)')

    await page.getByRole('button', { name: /Classificar por Ticket ID/i }).click()
    await expect(ticketIds()).toHaveText([/INC-00101/, /INC-00102/, /INC-00103/])
    await page.getByRole('button', { name: /Classificar por Ticket ID/i }).click()
    await expect(ticketIds()).toHaveText([/INC-00103/, /INC-00102/, /INC-00101/])

    await page.getByRole('button', { name: /Classificar por Abertura/i }).click()
    await expect(ticketIds()).toHaveText([/INC-00102/, /INC-00103/, /INC-00101/])
    await page.getByRole('button', { name: /Classificar por Abertura/i }).click()
    await expect(ticketIds()).toHaveText([/INC-00101/, /INC-00103/, /INC-00102/])
  })

  test('reordena colunas por arrastar e persiste apos reload', async ({ page }) => {
    await setupMocks(page)
    await openIncidentQueue(page)

    const company = page.getByRole('columnheader', { name: /Empresa/i })
    const subject = page.getByRole('columnheader', { name: /Assunto/i })
    await company.dragTo(subject)

    const headers = page.locator('[data-testid="ticket-table-scroll"] thead th')
    await expect(headers.nth(2)).toContainText('Empresa')
    await expect(headers.nth(3)).toContainText('Assunto')

    await page.reload()
    await expect(page.getByText(/INC-00101/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(headers.nth(2)).toContainText('Empresa')
    await expect(headers.nth(3)).toContainText('Assunto')
  })

  test('customiza colunas e persiste após reload', async ({ page }) => {
    await setupMocks(page)
    await openIncidentQueue(page)

    // SLA é coluna default — visível de início; Categoria não é default — ausente.
    await expect(page.getByRole('columnheader', { name: 'SLA' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Categoria' })).toHaveCount(0)

    await page.getByRole('button', { name: /Colunas/i }).click()
    await expect(page.getByText('Customizar Colunas')).toBeVisible({ timeout: 5_000 })

    // Marca "Categoria" (nova) e desmarca "SLA" (default) — os checkboxes ficam
    // dentro de <label>, então clicar no label do modal alterna o checkbox.
    await page.locator('label').filter({ hasText: 'Categoria' }).click()
    await page.locator('label').filter({ hasText: /^SLA$/ }).click()
    await page.getByRole('button', { name: 'Salvar Preferências' }).click()

    await expect(page.getByRole('columnheader', { name: 'Categoria' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('columnheader', { name: 'SLA' })).toHaveCount(0)

    // Persistência: sobrevive a um reload da página (localStorage)
    await page.reload()
    await page.waitForTimeout(2_500)
    await expect(page.getByRole('columnheader', { name: 'Categoria' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('columnheader', { name: 'SLA' })).toHaveCount(0)
  })

  test('filtra por coluna (Prioridade)', async ({ page }) => {
    await setupMocks(page)
    await openIncidentQueue(page)

    await expect(page.getByText('INC-00101')).toBeVisible()
    await expect(page.getByText('INC-00102')).toBeVisible()
    await expect(page.getByText('INC-00103')).toBeVisible()

    // "Mudanças" também renderiza um TicketDataTable (sempre montado, só oculto
    // via CSS até o usuário abrir a aba) — escopamos ao elemento visível.
    await page.locator('button:visible').filter({ hasText: 'Filtro' }).click()
    // Escolhe o campo no popover de seleção (botão, não o <th> nem o <option> do agrupar-por)
    await page.getByRole('button', { name: 'Prioridade', exact: true }).click()
    // Marca o valor "P1 - Critical" no checklist do filtro (dentro de <label>,
    // diferente das duas células da tabela que também mostram esse texto)
    await page.locator('label').filter({ hasText: 'P1 - Critical' }).click()
    await page.getByRole('button', { name: 'Aplicar' }).click()

    // Só os 2 chamados P1 permanecem
    await expect(page.getByText('INC-00101')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('INC-00102')).toBeVisible()
    await expect(page.getByText('INC-00103')).toHaveCount(0)
    await expect(page.getByText(/Prioridade: P1 - Critical/i)).toBeVisible()
  })

  test('agrupa por coluna (Prioridade) com contagem por grupo', async ({ page }) => {
    await setupMocks(page)
    await openIncidentQueue(page)

    // "Mudanças" também renderiza um TicketDataTable (sempre montado, só oculto
    // via CSS até o usuário abrir a aba) — escopamos ao elemento visível.
    await page.locator('select[aria-label="Agrupar por"]:visible').selectOption({ label: 'Prioridade' })

    await expect(page.getByText(/Prioridade: P1 - Critical\s*\(2\)/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/Prioridade: P3 - Moderate\s*\(1\)/i)).toBeVisible()

    // Colapsa o primeiro grupo e confirma que suas linhas somem
    await page.getByText(/Prioridade: P1 - Critical/i).click()
    await expect(page.getByText('INC-00101')).toHaveCount(0)
    await expect(page.getByText('INC-00103')).toBeVisible()
  })

  test('redimensiona coluna por arrastar a borda, persiste e restaura com duplo clique', async ({ page }) => {
    await setupMocks(page)
    await openIncidentQueue(page)

    const subjectHeader = page.getByRole('columnheader', { name: /Assunto/i })
    const handle = page.getByLabel('Redimensionar coluna Assunto')
    const widthOf = async () => (await subjectHeader.boundingBox())?.width ?? 0

    const initialWidth = await widthOf()

    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('resize handle não encontrado')
    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 120, startY, { steps: 10 })
    await page.mouse.up()

    await expect.poll(widthOf).toBeGreaterThan(initialWidth + 100)
    const resizedWidth = await widthOf()

    // Persiste após reload
    await page.reload()
    await expect(page.getByText(/INC-00101/i).first()).toBeVisible({ timeout: 10_000 })
    await expect.poll(widthOf).toBeGreaterThan(initialWidth + 100)

    // Duplo clique no handle restaura a largura padrão
    await page.getByLabel('Redimensionar coluna Assunto').dblclick()
    await expect.poll(widthOf).toBeLessThan(resizedWidth)
  })
})
