import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import PlatformModuleSettings from '../PlatformModuleSettings'

// ─── Mock dependencies ──────────────────────────────────────────

const { mockFrom, mockSingle, mockSelect, mockEq } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSingle: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  },
}))

const { mockUploadBrandAsset, mockUpdateBrandingSettings, mockRemoveBrandAsset, mockRefreshCompany, mockRefreshTenant } = vi.hoisted(() => ({
  mockUploadBrandAsset: vi.fn(),
  mockUpdateBrandingSettings: vi.fn(),
  mockRemoveBrandAsset: vi.fn(),
  mockRefreshCompany: vi.fn(),
  mockRefreshTenant: vi.fn(),
}))

vi.mock('../../auth', () => ({
  useAuth: () => ({ company: { id: 'company-123' }, refreshCompany: mockRefreshCompany }),
}))

vi.mock('../../tenant', () => ({
  useTenant: () => ({ tenant: { id: 'company-123' }, refreshTenant: mockRefreshTenant }),
}))

vi.mock('../../lib/services', () => ({
  companiesService: {
    uploadBrandAsset: mockUploadBrandAsset,
    updateBrandingSettings: mockUpdateBrandingSettings,
    removeBrandAsset: mockRemoveBrandAsset,
  },
}))

const COMPANY_ID = 'company-123'
const MOCK_COMPANY = {
  id: COMPANY_ID,
  name: 'Acme Corp',
  brand_name: 'Acme Brand',
  primary_color: 'Ocean',
  title_size: 'standard',
  welcome_title: 'Welcome to Acme',
  welcome_subtitle: 'How can we assist you today?',
  greeting_prefix: 'Hello',
  greeting_color: '#475569',
  bg_color: '#ffffff',
  logo_url: 'https://supabase.com/logo.png',
  background_url: 'https://supabase.com/bg.png',
  catalog_ui_config: {
    card_settings: { layout: 'grid' },
    portal_buttons: {
      incident_label: 'Report Problem',
      incident_desc: 'System error or outage',
      incident_emoji: '🚨',
      request_label: 'New Request',
      request_desc: 'Order software or access',
      request_emoji: '🔑',
    },
  },
}

describe('PlatformModuleSettings — Branding Panel', () => {
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.clearAllMocks()

    // Default mock behavior
    mockSingle.mockResolvedValue({ data: MOCK_COMPANY, error: null })
    mockUploadBrandAsset.mockResolvedValue('https://supabase.com/new-asset.png')
    mockRemoveBrandAsset.mockResolvedValue(undefined)
    mockRefreshCompany.mockResolvedValue(undefined)
    mockRefreshTenant.mockResolvedValue(undefined)
    mockUpdateBrandingSettings.mockResolvedValue({
      ...MOCK_COMPANY,
      brand_name: 'Acme Brand Updated',
    })
  })

  afterEach(() => {
    if (container) {
      document.body.removeChild(container)
      container = null
    }
  })

  it('renders the branding settings form with values from the database', async () => {
    const root = createRoot(container!)
    await act(async () => {
      root.render(
        <PlatformModuleSettings
          moduleKey="branding"
          companyId={COMPANY_ID}
          activeRole="admin"
          onBack={() => {}}
        />
      )
    })

    // Verify fetched company details are loaded into input fields
    const brandNameInput = container!.querySelector('input[value="Acme Brand"]') as HTMLInputElement
    expect(brandNameInput).not.toBeNull()

    const welcomeTitleInput = container!.querySelector('input[value="Welcome to Acme"]') as HTMLInputElement
    expect(welcomeTitleInput).not.toBeNull()

    const welcomeSubtitleInput = container!.querySelector('input[value="How can we assist you today?"]') as HTMLInputElement
    expect(welcomeSubtitleInput).not.toBeNull()

    // Verify theme swatch is selected
    const oceanThemeButton = [...container!.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Ocean Blue')
    )
    expect(oceanThemeButton).not.toBeNull()
    expect(oceanThemeButton?.className).toContain('border-indigo-600') // active state indicator
  })

  it('handles theme change and text input changes', async () => {
    const root = createRoot(container!)
    await act(async () => {
      root.render(
        <PlatformModuleSettings
          moduleKey="branding"
          companyId={COMPANY_ID}
          activeRole="admin"
          onBack={() => {}}
        />
      )
    })

    const brandNameInput = container!.querySelector('input[value="Acme Brand"]') as HTMLInputElement
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(brandNameInput, 'Acme Corp Brand New')
      brandNameInput.dispatchEvent(new Event('input', { bubbles: true }))
      brandNameInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Click Emerald Green theme
    const emeraldThemeButton = [...container!.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Emerald Green')
    )
    expect(emeraldThemeButton).not.toBeNull()

    await act(async () => {
      emeraldThemeButton!.click()
    })

    // Check saved state
    const saveButton = [...container!.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Salvar Configurações')
    )
    expect(saveButton).not.toBeNull()

    await act(async () => {
      saveButton!.click()
    })

    expect(mockUpdateBrandingSettings).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({
        brandName: 'Acme Corp Brand New',
        themeName: 'Emerald',
      }),
      MOCK_COMPANY.catalog_ui_config
    )
    expect(mockRefreshCompany).toHaveBeenCalledOnce()
    expect(mockRefreshTenant).toHaveBeenCalledOnce()
  })

  it('handles logo and background asset removal', async () => {
    const root = createRoot(container!)
    await act(async () => {
      root.render(
        <PlatformModuleSettings
          moduleKey="branding"
          companyId={COMPANY_ID}
          activeRole="admin"
          onBack={() => {}}
        />
      )
    })

    // Find the "Remover" button (using title="Remover" or text content)
    const removeButtons = [...container!.querySelectorAll('button')].filter(b =>
      b.getAttribute('title') === 'Remover' || b.textContent === '✕'
    )
    expect(removeButtons.length).toBeGreaterThanOrEqual(1)

    // Remove logo
    await act(async () => {
      removeButtons[0].click()
    })

    const saveButton = [...container!.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Salvar Configurações')
    )
    await act(async () => {
      saveButton!.click()
    })

    expect(mockUpdateBrandingSettings).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({
        logoUrl: null, // cleared
      }),
      MOCK_COMPANY.catalog_ui_config
    )
    expect(mockRemoveBrandAsset).toHaveBeenCalledWith(COMPANY_ID, 'logo')
  })
})
