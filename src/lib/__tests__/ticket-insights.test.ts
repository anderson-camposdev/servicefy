import { describe, expect, it } from 'vitest'
import { filterRequesterHistory, summarizeRequesterHistory } from '../ticket-insights'

const row = (overrides: Partial<{
  id: string
  state: string
  created_at: string
  sla_breached: boolean
}>) => ({
  id: 'ticket-1',
  state: 'New',
  created_at: '2026-07-01T10:00:00Z',
  sla_breached: false,
  ...overrides,
})

describe('histórico do solicitante no cockpit', () => {
  it('exclui o chamado atual, ordena do mais recente para o mais antigo e respeita o limite', () => {
    const rows = [
      row({ id: 'a', created_at: '2026-07-01T10:00:00Z' }),
      row({ id: 'atual', created_at: '2026-07-10T10:00:00Z' }),
      row({ id: 'b', created_at: '2026-07-05T10:00:00Z' }),
      row({ id: 'c', created_at: '2026-07-08T10:00:00Z' }),
    ]

    const history = filterRequesterHistory(rows, 'atual', 2)

    expect(history.map(item => item.id)).toEqual(['c', 'b'])
  })

  it('resume o histórico com totais operacionais (abertos e SLA estourado)', () => {
    const rows = [
      row({ id: 'a', state: 'Resolved' }),
      row({ id: 'b', state: 'In Progress', sla_breached: true }),
      row({ id: 'c', state: 'On Hold' }),
      row({ id: 'd', state: 'Closed' }),
    ]

    expect(summarizeRequesterHistory(rows)).toEqual({ total: 4, open: 2, breached: 1 })
  })

  it('lida com lista vazia sem quebrar', () => {
    expect(filterRequesterHistory([], 'x', 5)).toEqual([])
    expect(summarizeRequesterHistory([])).toEqual({ total: 0, open: 0, breached: 0 })
  })
})
