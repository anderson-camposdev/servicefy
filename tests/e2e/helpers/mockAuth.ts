/**
 * mockAuth.ts
 *
 * Regra crítica do Playwright:
 *   A rota registrada por ÚLTIMO tem prioridade (shadowing reverso).
 *   Registro obrigatório: catch-all PRIMEIRO, rotas específicas DEPOIS.
 *
 * Bug anterior: rest/v1/** (catch-all) estava registrado após profiles* e
 * companies*, portanto os overridia e retornava [] para ambos →
 * getAuthProfile recebia null → status 'unlinked' → "Conta sem perfil".
 *
 * Achado no pente fino de 2026-07-24: SUPABASE_URL estava hardcoded pro
 * projeto cloud, mas .env.local aponta pro Supabase local — nenhuma
 * requisição real do app batia nesses mocks (URL diferente), e a chave de
 * localStorage também não batia (supabase-js deriva de sb-<hostname>-auth-
 * token), então a sessão simulada nunca era encontrada. Agora lê a URL
 * real de .env.local (ver helpers/env.ts) para nunca divergir do ambiente
 * em que os testes rodam de verdade.
 */
import type { Page } from '@playwright/test'
import { SUPABASE_URL, SUPABASE_STORAGE_KEY } from './env'

export { SUPABASE_URL }

// ── Tenant A ───────────────────────────────────────────────────────
const TENANT_A = {
  id: 'company-a-uuid',
  name: 'Acme Corp',
  slug: 'acme',
  domain: 'acme.com',
  active: true,
  is_provider_tenant: false,
  primary_color: '#4F46E5',
  accent_color: '#818CF8',
  bg_color: '#F8FAFC',
  secondary_color: null,
  welcome_title: 'Bem-vindo ao Suporte',
  welcome_subtitle: 'Como podemos te ajudar hoje?',
  allow_local_login: true,
  sso_providers: '[]',
  concurrent_licenses: 10,
  license_plan: 'professional',
  license_expires_at: null,
  logo_url: null,
  background_url: null,
  brand_name: 'Acme Corp',
  title_color: null, title_font: null, title_size: null,
  subtitle_color: null, subtitle_font: null, subtitle_size: null,
  catalog_headline: null, catalog_headline_color: null, catalog_headline_size: null,
  greeting_prefix: null, greeting_color: null,
  created_at: '2025-01-01T00:00:00Z',
  schema_name: null,
}

// ── Profile com company embutida (formato do join PostgREST) ───────
const MOCK_PROFILE_WITH_COMPANY = {
  id: 'profile-test-uuid',
  auth_id: 'auth-test-user-id',
  name: 'Analista Teste',
  email: 'analista@acme.com',
  role: 'agent',
  company_id: TENANT_A.id,
  active: true,
  avatar_url: null,
  department: 'TI',
  phone: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  company: TENANT_A,
}

export const tenants = { A: TENANT_A, B_ID: 'company-b-uuid' }

// ── Helper: responde como objeto ou array conforme Accept header ───
async function fulfillSingleOrList(
  route: Parameters<Parameters<Page['route']>[1]>[0],
  single: object,
  list: object[]
) {
  const accept = route.request().headers()['accept'] ?? ''
  if (accept.includes('vnd.pgrst.object+json')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      body: JSON.stringify(single),
    })
  } else {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(list),
    })
  }
}

export async function setupMockAuth(page: Page): Promise<void> {
  // ── 1. localStorage: JWT estruturalmente válido ────────────────────
  // Supabase JS v2 decodifica o payload do access_token para checar "exp".
  // Token sem formato JWT é tratado como expirado → dispara refresh de rede.
  await page.addInitScript((storageKey: string) => {
    const toB64Url = (obj: object): string =>
      btoa(JSON.stringify(obj))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

    const now = Math.floor(Date.now() / 1000)
    const fakeJwt = [
      toB64Url({ alg: 'HS256', typ: 'JWT' }),
      toB64Url({
        sub: 'auth-test-user-id',
        email: 'analista@acme.com',
        role: 'authenticated',
        aud: 'authenticated',
        iat: now,
        exp: now + 3600,
      }),
      'mock_sig_playwright',
    ].join('.')

    localStorage.setItem(storageKey, JSON.stringify({
      access_token: fakeJwt,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: 'mock-refresh-token',
      user: {
        id: 'auth-test-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'analista@acme.com',
        email_confirmed_at: '2025-01-01T00:00:00Z',
        last_sign_in_at: '2025-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
      },
    }))
  }, SUPABASE_STORAGE_KEY)

  // ── 2–8. Rotas de rede — ORDEM IMPORTA: catch-all PRIMEIRO, específicas DEPOIS ──
  // Playwright: última rota registrada = maior prioridade (shadowing reverso).

  // 2. Catch-all REST → [] (prioridade MAIS BAIXA — registrado primeiro)
  await page.route(`${SUPABASE_URL}/rest/v1/**`, async route => {
    if (['POST', 'PATCH', 'PUT'].includes(route.request().method())) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[{"id":"mock-id"}]' })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  })

  // 3. Tabelas de tickets → listas vazias (prioridade MÉDIA)
  for (const table of ['incidents', 'service_requests', 'problems', 'changes',
    'catalog_items', 'request_catalog_items', 'incident_catalog_items',
    'sla_policies', 'notifications', 'workflow_rules', 'workflow_execution_log']) {
    await page.route(`${SUPABASE_URL}/rest/v1/${table}*`, async route => {
      if (['POST', 'PATCH', 'PUT'].includes(route.request().method())) {
        await route.fulfill({ status: 201, contentType: 'application/json', body: '[{"id":"mock-id"}]' })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })
  }

  // 4. companies → TENANT_A (prioridade ALTA — registrado depois do catch-all)
  await page.route(`${SUPABASE_URL}/rest/v1/companies*`, async route => {
    await fulfillSingleOrList(route, TENANT_A, [TENANT_A])
  })

  // 5. profiles → profile com company embutida (prioridade MAIS ALTA entre REST)
  // getAuthProfile usa .select('*, company:companies(*)').maybeSingle()
  // → envia Accept: application/vnd.pgrst.object+json → exige objeto único, NÃO array
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
    await fulfillSingleOrList(
      route,
      MOCK_PROFILE_WITH_COMPANY,
      [MOCK_PROFILE_WITH_COMPANY]
    )
  })

  // 6. auth/token → refresh token (usa Buffer.from para gerar JWT válido no Node)
  await page.route(`${SUPABASE_URL}/auth/v1/token*`, async route => {
    const now = Math.floor(Date.now() / 1000)
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const p = Buffer.from(JSON.stringify({
      sub: 'auth-test-user-id', email: 'analista@acme.com',
      role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600,
    })).toString('base64url')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: `${h}.${p}.mock_sig`,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: 'mock-refresh-token',
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

  // 7. auth/user
  await page.route(`${SUPABASE_URL}/auth/v1/user*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'auth-test-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'analista@acme.com',
        app_metadata: { provider: 'email' },
        user_metadata: {},
      }),
    })
  })

  // 8. Realtime WebSocket → aborta silenciosamente (maior prioridade, último)
  await page.route(`${SUPABASE_URL}/realtime/**`, async route => route.abort())
}
