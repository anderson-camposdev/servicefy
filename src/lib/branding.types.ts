// ============================================================
// ServiceFY ITSM — Tenant Branding Engine: Type Definitions
//
// Provides strongly-typed shapes for branding settings.
// Intentionally maps to existing `companies` columns so that
// no database migration is required (Option A).
// ============================================================

import type { ThemeName, FontScale } from './theme-engine'

// ─── Validation constants ────────────────────────────────────

/** Maximum allowed file size for brand assets (2 MB). */
export const BRANDING_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

/** Accepted MIME types for brand asset uploads. */
export const BRANDING_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
] as const

export type BrandingAllowedMimeType = (typeof BRANDING_ALLOWED_MIME_TYPES)[number]

// ─── Core branding payload ────────────────────────────────────

/**
 * Payload that the admin edits in `AdminPortalSettings`.
 * All file fields are optional — only provided when the user
 * selects a new file to upload.
 */
export interface BrandingSettings {
  /** Display name shown in the portal header. */
  brandName: string | null
  /** ThemeName key from the theme engine (maps to `companies.primary_color`). */
  themeName: ThemeName
  /** Title font scale (maps to `companies.title_size`). */
  fontScale: FontScale
  /** Portal welcome title (maps to `companies.welcome_title`). */
  welcomeTitle: string | null
  /** Portal welcome subtitle (maps to `companies.welcome_subtitle`). */
  welcomeSubtitle: string | null
  /** Greeting prefix shown in the portal top-bar (maps to `companies.greeting_prefix`). */
  greetingPrefix: string | null
  /** Hex colour for the greeting text (maps to `companies.greeting_color`). */
  greetingColor: string | null
  /** Login background — URL, hex or CSS gradient (maps to `companies.bg_color`). */
  loginBackground: string | null
  /**
   * Already-persisted URL for the company logo.
   * Pass `null` to clear the logo; omit (keep current value) by not including.
   */
  logoUrl: string | null
  /**
   * Already-persisted URL for the portal background image.
   * Pass `null` to clear the background.
   */
  backgroundUrl: string | null
  /** Card layout preference stored inside `catalog_ui_config.card_settings`. */
  cardLayout: 'grid' | 'list'
  /** Custom incident button overrides stored in `catalog_ui_config.portal_buttons`. */
  incidentButton: PortalButtonConfig | null
  /** Custom request button overrides stored in `catalog_ui_config.portal_buttons`. */
  requestButton: PortalButtonConfig | null
}

/** Customisation data for the portal's primary action buttons. */
export interface PortalButtonConfig {
  label: string | null
  description: string | null
  emoji: string | null
}

// ─── Structured JSONB helpers ─────────────────────────────────

/**
 * Strongly-typed shape for `companies.catalog_ui_config` that is
 * consumed by AdminPortalSettings and UserPortalLayout.
 *
 * NOTE: This type describes what the frontend writes/reads; the
 * Supabase column type is `Json` (opaque), so callers must cast
 * when reading: `(row.catalog_ui_config as CatalogUiConfig | null) ?? {}`.
 */
export interface CatalogUiConfig {
  card_settings: CardSettings
  portal_buttons: PortalButtonsConfig
}

export interface CardSettings {
  layout: 'grid' | 'list'
  icon_size?: 'small' | 'medium' | 'large' | 'xlarge'
  font_size?: 'small' | 'medium' | 'large'
  icon_bg_color?: string
  label_bg_color?: string
  label_color?: string
}

export interface PortalButtonsConfig {
  incident_label?: string
  incident_desc?: string
  incident_emoji?: string
  request_label?: string
  request_desc?: string
  request_emoji?: string
}

// ─── Upload results ──────────────────────────────────────────

/** Returned by `brandingService.uploadAssets()`. */
export interface BrandingUploadResult {
  /** Public URL of the uploaded logo, or `null` if not uploaded this call. */
  logoUrl: string | null
  /** Public URL of the uploaded background, or `null` if not uploaded this call. */
  backgroundUrl: string | null
}

// ─── Validation ──────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean
  error: string | null
}

/**
 * Validates a brand asset file against size and MIME-type constraints.
 * Pure function — no side effects, safe to use in unit tests without mocking.
 *
 * @param file - The File object selected by the user.
 * @returns `{ valid: true, error: null }` on success, or `{ valid: false, error }` on failure.
 *
 * @example
 * ```typescript
 * const result = validateBrandingFile(file)
 * if (!result.valid) toast.error(result.error!)
 * ```
 */
export function validateBrandingFile(file: File): FileValidationResult {
  if (file.size > BRANDING_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Arquivo muito grande. Tamanho máximo permitido: 2 MB (recebido: ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    }
  }

  const isAllowedType = (BRANDING_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)
  if (!isAllowedType) {
    return {
      valid: false,
      error: `Formato inválido. Formatos aceitos: PNG, JPG, SVG, WebP. Recebido: "${file.type || 'desconhecido'}".`,
    }
  }

  return { valid: true, error: null }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Returns the deterministic Supabase Storage path for a brand asset,
 * ensuring idempotent uploads (upsert always replaces the previous file).
 *
 * Path format: `brands/{companyId}/{assetType}.{ext}`
 *
 * @param companyId  - The tenant's UUID.
 * @param assetType  - `'logo'` or `'background'`.
 * @param mimeType   - MIME type used to derive the file extension.
 */
export function buildBrandAssetPath(
  companyId: string,
  assetType: 'logo' | 'background',
  mimeType: string,
): string {
  const extMap: Record<string, string> = {
    'image/png':     'png',
    'image/jpeg':    'jpg',
    'image/jpg':     'jpg',
    'image/svg+xml': 'svg',
    'image/webp':    'webp',
  }
  const ext = extMap[mimeType] ?? 'png'
  return `brands/${companyId}/${assetType}.${ext}`
}
