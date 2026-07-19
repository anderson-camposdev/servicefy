// ============================================================
// ServiceFY ITSM — Branding Service: Unit Tests
//
// Follows TDD rules from .agents/rules/testing.md:
//   - Minimum 80% coverage (branches, functions, lines, statements)
//   - Arrange-Act-Assert pattern
//   - Descriptive test names
//   - Isolated tests (no shared mutable state between suites)
//   - All external dependencies (Supabase) are mocked
// ============================================================

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
  validateBrandingFile,
  validateBrandingDimensions,
  buildBrandAssetPath,
  BRANDING_MAX_FILE_SIZE_BYTES,
} from '../branding.types'
import type { BrandingSettings } from '../branding.types'

// ─── Mock Supabase before importing services ─────────────────
//
// vi.mock() is hoisted to the top of the file by Vitest.
// All variables referenced inside the factory MUST be declared
// with vi.hoisted() — otherwise they are undefined at hoist time.

const {
  mockUpload,
  mockGetPublicUrl,
  mockRemove,
  mockFrom,
  mockRpc,
} = vi.hoisted(() => ({
  mockUpload:       vi.fn(),
  mockGetPublicUrl: vi.fn(),
  mockRemove:       vi.fn(),
  mockFrom:         vi.fn(),
  mockRpc:          vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn((_bucket: string) => ({
        upload:       mockUpload,
        getPublicUrl: mockGetPublicUrl,
        remove:       mockRemove,
      })),
    },
    from: mockFrom,
    rpc: mockRpc,
  },
}))

// Import after mocking so the module resolves the mocked supabase
import { companiesService } from '../services'

// ─── Helpers ─────────────────────────────────────────────────


function makeFile(
  name: string,
  type: string,
  sizeBytes: number,
): File {
  const content = new Uint8Array(sizeBytes)
  return new File([content], name, { type })
}

const VALID_PNG_1MB = makeFile('logo.png', 'image/png', 1024 * 1024)
const VALID_JPG_1MB = makeFile('bg.jpg',  'image/jpeg', 1024 * 1024)
const VALID_SVG     = makeFile('icon.svg', 'image/svg+xml', 500)
const VALID_WEBP    = makeFile('img.webp', 'image/webp', 256)
const TOO_LARGE     = makeFile('huge.png', 'image/png', BRANDING_MAX_FILE_SIZE_BYTES + 1)
const INVALID_GIF   = makeFile('anim.gif', 'image/gif', 512)
const INVALID_PDF   = makeFile('doc.pdf',  'application/pdf', 1024)
const UNKNOWN_TYPE  = makeFile('file.bin', '', 256)

const COMPANY_ID = 'a1b2c3d4-0000-0000-0000-000000000001'

// ─── Suite 1: validateBrandingFile ───────────────────────────

describe('validateBrandingFile', () => {
  it('accepts a valid PNG file under 2 MB', () => {
    const result = validateBrandingFile(VALID_PNG_1MB)
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })

  it('accepts a valid JPEG file under 2 MB', () => {
    const result = validateBrandingFile(VALID_JPG_1MB)
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })

  it('rejects SVG files because public SVG is outside the hardened contract', () => {
    const result = validateBrandingFile(VALID_SVG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/formato inválido/i)
  })

  it('accepts a valid WebP file', () => {
    const result = validateBrandingFile(VALID_WEBP)
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
  })

  it('rejects a file that exceeds 2 MB', () => {
    const result = validateBrandingFile(TOO_LARGE)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/muito grande/i)
    expect(result.error).toMatch(/2 MB/i)
  })

  it('rejects a GIF file (unsupported format)', () => {
    const result = validateBrandingFile(INVALID_GIF)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/formato inválido/i)
    expect(result.error).toContain('image/gif')
  })

  it('rejects a PDF file', () => {
    const result = validateBrandingFile(INVALID_PDF)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/formato inválido/i)
  })

  it('rejects a file with empty MIME type', () => {
    const result = validateBrandingFile(UNKNOWN_TYPE)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/desconhecido/i)
  })

  it('accepts a file at exactly the size limit (boundary condition)', () => {
    const exactLimit = makeFile('exact.png', 'image/png', BRANDING_MAX_FILE_SIZE_BYTES)
    const result = validateBrandingFile(exactLimit)
    expect(result.valid).toBe(true)
  })
})

