// ============================================================
// useTenantFeatureAccess — Gate de feature por plano/assinatura (Fase 12)
// Consulta a RPC check_tenant_feature_access (SECURITY DEFINER, fail-closed).
// Falha de rede/RPC é reportada separadamente de "sem acesso ao recurso":
// a UI decide o que mostrar em cada caso (erro vs. paywall).
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface TenantFeatureAccessState {
  checking: boolean
  hasAccess: boolean
  error: string
}

export function useTenantFeatureAccess(
  companyId: string,
  featureName: string,
  enabled = true,
): TenantFeatureAccessState {
  const [state, setState] = useState<TenantFeatureAccessState>({
    checking: true,
    hasAccess: false,
    error: '',
  })

  useEffect(() => {
    if (!enabled || !companyId) {
      setState({ checking: false, hasAccess: false, error: '' })
      return
    }

    let cancelled = false
    setState(current => ({ ...current, checking: true, error: '' }))

    supabase
      .rpc('check_tenant_feature_access', { p_company_id: companyId, p_feature_name: featureName })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ checking: false, hasAccess: false, error: error.message })
          return
        }
        setState({ checking: false, hasAccess: data === true, error: '' })
      })

    return () => { cancelled = true }
  }, [companyId, featureName, enabled])

  return state
}
