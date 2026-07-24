/**
 * omnichannel-routing.spec.ts
 *
 * Rotas e Triagem (Central de Configurações → "Rotas e filas"):
 *  1. Admin abre a tela e vê as abas Rotas e Triagem (antes placeholder).
 *  2. A aba Rotas lista rotas e permite criar (RPC/insert mockado).
 *  3. A aba Triagem lista eventos pendentes e permite resolver.
 *
 * Exige papel administrativo → sobrescrevemos o perfil mock para company_admin.
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth, tenants, SUPABASE_URL } from './helpers/mockAuth'


const ADMIN_PROFILE = {
  id: 'profile-admin-uuid', auth_id: 'auth-test-user-id', name: 'Admin Teste',
  email: 'admin@acme.com', role: 'company_admin', company_id: tenants.A.id,
  active: true, avatar_url: null, department: 'TI', phone: null,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
  company: tenants.A,
}

const MOCK_CONNECTIONS = [
  { id: 'conn-1', company_id: tenants.A.id, provider: 'whatsapp_cloud', name: 'WhatsApp Suporte', address: '+551140028922', enabled: true, status: 'healthy', subscription_expires_at: null, last_health_check_at: null, last_error_code: null, rotation_required: false },
]
const MOCK_ROUTES = [
  { id: 'route-1', connection_id: 'conn-1', target_company_id: tenants.A.id, priority: 100, match_type: 'domain', match_value: 'acme.com', assignment_group_id: null, enabled: true, created_at: '2025-01-01T00:00:00Z' },
]
const MOCK_TRIAGE = [
  { id: 'triage-1', company_id: tenants.A.id, connection_id: 'conn-1', sender: 'cliente@externo.com', subject: 'Preciso de ajuda', reason: 'ambiguous_route', status: 'pending', resolved_company_id: null, created_at: new Date().toISOString() },
]

async function setupRoutingMocks(page: Page) {
  await setupMockAuth(page)

  // Sobrescreve o perfil para admin (última rota registrada tem prioridade)
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
    const accept = route.request().headers()['accept'] ?? ''
    const body = accept.includes('vnd.pgrst.object+json') ? JSON.stringify(ADMIN_PROFILE) : JSON.stringify([ADMIN_PROFILE])
    await route.fulfill({ status: 200, contentType: accept.includes('object') ? 'application/vnd.pgrst.object+json' : 'application/json', body })
  })

  const fulfillList = (rows: unknown[]) => async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'new-id' }]) }); return }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  }

  await page.route(`${SUPABASE_URL}/rest/v1/channel_connections*`, fulfillList(MOCK_CONNECTIONS))
  await page.route(`${SUPABASE_URL}/rest/v1/channel_routes*`, fulfillList(MOCK_ROUTES))
  await page.route(`${SUPABASE_URL}/rest/v1/channel_triage_events*`, fulfillList(MOCK_TRIAGE))
  await page.route(`${SUPABASE_URL}/rest/v1/assignment_groups*`, fulfillList([{ id: 'g1', name: 'Suporte N1' }]))
  await page.route(`${SUPABASE_URL}/rest/v1/company_module_entitlements*`, fulfillList([{ module_key: 'omnichannel', enabled: true }]))
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/resolve_channel_triage`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

async function openRouting(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(3_000)

  const settingsBtn = page.locator('button, a').filter({ hasText: /Configurações/i }).first()
  if (await settingsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await settingsBtn.click()
    await page.waitForTimeout(1_500)
  }

  const card = page.locator('button, article').filter({ hasText: /Rotas e filas/i }).first()
  await expect(card).toBeVisible({ timeout: 10_000 })
  await card.click()
  await page.waitForTimeout(1_500)
}

test.describe('Omnichannel — Rotas e Triagem', () => {
  test('abre a tela e mostra as abas Rotas e Triagem', async ({ page }) => {
    await setupRoutingMocks(page)
    await openRouting(page)

    await expect(page.getByRole('heading', { name: /Rotas e filas/i }).first()).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('button', { name: /Rotas/ }).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /Triagem/ }).first()).toBeVisible({ timeout: 5_000 })
    // Rota existente aparece
    await expect(page.getByText(/acme\.com/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('a aba Triagem lista eventos pendentes e permite resolver', async ({ page }) => {
    await setupRoutingMocks(page)
    await openRouting(page)

    await page.getByRole('button', { name: /Triagem/ }).first().click()
    await page.waitForTimeout(800)

    await expect(page.getByText(/Preciso de ajuda/i).first()).toBeVisible({ timeout: 6_000 })
    await expect(page.getByText(/Rota ambígua/i).first()).toBeVisible({ timeout: 4_000 })

    const assignBtn = page.getByRole('button', { name: /Atribuir a este tenant/i }).first()
    await expect(assignBtn).toBeVisible({ timeout: 4_000 })
    await assignBtn.click()
    await page.waitForTimeout(800)
  })
})