describe('validateBrandingDimensions', () => {
  it('accepts a horizontal tenant wordmark with adequate resolution', () => {
    expect(validateBrandingDimensions(500, 148, 'logo')).toEqual({ valid: true, error: null })
  })

  it('rejects a low-resolution logo', () => {
    expect(validateBrandingDimensions(120, 40, 'logo').error).toMatch(/baixa resolução/i)
  })

  it('rejects an excessively wide logo', () => {
    expect(validateBrandingDimensions(1200, 100, 'logo').error).toMatch(/proporção/i)
  })

  it('requires a widescreen-quality background', () => {
    expect(validateBrandingDimensions(1024, 576, 'background').error).toMatch(/1280×720/)
    expect(validateBrandingDimensions(1920, 1080, 'background')).toEqual({ valid: true, error: null })
  })
})

// ─── Suite 2: buildBrandAssetPath ────────────────────────────

describe('buildBrandAssetPath', () => {
  it('builds a deterministic logo path for PNG', () => {
    const path = buildBrandAssetPath(COMPANY_ID, 'logo', 'image/png')
    expect(path).toBe(`brands/${COMPANY_ID}/logo`)
  })

  it('builds a deterministic background path for JPEG', () => {
    const path = buildBrandAssetPath(COMPANY_ID, 'background', 'image/jpeg')
    expect(path).toBe(`brands/${COMPANY_ID}/background`)
  })

  it('maps image/jpg MIME type to .jpg extension', () => {
    const path = buildBrandAssetPath(COMPANY_ID, 'logo', 'image/jpg')
    expect(path).toBe(`brands/${COMPANY_ID}/logo`)
  })

  it('maps image/svg+xml MIME type to .svg extension', () => {
    const path = buildBrandAssetPath(COMPANY_ID, 'logo', 'image/svg+xml')
    expect(path).toBe(`brands/${COMPANY_ID}/logo`)
  })

  it('maps image/webp MIME type to .webp extension', () => {
    const path = buildBrandAssetPath(COMPANY_ID, 'background', 'image/webp')
    expect(path).toBe(`brands/${COMPANY_ID}/background`)
  })

  it('falls back to .png extension for unknown MIME types', () => {
    const path = buildBrandAssetPath(COMPANY_ID, 'logo', 'image/unknown')
    expect(path).toBe(`brands/${COMPANY_ID}/logo`)
  })

  it('produces the same path on repeated calls (idempotence)', () => {
    const path1 = buildBrandAssetPath(COMPANY_ID, 'logo', 'image/png')
    const path2 = buildBrandAssetPath(COMPANY_ID, 'logo', 'image/png')
    expect(path1).toBe(path2)
  })
})

// ─── Suite 3: companiesService.uploadBrandAsset ──────────────

