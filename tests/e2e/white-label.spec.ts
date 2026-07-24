import { expect, test, type Page, type Route } from '@playwright/test'
import { setupMockAuth, tenants, SUPABASE_URL } from './helpers/mockAuth'

// PNG sólido 256×96 (acima do mínimo exigido pela validação de
// resolução do upload de logo, 240×80 — um PNG 1×1 trivial passou a ser
// rejeitado com "Logotipo com baixa resolução" quando essa validação foi
// adicionada ao produto, e o fixture de teste nunca foi atualizado).
const VALID_LOGO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAABgCAIAAAB9kzvfAAABHElEQVR4nO3TMQ0AMAzAsEIY5cEau8HoEUsGkCdz3oWsWS+ARQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQNoHe0DHNqOMP/EAAAAASUVORK5CYII=',
  'base64',
)

async function fulfillCompany(route: Route, company: Record<string, unknown>) {
  const objectResponse = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object+json')
  await route.fulfill({
    status: 200,
    contentType: objectResponse ? 'application/vnd.pgrst.object+json' : 'application/json',
    body: JSON.stringify(objectResponse ? company : [company]),
  })
}

async function setupBrandingAdmin(page: Page) {
  await setupMockAuth(page)

  let company: Record<string, unknown> = { ...tenants.A, background_url: null }
  const profile = () => ({
    id: 'profile-admin-uuid',
    auth_id: 'auth-test-user-id',
    name: 'Admin Teste',
    email: 'admin@acme.com',
    role: 'company_admin',
    company_id: tenants.A.id,
    active: true,
    avatar_url: null,
    department: 'TI',
    phone: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    company,
  })

  await page.route(`${SUPABASE_URL}/rest/v1/companies*`, route => fulfillCompany(route, company))
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
    const objectResponse = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object+json')
    await route.fulfill({
      status: 200,
      contentType: objectResponse ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: JSON.stringify(objectResponse ? profile() : [profile()]),
    })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/company_module_entitlements*`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(['core', 'esm', 'omnichannel', 'cmdb', 'compliance'].map(module_key => ({ module_key, enabled: true }))),
  }))
  await page.route(`${SUPABASE_URL}/rest/v1/channel_connections*`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))

  await page.route(`${SUPABASE_URL}/storage/v1/object/**`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'image/png', body: VALID_LOGO_PNG })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"brands/company-a-uuid/logo"}' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/update_company_branding`, async route => {
    const payload = route.request().postDataJSON() as { p_settings: Record<string, unknown> }
    company = { ...company, ...payload.p_settings }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(company) })
  })

  return { getCompany: () => company }
}

test('admin salva logo e tema e a marca persiste sem recarregar a SPA', async ({ page }) => {
  const state = await setupBrandingAdmin(page)
  await page.goto('/')

  await page.getByRole('button', { name: /Configurações/i }).first().click()

  // "Identidade e portal" fica no grupo "Experiência e conhecimento"
  // (category portal_brand) — não é o grupo padrão ('access') ao abrir
  // Configurações. A busca da Central varre todos os grupos (ver
  // SettingsCenter.tsx, visibleSections).
  const searchBox = page.getByPlaceholder(/Buscar usuários, SLA/i)
  await expect(searchBox, 'Campo de busca da Central de Configurações não encontrado').toBeVisible({ timeout: 10_000 })
  await searchBox.fill('Identidade e portal')
  await page.waitForTimeout(500)

  await page.getByRole('button').filter({ hasText: /Identidade e portal/i }).first().click()
  await expect(page.getByRole('heading', { name: /Identidade visual e portal/i })).toBeVisible()

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: VALID_LOGO_PNG,
  })
  await expect(page.getByText('Logotipo enviado com sucesso!')).toBeVisible()
  await page.getByRole('button', { name: 'Emerald Green' }).click()
  await page.getByLabel('Nome da Marca').fill('Acme White Label')
  await page.getByRole('button', { name: /Salvar Configurações/i }).click()

  await expect.poll(() => state.getCompany().primary_color).toBe('Emerald')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--brand-primary'))).toBe('#059669')
  await expect(page.getByText('Acme White Label').first()).toBeVisible()
  expect(String(state.getCompany().logo_url)).toContain('/branding_assets/brands/company-a-uuid/logo?v=')

  await page.reload()
  await expect(page.getByText('Acme White Label').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--brand-primary'))).toBe('#059669')
})
