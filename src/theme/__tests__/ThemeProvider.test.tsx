import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authCompany: null as Record<string, unknown> | null,
  tenant: null as Record<string, unknown> | null,
}))

vi.mock('../../auth', () => ({
  useAuth: () => ({ company: state.authCompany }),
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
})

