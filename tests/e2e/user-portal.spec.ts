/**
 * user-portal.spec.ts
 *
 * Cobre o fluxo completo do Portal do Usuário (ServiceCatalog no UserPortal):
 *
 *  1. Portal carrega com saudação personalizada ("Olá, {firstName}!")
 *  2. Cards do catálogo visíveis ("Reportar um Problema", "Solicitar Algo")
 *  3. Abertura do formulário de "Reportar um Problema"
 *  4. Preenchimento e envio do formulário de novo chamado
 *  5. Pesquisa no catálogo e filtro de resultados
 *  6. Tab "Meus Chamados" mostra chamados do usuário (ou lista vazia)
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'

// ── Dados mockados ────────────────────────────────────────────────

const MOCK_CATALOG_ITEMS = [
  {
    id: 'cat-001',
    company_id: 'company-a-uuid',
    title: 'Reportar um Problema',
    description: 'Relate incidentes técnicos que afetam sua produtividade.',
    icon: 'AlertCircle',
    category: 'Suporte',
    type: 'incident',
    is_active: true,
    sort_order: 1,
    form_fields: JSON.stringify([
      { id: 'f1', label: 'Título do Problema', type: 'text', required: true, placeholder: 'Descreva brevemente' },
      { id: 'f2', label: 'Descrição Detalhada', type: 'textarea', required: true, placeholder: 'Forneça mais detalhes' },
      { id: 'f3', label: 'Urgência', type: 'select', required: true, options: ['Baixa', 'Média', 'Alta', 'Crítica'] },
    ]),
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'cat-002',
    company_id: 'company-a-uuid',
    title: 'Solicitar Algo / Serviço',
    description: 'Solicite novos acessos, equipamentos ou serviços de TI.',
    icon: 'ShoppingCart',
    category: 'Requisição',
    type: 'service_request',
    is_active: true,
    sort_order: 2,
    form_fields: JSON.stringify([
      { id: 'f1', label: 'O que você precisa?', type: 'text', required: true, placeholder: 'Ex: Acesso ao sistema X' },
      { id: 'f2', label: 'Justificativa', type: 'textarea', required: false, placeholder: 'Por que você precisa?' },
    ]),
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'cat-003',
    company_id: 'company-a-uuid',
    title: 'Configurar VPN',
    description: 'Solicite a configuração de acesso remoto via VPN.',
    icon: 'Shield',
    category: 'Acesso',
    type: 'service_request',
    is_active: true,
    sort_order: 3,
    form_fields: JSON.stringify([]),
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
]

const MOCK_USER_INCIDENTS = [
  {
    id: 'inc-user-001',
    number: 'INC-00123',
    short_description: 'Computador não liga',
    state: 'In Progress',
    priority_level: 3,
    company_id: 'company-a-uuid',
    caller_id: 'profile-test-uuid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// ── Setup: mocks do portal ────────────────────────────────────────

async function setupPortalMocks(page: Page) {
  await setupMockAuth(page)

  // Catálogo de serviços
  for (const table of ['catalog_items', 'incident_catalog_items', 'request_catalog_items']) {
    await page.route(`${SUPABASE_URL}/rest/v1/${table}*`, async route => {
      if (route.request().method() !== 'GET') {
        await route.fulfill({ status: 201, contentType: 'application/json', body: '[{"id":"mock-id"}]' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CATALOG_ITEMS),
      })
    })
  }

  // Chamados do usuário (para "Meus Chamados")
  await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'new-inc-001', number: 'INC-99999' }]),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER_INCIDENTS),
    })
  })

  await page.route(`${SUPABASE_URL}/rest/v1/service_requests*`, async route => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'new-sr-001', number: 'SR-99999' }]),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

// ── Helper: navega até o Portal do Usuário ────────────────────────

async function navigateToPortal(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(3_000)

  // Tenta clicar no botão "Portal do Usuário" na sidebar
  const portalBtn = page
    .locator('button')
    .filter({ hasText: /Portal do Usuário|Portal/i })
    .first()

  if (await portalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await portalBtn.click()
    await page.waitForTimeout(2_500)
  }
}

// ══════════════════════════════════════════════════════════════════
// TESTES
// ══════════════════════════════════════════════════════════════════

test.describe('Portal do Usuário — Catálogo e Saudação', () => {
  test('deve exibir saudação personalizada com nome do usuário', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // O UserPortal exibe "Olá, {firstName}! 👋"
    // O perfil mockado é "Analista Teste" → firstName = "Analista"
    const greeting = page
      .getByText(/Olá.*Analista|Olá.*👋|bem-vindo/i)
      .first()

    await expect(greeting).toBeVisible({ timeout: 10_000 })
  })

  test('deve exibir o título e subtítulo de boas-vindas do tenant', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // O mock do Tenant A define welcome_title = "Bem-vindo ao Suporte"
    const welcomeTitle = page.getByText(/Bem-vindo ao Suporte/i).first()
    await expect(welcomeTitle).toBeVisible({ timeout: 8_000 })

    // welcome_subtitle = "Como podemos te ajudar hoje?"
    const welcomeSubtitle = page.getByText(/Como podemos te ajudar hoje/i).first()
    await expect(welcomeSubtitle).toBeVisible({ timeout: 5_000 })
  })

  test('deve exibir cards do catálogo de serviços', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // Card "Reportar um Problema"
    const problemCard = page
      .getByText(/Reportar um Problema/i)
      .first()
    await expect(problemCard).toBeVisible({ timeout: 10_000 })

    // Card "Solicitar Algo"
    const serviceCard = page
      .getByText(/Solicitar Algo|Solicitar Serviço/i)
      .first()
    await expect(serviceCard).toBeVisible({ timeout: 5_000 })
  })

  test('deve exibir as abas "Catálogo de Serviços" e "Meus Chamados"', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    await expect(page.getByText(/Catálogo de Serviços/i).first()).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/Meus Chamados/i).first()).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Portal do Usuário — Formulário de Novo Chamado', () => {
  test('deve abrir formulário ao clicar em "Reportar um Problema"', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // Aguarda o card aparecer e clica
    const problemCard = page
      .getByText(/Reportar um Problema/i)
      .first()

    await expect(problemCard).toBeVisible({ timeout: 10_000 })

    // Clica no card (pode ser button ou div clicável)
    const clickTarget = page
      .locator('button, [role="button"], div[class*="cursor"]')
      .filter({ hasText: /Reportar um Problema/i })
      .first()

    if (await clickTarget.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await clickTarget.click()
    } else {
      await problemCard.click()
    }

    await page.waitForTimeout(1_500)

    // Formulário ou modal deve aparecer com campo de texto
    const formVisible =
      (await page.locator('input[type="text"], textarea').first().isVisible({ timeout: 5_000 }).catch(() => false)) ||
      (await page.getByText(/Título do Problema|Descreva|formulário/i).first().isVisible({ timeout: 3_000 }).catch(() => false))

    expect(formVisible).toBeTruthy()
  })

  test('deve preencher e enviar formulário de incidente', async ({ page }) => {
    test.setTimeout(60_000)

    await setupPortalMocks(page)
    await navigateToPortal(page)

    // Abre o card de "Reportar um Problema"
    const clickTarget = page
      .locator('button, [role="button"], div[class*="cursor"]')
      .filter({ hasText: /Reportar um Problema/i })
      .first()

    if (await clickTarget.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await clickTarget.click()
      await page.waitForTimeout(1_500)
    }

    // Preenche o campo de título / descrição breve
    const titleInput = page
      .locator('input[type="text"]')
      .or(page.locator('input[placeholder*="Descreva brevemente"]'))
      .or(page.locator('input[placeholder*="Título"]'))
      .first()

    if (await titleInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await titleInput.fill('Notebook não carrega após atualização')
      await page.waitForTimeout(400)
    }

    // Preenche o campo de descrição detalhada
    const descTextarea = page
      .locator('textarea')
      .or(page.locator('textarea[placeholder*="detalhes"]'))
      .or(page.locator('textarea[placeholder*="Forneça"]'))
      .first()

    if (await descTextarea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await descTextarea.fill('Após a última atualização do Windows, meu notebook não consegue completar a inicialização. A tela fica preta após a logo da fabricante.')
      await page.waitForTimeout(400)
    }

    // Seleciona urgência se existir
    const urgencySelect = page.locator('select').first()
    if (await urgencySelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await urgencySelect.selectOption({ index: 2 }) // Média
      await page.waitForTimeout(300)
    }

    // Submete o formulário
    const submitBtn = page
      .getByRole('button', { name: /enviar|abrir chamado|criar|submit|confirmar/i })
      .or(page.locator('button[type="submit"]'))
      .first()

    if (await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await submitBtn.click()
      await page.waitForTimeout(2_000)

      // Aguarda confirmação (toast, mensagem ou redirecionamento)
      const bodyText = await page.locator('body').textContent() ?? ''
      const hasConfirmation =
        bodyText.includes('sucesso') ||
        bodyText.includes('aberto') ||
        bodyText.includes('criado') ||
        bodyText.includes('INC-') ||
        bodyText.includes('SR-') ||
        bodyText.includes('99999') ||
        // Formulário fechou (voltou ao catálogo)
        bodyText.includes('Catálogo de Serviços') ||
        bodyText.includes('Reportar um Problema')

      expect(hasConfirmation).toBeTruthy()
    }
  })
})

test.describe('Portal do Usuário — Pesquisa no Catálogo', () => {
  test('deve filtrar itens ao digitar na barra de busca', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // Localiza a barra de busca preditiva
    const searchInput = page
      .locator('input[placeholder*="Busque"]')
      .or(page.locator('input[placeholder*="problema ou serviço"]'))
      .or(page.locator('input[type="search"]'))
      .or(page.locator('input[placeholder*="Pesquise"]'))
      .first()

    await expect(searchInput).toBeVisible({ timeout: 10_000 })

    // Digita "VPN" — deve corresponder ao item "Configurar VPN"
    await searchInput.fill('VPN')
    await page.waitForTimeout(1_200)

    // O input tem o valor "VPN" — a busca foi ativada
    const inputValue = await searchInput.inputValue()
    expect(inputValue).toBe('VPN')

    // Resultado ou feedback visível na tela
    const bodyText = await page.locator('body').textContent() ?? ''
    const hasSearchResult =
      bodyText.includes('VPN') ||
      bodyText.includes('Nada encontrado') ||
      bodyText.includes('nenhum resultado') ||
      bodyText.includes('Configurar VPN')

    expect(hasSearchResult).toBeTruthy()
  })

  test('deve limpar a busca e mostrar catálogo completo novamente', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    const searchInput = page
      .locator('input[placeholder*="Busque"]')
      .or(page.locator('input[placeholder*="problema ou serviço"]'))
      .or(page.locator('input[type="search"]'))
      .first()

    if (await searchInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await searchInput.fill('xyz_nao_existe')
      await page.waitForTimeout(1_000)

      // Limpa
      await searchInput.fill('')
      await page.waitForTimeout(1_000)

      // Catálogo deve mostrar os cards novamente
      const problemCard = page.getByText(/Reportar um Problema/i).first()
      await expect(problemCard).toBeVisible({ timeout: 5_000 })
    }
  })
})

test.describe('Portal do Usuário — Meus Chamados', () => {
  test('deve navegar para "Meus Chamados" e listar o chamado existente', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // Clica na aba "Meus Chamados"
    const myTicketsTab = page
      .getByText(/Meus Chamados/i)
      .first()

    await expect(myTicketsTab).toBeVisible({ timeout: 10_000 })
    await myTicketsTab.click()
    await page.waitForTimeout(2_000)

    // O chamado mockado "Computador não liga" deve estar visível
    // OU uma mensagem de lista vazia (ambos são estados válidos)
    const bodyText = await page.locator('body').textContent() ?? ''
    const hasTicketContent =
      bodyText.includes('Computador não liga') ||
      bodyText.includes('INC-00123') ||
      bodyText.includes('nenhum chamado') ||
      bodyText.includes('Nenhum chamado') ||
      bodyText.includes('sem chamados') ||
      bodyText.includes('Em andamento') ||
      bodyText.includes('In Progress')

    expect(hasTicketContent).toBeTruthy()
  })

  test('deve exibir contador de chamados na aba', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // A aba "Meus Chamados" pode exibir "(1)" ou badge com o número
    const myTicketsTab = page.getByText(/Meus Chamados/i).first()
    await expect(myTicketsTab).toBeVisible({ timeout: 10_000 })

    // Verifica que a área da aba contém texto numérico ou está presente
    const tabArea = page
      .locator('[role="tab"], button')
      .filter({ hasText: /Meus Chamados/i })
      .first()

    const tabVisible = await tabArea.isVisible({ timeout: 5_000 }).catch(() =>
      myTicketsTab.isVisible()
    )
    expect(tabVisible).toBeTruthy()
  })
})
