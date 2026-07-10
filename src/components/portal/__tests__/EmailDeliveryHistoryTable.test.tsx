import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailDeliveryHistoryTable } from '../EmailDeliveryHistoryTable'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    created_at: '2026-07-10T12:00:00.000Z',
    ticket_id: 'ticket-uuid-1',
    event_type: 'ticket_opened',
    recipient_email: 'user@example.com',
    status: 'sent',
    last_error: null,
    tickets: { number: 'INC-001' },
    ...overrides,
  }
}

interface MockQueriesOptions {
  outboxData: Array<Record<string, unknown>>
  outboxCount: number
  eventsData?: Array<Record<string, unknown>>
}

function mockQueries({ outboxData, outboxCount, eventsData = [] }: MockQueriesOptions) {
  const outboxEq = vi.fn(() => ({
    order: vi.fn(() => ({
      range: vi.fn(() => Promise.resolve({ data: outboxData, error: null, count: outboxCount })),
    })),
  }))
  const eventsEqCompany = vi.fn()
  const eventsEqTransport = vi.fn(() => ({
    in: vi.fn(() => Promise.resolve({ data: eventsData, error: null })),
  }))
  eventsEqCompany.mockReturnValue({ eq: eventsEqTransport })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'ticket_email_outbox') {
      return { select: vi.fn(() => ({ eq: outboxEq })) }
    }
    if (table === 'ticket_email_delivery_events') {
      return { select: vi.fn(() => ({ eq: eventsEqCompany })) }
    }
    throw new Error(`tabela inesperada: ${table}`)
  })

  return { outboxEq, eventsEqCompany, eventsEqTransport }
}

describe('EmailDeliveryHistoryTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filtra estritamente pelo tenant atual em ambas as consultas', async () => {
    const { outboxEq, eventsEqCompany } = mockQueries({
      outboxData: [outboxRow()],
      outboxCount: 1,
      eventsData: [{ outbox_id: 'outbox-1', transport: 'global_smtp' }],
    })

    render(<EmailDeliveryHistoryTable companyId="company-123" />)
    await screen.findByText('#INC-001')

    expect(outboxEq).toHaveBeenCalledWith('company_id', 'company-123')
    expect(eventsEqCompany).toHaveBeenCalledWith('company_id', 'company-123')
  })

  it('lista data/hora, ticket, evento, destinatário e status', async () => {
    mockQueries({ outboxData: [outboxRow()], outboxCount: 1 })
    render(<EmailDeliveryHistoryTable companyId="company-123" />)

    expect(await screen.findByText('#INC-001')).toBeTruthy()
    expect(screen.getByText('user@example.com')).toBeTruthy()
    expect(screen.getByText('Abertura')).toBeTruthy()
    expect(screen.getByText('Enviado')).toBeTruthy()
  })

  it('exibe badge de fallback e erro humanizado quando o envio usou contingência', async () => {
    mockQueries({
      outboxData: [outboxRow({ last_error: 'Servidor SMTP indisponivel temporariamente.' })],
      outboxCount: 1,
      eventsData: [{ outbox_id: 'outbox-1', transport: 'global_smtp' }],
    })
    render(<EmailDeliveryHistoryTable companyId="company-123" />)

    expect(await screen.findByText('Via contingência')).toBeTruthy()
    expect(screen.getByText('Servidor SMTP do cliente indisponível — Enviado via contingência')).toBeTruthy()
  })

  it('exibe badge de falha definitiva sem o rótulo de contingência quando não houve fallback', async () => {
    mockQueries({
      outboxData: [outboxRow({ status: 'dead_letter', last_error: 'Autenticacao SMTP recusada.' })],
      outboxCount: 1,
    })
    render(<EmailDeliveryHistoryTable companyId="company-123" />)

    expect(await screen.findByText('Falhou')).toBeTruthy()
    expect(screen.getByText('Conexão rejeitada pelo servidor do cliente — Falha definitiva')).toBeTruthy()
    expect(screen.queryByText('Via contingência')).toBeNull()
  })

  it('mostra estado vazio quando não há histórico', async () => {
    mockQueries({ outboxData: [], outboxCount: 0 })
    render(<EmailDeliveryHistoryTable companyId="company-123" />)

    expect(await screen.findByText('Nenhum e-mail disparado ainda para este tenant.')).toBeTruthy()
  })

  it('avança para a próxima página preservando o filtro de tenant', async () => {
    const page1 = Array.from({ length: 10 }, (_, index) => outboxRow({ id: `outbox-${index}`, tickets: { number: `INC-${index}` } }))
    mockQueries({ outboxData: page1, outboxCount: 11 })
    render(<EmailDeliveryHistoryTable companyId="company-123" />)
    await screen.findByText('#INC-0')

    const page2 = mockQueries({ outboxData: [outboxRow({ id: 'outbox-10', tickets: { number: 'INC-10' } })], outboxCount: 11 })
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))

    await screen.findByText('#INC-10')
    expect(page2.outboxEq).toHaveBeenCalledWith('company_id', 'company-123')
    await waitFor(() => expect(screen.getByText('Página 2 de 2 · 11 envios')).toBeTruthy())
  })
})
