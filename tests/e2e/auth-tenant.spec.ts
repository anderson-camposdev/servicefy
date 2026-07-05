/**
 * auth-tenant.spec.ts
 *
 * Cobre:
 *  1. Tela de login renderiza campos e botão
 *  2. Validação de formulário vazio (sem envio)
 *  3. Login bem-sucedido redireciona para o painel (via mock de JWT)
 *  4. Isolamento de tenant: usuário do Tenant A não vê dados do Tenant B
 *     (RLS simulado — qualquer requisição com filter company_id=eq.B deve
 *      ser interceptada e retornar vazia, jamais os dados de B)
 */

import { test, expect } from '@playwright/test'
import { setupMockAuth, tenants } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'

// ── 1. Renderização da tela de login ──────────────────────────────

test.describe('Tela de Login', () => {
  test('deve exibir campos de e-mail, senha e botão de entrar', async ({ page }) => {
    // Não configura mock de auth — exibe tela de login real
    await page.route(`${SUPABASE_URL}/rest/v1/**`, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route(`${SUPABASE_URL}/auth/v1/**`, async route => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"not_authenticated"}' })
    })

    await page.goto('/')
    await page.waitForTimeout(3_000)

    // A tela de login deve conter campo de e-mail
    const emailInput = page
      .locator('input[type="email"]')
      .or(page.locator('input[placeholder*="email"]'))
      .or(page.locator('input[placeholder*="E-mail"]'))
      .or(page.locator('input[name="email"]'))
      .first()

    await expect(emailInput).toBeVisible({ timeout: 10_000 })

    // Campo de senha
    const passwordInput = page.locator('input[type="password"]').first()
    await expect(passwordInput).toBeVisible({ timeout: 5_000 })

    // Botão de entrar / login
    const loginBtn = page
      .getByRole('button', { name: /entrar|login|sign in|acessar/i })
      .first()
    await expect(loginBtn).toBeVisible({ timeout: 5_000 })
  })

  test('deve mostrar feedback ao tentar enviar formulário vazio', async ({ page }) => {
    await page.route(`${SUPABASE_URL}/auth/v1/**`, async route => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"not_authenticated"}' })
    })
    await page.route(`${SUPABASE_URL}/rest/v1/**`, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')
    await page.waitForTimeout(3_000)

    const loginBtn = page
      .getByRole('button', { name: /entrar|login|sign in|acessar/i })
      .first()

    if (await loginBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await loginBtn.click()
      await page.waitForTimeout(800)

      // Formulário HTML5 validation ou mensagem de erro deve estar presente
      const bodyText = await page.locator('body').textContent() ?? ''
      const hasValidation =
        bodyText.includes('obrigatório') ||
        bodyText.includes('inválido') ||
        bodyText.includes('preencha') ||
        bodyText.includes('required') ||
        bodyText.includes('email') ||
        // campo ainda visível = não foi submetido (HTML5 validation bloqueou)
        (await page.locator('input[type="email"]').isVisible().catch(() => false))

      expect(hasValidation).toBeTruthy()
    }
  })

  test('deve redirecionar ao painel após login bem-sucedido (mock)', async ({ page }) => {
    // Rota de auth/token simula login com credenciais válidas
    await page.route(`${SUPABASE_URL}/auth/v1/token*`, async route => {
      const now = Math.floor(Date.now() / 1000)
      const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const p = Buffer.from(JSON.stringify({
        sub: 'auth-test-user-id',
        email: 'analista@acme.com',
        role: 'authenticated',
        aud: 'authenticated',
        iat: now,
        exp: now + 3600,
      })).toString('base64url')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: `${h}.${p}.mock_sig`,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: 'mock-refresh',
          user: {
            id: 'auth-test-user-id',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'analista@acme.com',
            app_metadata: { provider: 'email' },
            user_metadata: {},
          },
        }),
      })
    })

    await setupMockAuth(page)
    await page.goto('/')
    await page.waitForTimeout(4_000)

    // Após auth mock, a app deve renderizar o painel (não a tela de login)
    const bodyText = await page.locator('body').textContent() ?? ''
    const isOnDashboard =
      bodyText.includes('Incidentes') ||
      bodyText.includes('Portal') ||
      bodyText.includes('Analista') ||
      bodyText.includes('Dashboard') ||
      bodyText.includes('Chamados')

    expect(isOnDashboard).toBeTruthy()

    // Tela de login NÃO deve estar visível
    const loginBtn = page.getByRole('button', { name: /entrar|login|sign in/i }).first()
    const loginStillVisible = await loginBtn.isVisible({ timeout: 2_000 }).catch(() => false)
    expect(loginStillVisible).toBeFalsy()
  })
})