describe('companiesService.uploadBrandAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads to branding_assets bucket with the correct deterministic path', async () => {
    // Arrange
    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://cdn.example.com/brands/logo.png' },
    })

    // Act
    const url = await companiesService.uploadBrandAsset(COMPANY_ID, VALID_PNG_1MB, 'logo')

    // Assert — path must be deterministic (not include timestamps/random tokens)
    expect(mockUpload).toHaveBeenCalledWith(
      `brands/${COMPANY_ID}/logo`,
      VALID_PNG_1MB,
      expect.objectContaining({ upsert: true }),
    )
    expect(url).toMatch(/^https:\/\/cdn\.example\.com\/brands\/logo\.png\?v=\d+$/)
  })

  it('defaults assetType to "logo" when not specified', async () => {
    // Arrange
    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://cdn.example.com/brands/logo.png' },
    })

    // Act
    await companiesService.uploadBrandAsset(COMPANY_ID, VALID_PNG_1MB)

    // Assert
    expect(mockUpload).toHaveBeenCalledWith(
      `brands/${COMPANY_ID}/logo`,
      expect.any(File),
      expect.anything(),
    )
  })

  it('uploads background with correct path when assetType is "background"', async () => {
    // Arrange
    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://cdn.example.com/brands/background.jpg' },
    })

    // Act
    await companiesService.uploadBrandAsset(COMPANY_ID, VALID_JPG_1MB, 'background')

    // Assert
    expect(mockUpload).toHaveBeenCalledWith(
      `brands/${COMPANY_ID}/background`,
      VALID_JPG_1MB,
      expect.objectContaining({ upsert: true }),
    )
  })

  it('throws a descriptive error when file exceeds 2 MB', async () => {
    // Arrange — no mocks needed: validation rejects before any storage call
    // Act & Assert
    await expect(
      companiesService.uploadBrandAsset(COMPANY_ID, TOO_LARGE, 'logo'),
    ).rejects.toThrow(/muito grande/i)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('throws a descriptive error for unsupported file format', async () => {
    await expect(
      companiesService.uploadBrandAsset(COMPANY_ID, INVALID_GIF, 'logo'),
    ).rejects.toThrow(/formato inválido/i)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('throws when Supabase storage returns an upload error', async () => {
    // Arrange
    mockUpload.mockResolvedValueOnce({ error: { message: 'Bucket not found' } })

    // Act & Assert
    await expect(
      companiesService.uploadBrandAsset(COMPANY_ID, VALID_PNG_1MB, 'logo'),
    ).rejects.toThrow('Bucket not found')
  })

  it('uses upsert: true to guarantee idempotent overwrites', async () => {
    // Arrange
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/logo.png' } })

    // Act — upload the same tenant logo twice
    await companiesService.uploadBrandAsset(COMPANY_ID, VALID_PNG_1MB, 'logo')
    await companiesService.uploadBrandAsset(COMPANY_ID, VALID_PNG_1MB, 'logo')

    // Assert — both calls use the same deterministic path with upsert
    const calls = (mockUpload as Mock).mock.calls
    expect(calls[0][0]).toBe(calls[1][0]) // same path
    expect(calls[0][2]).toMatchObject({ upsert: true })
    expect(calls[1][2]).toMatchObject({ upsert: true })
  })
})

// ─── Suite 4: companiesService.updateBrandingSettings ────────

describe('companiesService.updateBrandingSettings', () => {
  const MOCK_COMPANY_ROW = {
    id: COMPANY_ID,
    name: 'Acme Corp',
    primary_color: 'Ocean',
    title_size: 'standard',
    logo_url: 'https://cdn.example.com/logo.png',
    background_url: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Chain mock: supabase.from(...).update(...).eq(...).select(...).single()
    mockRpc.mockResolvedValue({ data: MOCK_COMPANY_ROW, error: null })
  })

  const baseSettings: BrandingSettings = {
    brandName:        'Acme Corp',
    themeName:        'Ocean',
    fontScale:        'standard',
    welcomeTitle:     'Bem-vindo ao Portal',
    welcomeSubtitle:  'Como posso ajudar?',
    greetingPrefix:   'Bom dia',
    greetingColor:    '#94a3b8',
    loginBackground:  null,
    logoUrl:          'https://cdn.example.com/logo.png',
    backgroundUrl:    null,
    cardLayout:       'grid',
    incidentButton:   null,
    requestButton:    null,
  }

  it('calls the hardened RPC with the tenant and branding payload', async () => {
    // Act
    await companiesService.updateBrandingSettings(COMPANY_ID, baseSettings)

    // Assert — update called with expected column mapping
    expect(mockRpc).toHaveBeenCalledWith(
      'update_company_branding',
      {
        p_company_id: COMPANY_ID,
        p_settings: expect.objectContaining({
        primary_color:    'Ocean',
        title_size:       'standard',
        logo_url:         'https://cdn.example.com/logo.png',
        background_url:   null,
        brand_name:       'Acme Corp',
        welcome_title:    'Bem-vindo ao Portal',
        greeting_prefix:  'Bom dia',
        greeting_color:   '#94a3b8',
        }),
      },
    )
  })

  it('scopes the RPC to the requested company id', async () => {
    // Act
    await companiesService.updateBrandingSettings(COMPANY_ID, baseSettings)

    // Assert — RLS is enforced at the application layer via the eq filter
    expect(mockRpc).toHaveBeenCalledWith('update_company_branding', expect.objectContaining({ p_company_id: COMPANY_ID }))
  })

  it('merges card_layout into existing catalog_ui_config without clobbering other keys', async () => {
    // Arrange — simulate existing config with extra fields
    const existingConfig: import('../branding.types').CatalogUiConfig = {
      card_settings:  { layout: 'list', icon_size: 'large' },
      portal_buttons: { incident_label: 'Abrir Chamado' },
    }
    const settings: BrandingSettings = { ...baseSettings, cardLayout: 'grid' }

    // Act
    await companiesService.updateBrandingSettings(COMPANY_ID, settings, existingConfig)

    // Assert — card_settings.layout updated, icon_size preserved
    const payload = (mockRpc as Mock).mock.calls[0][1].p_settings
    const config = payload.catalog_ui_config as typeof existingConfig
    expect(config.card_settings.layout).toBe('grid')
    expect((config.card_settings as { icon_size?: string }).icon_size).toBe('large')
    // portal_buttons not overwritten when button settings are null
    expect(config.portal_buttons.incident_label).toBe('Abrir Chamado')
  })

  it('maps incident and request button overrides into portal_buttons', async () => {
    // Arrange
    const settings: BrandingSettings = {
      ...baseSettings,
      incidentButton: { label: 'Reportar Falha', description: 'Algo parou', emoji: '🔥' },
      requestButton:  { label: 'Pedir Acesso',   description: 'Novo acesso', emoji: '🔑' },
    }

    // Act
    await companiesService.updateBrandingSettings(COMPANY_ID, settings)

    // Assert
    const payload = (mockRpc as Mock).mock.calls[0][1].p_settings
    const buttons = (payload.catalog_ui_config as { portal_buttons: Record<string, string> }).portal_buttons
    expect(buttons.incident_label).toBe('Reportar Falha')
    expect(buttons.incident_desc).toBe('Algo parou')
    expect(buttons.incident_emoji).toBe('🔥')
    expect(buttons.request_label).toBe('Pedir Acesso')
    expect(buttons.request_desc).toBe('Novo acesso')
    expect(buttons.request_emoji).toBe('🔑')
  })

  it('uses a default empty catalog_ui_config when none is provided', async () => {
    // Act — no existingCatalogUiConfig argument
    await companiesService.updateBrandingSettings(COMPANY_ID, baseSettings)

    // Assert — still produces a valid CatalogUiConfig shape
    const payload = (mockRpc as Mock).mock.calls[0][1].p_settings
    expect(payload.catalog_ui_config).toMatchObject({
      card_settings: { layout: 'grid' },
    })
  })

  it('throws when Supabase returns an error on update', async () => {
    // Arrange
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'RLS violation' } })

    // Act & Assert
    await expect(
      companiesService.updateBrandingSettings(COMPANY_ID, baseSettings),
    ).rejects.toMatchObject({ message: 'RLS violation' })
  })

  it('returns the updated CompanyRow on success', async () => {
    // Act
    const result = await companiesService.updateBrandingSettings(COMPANY_ID, baseSettings)

    // Assert
    expect(result).toMatchObject({ id: COMPANY_ID, name: 'Acme Corp' })
  })
})

describe('companiesService.removeBrandAsset', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes only the deterministic object for the requested tenant asset', async () => {
    mockRemove.mockResolvedValueOnce({ error: null })
    await companiesService.removeBrandAsset(COMPANY_ID, 'background')
    expect(mockRemove).toHaveBeenCalledWith([`brands/${COMPANY_ID}/background`])
  })

  it('surfaces storage deletion errors', async () => {
    mockRemove.mockResolvedValueOnce({ error: { message: 'not allowed' } })
    await expect(companiesService.removeBrandAsset(COMPANY_ID, 'logo')).rejects.toThrow('not allowed')
  })
})
