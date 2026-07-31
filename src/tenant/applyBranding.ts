// ============================================================
// ServiceFY ITSM — Multi-Tenant (White-Label)
// ETAPA 2 — Aplicação do branding (cores, logo, favicon, título)
//
// Converte uma linha de `companies` num objeto de branding e o
// aplica globalmente via CSS variables em :root, além de favicon
// e document.title. As CSS vars alimentam os utilitários Tailwind
// `*-brand-*` definidos em index.css.
// ============================================================

import type { CompanyRow } from '../lib/database.types'
import { THEME_HEX_COLORS } from '../lib/theme-engine'
import type { ThemeName } from '../lib/theme-engine'

export interface TenantBranding {
  /** Nome de exibição da marca. */
  name: string
  logoUrl: string | null
  faviconUrl: string | null
  primaryColor: string
  accentColor: string
  backgroundColor: string
  welcomeTitle: string
  welcomeSubtitle: string
  titleColor: string | null
  titleFont: string | null
  titleSize: string | null
  subtitleColor: string | null
  subtitleFont: string | null
  subtitleSize: string | null
  /** ThemeName do motor de temas (mesmo valor que primaryColor para novos registros). */
  themeName: string
  /** URL da imagem de fundo compartilhada pelo login e portal do usuário. */
  backgroundUrl: string | null
  /** Escala da fonte dos títulos: 'compact' | 'standard' | 'large' | 'display'. */
  fontScale: string
  greetingPrefix: string | null
  greetingColor: string | null
}

/** Branding padrão do produto (ServiceFY) — usado fora de um tenant resolvido. */
export const DEFAULT_BRANDING: TenantBranding = {
  name: 'ServiceFY',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#075985',
  accentColor: '#F4C542',
  backgroundColor: '#f8fafc',
  welcomeTitle: 'Gestão de serviços para operações que não podem parar.',
  welcomeSubtitle: 'Incidentes, solicitações, problemas, mudanças e conhecimento trabalhando no mesmo fluxo.',
  titleColor: null,
  titleFont: null,
  titleSize: null,
  subtitleColor: null,
  subtitleFont: null,
  subtitleSize: null,
  themeName: 'Midnight',
  backgroundUrl: null,
  fontScale: 'standard',
  greetingPrefix: null,
  greetingColor: null,
}

/** Monta o branding a partir da linha de `companies`, com fallbacks seguros. */
export function brandingFromCompany(row: CompanyRow): TenantBranding {
  return {
    name: row.brand_name || row.name || DEFAULT_BRANDING.name,
    logoUrl: row.logo_url ?? null,
    faviconUrl: row.logo_url ?? null,
    primaryColor: row.primary_color || DEFAULT_BRANDING.primaryColor,
    accentColor: row.accent_color || DEFAULT_BRANDING.accentColor,
    backgroundColor: row.bg_color || DEFAULT_BRANDING.backgroundColor,
    welcomeTitle: row.welcome_title || DEFAULT_BRANDING.welcomeTitle,
    welcomeSubtitle: row.welcome_subtitle || DEFAULT_BRANDING.welcomeSubtitle,
    titleColor: row.title_color ?? null,
    titleFont: row.title_font ?? null,
    titleSize: row.title_size ?? null,
    subtitleColor: row.subtitle_color ?? null,
    subtitleFont: row.subtitle_font ?? null,
    subtitleSize: row.subtitle_size ?? null,
    themeName: row.primary_color || DEFAULT_BRANDING.themeName,
    backgroundUrl: row.background_url ?? null,
    fontScale: row.title_size || DEFAULT_BRANDING.fontScale,
    greetingPrefix: row.greeting_prefix ?? null,
    greetingColor: row.greeting_color ?? null,
  }
}

/** Atualiza (ou cria) o <link rel="icon"> do documento. */
function setFavicon(href: string | null): void {
  if (typeof document === 'undefined') return
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href || '/favicon.svg'
}

/**
 * Aplica o branding globalmente: CSS variables, favicon e título.
 * Idempotente — pode ser chamado a cada troca de tenant.
 */
export function applyBranding(branding: TenantBranding): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  const hexPrimary = THEME_HEX_COLORS[branding.primaryColor as ThemeName] || branding.primaryColor

  root.style.setProperty('--brand-primary', hexPrimary)
  root.style.setProperty('--brand-secondary', branding.accentColor)
  root.style.setProperty('--brand-accent', branding.accentColor)
  root.style.setProperty('--brand-bg', branding.backgroundColor)
  root.style.setProperty('--color-bg-primary', branding.backgroundColor)
  
  if (branding.titleColor) {
    root.style.setProperty('--brand-title-color', branding.titleColor)
  } else {
    root.style.removeProperty('--brand-title-color')
  }

  if (branding.titleFont) {
    root.style.setProperty('--brand-title-font', branding.titleFont)
  } else {
    root.style.removeProperty('--brand-title-font')
  }

  if (branding.titleSize) {
    root.style.setProperty('--brand-title-size', branding.titleSize)
  } else {
    root.style.removeProperty('--brand-title-size')
  }

  if (branding.subtitleColor) {
    root.style.setProperty('--brand-subtitle-color', branding.subtitleColor)
  } else {
    root.style.removeProperty('--brand-subtitle-color')
  }

  if (branding.subtitleFont) {
    root.style.setProperty('--brand-subtitle-font', branding.subtitleFont)
  } else {
    root.style.removeProperty('--brand-subtitle-font')
  }

  if (branding.subtitleSize) {
    root.style.setProperty('--brand-subtitle-size', branding.subtitleSize)
  } else {
    root.style.removeProperty('--brand-subtitle-size')
  }

  document.title = branding.welcomeTitle || branding.name
  setFavicon(branding.faviconUrl)
}
