import type { CompanyLoginDomainRow } from './database.types'
import type { Json } from './database.generated'
import { normalizeSsoProviders, type SsoProvider } from './sso'
import { supabase } from './supabase'

export interface CompanyLoginPolicy {
  allowLocalLogin: boolean
  providers: SsoProvider[]
  domains: CompanyLoginDomainRow[]
}

export const loginIntegrationService = {
  async getPolicy(companyId: string): Promise<CompanyLoginPolicy> {
    const [companyResult, domainsResult] = await Promise.all([
      supabase
        .from('companies')
        .select('allow_local_login, sso_providers')
        .eq('id', companyId)
        .single(),
      supabase
        .from('company_login_domains')
        .select('id, company_id, domain, is_primary, verified_at, created_at, updated_at')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false })
        .order('domain'),
    ])

    if (companyResult.error) throw companyResult.error
    if (domainsResult.error) throw domainsResult.error

    return {
      allowLocalLogin: companyResult.data.allow_local_login,
      providers: normalizeSsoProviders(companyResult.data.sso_providers),
      domains: (domainsResult.data ?? []) as CompanyLoginDomainRow[],
    }
  },

  async updatePolicy(
    companyId: string,
    allowLocalLogin: boolean,
    providers: SsoProvider[],
  ): Promise<{ allow_local_login: boolean; sso_providers: Json }> {
    const { data, error } = await supabase.rpc('update_company_login_policy', {
      p_company_id: companyId,
      p_allow_local_login: allowLocalLogin,
      p_sso_providers: providers as Json,
    })
    if (error) throw error
    return {
      allow_local_login: data.allow_local_login,
      sso_providers: data.sso_providers,
    }
  },
}
