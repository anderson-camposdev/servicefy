/**
 * virtual-agent.spec.ts
 *
 * Widget do Agente Virtual no Portal do Usuário:
 *  1. Widget só aparece quando o módulo está habilitado (entitlement).
 *  2. "quais meus chamados" → resposta direta, sem confirmação.
 *  3. "quero abrir uma solicitação" → pede confirmação → Sim → chamado criado.
 *  4. "quero falar com um humano" → transferência (sem exigir confirmação).
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'

async function setupWidgetMocks(page: Page, { entitled = true } = {}) {
  await setupMockAuth(page)

  await page.route(`${SUPABASE_URL}/rest/v1/company_module_entitlements*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(entitled ? [{ module_key: 'virtual_agent', enabled: true }] : []),
    })
  })

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/virtual_agent_process_message`, async route => {
    const body = route.request().postDataJSON() as { p_text: string }
    const text = (body.p_text || '').toLowerCase()

    if (text.includes('chamado')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ conversationId: 'conv-1', reply: 'Seus últimos chamados: INC-001 (New)', executionId: 'exec-list', requiresConfirmation: false }),
      })
    } else if (text.includes('solicitação') || text.includes('solicitar')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ conversationId: 'conv-1', reply: 'Confirma que deseja "Abrir solicitação simples"? Responda Sim ou Não.', executionId: 'exec-pending', requiresConfirmation: true }),
      })
    } else if (text.includes('humano')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ conversationId: 'conv-1', reply: 'Vou te transferir para um atendente humano. Em breve alguém continua o atendimento por aqui.', executionId: 'exec-handoff', requiresConfirmation: false }),
      })
    } else {
      // Mensagem não reconhecida (ex.: "oi") → menu amigável, SEM transferência (migration 087)
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ conversationId: 'conv-1', reply: 'Posso te ajudar a: consultar seus chamados, abrir uma solicitação simples, ou falar com um atendente humano. É só me dizer o que você precisa.', executionId: null, requiresConfirmation: false }),
      })
    }
  })

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/virtual_agent_confirm_action`, async route => {
    const body = route.request().postDataJSON() as { p_confirmed: boolean }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        reply: body.p_confirmed ? 'Solicitação REQ-99999 criada com sucesso! Um analista vai te atender em breve.' : 'Tudo bem, cancelei essa ação.',
        confirmed: body.p_confirmed,
      }),
    })
  })
}

async function navigateToPortal(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(3_000)
  const portalBtn = page.locator('button').filter({ hasText: /Portal do Usuário|Portal/i }).first()
  if (await portalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await portalBtn.click()
    await page.waitForTimeout(2_500)
  }
}

test.describe('Agente Virtual — Widget do Portal', () => {
  test('widget não aparece quando o módulo não está habilitado', async ({ page }) => {
    await setupWidgetMocks(page, { entitled: false })
    await navigateToPortal(page)
    await expect(page.getByRole('button', { name: /Assistente/i })).toHaveCount(0)
  })

  test('consulta de chamados responde diretamente, sem confirmação', async ({ page }) => {
    await setupWidgetMocks(page)
    await navigateToPortal(page)

    const openBtn = page.getByRole('button', { name: /Assistente/i }).first()
    await expect(openBtn).toBeVisible({ timeout: 8_000 })
    await openBtn.click()

    const input = page.locator('input[placeholder="Digite sua mensagem…"]')
    await expect(input).toBeVisible({ timeout: 4_000 })
    await input.fill('quais meus chamados')
    await input.press('Enter')

    await expect(page.getByText(/Seus últimos chamados: INC-001/i)).toBeVisible({ timeout: 6_000 })
    await expect(page.getByRole('button', { name: /^Sim$/ })).toHaveCount(0)
  })

  test('abrir solicitação pede confirmação e cria o chamado ao confirmar', async ({ page }) => {
    await setupWidgetMocks(page)
    await navigateToPortal(page)

    await page.getByRole('button', { name: /Assistente/i }).first().click()
    const input = page.locator('input[placeholder="Digite sua mensagem…"]')
    await expect(input).toBeVisible({ timeout: 4_000 })
    await input.fill('quero abrir uma solicitação')
    await input.press('Enter')

    await expect(page.getByText(/Confirma que deseja/i)).toBeVisible({ timeout: 6_000 })
    await page.getByRole('button', { name: /^Sim$/ }).click()

    await expect(page.getByText(/REQ-99999 criada com sucesso/i)).toBeVisible({ timeout: 6_000 })
  })

  test('pedido de humano transfere a conversa', async ({ page }) => {
    await setupWidgetMocks(page)
    await navigateToPortal(page)

    await page.getByRole('button', { name: /Assistente/i }).first().click()
    const input = page.locator('input[placeholder="Digite sua mensagem…"]')
    await expect(input).toBeVisible({ timeout: 4_000 })
    await input.fill('quero falar com um humano')
    await input.press('Enter')

    // Frase exclusiva da resposta de handoff (a saudação inicial também menciona "transferir")
    await expect(page.getByText(/Em breve alguém continua o atendimento/i)).toBeVisible({ timeout: 6_000 })
  })

  test('saudação não reconhecida mostra o menu e NÃO transfere (fix 087)', async ({ page }) => {
    await setupWidgetMocks(page)
    await navigateToPortal(page)

    await page.getByRole('button', { name: /Assistente/i }).first().click()
    const input = page.locator('input[placeholder="Digite sua mensagem…"]')
    await expect(input).toBeVisible({ timeout: 4_000 })
    await input.fill('oi')
    await input.press('Enter')

    await expect(page.getByText(/Posso te ajudar a: consultar seus chamados/i)).toBeVisible({ timeout: 6_000 })
    // Não houve handoff: a frase exclusiva da transferência não aparece
    await expect(page.getByText(/Em breve alguém continua o atendimento/i)).toHaveCount(0)
  })
})
