// ============================================================
// ServiceFY ITSM — Autenticação (Supabase Auth real)
// Barrel de exports do módulo de auth.
// ============================================================

export {
  getAuthProfile,
  isProviderUser,
  signInWithPassword,
  signInWithOAuth,
  signOut,
} from './authService'
export type { AuthProfile } from './authService'

export { AuthProvider, useAuth } from './AuthContext'
export type { AuthContextValue, AuthStatus } from './AuthContext'
