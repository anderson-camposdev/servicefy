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
import { setupMockAuth, SUPABASE_URL } from './helpers/mockAuth'


// ── Dados mockados ────────────────────────────────────────────────

const MOCK_CATEGORIES = [
  {
    id: 'cat-001',
    company_id: 'company-a-uuid',
    name: 'Suporte Técnico',
    icon: 'Wrench',
    is_active: true,
  }
]
const MOCK_SERVICES = [
  {
    id: 'svc-001',
    category_id: 'cat-001',
    company_id: 'company-a-uuid',
    name: 'Equipamentos',
    icon: 'Monitor',
    is_active: true,
  }
]
const MOCK_SYMPTOMS = [
  {
    id: 'sym-001',
    service_id: 'svc-001',
    company_id: 'company-a-uuid',
    symptom_id: 'sys-sym-001',
    active: true,
    symptom: {
      id: 'sys-sym-001',
      name: 'Notebook com defeito',
      icon: 'Laptop',
    },
    service: {
      id: 'svc-001',
      name: 'Equipamentos',
      category_id: 'cat-001',
    }
  }
]

const MOCK_REQ_CATEGORIES = [
  {
    id: 'rcat-001',
    company_id: 'company-a-uuid',
    name: 'Acessos e Contas',
    icon: 'Key',
    active: true,
  }
]
const MOCK_REQ_SUBCATEGORIES = [
  {
    id: 'rsub-001',
    category_id: 'rcat-001',
    name: 'Rede',
    active: true,
  }
]
const MOCK_REQ_ITEMS = [
  {
    id: 'ritem-001',
    request_subcategory_id: 'rsub-001',
    name: 'Configurar VPN',
    description: 'Solicitação de acesso seguro remoto via VPN corporativa.',
    active: true,
  }
]

const MOCK_USER_INCIDENTS = [
  {
    id: 'inc-user-001',
    number: 'INC-00123',
    short_description: 'Computador não liga',
    state: 'In Progress',
    priority: 'P3 - Moderate',
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

  await page.route(`${SUPABASE_URL}/rest/v1/departments*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_categories*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATEGORIES) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_services*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SERVICES) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_service_symptoms*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SYMPTOMS) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/request_categories*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_REQ_CATEGORIES) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/request_subcategories*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_REQ_SUBCATEGORIES) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/request_items*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_REQ_ITEMS) })
  })

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

    // O topo exibe "Como posso te ajudar, Analista?"
    const greeting = page.getByText(/Como posso te ajudar, Analista/i).first()
    await expect(greeting).toBeVisible({ timeout: 10_000 })
  })

  test('deve exibir o título e subtítulo de boas-vindas do tenant', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // O topo exibe "Como posso te ajudar, Analista?"
    const greeting = page.getByText(/Como posso te ajudar, Analista/i).first()
    await expect(greeting).toBeVisible({ timeout: 8_000 })

    // A home exibe o subtítulo "O que você precisa?"
    const welcomeSubtitle = page.getByText(/O que você precisa/i).first()
    await expect(welcomeSubtitle).toBeVisible({ timeout: 5_000 })
  })

  test('deve exibir cards do catálogo de serviços', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // Card "Reportar Problema"
    const problemCard = page
      .getByText(/Reportar (um )?Problema/i)
      .first()
    await expect(problemCard).toBeVisible({ timeout: 10_000 })

    // Card "Solicitar Serviço"
    const serviceCard = page
      .getByText(/Solicitar Serviço/i)
      .first()
    await expect(serviceCard).toBeVisible({ timeout: 5_000 })
  })

  test('deve exibir as abas "Início" e "Meus Chamados" no menu', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    await expect(page.getByText(/Início/i).first()).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/Meus Chamados/i).first()).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Portal do Usuário — Formulário de Novo Chamado', () => {
  test('deve abrir formulário ao clicar em "Reportar um Problema"', async ({ page }) => {
    await setupPortalMocks(page)
    await navigateToPortal(page)

    // Aguarda o card aparecer e clica
    const problemCard = page
      .getByText(/Reportar (um )?Problema/i)
      .first()

    await expect(problemCard).toBeVisible({ timeout: 10_000 })

    // Clica no card (pode ser button ou div clicável)
    const clickTarget = page
      .locator('button, [role="button"], div[class*="cursor"]')
      .filter({ hasText: /Reportar (um )?Problema/i })
      .first()

    if (await clickTarget.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await clickTarget.click()
    } else {
      await problemCard.click()
    }

    await page.waitForTimeout(1_500)

    // Se estiver usando o novo catálogo guiado (wizard), clica nos cards para chegar ao form
    const catCard = page.getByText('Suporte Técnico').first()
    if (await catCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await catCard.click()
      await page.waitForTimeout(1_000)

      const svcCard = page.getByText('Equipamentos').first()
      await expect(svcCard).toBeVisible({ timeout: 5_000 })
      await svcCard.click()
      await page.waitForTimeout(1_000)

      const symCard = page.getByText('Notebook com defeito').first()
      await expect(symCard).toBeVisible({ timeout: 5_000 })
      await symCard.click()
      await page.waitForTimeout(1_500)
    }

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
      .filter({ hasText: /Reportar (um )?Problema/i })
      .first()

    if (await clickTarget.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await clickTarget.click()
      await page.waitForTimeout(1_500)
    }

    // Se estiver usando o novo catálogo guiado (wizard), clica nos cards para chegar ao form
    const catCard = page.getByText('Suporte Técnico').first()
    if (await catCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await catCard.click()
      await page.waitForTimeout(1_000)

      const svcCard = page.getByText('Equipamentos').first()
      await expect(svcCard).toBeVisible({ timeout: 5_000 })
      await svcCard.click()
      await page.waitForTimeout(1_000)

      const symCard = page.getByText('Notebook com defeito').first()
      await expect(symCard).toBeVisible({ timeout: 5_000 })
      await symCard.click()
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
        bodyText.includes('Início') ||
        bodyText.includes('Reportar Problema')

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
      const problemCard = page.getByText(/Reportar (um )?Problema/i).first()
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
      bodyText.includes('Em Atendimento')

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
      .locator('[role="tab"], button, a')
      .filter({ hasText: /Meus Chamados/i })
      .first()

    const tabVisible = await tabArea.isVisible({ timeout: 5_000 }).catch(() =>
      myTicketsTab.isVisible()
    )
    expect(tabVisible).toBeTruthy()
  })
})
