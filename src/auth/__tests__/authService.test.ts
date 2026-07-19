import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'

const { mockGetUser, mockSignOut } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
  },
}))

import { validateStoredSession } from '../authService'

const user = (id: string): User => ({
  id,
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-07-18T00:00:00.000Z',
})

const session = (id: string): Session => ({
  access_token: 'signed-access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: user(id),
})

describe('validateStoredSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
  })

  it('retorna a sessão com o usuário confirmado pelo servidor', async () => {
    const authoritativeUser = user('auth-user-1')
    mockGetUser.mockResolvedValue({ data: { user: authoritativeUser }, error: null })

    const result = await validateStoredSession(session('auth-user-1'))

    expect(mockGetUser).toHaveBeenCalledWith('signed-access-token')
    expect(result?.user).toBe(authoritativeUser)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('rejeita identidade divergente e remove a sessão somente deste navegador', async () => {
    mockGetUser.mockResolvedValue({ data: { user: user('other-user') }, error: null })

    await expect(validateStoredSession(session('auth-user-1'))).resolves.toBeNull()
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('não consulta o servidor quando a sessão está incompleta', async () => {
    await expect(validateStoredSession(null)).resolves.toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})
