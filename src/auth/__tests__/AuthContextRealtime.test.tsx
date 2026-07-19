import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { AuthProvider, useAuth } from '../AuthContext'
import { useEffect } from 'react'

// Mock window.alert
const mockAlert = vi.spyOn(window, 'alert').mockImplementation(() => {});

// Mock Supabase client
const {
  mockGetSession,
  mockOnAuthStateChange,
  mockSignOut,
  mockChannel,
  mockOn,
  mockSubscribe,
  mockUnsubscribe,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockSignOut: vi.fn(),
  mockChannel: vi.fn(),
  mockOn: vi.fn(),
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
    channel: mockChannel,
  },
}))

// Mock authService
const {
  mockGetAuthProfile,
  mockAuthSignOut,
  mockValidateStoredSession,
} = vi.hoisted(() => ({
  mockGetAuthProfile: vi.fn(),
  mockAuthSignOut: vi.fn(),
  mockValidateStoredSession: vi.fn(),
}))

vi.mock('../authService', () => ({
  getAuthProfile: mockGetAuthProfile,
  isProviderUser: vi.fn().mockReturnValue(false),
  signInWithPassword: vi.fn(),
  signOut: mockAuthSignOut,
  validateStoredSession: mockValidateStoredSession,
}))

// A helper component to read the auth state and trigger tests
function AuthConsumer({ onStateReady }: { onStateReady: (value: any) => void }) {
  const auth = useAuth()
  useEffect(() => {
    onStateReady(auth)
  }, [auth, onStateReady])
  return <div>Auth Context Tester</div>
}

describe('AuthContext — Reactive Session Revocation (Realtime)', () => {
  let container: HTMLDivElement | null = null
  let realtimeCallback: ((payload: any) => void) | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.clearAllMocks()

    realtimeCallback = null

    // Mock channel chain
    mockOn.mockImplementation((_event, _filter, callback) => {
      realtimeCallback = callback
      return { subscribe: mockSubscribe }
    })
    mockSubscribe.mockReturnValue({ unsubscribe: mockUnsubscribe })
    mockChannel.mockReturnValue({ on: mockOn })

    // Setup base supabase auth mock session
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'auth-user-123', email: 'test@acme.com' },
          access_token: 'token-abc',
        },
      },
    })
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
    mockValidateStoredSession.mockImplementation(async session => session)

    // Setup profile mock response
    mockGetAuthProfile.mockResolvedValue({
      profile: {
        id: 'profile-user-123',
        auth_id: 'auth-user-123',
        company_id: 'company-abc',
        name: 'Juliana Costa',
        email: 'test@acme.com',
        role: 'agent',
        active: true,
      },
      company: {
        id: 'company-abc',
        name: 'Acme Corp',
        is_provider_tenant: false,
      },
    })
  })

  afterEach(() => {
    if (container) {
      document.body.removeChild(container)
      container = null
    }
  })

  it('deve se inscrever no canal postgres_changes ao carregar perfil ativo', async () => {
    const root = createRoot(container!)
    let capturedAuth: any = null

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthConsumer onStateReady={(auth) => { capturedAuth = auth }} />
        </AuthProvider>
      )
    })

    // Aguarda carregar dados assincronos de login
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(capturedAuth.status).toBe('authenticated')
    expect(mockValidateStoredSession).toHaveBeenCalledWith(expect.objectContaining({
      access_token: 'token-abc',
    }))
    expect(mockChannel).toHaveBeenCalledWith('profile-status-profile-user-123')
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: 'id=eq.profile-user-123',
      },
      expect.any(Function)
    )
    expect(realtimeCallback).toBeTruthy()
  })

  it('não carrega perfil quando o servidor rejeita a sessão persistida', async () => {
    mockValidateStoredSession.mockResolvedValue(null)

    const root = createRoot(container!)
    let capturedAuth: any = null

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthConsumer onStateReady={(auth) => { capturedAuth = auth }} />
        </AuthProvider>
      )
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(capturedAuth.status).toBe('unauthenticated')
    expect(capturedAuth.session).toBeNull()
    expect(mockGetAuthProfile).not.toHaveBeenCalled()
  })

  it('deve invocar o logout e alertar o usuario quando o status for alterado para active=false em tempo real', async () => {
    const root = createRoot(container!)
    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthConsumer onStateReady={() => {}} />
        </AuthProvider>
      )
    })

    // Aguarda carregar dados assincronos
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(realtimeCallback).toBeTruthy()

    // Simula disparo de atualizacao do realtime com perfil inativo
    await act(async () => {
      realtimeCallback!({
        new: { id: 'profile-user-123', active: false },
      })
    })

    // Aguarda a resolucao do signOut
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(mockAuthSignOut).toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('Sua sessão foi encerrada por decisões administrativas')
  })
})
