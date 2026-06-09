// ============================================================
// Flowfy ITSM — Multi-Tenant (White-Label)
// ETAPA 1 — Identificação do Tenant (lado do cliente)
//
// Como o Flowfy é uma SPA (Vite + React, sem servidor Node),
// não existe "middleware" de servidor. A resolução do tenant
// acontece no navegador, ANTES do app montar, a partir de:
//   1) Subdomínio em produção  → acme.flowfy.app  → "acme"
//   2) Query param (?tenant=)  → previews / staging / links diretos
//   3) localStorage            → desenvolvimento local (localhost)
//   4) Subdomínio em localhost → acme.localhost:5173 → "acme"
// ============================================================

/** Domínio base de produção. Subdomínios deste host viram tenants. */
export const BASE_DOMAIN = 'flowfy.app'

/** Chave usada para fixar o tenant em desenvolvimento local. */
export const TENANT_STORAGE_KEY = 'flowfy.tenant'

/** Nome do query param que sobrescreve o tenant (staging/previews). */
export const TENANT_QUERY_PARAM = 'tenant'

/**
 * Subdomínios reservados que NÃO representam um cliente.
 * Acessos a estes caem no fluxo padrão (sem tenant resolvido).
 */
export const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'auth',
  'static',
  'assets',
  'cdn',
])

/** De onde o slug do tenant foi resolvido (útil para debug/telemetria). */
export type TenantSource = 'subdomain' | 'query' | 'storage' | 'none'

export interface ResolvedTenant {
  /** Slug normalizado do tenant (ex.: "acme") ou null se não resolvido. */
  slug: string | null
  /** Origem da resolução. */
  source: TenantSource
}

/** Normaliza um candidato a slug: minúsculo, sem espaços, só [a-z0-9-]. */
function normalizeSlug(raw: string | null | undefined): string | null {
  if (!raw) return null
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  return slug.length > 0 ? slug : null
}

/**
 * Extrai o slug a partir do hostname.
 * Suporta produção (`*.flowfy.app`) e dev (`*.localhost`).
 * Retorna null para o domínio raiz, IPs, localhost puro ou subdomínios reservados.
 */
export function extractSlugFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/:\d+$/, '') // remove :porta

  // IP direto não tem subdomínio de tenant.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null

  let candidate: string | null = null

  if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) {
    candidate = null
  } else if (host.endsWith(`.${BASE_DOMAIN}`)) {
    // acme.flowfy.app → "acme"  |  acme.staging.flowfy.app → "acme"
    candidate = host.slice(0, -(`.${BASE_DOMAIN}`.length)).split('.')[0]
  } else if (host.endsWith('.localhost')) {
    // acme.localhost → "acme" (dev com subdomínio)
    candidate = host.slice(0, -('.localhost'.length)).split('.')[0]
  }

  const slug = normalizeSlug(candidate)
  if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null
  return slug
}

/**
 * Resolve o tenant atual a partir do ambiente do navegador.
 * Ordem de prioridade: subdomínio → query param → localStorage.
 *
 * O query param (quando presente) é persistido em localStorage para
 * sobreviver à navegação em ambientes sem subdomínio (ex.: localhost).
 */
export function resolveTenant(): ResolvedTenant {
  if (typeof window === 'undefined') {
    return { slug: null, source: 'none' }
  }

  // 1) Subdomínio (caminho oficial de produção)
  const fromHost = extractSlugFromHostname(window.location.hostname)
  if (fromHost) {
    return { slug: fromHost, source: 'subdomain' }
  }

  // 2) Query param (?tenant=acme) — staging, previews, links diretos
  const params = new URLSearchParams(window.location.search)
  const fromQuery = normalizeSlug(params.get(TENANT_QUERY_PARAM))
  if (fromQuery) {
    try {
      window.localStorage.setItem(TENANT_STORAGE_KEY, fromQuery)
    } catch {
      /* localStorage indisponível (modo privado) — segue sem persistir */
    }
    return { slug: fromQuery, source: 'query' }
  }

  // 3) localStorage (desenvolvimento local)
  try {
    const fromStorage = normalizeSlug(window.localStorage.getItem(TENANT_STORAGE_KEY))
    if (fromStorage) {
      return { slug: fromStorage, source: 'storage' }
    }
  } catch {
    /* localStorage indisponível — ignora */
  }

  return { slug: null, source: 'none' }
}

/** Conveniência: retorna apenas o slug resolvido (ou null). */
export function getTenantSlug(): string | null {
  return resolveTenant().slug
}

/** Fixa o tenant manualmente em dev (ex.: seletor de tenant na UI de testes). */
export function setTenantOverride(slug: string): void {
  const normalized = normalizeSlug(slug)
  if (!normalized) return
  try {
    window.localStorage.setItem(TENANT_STORAGE_KEY, normalized)
  } catch {
    /* ignora */
  }
}

/** Limpa o override de tenant em dev. */
export function clearTenantOverride(): void {
  try {
    window.localStorage.removeItem(TENANT_STORAGE_KEY)
  } catch {
    /* ignora */
  }
}
