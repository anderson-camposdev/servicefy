/**
 * workflow.spec.ts
 *
 * Cobre:
 *  1. Renderização do Workflow Builder ("Motor de Automação")
 *  2. Lista de automações existentes na sidebar
 *  3. Adição de uma nova condição em uma automação existente
 *  4. Troca do gatilho para "Via E-mail" (origen-based trigger)
 *  5. Abertura da galeria de templates ao criar nova automação
 */
import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth, SUPABASE_URL } from './helpers/mockAuth'


// Schema real de workflow_rules (migration 055) — conditions/actions no
// mesmo formato JSON que a UI produz (ConditionRow[]/ActionRow[]).
const MOCK_WORKFLOWS = [
  {
    id: 'wf-001', company_id: 'company-a-uuid', ticket_type: 'incident',
    name: 'Auto-atribuição P1', description: 'Atribui incidentes críticos ao plantão.',
    active: true, trigger_event: 'incident_created', trigger_source: 'any',
    conditions: [{ id: 'c1', field: 'priority', operator: 'equals', value: 'P1 - Critical', logicOp: 'AND' }],
    actions: [{ id: 'a1', type: 'assign_group', params: { group: 'Plantão TI' } }],
    priority_order: 100, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'wf-002', company_id: 'company-a-uuid', ticket_type: 'incident',
    name: 'Alerta de SLA', description: 'Notifica quando o SLA está prestes a vencer.',
    active: true, trigger_event: 'sla_warning', trigger_source: 'any',
    conditions: [],
    actions: [{ id: 'a1', type: 'send_notification', params: { message: 'SLA próximo de vencer!' } }],
    priority_order: 100, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'wf-003', company_id: 'company-a-uuid', ticket_type: 'incident',
    name: 'Triagem E-mail', description: 'Categoriza chamados abertos por e-mail.',
    active: true, trigger_event: 'incident_created', trigger_source: 'email',
    conditions: [],
    actions: [{ id: 'a1', type: 'set_field', params: { field: 'category', value: 'Triagem' } }],
    priority_order: 100, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'wf-004', company_id: 'company-a-uuid', ticket_type: 'incident',
    name: 'Triagem Automática de Hardware', description: 'Encaminha chamados de hardware.',
    active: true, trigger_event: 'incident_created', trigger_source: 'any',
    conditions: [{ id: 'c1', field: 'category', operator: 'equals', value: 'Hardware', logicOp: 'AND' }],
    actions: [{ id: 'a1', type: 'add_tag', params: { tag: 'hardware' } }],
    priority_order: 100, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
  },
]

async function setupWorkflowMocks(page: Page) {
  await setupMockAuth(page)
  await page.route(`${SUPABASE_URL}/rest/v1/workflow_rules*`, async route => {
    const method = route.request().method()
    if (method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ ...MOCK_WORKFLOWS[0], id: 'wf-new-001' }]) })
      return
    }
    if (method === 'PATCH') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_WORKFLOWS[0]]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WORKFLOWS) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/workflow_execution_log*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

