// ============================================================
// Flowfy ITSM — Multi-Tenant (White-Label)
// ETAPA 2 — Aplicação do branding (cores, logo, favicon, título)
//
// Converte uma linha de `companies` num objeto de branding e o
// aplica globalmente via CSS variables em :root, além de favicon
// e document.title. As CSS vars alimentam os utilitários Tailwind
// `*-brand-*` definidos em index.css.
// ============================================================

import type { CompanyRow } from '../lib/database.types'

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
}

/** Branding padrão do produto (Flowfy) — usado fora de um tenant resolvido. */
export const DEFAULT_BRANDING: TenantBranding = {
  name: 'Flowfy',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#10b981',
  accentColor: '#00a3e0',
  backgroundColor: '#f8fafc',
  welcomeTitle: 'Flowfy ITSM Enterprise',
  welcomeSubtitle: 'Plataforma ITSM multi-tenant baseada no ITIL v4',
}

/** Monta o branding a partir da linha de `companies`, com fallbacks seguros. */
export function brandingFromCompany(row: CompanyRow): TenantBranding {
  return {
    name: row.name || DEFAULT_BRANDING.name,
    logoUrl: row.logo_url ?? null,
    faviconUrl: row.logo_url ?? null,
    primaryColor: row.primary_color || DEFAULT_BRANDING.primaryColor,
    accentColor: row.accent_color || DEFAULT_BRANDING.accentColor,
    backgroundColor: row.bg_color || DEFAULT_BRANDING.backgroundColor,
    welcomeTitle: row.welcome_title || DEFAULT_BRANDING.welcomeTitle,
    welcomeSubtitle: row.welcome_subtitle || DEFAULT_BRANDING.welcomeSubtitle,
  }
}

/** Atualiza (ou cria) o <link rel="icon"> do documento. */
function setFavicon(href: string | null): void {
  if (typeof document === 'undefined' || !href) return
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href
}

/**
 * Aplica o branding globalmente: CSS variables, favicon e título.
 * Idempotente — pode ser chamado a cada troca de tenant.
 */
export function applyBranding(branding: TenantBranding): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.style.setProperty('--brand-primary', branding.primaryColor)
  root.style.setProperty('--brand-accent', branding.accentColor)
  root.style.setProperty('--brand-bg', branding.backgroundColor)

  document.title = branding.welcomeTitle || branding.name
  setFavicon(branding.faviconUrl)
}
