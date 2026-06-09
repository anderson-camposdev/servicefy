// ============================================================
// Flowfy ITSM — Motor White-Label (ThemeProvider)
//
// Injeta as cores da empresa ativa em CSS Variables no :root.
// Empresa efetiva = a do usuário AUTENTICADO (useAuth) tem
// prioridade; na ausência (pré-login), usa o tenant do
// subdomínio/parâmetro (useTenant). As variáveis alimentam os
// utilitários Tailwind v4 `*-primary` / `*-secondary` (ver index.css).
// ============================================================

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTenant } from '../tenant'
import { useAuth } from '../auth'

const DEFAULTS = { primary: '#10b981', secondary: '#00a3e0', bg: '#f8fafc' }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const { company } = useAuth()

  // Prioriza a empresa do usuário logado; cai no tenant do subdomínio.
  const effective = company ?? tenant

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const primary = effective?.primary_color || DEFAULTS.primary
    const secondary = effective?.secondary_color || effective?.accent_color || DEFAULTS.secondary
    const bg = effective?.bg_color || DEFAULTS.bg

    // Fonte runtime das CSS Variables (os tokens @theme apontam para estas).
    root.style.setProperty('--brand-primary', primary)
    root.style.setProperty('--brand-secondary', secondary)
    root.style.setProperty('--brand-accent', secondary)
    root.style.setProperty('--brand-bg', bg)
  }, [
    effective?.id,
    effective?.primary_color,
    effective?.secondary_color,
    effective?.accent_color,
    effective?.bg_color,
  ])

  return <>{children}</>
}
