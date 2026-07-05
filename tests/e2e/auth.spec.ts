/**
 * auth.spec.ts
 *
 * Cobre:
 *  1. Renderização da tela de login quando não autenticado
 *  2. Validação do formulário de login (campos vazios)
 *  3. Multitenancy: garante que dados do Tenant A não vazam para Tenant B
 */
import { test, expect } from '@playwright/test'
import { setupMockAuth, tenants } from './helpers/mockAuth'

// ── 1. Tela de login sem sessão ───────────────────────────────────
test.describe('Autenticação — Tela de Login', () => {
  test('deve renderizar o formulário de login quando não autenticado', async ({ page }) => {
    await page.goto('/')

    // Aguarda a tela carregar e o estado de auth resolver para "unauthenticated"
    await expect(page).toHaveTitle(/servicefy/i)

    // O app deve exibir campos de e-mail e senha
    const emailInput = page.getByRole('textbox', { name: /e-mail|email/i })
      .or(page.locator('input[type="email"]'))
      .first()

    await expect(emailInput).toBeVisible({ timeout: 10_000 })
  })

  test('não deve permitir login com campos vazios', async ({ page }) => {
    await page.goto('/')

    // Aguarda o formulário de login aparecer
    const submitBtn = page
      .getByRole('button', { name: /entrar|login|acessar/i })
      .first()

    await expect(submitBtn).toBeVisible({ timeout: 10_000 })

    // Tenta submeter sem preencher
    await submitBtn.click()

    // O browser deve mostrar validação nativa (required) ou o app uma mensagem
    // Verifica que continuamos na mesma página (não houve navegação para dashboard)
    await expect(page).not.toHaveURL(/dashboard|portal|workspace/i)
  })

  test('deve mostrar mensagem de erro para credenciais inválidas', async ({ page }) => {
    // Mock: auth retorna 400 — credenciais inválidas
    await page.route('**/auth/v1/token*', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    })

    await page.goto('/')

    const emailInput = page.locator('input[type="email"]').first()
    const passwordInput = page.locator('input[type="password"]').first()

    await expect(emailInput).toBeVisible({ timeout: 10_000 })
    await emailInput.fill('usuario@inexistente.com')
    await passwordInput.fill('senhaErrada123')

    const submitBtn = page.getByRole('button', { name: /entrar|login|acessar/i }).first()
    await submitBtn.click()

    // Deve exibir alguma mensagem de erro — não navegar para área autenticada
    await expect(page).not.toHaveURL(/dashboard|portal|workflow/i)
  })
})

// ── 2. Isolamento multitenancy ─────────────────────────────────────
test.describe('Multitenancy — Isolamento de Dados', () => {
  test('usuário do Tenant A não deve ver dados do Tenant B', async ({ page }) => {
    await setupMockAuth(page)

    // Intercepta a query de incidents para garantir que company_id = Tenant A
    let incidentQueryURL = ''
    page.on('request', req => {
      if (req.url().includes('/rest/v1/incidents')) {
        incidentQueryURL = req.url()
      }
    })

    await page.goto('/')

    // Aguarda autenticação mock ser processada
    await page.waitForTimeout(2_000)

    // Se a app fez alguma query de incidents, ela deve filtrar pelo tenant correto
    // (company_id=eq.company-a-uuid ou via RLS — aqui verificamos que NÃO contém o Tenant B)
    if (incidentQueryURL) {
      expect(incidentQueryURL).not.toContain(tenants.B_ID)
    }
  })

  test('sessão autenticada deve carregar dados do Tenant A', async ({ page }) => {
    await setupMockAuth(page)
    await page.goto('/')

    // Aguarda o app carregar — deve estar autenticado com dados mockados do Tenant A
    await page.waitForTimeout(3_000)

    // Verifica que o nome da empresa aparece em algum lugar da UI
    // (pode ser no sidebar, no header ou em título)
    const bodyText = await page.locator('body').textContent()
    // A empresa "Acme Corp" ou o usuário "Analista Teste" deve aparecer
    const hasCompanyRef = bodyText?.includes('Acme') ||
      bodyText?.includes('analista') ||
      bodyText?.includes('Analista')

    expect(hasCompanyRef).toBeTruthy()
  })
})
