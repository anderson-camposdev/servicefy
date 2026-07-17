// ============================================================
// ServiceFY ITSM — Multi-Tenant (White-Label)
// ETAPA 2 — Contexto React do Tenant
//
// Resolve o tenant (Etapa 1) → busca a empresa no Supabase →
// aplica o branding global → expõe tudo via useTenant().
// Não bloqueia a renderização: aplica o branding padrão de
// imediato e atualiza quando o tenant carrega.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CompanyRow } from '../lib/database.types'
import { resolveTenant, isCustomDomain } from './resolveTenant'
import type { TenantSource } from './resolveTenant'
import { getTenantBySlug, getTenantByHostname } from './tenantService'
import { brandingFromCompany, DEFAULT_BRANDING } from './applyBranding'
import type { TenantBranding } from './applyBranding'

/** Estado do carregamento do tenant. */
export type TenantStatus =
  | 'loading' // resolvendo / buscando no banco
  | 'ready' // tenant carregado com sucesso
  | 'no-tenant' // nenhum slug resolvido (domínio raiz / dev sem override)
  | 'not-found' // slug resolvido mas sem empresa ativa correspondente
  | 'error' // falha na consulta ao Supabase

export interface TenantContextValue {
  status: TenantStatus
  /** Slug resolvido do subdomínio/override (ou null). */
  slug: string | null
  /** Origem da resolução do slug. */
  source: TenantSource
  /** Linha completa da empresa (ou null se não resolvido). */
  tenant: CompanyRow | null
  /** Branding em uso — sempre preenchido (cai no padrão ServiceFY). */
  branding: TenantBranding
  /** Mensagem de erro, quando status === 'error'. */
  error: string | null
  /** Recarrega os dados visuais do tenant resolvido sem reload da SPA. */
  refreshTenant: () => Promise<void>
}

type TenantState = Omit<TenantContextValue, 'refreshTenant'>

const TenantContext = createContext<TenantContextValue | undefined>(undefined)

export function TenantProvider({ children }: { children: ReactNode }) {
  // Resolução do slug é síncrona — inicializa o estado de forma lazy
  // (evita setState síncrono dentro do efeito / cascata de renders).
  const [state, setState] = useState<TenantState>(() => {
    const { slug, source } = resolveTenant()
    const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
    const hasCustomDomain = hostname ? isCustomDomain(hostname) : false

    return {
      status: (slug || hasCustomDomain) ? 'loading' : 'no-tenant',
      slug,
      source: hasCustomDomain && !slug ? 'domain' : source,
      tenant: null,
      branding: DEFAULT_BRANDING,
      error: null,
    }
  })

  const refreshTenant = useCallback(async () => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
    const hasCustomDomain = hostname ? isCustomDomain(hostname) : false

    if (!state.slug && !hasCustomDomain) return

    let row: CompanyRow | null = null
    if (state.slug) {
      row = await getTenantBySlug(state.slug)
    } else if (hasCustomDomain) {
      row = await getTenantByHostname(hostname)
    }

    if (!row) {
      setState(prev => ({ ...prev, status: 'not-found', tenant: null, branding: DEFAULT_BRANDING }))
      return
    }
    setState(prev => ({
      ...prev,
      status: 'ready',
      tenant: row,
      branding: brandingFromCompany(row),
      slug: row.slug,
      error: null,
    }))
  }, [state.slug])

  useEffect(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
    const hasCustomDomain = hostname ? isCustomDomain(hostname) : false

    if (!state.slug && !hasCustomDomain) return
    if (state.tenant) return // evita busca duplicada se já carregado

    let cancelled = false

    const fetchTenant = async () => {
      try {
        let row: CompanyRow | null = null
        if (state.slug) {
          row = await getTenantBySlug(state.slug)
        } else if (hasCustomDomain) {
          row = await getTenantByHostname(hostname)
        }

        if (cancelled) return

        if (!row) {
          setState(prev => ({ ...prev, status: 'not-found' }))
          return
        }

        const branding = brandingFromCompany(row)
        setState(prev => ({
          ...prev,
          status: 'ready',
          tenant: row,
          branding,
          slug: row.slug,
        }))
      } catch (err: unknown) {
        if (cancelled) return
        setState(prev => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Falha ao carregar o tenant',
        }))
      }
    }

    void fetchTenant()

    return () => {
      cancelled = true
    }
  }, [state.slug])

  return <TenantContext.Provider value={{ ...state, refreshTenant }}>{children}</TenantContext.Provider>
}

/** Hook de acesso ao tenant atual. Lança se usado fora do provider. */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext)
  if (ctx === undefined) {
    throw new Error('useTenant precisa estar dentro de <TenantProvider>')
  }
  return ctx
}
