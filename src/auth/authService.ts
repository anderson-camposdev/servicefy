// ============================================================
// ServiceFY ITSM — Autenticação (Supabase Auth real)
// ETAPA 3 — Serviço de sessão + perfil do usuário logado
// ============================================================

import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { CompanyRow, ProfileRow } from '../lib/database.types'
import type { SsoProvider } from '../lib/sso'

/** Perfil do usuário logado já com a empresa (tenant) resolvida. */
export interface AuthProfile {
  profile: ProfileRow
  /** Linha completa de companies — o front usa o branding/licenças. */
  company: CompanyRow | null
}

/**
 * Carrega o profile do usuário autenticado a partir do auth_id
 * (= auth.users.id). Junta a empresa completa para o branding e
 * para sabermos se é provedor MSP. Retorna null quando ainda não
 * há profile vinculado.
 */
export async function getAuthProfile(authUserId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, company:companies!inner(*)')
    .eq('auth_id', authUserId)
    .eq('active', true)
    .eq('company.active', true)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const { company, ...profile } = data as unknown as ProfileRow & { company: CompanyRow | null }
  return { profile: profile as ProfileRow, company: (company as CompanyRow) ?? null }
}

/**
 * Regra de governança MSP: o usuário é "provedor" (superpoderes) se
 * pertence a um tenant com is_provider_tenant = true OU é sysadmin.
 * Espelha public.is_current_user_msp_admin() no banco.
 */
export function isProviderUser(authProfile: AuthProfile | null): boolean {
  if (!authProfile) return false
  return Boolean(authProfile.company?.is_provider_tenant) || authProfile.profile.role === 'sysadmin'
}

/**
 * Confirma no Supabase Auth que uma sessão recuperada do storage ainda pertence
 * ao usuário informado. O perfil e o papel só são carregados depois desta
 * verificação server-side.
 */
export async function validateStoredSession(session: Session | null): Promise<Session | null> {
  if (!session?.access_token || !session.user?.id) return null

  const { data, error } = await supabase.auth.getUser(session.access_token)
  if (error || !data.user || data.user.id !== session.user.id) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return null
  }

  return { ...session, user: data.user }
}

/** Login com e-mail e senha. */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/** Inicia OAuth no Supabase preservando o host/subdomínio atual do tenant. */
export async function signInWithOAuth(provider: SsoProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/`,
      ...(provider === 'azure' ? { scopes: 'email' } : {}),
    },
  })
  if (error) throw error
  return data
}

/** Encerra a sessão atual. */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
