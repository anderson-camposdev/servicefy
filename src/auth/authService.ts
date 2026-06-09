// ============================================================
// Flowfy ITSM — Autenticação (Supabase Auth real)
// ETAPA 3 — Serviço de sessão + perfil do usuário logado
// ============================================================

import { supabase } from '../lib/supabase'
import type { CompanyRow, ProfileRow } from '../lib/database.types'

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
    .select('*, company:companies(*)')
    .eq('auth_id', authUserId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const { company, ...profile } = data as ProfileRow & { company: CompanyRow | null }
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

/** Login com e-mail e senha. */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/** Encerra a sessão atual. */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