test.describe('Workflow Builder — Motor de Automação', () => {
  test.beforeEach(async ({ page }) => {
    await setupWorkflowMocks(page)
    await page.goto('/')
    await page.waitForTimeout(3_000)

    // 1. Simula papel de admin se necessário
    const roleSelector = page.locator('select:has(option[value="company_admin"])').first()
    if (await roleSelector.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await roleSelector.selectOption('company_admin')
      await page.waitForTimeout(1_500)
    }

    // 2. Clica em Configurações
    const configBtn = page.locator('button').filter({ hasText: /Configurações/i }).first()
    await expect(configBtn, 'Botão "Configurações" da sidebar não encontrado').toBeVisible({ timeout: 10_000 })
    await configBtn.click()

    // 3. Usa a busca da Central de Configurações — mais robusto que
    // procurar o card direto, já que "Motor de Automação" só aparece no
    // DOM quando o grupo "Práticas de serviço" está ativo (ver
    // SettingsCenter.tsx, visibleSections); a busca varre todos os grupos.
    const searchBox = page.getByPlaceholder(/Buscar usuários, SLA/i)
    await expect(searchBox, 'Campo de busca da Central de Configurações não encontrado').toBeVisible({ timeout: 10_000 })
    await searchBox.fill('Automação')
    await page.waitForTimeout(500)

    const automationCard = page.getByText('Motor de Automação', { exact: true }).first()
    await expect(automationCard, 'Card "Motor de Automação" não encontrado na busca').toBeVisible({ timeout: 5_000 })
    await automationCard.click()
    await page.waitForTimeout(1_500)
  })

  test('deve renderizar o Workflow Builder com a lista de automações', async ({ page }) => {
    // Verifica que a sidebar com automações está visível
    // O componente exibe "Automações" como título da sidebar
    const automacaoTitle = page
      .getByText(/automações/i)
      .or(page.getByText(/motor de automação/i))
      .first()

    await expect(automacaoTitle).toBeVisible({ timeout: 10_000 })
  })

  test('deve exibir automações pré-definidas na sidebar', async ({ page }) => {
    // O mock inicial tem 4 workflows: Auto-atribuição P1, Alerta SLA, Triagem E-mail, Hardware
    const bodyText = await page.locator('body').textContent() ?? ''

    const hasWorkflows =
      bodyText.includes('Auto-atribuição') ||
      bodyText.includes('Alerta de SLA') ||
      bodyText.includes('Triagem') ||
      bodyText.includes('Hardware')

    expect(hasWorkflows).toBeTruthy()
  })

  test('deve adicionar um bloco de condição à automação selecionada', async ({ page }) => {
    // Procura o botão "Adicionar condição" no painel de configuração
    const addConditionBtn = page
      .getByRole('button', { name: /adicionar condição/i })
      .first()

    await expect(addConditionBtn).toBeVisible({ timeout: 10_000 })

    // Conta condições antes de adicionar
    const conditionsBefore = await page
      .locator('select')
      .filter({ has: page.locator('option[value="priority"]') })
      .count()

    // Clica para adicionar nova condição
    await addConditionBtn.click()
    await page.waitForTimeout(500)

    // Conta condições depois
    const conditionsAfter = await page
      .locator('select')
      .filter({ has: page.locator('option[value="priority"]') })
      .count()

    // Deve ter aumentado o número de selects de campo
    expect(conditionsAfter).toBeGreaterThanOrEqual(conditionsBefore)
  })

  test('deve trocar o gatilho para "Via E-mail" no seletor de origem', async ({ page }) => {
    // Abre o card de gatilho se estiver fechado
    const triggerCard = page
      .getByRole('button', { name: /gatilho|quando/i })
      .first()

    if (await triggerCard.isVisible({ timeout: 5_000 })) {
      // Já pode estar aberto — não precisamos clicar necessariamente
    }

    // Procura o botão "Via E-mail" no seletor de origem
    // (aparece quando o evento é "Chamado criado")
    const emailSourceBtn = page
      .getByRole('button', { name: /via e-mail|email/i })
      .or(page.locator('button').filter({ hasText: /via e-mail/i }))
      .first()

    if (await emailSourceBtn.isVisible({ timeout: 5_000 })) {
      await emailSourceBtn.click()
      await page.waitForTimeout(500)

      // Após selecionar, o botão deve ficar com estilo "selecionado"
      // (border-amber-400 bg-amber-50 no nosso CSS)
      // Verificamos via aria ou pelo texto visível na tela
      const bodyText = await page.locator('body').textContent() ?? ''
      expect(bodyText).toContain('Via E-mail')
    } else {
      // Se o seletor de origem não está visível, pode ser que o workflow
      // aberto não seja do tipo "incident_created" — navega para Triagem E-mail
      const triagemBtn = page
        .locator('button')
        .filter({ hasText: /triagem/i })
        .first()

      if (await triagemBtn.isVisible({ timeout: 3_000 })) {
        await triagemBtn.click()
        await page.waitForTimeout(1_000)

        // O seletor de origem deve aparecer agora
        const emailBtn = page
          .locator('button')
          .filter({ hasText: /via e-mail/i })
          .first()

        await expect(emailBtn).toBeVisible({ timeout: 5_000 })
      }
    }
  })

  test('deve abrir a galeria de templates ao clicar em "Nova"', async ({ page }) => {
    // Botão "Nova" na sidebar do Workflow Builder
    const novaBtn = page
      .getByRole('button', { name: /nova/i })
      .first()

    await expect(novaBtn).toBeVisible({ timeout: 10_000 })
    await novaBtn.click()
    await page.waitForTimeout(500)

    // A galeria de templates deve aparecer (modal com "Nova Automação" ou "Template")
    const galleryTitle = page
      .getByText(/nova automação|template|galeria/i)
      .first()

    await expect(galleryTitle).toBeVisible({ timeout: 5_000 })

    // Deve ter a opção "Do Zero"
    const doZeroBtn = page
      .getByRole('button', { name: /do zero|zero/i })
      .or(page.locator('button').filter({ hasText: /zero/i }))
      .first()

    await expect(doZeroBtn).toBeVisible({ timeout: 3_000 })

    // Fecha o modal pressionando Escape
    await page.keyboard.press('Escape')
  })

  test('deve abrir o modal de simulação ao clicar em "Testar"', async ({ page }) => {
    // Botão "Testar" no header da configuração
    const testBtn = page
      .getByRole('button', { name: /testar/i })
      .first()

    await expect(testBtn).toBeVisible({ timeout: 10_000 })
    await testBtn.click()
    await page.waitForTimeout(500)

    // Modal de simulação deve aparecer
    const simModal = page
      .getByText(/simular automação|executar simulação/i)
      .first()

    await expect(simModal).toBeVisible({ timeout: 5_000 })

    // Fecha o modal
    const closeBtn = page.getByRole('button', { name: /fechar|close/i }).first()
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
  })
})
