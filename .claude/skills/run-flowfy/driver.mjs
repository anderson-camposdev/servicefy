#!/usr/bin/env node
/**
 * driver.mjs — Flowfy ITSM dev-server driver
 *
 * Usage:
 *   node .claude/skills/run-flowfy/driver.mjs [command] [args...]
 *
 * Commands:
 *   screenshot [outfile]          — screenshot the home page (portal screen)
 *   screenshot-portal [outfile]   — same as above
 *   screenshot-admin [outfile]    — screenshot the admin dashboard
 *   navigate <url-path> [outfile] — navigate to any path, screenshot
 *   flow-incident [outfile]       — walk the incident-reporting flow, screenshot done screen
 *   smoke                         — quick sanity check: portal loads, no console errors
 *
 * All screenshots land in .claude/skills/run-flowfy/shots/ by default.
 * Dev server must already be running on http://localhost:5173
 */

import { chromium } from '@playwright/test'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __dir  = dirname(fileURLToPath(import.meta.url))
const SHOTS  = join(__dir, 'shots')
const BASE   = 'http://localhost:5173'
const SUPA   = 'https://enxtvrvsfwvcnpyspyfl.supabase.co'

mkdirSync(SHOTS, { recursive: true })

// ── Mock auth (mirrors tests/e2e/helpers/mockAuth.ts) ──────────────────────

const TENANT_A = {
  id: 'company-a-uuid', name: 'Acme Corp', slug: 'acme', domain: 'acme.com',
  active: true, is_provider_tenant: false, primary_color: '#4F46E5',
  accent_color: '#818CF8', bg_color: '#F8FAFC', secondary_color: null,
  welcome_title: 'Bem-vindo ao Suporte', welcome_subtitle: 'Como podemos te ajudar hoje?',
  allow_local_login: true, sso_providers: '[]', concurrent_licenses: 10,
  license_plan: 'professional', license_expires_at: null, logo_url: null,
  brand_name: 'Acme Corp', schema_name: null,
  title_color: null, title_font: null, title_size: null,
  subtitle_color: null, subtitle_font: null, subtitle_size: null,
  catalog_headline: null, catalog_headline_color: null, catalog_headline_size: null,
  greeting_prefix: null, greeting_color: null,
  created_at: '2025-01-01T00:00:00Z',
}

const MOCK_PROFILE = {
  id: 'profile-test-uuid', auth_id: 'auth-test-user-id',
  name: 'Analista Teste', email: 'analista@acme.com', role: 'agent',
  company_id: TENANT_A.id, active: true, avatar_url: null,
  department: 'TI', phone: null,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
  company: TENANT_A,
}

