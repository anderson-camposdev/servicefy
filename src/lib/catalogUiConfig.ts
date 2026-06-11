import type { Json } from './database.types'

export type CatalogButtonStyle = 'solid' | 'outline' | 'ghost'
export type CatalogButtonSize = 'sm' | 'md' | 'lg'
export type CatalogButtonPosition = 'bottom' | 'right'

export interface CatalogUiConfig {
  iconSize: number
  buttonStyle: CatalogButtonStyle
  buttonSize: CatalogButtonSize
  buttonPosition: CatalogButtonPosition
  buttonLabel: string
}

export const DEFAULT_CATALOG_UI_CONFIG: CatalogUiConfig = {
  iconSize: 112,
  buttonStyle: 'ghost',
  buttonSize: 'sm',
  buttonPosition: 'bottom',
  buttonLabel: 'Selecionar',
}

export function parseCatalogUiConfig(value: Json | CatalogUiConfig | null | undefined): CatalogUiConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const iconSize = typeof raw.iconSize === 'number'
    ? Math.min(160, Math.max(64, raw.iconSize))
    : DEFAULT_CATALOG_UI_CONFIG.iconSize

  return {
    iconSize,
    buttonStyle: ['solid', 'outline', 'ghost'].includes(String(raw.buttonStyle))
      ? raw.buttonStyle as CatalogButtonStyle
      : DEFAULT_CATALOG_UI_CONFIG.buttonStyle,
    buttonSize: ['sm', 'md', 'lg'].includes(String(raw.buttonSize))
      ? raw.buttonSize as CatalogButtonSize
      : DEFAULT_CATALOG_UI_CONFIG.buttonSize,
    buttonPosition: ['bottom', 'right'].includes(String(raw.buttonPosition))
      ? raw.buttonPosition as CatalogButtonPosition
      : DEFAULT_CATALOG_UI_CONFIG.buttonPosition,
    buttonLabel: typeof raw.buttonLabel === 'string' && raw.buttonLabel.trim()
      ? raw.buttonLabel.trim().slice(0, 32)
      : DEFAULT_CATALOG_UI_CONFIG.buttonLabel,
  }
}

