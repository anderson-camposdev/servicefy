import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailDeliveryPolicyForm } from '../EmailDeliveryPolicyForm'

const { mockFrom, mockRpc, mockOrder } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockOrder: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}))

describe('EmailDeliveryPolicyForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrder.mockResolvedValue({
      data: [{ event_type: 'ticket_opened', allow_global_fallback: true }],
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ order: mockOrder })),
      })),
    })
    mockRpc.mockResolvedValue({ error: null })
  })

  it('carrega políticas existentes e atualiza fallback somente pela RPC', async () => {
    render(<EmailDeliveryPolicyForm companyId="company-123" />)

    const toggle = await screen.findByRole('checkbox', { name: 'Fallback global para Novo chamado registrado' }) as HTMLInputElement
    expect(toggle.checked).toBe(true)

    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar política de contingência' }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('save_tenant_email_delivery_policy', {
      p_company_id: 'company-123',
      p_event_type: 'ticket_opened',
      p_allow_global_fallback: false,
    }))
    expect(screen.getByRole('status').textContent).toContain('Política de contingência salva.')
  })
})