async function setupMockAuth(page) {
  // Inject fake JWT into localStorage before page load
  await page.addInitScript(() => {
    const toB64Url = obj => btoa(JSON.stringify(obj))
      .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
    const now = Math.floor(Date.now() / 1000)
    const fakeJwt = [
      toB64Url({ alg: 'HS256', typ: 'JWT' }),
      toB64Url({ sub:'auth-test-user-id', email:'analista@acme.com',
        role:'authenticated', aud:'authenticated', iat:now, exp:now+3600 }),
      'mock_sig_driver',
    ].join('.')
    localStorage.setItem('sb-enxtvrvsfwvcnpyspyfl-auth-token', JSON.stringify({
      access_token: fakeJwt, token_type: 'bearer',
      expires_in: 3600, expires_at: now + 3600,
      refresh_token: 'mock-refresh',
      user: { id:'auth-test-user-id', aud:'authenticated', role:'authenticated',
        email:'analista@acme.com', email_confirmed_at:'2025-01-01T00:00:00Z',
        app_metadata:{ provider:'email' }, user_metadata:{} },
    }))
  })

  // REST catch-all → empty arrays
  await page.route(`${SUPA}/rest/v1/**`, async route => {
    const method = route.request().method()
    if (['POST','PATCH','PUT'].includes(method)) {
      await route.fulfill({ status:201, contentType:'application/json', body:'[{"id":"mock-id"}]' })
    } else {
      await route.fulfill({ status:200, contentType:'application/json', body:'[]' })
    }
  })

  // incidents → empty list (no real tickets in driver)
  await page.route(`${SUPA}/rest/v1/incidents*`, async route => {
    if (['POST','PATCH','PUT'].includes(route.request().method())) {
      const inc = { id:'inc-driver-001', number:'INC-09999',
        priority:'P3 - Moderate', state:'New',
        short_description:'Driver test incident',
        ticket_type:'incident', created_at:new Date().toISOString(),
        updated_at:new Date().toISOString(), company_id:TENANT_A.id,
        caller_id:'profile-test-uuid', caller_name:'Analista Teste', sla_breached:false }
      const accept = route.request().headers()['accept'] ?? ''
      await route.fulfill({
        status:201,
        contentType: accept.includes('vnd.pgrst.object+json')
          ? 'application/vnd.pgrst.object+json' : 'application/json',
        body: accept.includes('vnd.pgrst.object+json')
          ? JSON.stringify(inc) : JSON.stringify([inc]),
      })
    } else {
      await route.fulfill({ status:200, contentType:'application/json', body:'[]' })
    }
  })

  // companies → TENANT_A
  await page.route(`${SUPA}/rest/v1/companies*`, async route => {
    const accept = route.request().headers()['accept'] ?? ''
    await route.fulfill({
      status:200,
      contentType: accept.includes('vnd.pgrst.object+json')
        ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: accept.includes('vnd.pgrst.object+json')
        ? JSON.stringify(TENANT_A) : JSON.stringify([TENANT_A]),
    })
  })

  // profiles → MOCK_PROFILE (must be registered AFTER companies to shadow catch-all)
  await page.route(`${SUPA}/rest/v1/profiles*`, async route => {
    const accept = route.request().headers()['accept'] ?? ''
    await route.fulfill({
      status:200,
      contentType: accept.includes('vnd.pgrst.object+json')
        ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: accept.includes('vnd.pgrst.object+json')
        ? JSON.stringify(MOCK_PROFILE) : JSON.stringify([MOCK_PROFILE]),
    })
  })

  // auth endpoints
  await page.route(`${SUPA}/auth/v1/token*`, async route => {
    const now = Math.floor(Date.now() / 1000)
    const h = Buffer.from(JSON.stringify({ alg:'HS256', typ:'JWT' })).toString('base64url')
    const p = Buffer.from(JSON.stringify({ sub:'auth-test-user-id', email:'analista@acme.com',
      role:'authenticated', aud:'authenticated', iat:now, exp:now+3600 })).toString('base64url')
    await route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ access_token:`${h}.${p}.mock_sig`, token_type:'bearer',
        expires_in:3600, expires_at:now+3600, refresh_token:'mock-refresh',
        user:{ id:'auth-test-user-id', aud:'authenticated', role:'authenticated',
          email:'analista@acme.com', app_metadata:{ provider:'email' }, user_metadata:{} } }) })
  })

  await page.route(`${SUPA}/auth/v1/user*`, async route => {
    await route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ id:'auth-test-user-id', aud:'authenticated', role:'authenticated',
        email:'analista@acme.com', app_metadata:{ provider:'email' }, user_metadata:{} }) })
  })

  await page.route(`${SUPA}/realtime/**`, async route => route.abort())
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function navigateToPortal(page) {
  await page.goto(BASE, { waitUntil:'networkidle', timeout:30000 })
  // The app may show a workspace/admin layout — look for Portal nav button
  const portalBtn = page.locator('button, a').filter({ hasText: /Portal do Usuário|Portal/i }).first()
  if (await portalBtn.isVisible({ timeout:5000 }).catch(() => false)) {
    await portalBtn.click()
    await page.waitForTimeout(2000)
  }
}

async function shoot(page, name) {
  const out = join(SHOTS, name.endsWith('.png') ? name : `${name}.png`)
  await page.screenshot({ path: out, fullPage: false })
  console.log(`screenshot → ${out}`)
  return out
}

// ── Commands ───────────────────────────────────────────────────────────────

