import { expect, test, type Page } from '@playwright/test'
import { setupMockAuth, tenants } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'
const ADMIN_PROFILE = {
  id: 'profile-admin-uuid', auth_id: 'auth-test-user-id', name: 'Admin Teste',
  email: 'admin@acme.com', role: 'company_admin', company_id: tenants.A.id,
  active: true, avatar_url: null, department: 'TI', phone: null,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', company: tenants.A,
}

async function setup(page: Page) {
  await setupMockAuth(page)
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
    const accept = route.request().headers()['accept'] ?? ''
    await route.fulfill({ status: 200, contentType: accept.includes('object') ? 'application/vnd.pgrst.object+json' : 'application/json', body: accept.includes('object') ? JSON.stringify(ADMIN_PROFILE) : JSON.stringify([ADMIN_PROFILE]) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/company_module_entitlements*`, async route => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      ['core', 'esm', 'omnichannel', 'cmdb', 'compliance'].map(module_key => ({ module_key, enabled: true })),
    ) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/channel_connections*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

test('todas as opções licenciadas abrem uma configuração operacional real', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await page.waitForTimeout(3_000)
  const settings = page.locator('button, a').filter({ hasText: /Configurações/i }).first()
  if (await settings.isVisible({ timeout: 5_000 }).catch(() => false)) await settings.click()

  const modules = [
    ['Domínios de serviço', 'Domínios de serviço'],
    ['Macros e taxonomias', 'Macros de resposta'],
    ['Templates e notificações', 'Templates e notificações'],
    ['Itens de configuração', 'Itens de configuração'],
    ['LGPD e retenção', 'LGPD, retenção e segurança'],
    ['Módulos contratados', 'Módulos contratados e licenças'],
  ] as const

  for (const [cardTitle, screenTitle] of modules) {
    const card = page.locator('button, article').filter({ hasText: new RegExp(cardTitle, 'i') }).first()
    await expect(card).toBeVisible({ timeout: 8_000 })
    await card.click()
    await expect(page.getByRole('heading', { name: screenTitle, exact: true })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /Central de Configurações/i }).first().click()
  }
})
