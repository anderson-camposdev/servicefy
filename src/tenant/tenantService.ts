// ============================================================
// ServiceFY ITSM — Multi-Tenant (White-Label)
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
  'id, name, domain, slug, active, logo_url, background_url, primary_color, secondary_color, brand_name, accent_color, bg_color, welcome_title, welcome_subtitle, title_color, title_font, title_size, subtitle_color, subtitle_font, subtitle_size, catalog_headline, catalog_headline_color, catalog_headline_size, greeting_prefix, greeting_color, catalog_ui_config, allow_local_login, sso_providers'

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

/**
 * Busca um tenant ativo pelo hostname do navegador.
 * Tenta encontrar por correspondência direta do domínio da empresa,
 * ou via tabela de domínios de login verificados, com fallback para o parent domain.
 */
export async function getTenantByHostname(hostname: string): Promise<CompanyRow | null> {
  const host = hostname.toLowerCase().replace(/:\d+$/, '') // remove porta

  // 1. Busca direta pelo campo `domain` na tabela `companies`
  const { data: directCompany, error: directError } = await supabase
    .from('companies')
    .select(TENANT_COLUMNS)
    .eq('domain', host)
    .eq('active', true)
    .maybeSingle()

  if (directError) throw directError
  if (directCompany) return directCompany as CompanyRow

  // 2. Busca pela tabela `company_login_domains`
  const { data: domainRecord, error: domainError } = await supabase
    .from('company_login_domains')
    .select('company_id')
    .eq('domain', host)
    .maybeSingle()

  if (domainError) throw domainError
  if (domainRecord) {
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select(TENANT_COLUMNS)
      .eq('id', domainRecord.company_id)
      .eq('active', true)
      .maybeSingle()

    if (companyError) throw companyError
    if (company) return company as CompanyRow
  }

  // 3. Fallback: se o hostname tiver mais de 2 partes (ex: suporte.alliedit.com.br),
  // tenta buscar pelo domínio pai (alliedit.com.br)
  const parts = host.split('.')
  if (parts.length > 2) {
    // Para domínios de dois níveis (ex: alliedit.com.br), o parent domain é parts.slice(1).join('.')
    // Se o domínio for de 3 níveis (ex: suporte.alliedit.com.br), parts.slice(1).join('.') dará alliedit.com.br.
    // Se for suporte.alliedit.com, parts.slice(1).join('.') dará alliedit.com.
    const parentDomain = parts.slice(1).join('.')

    // Evitamos buscar coisas genéricas como ".com" ou ".com.br"
    if (parentDomain.includes('.')) {
      // Tenta busca direta pelo parent domain
      const { data: parentCompany, error: parentError } = await supabase
        .from('companies')
        .select(TENANT_COLUMNS)
        .eq('domain', parentDomain)
        .eq('active', true)
        .maybeSingle()

      if (parentError) throw parentError
      if (parentCompany) return parentCompany as CompanyRow

      // Tenta busca na company_login_domains pelo parent domain
      const { data: parentDomainRecord, error: parentDomainError } = await supabase
        .from('company_login_domains')
        .select('company_id')
        .eq('domain', parentDomain)
        .maybeSingle()

      if (parentDomainError) throw parentDomainError
      if (parentDomainRecord) {
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select(TENANT_COLUMNS)
          .eq('id', parentDomainRecord.company_id)
          .eq('active', true)
          .maybeSingle()

        if (companyError) throw companyError
        if (company) return company as CompanyRow
      }
    }
  }

  return null
}