const COMMANDS = {

  async 'screenshot'(args) {
    const [outfile] = args
    const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] })
    const ctx = await browser.newContext({ viewport:{ width:1440, height:900 } })
    const page = await ctx.newPage()
    await setupMockAuth(page)
    await navigateToPortal(page)
    // Wait for portal home content
    await page.waitForSelector('text=O que você precisa', { timeout:15000 }).catch(() => {})
    const out = await shoot(page, outfile || 'portal-home')
    // Check for console errors
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    if (errors.length) console.warn('Console errors:', errors)
    await browser.close()
    return out
  },

  async 'screenshot-admin'(args) {
    const [outfile] = args
    const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] })
    const ctx = await browser.newContext({ viewport:{ width:1440, height:900 } })
    const page = await ctx.newPage()
    await setupMockAuth(page)
    await page.goto(BASE, { waitUntil:'networkidle', timeout:30000 })
    await page.waitForTimeout(2000)
    const out = await shoot(page, outfile || 'admin-home')
    await browser.close()
    return out
  },

  async 'navigate'(args) {
    const [path, outfile] = args
    if (!path) throw new Error('Usage: navigate <path> [outfile]')
    const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] })
    const ctx = await browser.newContext({ viewport:{ width:1440, height:900 } })
    const page = await ctx.newPage()
    await setupMockAuth(page)
    await page.goto(`${BASE}${path}`, { waitUntil:'networkidle', timeout:30000 })
    await page.waitForTimeout(1500)
    const name = outfile || `nav-${path.replace(/\//g,'-').replace(/^-/,'')}`
    const out = await shoot(page, name)
    await browser.close()
    return out
  },

  async 'flow-incident'(args) {
    const [outfile] = args
    const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] })
    const ctx = await browser.newContext({ viewport:{ width:1440, height:900 } })
    const page = await ctx.newPage()
    await setupMockAuth(page)
    await navigateToPortal(page)
    await page.waitForSelector('text=O que você precisa', { timeout:15000 }).catch(() => {})

    // Click "Reportar Problema"
    await page.locator('button').filter({ hasText:/Reportar Problema/i }).first().click()
    await page.waitForTimeout(800)
    await shoot(page, 'flow-inc-cats')

    // Pick first incident category
    const cats = page.locator('button').filter({ hasText:/Redes e Conectividade|Sistemas e Aplicações|Hardware|Segurança/i })
    await cats.first().click()
    await page.waitForTimeout(800)
    await shoot(page, 'flow-inc-symptoms')

    // Pick first symptom
    const symptoms = page.locator('button').filter({ hasText:/Link de internet|VPN|ERP|Computador|Senha/i })
    await symptoms.first().click()
    await page.waitForTimeout(800)
    await shoot(page, 'flow-inc-form')

    // Fill description and submit
    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible({ timeout:3000 }).catch(() => false)) {
      await textarea.fill('Driver test: reproducible issue since this morning.')
    }
    await page.locator('button').filter({ hasText:/Abrir Incidente/i }).first().click()
    await page.waitForTimeout(3000)
    const out = await shoot(page, outfile || 'flow-done')
    await browser.close()
    return out
  },

  async 'smoke'() {
    const errors = []
    const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] })
    const ctx = await browser.newContext({ viewport:{ width:1440, height:900 } })
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
    await setupMockAuth(page)
    await navigateToPortal(page)
    const text = await page.locator('body').textContent({ timeout:15000 }).catch(() => '')
    await browser.close()

    const hasPortal = /O que você precisa|Reportar Problema|Solicitar Serviço/.test(text)
    if (!hasPortal) errors.push('Portal content not found in body')

    if (errors.length) {
      console.error('SMOKE FAILED:')
      errors.forEach(e => console.error(' ', e))
      process.exit(1)
    }
    console.log('smoke OK — portal loaded, no page errors')
  },
}

// ── Entry point ────────────────────────────────────────────────────────────

const [,, cmd = 'screenshot', ...args] = process.argv
const handler = COMMANDS[cmd] ?? COMMANDS['screenshot-portal']

if (!COMMANDS[cmd]) {
  console.log(`Unknown command: ${cmd}`)
  console.log('Available:', Object.keys(COMMANDS).join(', '))
  process.exit(1)
}

handler(args).catch(err => { console.error(err); process.exit(1) })
