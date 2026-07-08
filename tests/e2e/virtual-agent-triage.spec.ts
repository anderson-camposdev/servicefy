/**
 * virtual-agent-triage.spec.ts
 *
 * Agente CONDUTOR de triagem (TriageChat) no widget do portal:
 *  1. Widget só aparece com o módulo virtual_agent habilitado.
 *  2. Caminho de incidente: menu → categoria → serviço → sintoma → impacto →
 *     urgência → campo de formulário → confirmar → chamado aberto.
 *  3. Caminho de solicitação: menu → categoria → item → campo → confirmar.
 *  4. "Falar com atendente" reusa o agente de palavra-chave (handoff).
 */

import { test, expect, type Page } from '@playwright/test'
import { setupMockAuth } from './helpers/mockAuth'

const SUPABASE_URL = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'
const COMPANY = 'company-a-uuid'

const CATALOG = {
  categories: [{ id: 'cat1', company_id: COMPANY, name: 'Rede', description: null, icon: '', sort_order: 1, is_active: true, created_at: '2025-01-01T00:00:00Z' }],
  services: [{ id: 'svc1', company_id: COMPANY, category_id: 'cat1', name: 'VPN', description: null, icon: '', sort_order: 1, is_active: true, created_at: '2025-01-01T00:00:00Z' }],
  symptoms: [{
    id: 'sym1', company_id: COMPANY, service_id: 'svc1', symptom_id: 'ss1',
    sla_hours: 8, assignment_group_id: 'g1', form_template_id: null,
    form_fields: [{ id: 'f1', label: 'Sistema operacional', type: 'select', required: true, options: ['Windows', 'Mac'] }],
    ui_config: {}, active: true, created_at: '2025-01-01T00:00:00Z',
    symptom: { id: 'ss1', name: 'Não conecta', icon: null, sort_order: 1 },
    group: { id: 'g1', name: 'Redes' },
    service: { id: 'svc1', name: 'VPN', category_id: 'cat1', icon: null },
  }],
  reqCategories: [{ id: 'rcat1', company_id: COMPANY, name: 'Acessos', description: null, icon: null, active: true, sort_order: 1, created_at: '2025-01-01T00:00:00Z' }],
  reqSubcategories: [] as unknown[],
  reqItems: [{
    id: 'ri1', company_id: COMPANY, request_category_id: 'rcat1', request_subcategory_id: null,
    name: 'Novo e-mail', description: null, icon: null, form_template_id: null,
    form_fields: [{ id: 'rf1', label: 'Nome desejado', type: 'text', required: true }],
    ui_config: {}, assignment_group_id: 'g2', active: true, sort_order: 1, created_at: '2025-01-01T00:00:00Z',
    requires_approval: false, group: { id: 'g2', name: 'TI' },
  }],
}

async function setupTriageMocks(page: Page, { entitled = true } = {}) {
  await setupMockAuth(page)

  const json = (rows: unknown) => async (route: import('@playwright/test').Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  }

  await page.route(`${SUPABASE_URL}/rest/v1/company_module_entitlements*`, json(entitled ? [{ module_key: 'virtual_agent', enabled: true }] : []))
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_categories*`, json(CATALOG.categories))
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_services*`, json(CATALOG.services))
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_service_symptoms*`, json(CATALOG.symptoms))
  await page.route(`${SUPABASE_URL}/rest/v1/request_categories*`, json(CATALOG.reqCategories))
  await page.route(`${SUPABASE_URL}/rest/v1/request_subcategories*`, json(CATALOG.reqSubcategories))
  await page.route(`${SUPABASE_URL}/rest/v1/request_items*`, json(CATALOG.reqItems))

  // Criação do chamado → objeto único (openRequest/openServiceRequest usam .single())
  await page.route(`${SUPABASE_URL}/rest/v1/incidents*`, async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/vnd.pgrst.object+json', body: JSON.stringify({ id: 'inc-new', number: 'INC-77001' }) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  })

  // RPCs de persistência/auditoria e reuso do agente de palavra-chave
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/virtual_agent_triage_sync`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('conv-1') })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/virtual_agent_triage_complete`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/virtual_agent_process_message`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversationId: 'conv-1', reply: 'Vou te transferir para um atendente humano. Em breve alguém continua o atendimento por aqui.', requiresConfirmation: false }) })
  })
}

async function openWidget(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(3_000)
  const portalBtn = page.locator('button').filter({ hasText: /Portal do Usuário|Portal/i }).first()
  if (await portalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await portalBtn.click(); await page.waitForTimeout(2_000)
  }
  const open = page.getByRole('button', { name: /Assistente/i }).first()
  await expect(open).toBeVisible({ timeout: 8_000 })
  await open.click()
}

const clickBtn = (page: Page, re: RegExp) => page.getByRole('button', { name: re }).first().click()

