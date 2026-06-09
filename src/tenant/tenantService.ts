// ============================================================
// Flowfy ITSM — Multi-Tenant (White-Label)
// ETAPA 2 — Acesso aos dados do tenant no Supabase
//
// Busca a empresa (tenant) e seu branding. Roda ANTES do login,
// usando a chave anônima — a leitura pública de `companies` já é
// permitida pela policy `select_company_policy` (migration 008).
// ============================================================

import { supabase } from '../lib/supabase'
import type { CompanyRow } from '../lib/database.types'

/** Colunas necessárias para resolver o tenant e montar o branding. */
const TENANT_COLUMNS =
  'id, name, domain, slug, active, logo_url, primary_color, secondary_color, brand_name, accent_color, bg_color, welcome_title, welcome_subtitle'

/**
 * Busca um tenant ativo pelo slug (subdomínio).
 * Retorna null quando não existe ou está inativo — o caller decide o fallback.
 */
export async function getTenantBySlug(slug: string): Promise<CompanyRow | null> {
  const { data, error } = await supabase
    .from('companies')
    .select(TENANT_COLUMNS)
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()

  if (error) throw error
  return (data as CompanyRow) ?? null
}

/**
 * Busca um tenant ativo pelo domínio de e-mail corporativo.
 * Útil como fallback e para domínios customizados (ex.: suporte.cliente.com).
 */
export async function getTenantByDomain(domain: string): Promise<CompanyRow | null> {
  const { data, error } = await supabase
    .from('companies')
    .select(TENANT_COLUMNS)
    .eq('domain', domain.toLowerCase())
    .eq('active', true)
    .maybeSingle()

  if (error) throw error
  return (data as CompanyRow) ?? null
}
