/**
 * smoke.spec.ts
 *
 * Teste Smoke (E2E) para o Portal do Usuário do ServiceFY ITSM.
 * Valida a carga inicial do Portal e o fluxo completo de criação de um ticket via catálogo.
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'

// Mocks estruturados para o fluxo do catálogo de incidentes (3 níveis: Categoria -> Serviço -> Sintoma)
const MOCK_DEPARTMENTS = [] // Vazio pula a seleção inicial de departamentos

const MOCK_CATEGORIES = [
  {
    id: 'cat-smoke-1',
    company_id: 'company-a-uuid',
    name: 'Sistemas Corporativos',
    description: 'Problemas de acesso e erros em sistemas.',
    icon: 'Monitor',
    is_active: true,
    sort_order: 1,
  }
]

const MOCK_SERVICES = [
  {
    id: 'svc-smoke-1',
    category_id: 'cat-smoke-1',
    company_id: 'company-a-uuid',
    name: 'ERP ServiceFY',
    description: 'Incidentes relacionados ao ERP corporativo.',
    icon: 'Cpu',
    is_active: true,
    sort_order: 1,
  }
]

const MOCK_SYMPTOMS = [
  {
    id: 'sym-smoke-1',
    service_id: 'svc-smoke-1',
    company_id: 'company-a-uuid',
    symptom_id: 'sys-sym-smoke-1',
    sla_hours: 4,
    is_active: true,
    symptom: {
      id: 'sys-sym-smoke-1',
      name: 'Erro de Autenticação/Login',
      icon: 'AlertTriangle',
    },
    service: {
      id: 'svc-smoke-1',
      name: 'ERP ServiceFY',
      category_id: 'cat-smoke-1',
      icon: 'Cpu',
    }
  }
]

async function setupSmokeMocks(page: Page) {
  // 1. Inicializa autenticação mockada central
  await setupMockAuth(page)

  // 2. Intercepta requisições REST das tabelas do catálogo de serviços
  await page.route(`${SUPABASE_URL}/rest/v1/departments*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEPARTMENTS) })
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

  // 3. Intercepta criação de chamados (POST/GET incidents)
  await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
    if (route.request().method() === 'POST') {
      const singleInc = {
        id: 'new-inc-smoke-001',
        number: 'INC-SMOKE-99',
        priority: 'P3 - Moderate',
        created_at: new Date().toISOString(),
        sla_deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      }
      const accept = route.request().headers()['accept'] ?? ''
      if (accept.includes('vnd.pgrst.object+json')) {
        await route.fulfill({
          status: 201,
          contentType: 'application/vnd.pgrst.object+json',
          body: JSON.stringify(singleInc),
        })
      } else {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([singleInc]),
        })
      }
      return
    }
    // GET
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/company_module_entitlements*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(`${SUPABASE_URL}/rest/v1/channel_connections*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
}

async function navigateToPortal(page: Page) {
  // Navega para a raiz
  await page.goto('/')
  await page.waitForTimeout(3_000)

  // Clica no botão "Portal do Usuário" na sidebar
  const portalBtn = page
    .locator('button')
    .filter({ hasText: /Portal do Usuário|Portal/i })
    .first()

  if (await portalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await portalBtn.click()
    await page.waitForTimeout(2_500)
  }
}

test.describe('ServiceFY ITSM — Smoke Test E2E', () => {
  test('Deve carregar o Portal do Usuário e criar um chamado via formulário', async ({ page }) => {
    test.setTimeout(60_000)

    // Logs de erro do navegador
    page.on('pageerror', err => console.log('BROWSER_PAGE_ERROR:', err.message))
    page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER_CONSOLE_ERROR:', msg.text()) })

    // O mock de auth intercepta rotas chave (já vimos no setupSmokeMocks)
    await setupSmokeMocks(page)

    // Navega para o portal configurando o state adequado
    await navigateToPortal(page)
    // Limpa toasts residuais
    await page.evaluate(() => {
      document.querySelectorAll('.toast').forEach(t => t.remove())
    })

    // 1. Valida carga da página inicial do portal (saudação ao analista)
    const greeting = page.getByText(/Olá.*Analista|Olá.*👋/i).first()
    const currentGreeting = page.getByText(/Como posso te ajudar.*Analista/i).first().or(greeting)
    await expect(currentGreeting).toBeVisible({ timeout: 15_000 })

    // 2. Valida visibilidade dos cards de entrada do catálogo
    const problemCard = page.getByText(/Reportar (um )?Problema/i).first()
    await expect(problemCard).toBeVisible({ timeout: 10_000 })

    // Clica no card para entrar na jornada de Incidentes
    await problemCard.click()
    await page.waitForTimeout(1_000)

    // 3. Nível 1: Clica na categoria "Sistemas Corporativos"
    const catCard = page.getByText(/Sistemas Corporativos/i).first()
    await expect(catCard).toBeVisible({ timeout: 5_000 })
    await catCard.click()
    await page.waitForTimeout(1_000)
    await expect(page.getByRole('heading', { name: /Qual servi.o foi afetado/i })).toBeVisible()

    // 4. Nível 2: Clica no serviço "ERP ServiceFY"
    const svcCard = page.getByText(/ERP ServiceFY/i).first()
    await expect(svcCard).toBeVisible({ timeout: 5_000 })
    await svcCard.click()
    await page.waitForTimeout(1_000)
    await expect(page.getByRole('heading', { name: /O que est. acontecendo/i })).toBeVisible()

    // 5. Nível 3: Clica no sintoma "Erro de Autenticação/Login"
    const symCard = page.getByText(/Erro de Autenticação\/Login/i).first()
    await expect(symCard).toBeVisible({ timeout: 5_000 })
    await symCard.click()
    await page.waitForTimeout(1_500)

    // 6. Preenche o formulário
    const detailsTextarea = page
      .locator('textarea')
      .or(page.locator('textarea[placeholder*="Descreva"]'))
      .first()
    await expect(detailsTextarea).toBeVisible({ timeout: 5_000 })
    await detailsTextarea.fill('Smoke test: Erro 500 ao tentar efetuar login no ERP corporativo.')

    // 7. Envia o chamado
    const submitBtn = page
      .getByRole('button', { name: /Abrir Incidente/i })
      .or(page.locator('button[type="submit"]'))
      .first()
    await expect(submitBtn).toBeVisible({ timeout: 5_000 })
    await submitBtn.click()
    await page.waitForTimeout(2_500)

    // 8. Valida exibição da tela de sucesso/confirmação
    const bodyText = await page.locator('body').textContent() ?? ''
    const hasConfirmation =
      bodyText.includes('Ir para Meus Chamados') ||
      bodyText.includes('Voltar ao Catálogo') ||
      bodyText.includes('Protocol Active') ||
      bodyText.includes('Ref ID:')

    expect(hasConfirmation).toBeTruthy()
  })
  test('Configurações aparecem somente para administradores', async ({ page }) => {
    await setupSmokeMocks(page)
    await page.goto('/')
    await page.waitForTimeout(3_000)

    await expect(page.getByRole('button', { name: 'Configurações' })).toHaveCount(0)

    const roleSelector = page.locator('select:has(option[value="company_admin"])').first()
    await expect(roleSelector).toBeVisible()
    await roleSelector.selectOption('company_admin')

    await expect(page.getByRole('heading', { name: 'Central de Configurações' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Configurações' })).toBeVisible()

    await roleSelector.selectOption('cio')
    await expect(page.getByRole('button', { name: 'Configurações' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Central de Configurações' })).toHaveCount(0)
  })

})
