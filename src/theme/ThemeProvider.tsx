import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { CompanyRow } from '../lib/database.types'
import { useTenant, applyBranding, brandingFromCompany, DEFAULT_BRANDING } from '../tenant'
import type { TenantBranding } from '../tenant'
import { useAuth } from '../auth'

export interface BrandingContextValue {
  company: CompanyRow | null
  branding: TenantBranding
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const { company: authenticatedCompany, isProvider } = useAuth()
  // Provedor MSP navegando com o seletor de tenant (App.tsx) deve ver a marca
  // do tenant selecionado, não a da própria empresa-sede — mesma regra usada
  // por `currentCompany` em App.tsx. Sem isso, a marca fica presa na empresa
  // de origem do usuário mesmo depois de trocar de tenant no seletor.
  const company = (isProvider && tenant) ? tenant : (authenticatedCompany ?? tenant)
  const branding = useMemo(
    () => company ? brandingFromCompany(company) : DEFAULT_BRANDING,
    [company],
  )

  useEffect(() => {
    applyBranding(branding)
    const root = document.documentElement
    root.setAttribute('data-tenant', company?.slug || 'default')
    root.classList.remove('dark')
    root.classList.add('light')
  }, [branding, company?.slug])

  return (
    <BrandingContext.Provider value={{ company, branding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding(): BrandingContextValue {
  const context = useContext(BrandingContext)
  if (!context) throw new Error('useBranding precisa estar dentro de <ThemeProvider>')
  return context
}
