/**
 * knowledge.spec.ts
 *
 * Base de Conhecimento no Portal do Usuário:
 *  1. O menu "Base de Conhecimento" abre a KB (não é mais placeholder).
 *  2. A busca lista artigos publicados (RPC kb_search_articles).
 *  3. A leitura do artigo exibe o conteúdo e o feedback "Foi útil?".
 *
 * A visibilidade/tenant é garantida pela RLS no banco (coberta pelos
 * testes de contrato); aqui validamos a interface ponta a ponta com o
 * backend mockado.
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth, SUPABASE_URL } from './helpers/mockAuth'


const MOCK_ARTICLE = {
  id: 'kb-001',
  company_id: 'company-a-uuid',
  category_id: null,
  service_domain_id: null,
  title: 'Como redefinir a senha da VPN',
  slug: 'redefinir-senha-vpn',
  summary: 'Passo a passo para redefinir sua senha de acesso remoto.',
  body: '# Redefinição\n\nAcesse o portal e clique em **Esqueci minha senha**.\n\n- Informe seu e-mail\n- Verifique a caixa de entrada',
  status: 'published',
  visibility: 'tenant',
  author_id: null, reviewer_id: null, published_at: '2025-01-01T00:00:00Z',
  version: 1, tags: ['vpn', 'senha'], scheduled_at: null,
  view_count: 12, deflection_count: 3,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
}

const MOCK_SEARCH_ROW = {
  id: MOCK_ARTICLE.id, title: MOCK_ARTICLE.title, summary: MOCK_ARTICLE.summary,
  slug: MOCK_ARTICLE.slug, category_id: null, service_domain_id: null,
  visibility: 'tenant', status: 'published', tags: MOCK_ARTICLE.tags,
  view_count: 12, updated_at: MOCK_ARTICLE.updated_at, rank: 0.9, total_count: 1,
}

async function setupKbMocks(page: Page) {
  await setupMockAuth(page)

  // RPC de busca da KB (POST) → um artigo publicado
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/kb_search_articles`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_SEARCH_ROW]) })
  })

  // Leitura do artigo (GET single → objeto)
  await page.route(`${SUPABASE_URL}/rest/v1/knowledge_articles*`, async route => {
    const accept = route.request().headers()['accept'] ?? ''
    const body = accept.includes('vnd.pgrst.object+json') ? JSON.stringify(MOCK_ARTICLE) : JSON.stringify([MOCK_ARTICLE])
    await route.fulfill({ status: 200, contentType: accept.includes('object') ? 'application/vnd.pgrst.object+json' : 'application/json', body })
  })

  // Inserção de feedback (POST) → sucesso
  await page.route(`${SUPABASE_URL}/rest/v1/knowledge_article_feedback*`, async route => {
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[{"id":"fb-001"}]' })
  })
}

async function openKnowledge(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(3_000)

  const portalBtn = page.locator('button').filter({ hasText: /Portal do Usuário|Portal/i }).first()
  if (await portalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await portalBtn.click()
    await page.waitForTimeout(2_000)
  }

  const kbNav = page.locator('a, button, [role="button"]').filter({ hasText: /Base de Conhecimento/i }).first()
  await expect(kbNav).toBeVisible({ timeout: 10_000 })
  await kbNav.click()
  await page.waitForTimeout(1_500)
}

test.describe('Base de Conhecimento — Portal', () => {
  test('abre a KB pelo menu e lista artigos publicados', async ({ page }) => {
    await setupKbMocks(page)
    await openKnowledge(page)

    const searchInput = page.locator('input[placeholder*="Buscar artigos"]').first()
    await expect(searchInput).toBeVisible({ timeout: 8_000 })

    await expect(page.getByText(/Como redefinir a senha da VPN/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('abre o artigo e mostra conteúdo + feedback "Foi útil?"', async ({ page }) => {
    await setupKbMocks(page)
    await openKnowledge(page)

    const card = page.getByText(/Como redefinir a senha da VPN/i).first()
    await expect(card).toBeVisible({ timeout: 8_000 })
    await card.click()
    await page.waitForTimeout(1_200)

    // Conteúdo renderizado (Markdown → texto)
    await expect(page.getByText(/Esqueci minha senha|Redefinição/i).first()).toBeVisible({ timeout: 6_000 })
    // Bloco de feedback
    await expect(page.getByText(/Este artigo foi útil/i).first()).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Sim' }).click()
    await expect(page.getByText(/Obrigado pelo seu feedback/i)).toBeVisible()
  })

  test('busca por termo mantém a KB funcional', async ({ page }) => {
    await setupKbMocks(page)
    await openKnowledge(page)

    const searchInput = page.locator('input[placeholder*="Buscar artigos"]').first()
    await expect(searchInput).toBeVisible({ timeout: 8_000 })
    await searchInput.fill('vpn')
    await page.waitForTimeout(800)

    expect(await searchInput.inputValue()).toBe('vpn')
    await expect(page.getByText(/Como redefinir a senha da VPN/i).first()).toBeVisible({ timeout: 6_000 })
  })
})