test.describe('Agente de triagem — widget conduzido', () => {
  test('widget não aparece sem entitlement', async ({ page }) => {
    await setupTriageMocks(page, { entitled: false })
    await page.goto('/'); await page.waitForTimeout(3_000)
    await expect(page.getByRole('button', { name: /Assistente/i })).toHaveCount(0)
  })

  test('conduz a abertura de um incidente até o número do chamado', async ({ page }) => {
    await setupTriageMocks(page)
    await openWidget(page)

    await expect(page.getByText(/o que você precisa hoje/i)).toBeVisible({ timeout: 8_000 })
    await clickBtn(page, /Abrir um incidente/i)
    await clickBtn(page, /^Rede$/)
    await clickBtn(page, /^VPN$/)
    await clickBtn(page, /Não conecta/i)
    await clickBtn(page, /Alto —/i)          // impacto
    await clickBtn(page, /estou parado/i)    // urgência (Alta)
    await clickBtn(page, /^Windows$/)        // campo de formulário (select obrigatório)

    // descrição (texto) → pular
    const input = page.getByPlaceholder(/Digite sua resposta|escreva aqui/i)
    await input.fill('pular'); await input.press('Enter')

    await clickBtn(page, /Confirmar e abrir/i)
    await expect(page.getByText(/INC-77001/)).toBeVisible({ timeout: 8_000 })
  })

  test('conduz a abertura de uma solicitação com campo dinâmico', async ({ page }) => {
    await setupTriageMocks(page)
    await openWidget(page)

    await expect(page.getByText(/o que você precisa hoje/i)).toBeVisible({ timeout: 8_000 })
    await clickBtn(page, /Fazer uma solicitação/i)
    await clickBtn(page, /^Acessos$/)
    await clickBtn(page, /Novo e-mail/i)

    const input = page.getByPlaceholder(/Digite sua resposta|escreva aqui/i)
    await input.fill('joao.silva'); await input.press('Enter') // campo texto obrigatório
    await input.fill('pular'); await input.press('Enter')       // descrição

    await clickBtn(page, /Confirmar e abrir/i)
    await expect(page.getByText(/INC-77001/)).toBeVisible({ timeout: 8_000 })
  })

  test('"falar com atendente" transfere para humano', async ({ page }) => {
    await setupTriageMocks(page)
    await openWidget(page)

    await expect(page.getByText(/o que você precisa hoje/i)).toBeVisible({ timeout: 8_000 })
    await clickBtn(page, /Falar com um atendente humano/i)
    await expect(page.getByText(/Em breve alguém continua o atendimento/i)).toBeVisible({ timeout: 8_000 })
  })
})

// ─── Escolha de catálogo (TI/RH/...) quando há mais de um departamento ──────
const DEPARTMENTS = [
  { id: 'dept-rh', company_id: COMPANY, name: 'RH', description: null, icon: null, is_active: true, sort_order: 1, visible_to_groups: null, ui_config: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
]
const RH_CATEGORY = { id: 'cat-rh', company_id: COMPANY, department_id: 'dept-rh', name: 'Benefícios', description: null, icon: '', sort_order: 1, is_active: true, created_at: '2025-01-01T00:00:00Z' }
const RH_SERVICE = { id: 'svc-rh', company_id: COMPANY, category_id: 'cat-rh', name: 'Plano de saúde', description: null, icon: '', sort_order: 1, is_active: true, created_at: '2025-01-01T00:00:00Z' }
const RH_SYMPTOM = {
  id: 'sym-rh', company_id: COMPANY, service_id: 'svc-rh', symptom_id: 'ss-rh',
  sla_hours: 24, assignment_group_id: 'g-rh', form_template_id: null,
  form_fields: [], ui_config: {}, active: true, created_at: '2025-01-01T00:00:00Z',
  symptom: { id: 'ss-rh', name: 'Dúvida sobre cobertura', icon: null, sort_order: 1 },
  group: { id: 'g-rh', name: 'RH' },
  service: { id: 'svc-rh', name: 'Plano de saúde', category_id: 'cat-rh', icon: null },
}

async function setupTriageMocksWithDepartments(page: Page) {
  await setupTriageMocks(page)
  const json = (rows: unknown) => async (route: import('@playwright/test').Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  }
  await page.route(`${SUPABASE_URL}/rest/v1/departments*`, json(DEPARTMENTS))
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_categories*`, json([...CATALOG.categories, RH_CATEGORY]))
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_services*`, json([...CATALOG.services, RH_SERVICE]))
  await page.route(`${SUPABASE_URL}/rest/v1/catalog_service_symptoms*`, json([...CATALOG.symptoms, RH_SYMPTOM]))
}

test.describe('Agente de triagem — escolha de catálogo (TI/RH)', () => {
  test('com departamentos cadastrados, pergunta o catálogo e filtra as categorias corretamente', async ({ page }) => {
    await setupTriageMocksWithDepartments(page)
    await openWidget(page)

    await expect(page.getByText(/o que você precisa hoje/i)).toBeVisible({ timeout: 8_000 })
    await clickBtn(page, /Abrir um incidente/i)

    // Pergunta o catálogo antes da categoria
    await expect(page.getByText(/Qual catálogo de serviços você quer usar/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('button', { name: /^TI \/ Catálogo padrão$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^RH$/ })).toBeVisible()

    // Escolhendo RH, só aparece a categoria de RH (não "Rede", que é do catálogo padrão)
    await clickBtn(page, /^RH$/)
    await expect(page.getByRole('button', { name: /^Benefícios$/ })).toBeVisible({ timeout: 6_000 })
    await expect(page.getByRole('button', { name: /^Rede$/ })).toHaveCount(0)

    await clickBtn(page, /^Benefícios$/)
    await clickBtn(page, /Plano de saúde/i)
    await clickBtn(page, /Dúvida sobre cobertura/i)
    await clickBtn(page, /Baixo —/i)          // impacto
    await clickBtn(page, /posso esperar/i)    // urgência (Baixa)

    const input = page.getByPlaceholder(/Digite sua resposta|escreva aqui/i)
    await input.fill('pular'); await input.press('Enter') // descrição

    // O resumo de confirmação menciona o catálogo escolhido
    await expect(page.getByText(/Catálogo: RH/i)).toBeVisible({ timeout: 6_000 })
    await clickBtn(page, /Confirmar e abrir/i)
    await expect(page.getByText(/INC-77001/)).toBeVisible({ timeout: 8_000 })
  })
})
