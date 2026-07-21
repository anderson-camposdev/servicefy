import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authCompany: null as Record<string, unknown> | null,
  tenant: null as Record<string, unknown> | null,
  isProvider: false,
}))

vi.mock('../../auth', () => ({
  useAuth: () => ({ company: state.authCompany, isProvider: state.isProvider }),
}))

vi.mock('../../tenant', async importOriginal => {
  const actual = await importOriginal<typeof import('../../tenant')>()
  return {
    ...actual,
    useTenant: () => ({ tenant: state.tenant }),
  }
})

import { ThemeProvider, useBranding } from '../ThemeProvider'

const company = (overrides: Record<string, unknown>) => ({
  id: 'tenant-1', slug: 'acme', name: 'Acme Legal', brand_name: 'Acme',
  logo_url: null, primary_color: 'Ocean', secondary_color: '#0ea5e9',
  accent_color: '#0ea5e9', bg_color: '#f8fafc', welcome_title: 'Portal Acme',
  welcome_subtitle: 'Ajuda', title_color: null, title_font: null, title_size: null,
  subtitle_color: null, subtitle_font: null, subtitle_size: null, background_url: null,
  greeting_prefix: null, greeting_color: null,
  ...overrides,
})

function Probe() {
  const { branding } = useBranding()
  return <span data-testid="brand">{branding.name}</span>
}

describe('ThemeProvider white-label', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    state.authCompany = null
    state.tenant = null
    state.isProvider = false
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-tenant')
    document.querySelector('link[rel="icon"]')?.remove()
  })

  it('prioritizes the authenticated company and converts ThemeName to HEX', async () => {
    state.tenant = company({ id: 'tenant-from-host', brand_name: 'Host Brand', primary_color: 'Emerald' })
    state.authCompany = company({ id: 'tenant-auth', brand_name: 'Auth Brand', primary_color: 'Ocean' })
    const root = createRoot(container)

    await act(async () => root.render(<ThemeProvider><Probe /></ThemeProvider>))

    expect(container.textContent).toBe('Auth Brand')
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#2563eb')
    expect(document.documentElement.dataset.tenant).toBe('acme')
  })

  it('falls back to the resolved tenant and restores the default favicon without one', async () => {
    state.tenant = company({ brand_name: 'Host Brand', primary_color: '#123456', logo_url: null })
    const root = createRoot(container)

    await act(async () => root.render(<ThemeProvider><Probe /></ThemeProvider>))

    expect(container.textContent).toBe('Host Brand')
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#123456')
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href).toContain('/favicon.svg')
  })

  it('provedor MSP com tenant selecionado no seletor: branding segue o tenant simulado, nao a empresa-sede (regressao — Portal do Usuario ficava preso na empresa de origem ao trocar de tenant)', async () => {
    state.isProvider = true
    state.authCompany = company({ id: 'home-co', brand_name: 'Allied IT (sede)', primary_color: 'Ocean' })
    state.tenant = company({ id: 'selected-co', brand_name: 'Alpha Tech (selecionado)', primary_color: 'Emerald' })
    const root = createRoot(container)

    await act(async () => root.render(<ThemeProvider><Probe /></ThemeProvider>))

    expect(container.textContent).toBe('Alpha Tech (selecionado)')
  })

  it('usuario comum (nao provedor) com tenant resolvido pelo host: branding sempre segue a propria empresa, mesmo que exista um tenant resolvido', async () => {
    state.isProvider = false
    state.authCompany = company({ id: 'home-co', brand_name: 'Empresa do usuario', primary_color: 'Ocean' })
    state.tenant = company({ id: 'other-co', brand_name: 'Outro tenant', primary_color: 'Emerald' })
    const root = createRoot(container)

    await act(async () => root.render(<ThemeProvider><Probe /></ThemeProvider>))

    expect(container.textContent).toBe('Empresa do usuario')
  })
})

