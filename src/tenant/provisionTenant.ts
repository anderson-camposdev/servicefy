// ============================================================
// ServiceFY ITSM — Multi-Tenant (White-Label)
// ETAPA 5 — Provisionamento automatizado de novos clientes
//
// Wrapper do RPC public.provision_tenant. A autorização é feita
// no banco (somente o provedor MSP / sysadmin), espelhando o
// modelo de governança das demais operações.
// ============================================================

import { supabase } from '../lib/supabase'
import type { CompanyRow } from '../lib/database.types'

export interface ProvisionTenantInput {
  /** Identificador do subdomínio (acme.servicefy.app). Normalizado no banco. */
  slug: string
  name: string
  /** Domínio de e-mail corporativo (acme.com) usado na linkagem de profiles. */
  domain: string
  primaryColor?: string
  accentColor?: string
  bgColor?: string
  logoUrl?: string
  welcomeTitle?: string
  welcomeSubtitle?: string
  concurrentLicenses?: number
  licensePlan?: 'starter' | 'professional' | 'enterprise'
}

/**
 * Cria (ou atualiza, idempotente por slug) um tenant cliente.
 * Requer que o usuário autenticado seja do provedor MSP — caso
 * contrário o RPC lança erro de permissão (42501).
 */
export async function provisionTenant(input: ProvisionTenantInput): Promise<CompanyRow> {
  const { data, error } = await supabase.rpc('provision_tenant', {
    p_slug: input.slug,
    p_name: input.name,
    p_domain: input.domain,
    p_primary_color: input.primaryColor,
    p_accent_color: input.accentColor,
    p_bg_color: input.bgColor,
    p_logo_url: input.logoUrl,
    p_welcome_title: input.welcomeTitle,
    p_welcome_subtitle: input.welcomeSubtitle,
    p_concurrent_licenses: input.concurrentLicenses,
    p_license_plan: input.licensePlan,
  })

  if (error) throw error
  return data as unknown as CompanyRow
}
