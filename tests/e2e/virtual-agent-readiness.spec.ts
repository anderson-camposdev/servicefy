import { expect, test, type Page } from '@playwright/test'
import { setupMockAuth, tenants } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'

const ADMIN_PROFILE = {
  id: 'profile-admin-uuid', auth_id: 'auth-test-user-id', name: 'Admin Teste',
  email: 'admin@acme.com', role: 'company_admin', company_id: tenants.A.id,
  active: true, avatar_url: null, department: 'TI', phone: null,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
  company: tenants.A,
}

const CHECKS = [
  ['staff', 'Equipe técnica ativa'],
  ['groups', 'Filas com membros'],
  ['incident_catalog', 'Rotas de incidente'],
  ['request_catalog', 'Rotas de solicitação'],
  ['approvals', 'Aprovação governada'],
  ['sla', 'SLA P1–P5 e calendário'],
  ['pending', 'Motivos de pausa'],
  ['virtual_agent', 'Agente: abrir, consultar e transferir'],
].map(([key, label]) => ({ key, label, ready: true, details: 'configurado' }))

async function setupReadinessMocks(page: Page) {
  await setupMockAuth(page)
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
    const accept = route.request().headers()['accept'] ?? ''
    await route.fulfill({
      status: 200,
      contentType: accept.includes('object') ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: accept.includes('object') ? JSON.stringify(ADMIN_PROFILE) : JSON.stringify([ADMIN_PROFILE]),
    })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/company_module_entitlements*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { module_key: 'core', enabled: true }, { module_key: 'virtual_agent', enabled: true },
    ]) })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/channel_connections*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/virtual_agent_actions*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/virtual_agent_executions*`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/itsm_service_desk_readiness`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      companyId: tenants.A.id, companyName: 'Allied IT', ready: true,
      checks: CHECKS, checkedAt: new Date().toISOString(),
    }) })
  })
}

test('admin vê prontidão ITSM e abre o console real do agente', async ({ page }) => {
  await setupReadinessMocks(page)
  await page.goto('/')
  await page.waitForTimeout(3_000)

  const settings = page.locator('button, a').filter({ hasText: /Configurações/i }).first()
  if (await settings.isVisible({ timeout: 5_000 }).catch(() => false)) await settings.click()

  const card = page.locator('button, article').filter({ hasText: /Agente virtual/i }).first()
  await expect(card).toBeVisible({ timeout: 10_000 })
  await card.click()

  await expect(page.getByText(/Prontidão do Service Desk · Allied IT/i)).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('PRONTO', { exact: true })).toBeVisible()
  for (const check of CHECKS) await expect(page.getByText(check.label, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Testar conversa/i }).click()
  await expect(page.getByText(/O que você precisa hoje/i)).toBeVisible({ timeout: 8_000 })
})
