import { describe, expect, it } from 'vitest'
import { compareOperationalPriority, getSlaHealth } from '../ticket-operations'

const now = new Date('2026-07-18T12:00:00.000Z')

describe('priorização da fila operacional', () => {
  it('considera em risco apenas SLAs dentro da janela operacional', () => {
    expect(getSlaHealth({ status: 'In Progress', slaDeadline: '2026-07-18T15:30:00.000Z' }, now)).toBe('at-risk')
    expect(getSlaHealth({ status: 'In Progress', slaDeadline: '2026-07-19T12:00:00.000Z' }, now)).toBe('healthy')
  })

  it('identifica prazo vencido mesmo quando o sinalizador ainda não foi persistido', () => {
    expect(getSlaHealth({ status: 'New', slaDeadline: '2026-07-18T11:59:00.000Z' }, now)).toBe('breached')
  })

  it('não alerta em tickets já concluídos', () => {
    expect(getSlaHealth({ status: 'Resolved', slaBreached: true, slaDeadline: '2026-07-18T10:00:00.000Z' }, now)).toBe('completed')
  })

  it('ordena violações antes de risco, saudáveis e concluídos', () => {
    const rows = [
      { id: 'done', status: 'Closed', priority: 'P1 - Critical' },
      { id: 'healthy', status: 'New', priority: 'P2 - High', slaDeadline: '2026-07-19T12:00:00.000Z' },
      { id: 'risk', status: 'New', priority: 'P3 - Moderate', slaDeadline: '2026-07-18T14:00:00.000Z' },
      { id: 'breached', status: 'In Progress', priority: 'P4 - Low', slaBreached: true },
    ]

    expect(rows.sort((a, b) => compareOperationalPriority(a, b, now)).map(row => row.id))
      .toEqual(['breached', 'risk', 'healthy', 'done'])
  })
})