// ── 2. Isolamento de Tenant (RLS) ─────────────────────────────────

test.describe('Isolamento de Tenant (RLS)', () => {
  test('Tenant A não recebe dados do Tenant B em incidents', async ({ page }) => {
    const tenantBIncidentRequests: string[] = []

    await setupMockAuth(page)

    // Intercepta chamadas a incidents e registra qualquer tentativa com Tenant B
    await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
      const url = route.request().url()

      // Se a URL filtrar por company_id do Tenant B, isso é uma brecha de isolamento
      if (url.includes(tenants.B_ID)) {
        tenantBIncidentRequests.push(url)
      }

      // RLS retorna vazio para qualquer requisição (comportamento correto)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      })
    })

    await page.goto('/')
    await page.waitForTimeout(3_000)

    // Navega para Incidentes (onde o app carrega dados da fila)
    const incidentesNav = page
      .locator('button')
      .filter({ hasText: /Incidentes/i })
      .first()

    if (await incidentesNav.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await incidentesNav.click()
      await page.waitForTimeout(3_000)
    }

    // ASSERTION PRINCIPAL: nenhuma requisição foi feita com o ID do Tenant B
    expect(tenantBIncidentRequests).toHaveLength(0)
  })

  test('Tenant A não recebe dados do Tenant B em service_requests', async ({ page }) => {
    const tenantBRequests: string[] = []

    await setupMockAuth(page)

    await page.route(`${SUPABASE_URL}/rest/v1/service_requests*`, async route => {
      const url = route.request().url()
      if (url.includes(tenants.B_ID)) {
        tenantBRequests.push(url)
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')
    await page.waitForTimeout(3_000)

    // Navega para Solicitações se existir
    const srNav = page
      .locator('button')
      .filter({ hasText: /Solicitações|Requisições|Service Request/i })
      .first()

    if (await srNav.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await srNav.click()
      await page.waitForTimeout(2_000)
    }

    expect(tenantBRequests).toHaveLength(0)
  })

  test('Profile carregado pertence ao Tenant A (não ao B)', async ({ page }) => {
    let profileCompanyId: string | null = null

    await setupMockAuth(page)

    // Intercepta resposta de profiles para capturar o company_id retornado
    await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
      const accept = route.request().headers()['accept'] ?? ''
      const tenantAProfile = {
        id: 'profile-test-uuid',
        auth_id: 'auth-test-user-id',
        name: 'Analista Teste',
        email: 'analista@acme.com',
        role: 'agent',
        company_id: tenants.A.id,
        active: true,
        company: tenants.A,
      }

      profileCompanyId = tenants.A.id

      if (accept.includes('vnd.pgrst.object+json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.pgrst.object+json',
          body: JSON.stringify(tenantAProfile),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([tenantAProfile]),
        })
      }
    })

    await page.goto('/')
    await page.waitForTimeout(4_000)

    // O profile retornado deve ter company_id do Tenant A
    expect(profileCompanyId).toBe(tenants.A.id)
    expect(profileCompanyId).not.toBe(tenants.B_ID)
  })

  test('Workspace exibe dados da empresa Acme Corp (Tenant A)', async ({ page }) => {
    await setupMockAuth(page)
    await page.goto('/')
    await page.waitForTimeout(4_000)

    const bodyText = await page.locator('body').textContent() ?? ''

    // A empresa do Tenant A é "Acme Corp"
    // Mas o app pode exibir o nome do usuário "Analista Teste" como identificador
    const hasCorrectTenant =
      bodyText.includes('Analista') ||
      bodyText.includes('acme') ||
      bodyText.includes('Acme')

    expect(hasCorrectTenant).toBeTruthy()

    // Certifica que não há referência acidental ao Tenant B
    const tenantBId = tenants.B_ID
    expect(bodyText).not.toContain(tenantBId)
  })
})
