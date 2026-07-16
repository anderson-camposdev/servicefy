// ============================================================
// ServiceFY ITSM — Autenticação (Supabase Auth real)
// ETAPA 3 — Contexto React de sessão/usuário
//
// Observa a sessão do Supabase Auth, carrega o profile vinculado
// (por auth_id) e expõe `isProvider` para a INTERFACE ADAPTATIVA
// (Portal do Provedor MSP vs. portal de cliente nas próximas etapas).
// ============================================================

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { CompanyRow, ProfileRow } from '../lib/database.types'
import {
  getAuthProfile,
  isProviderUser,
  signInWithPassword,
  signInWithOAuth,
  signOut as authSignOut,
} from './authService'
import type { SsoProvider } from '../lib/sso'

export type AuthStatus =
  | 'loading' // verificando sessão / carregando profile
  | 'authenticated' // sessão válida + profile vinculado
  | 'unlinked' // sessão válida porém sem profile (aguardando provisionamento)
  | 'unauthenticated' // sem sessão
  | 'error'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  profile: ProfileRow | null
  company: CompanyRow | null
  /** TRUE se o usuário pertence ao tenant provedor ou é sysadmin. */
  isProvider: boolean
  role: string | null
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signInWithProvider: (provider: SsoProvider) => Promise<void>
  signOut: () => Promise<void>
  /** Recarrega profile + empresa da sessão atual (SPA, sem F5). */
  refreshCompany: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [isProvider, setIsProvider] = useState(false)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfile(null)
      setCompany(null)
      setIsProvider(false)
      setStatus('unauthenticated')
      return
    }
    try {
      const authProfile = await getAuthProfile(activeSession.user.id)
      if (!authProfile) {
        setProfile(null)
        setCompany(null)
        setIsProvider(false)
        setStatus('unlinked')
        return
      }
      setProfile(authProfile.profile)
      setCompany(authProfile.company)
      setIsProvider(isProviderUser(authProfile))
      setStatus('authenticated')
      setError(null)
    } catch (err: unknown) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Falha ao carregar o perfil do usuário')
    }
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      void loadProfile(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      void loadProfile(newSession)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    setStatus('loading')
    setError(null)
    try {
      await signInWithPassword(email, password)
      // onAuthStateChange dispara o carregamento do profile.
    } catch (err: unknown) {
      setStatus('unauthenticated')
      setError(err instanceof Error ? err.message : 'Falha no login')
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    await authSignOut()
    // onAuthStateChange limpa o estado.
  }, [])

  const signInWithProvider = useCallback(async (provider: SsoProvider) => {
    setStatus('loading')
    setError(null)
    try {
      await signInWithOAuth(provider)
    } catch (err: unknown) {
      setStatus('unauthenticated')
      setError(err instanceof Error ? err.message : 'Falha no login corporativo')
      throw err
    }
  }, [])

  // Listen to profile updates in real-time to detect administrative deactivation — migration 071/IAM
  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel(`profile-status-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          const newProfile = payload.new as ProfileRow
          if (newProfile && newProfile.active === false) {
            void signOut().then(() => {
              alert('Sua sessão foi encerrada por decisões administrativas')
            })
          }
        }
      )
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [profile?.id, signOut])


  // Re-busca profile + empresa da sessão atual (ex.: após salvar branding).
  const refreshCompany = useCallback(async () => {
    await loadProfile(session)
  }, [loadProfile, session])

  const value: AuthContextValue = {
    status,
    session,
    profile,
    company,
    isProvider,
    role: profile?.role ?? null,
    error,
    signIn,
    signInWithProvider,
    signOut,
    refreshCompany,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Hook de acesso à sessão/usuário. Lança se usado fora do provider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  }
  return ctx
}
