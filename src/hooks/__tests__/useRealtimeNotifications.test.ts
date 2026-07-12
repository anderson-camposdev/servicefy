import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeNotifications } from '../useRealtimeNotifications'

const { mockFrom, mockChannel, mockRemoveChannel, mockOn, mockSubscribe, mockUpdate, mockUpdateEq } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockOn: vi.fn(),
  mockSubscribe: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateEq: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    from: mockFrom,
  },
}))

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    company_id: 'company-123',
    user_id: 'profile-123',
    title: 'Novo ticket atribuído',
    message: 'O ticket INC001 foi direcionado para você.',
    type: 'info',
    read: false,
    linked_ticket_id: 'ticket-1',
    linked_ticket_type: 'incident',
    link: '/tickets/ticket-1',
    created_at: '2026-07-12T12:00:00.000Z',
    ...overrides,
  }
}

function mockInitialFetch(data: Array<Record<string, unknown>>) {
  const eq2 = vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve({ data, error: null })),
    })),
  }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  mockFrom.mockReturnValue({
    select: vi.fn(() => ({ eq: eq1 })),
    update: mockUpdate,
  })
  return { eq1, eq2 }
}

describe('useRealtimeNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.mockReturnValue({ on: mockOn })
    mockOn.mockReturnValue({ subscribe: mockSubscribe })
    mockSubscribe.mockReturnValue({ unsubscribe: vi.fn() })
    mockUpdateEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockUpdateEq })
  })

  it('não abre canal nem busca dados sem profileId/companyId', () => {
    renderHook(() => useRealtimeNotifications(null, null))

    expect(mockChannel).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('assina um único canal filtrado por user_id no servidor e busca o estado inicial', async () => {
    mockInitialFetch([notificationRow()])

    const { result } = renderHook(() => useRealtimeNotifications('profile-123', 'company-123'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockChannel).toHaveBeenCalledWith('notifications:profile-123')
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', table: 'notifications', filter: 'user_id=eq.profile-123' }),
      expect.any(Function),
    )
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })

  it('adiciona ao estado uma notificação recebida via realtime', async () => {
    mockInitialFetch([])
    let realtimeHandler: (payload: { new: Record<string, unknown> }) => void = () => undefined
    mockOn.mockImplementation((_event: string, _config: unknown, handler: typeof realtimeHandler) => {
      realtimeHandler = handler
      return { subscribe: mockSubscribe }
    })

    const { result } = renderHook(() => useRealtimeNotifications('profile-123', 'company-123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      realtimeHandler({ new: notificationRow({ id: 'notif-2' }) })
    })

    await waitFor(() => expect(result.current.notifications).toHaveLength(1))
    expect(result.current.notifications[0].id).toBe('notif-2')
    expect(result.current.unreadCount).toBe(1)
  })

  it('markAsRead faz update otimista local e persiste só a coluna read', async () => {
    mockInitialFetch([notificationRow()])
    const { result } = renderHook(() => useRealtimeNotifications('profile-123', 'company-123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.markAsRead('notif-1')
    })

    expect(result.current.notifications[0].read).toBe(true)
    expect(result.current.unreadCount).toBe(0)
    expect(mockUpdate).toHaveBeenCalledWith({ read: true })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'notif-1')
  })

  it('remove o canal ao desmontar (cleanup real, não só unsubscribe)', async () => {
    mockInitialFetch([])
    const { unmount } = renderHook(() => useRealtimeNotifications('profile-123', 'company-123'))
    await waitFor(() => expect(mockFrom).toHaveBeenCalled())

    unmount()

    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })
})
