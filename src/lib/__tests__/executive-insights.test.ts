import { describe, expect, it } from 'vitest'
import { buildExecutiveInsight, translateExecutiveStatus } from '../executive-insights'

describe('buildExecutiveInsight', () => {
  it('prioriza risco crítico de SLA', () => {
    const insight = buildExecutiveInsight({
      total_opened: 20,
      total_resolved: 18,
      sla_compliance_pct: 62.4,
      by_status: { New: 2 },
    })

    expect(insight.tone).toBe('critical')
    expect(insight.description).toContain('62.4%')
  })

  it('identifica concentração relevante de bloqueios', () => {
    const insight = buildExecutiveInsight({
      total_opened: 10,
      total_resolved: 10,
      sla_compliance_pct: 95,
      by_status: { 'Pending User': 2, 'On Hold': 2, 'In Progress': 6 },
    })

    expect(insight.title).toBe('Pendências estão limitando o fluxo')
    expect(insight.description).toContain('40%')
  })

  it('explica crescimento de backlog', () => {
    const insight = buildExecutiveInsight({
      total_opened: 15,
      total_resolved: 9,
      sla_compliance_pct: 93,
      by_status: { New: 6 },
    })

    expect(insight.description).toContain('6 chamados a mais')
  })

  it('reconhece uma operação estável', () => {
    const insight = buildExecutiveInsight({
      total_opened: 12,
      total_resolved: 14,
      sla_compliance_pct: 96,
      by_status: { Resolved: 14 },
    })

    expect(insight.tone).toBe('positive')
  })

  it('orienta ampliar um período vazio', () => {
    const insight = buildExecutiveInsight({
      total_opened: 0,
      total_resolved: 0,
      sla_compliance_pct: null,
      by_status: {},
    })

    expect(insight.tone).toBe('neutral')
    expect(insight.action).toContain('Amplie o período')
  })

  it('degrada com segurança quando a distribuição não veio na resposta', () => {
    const insight = buildExecutiveInsight({
      total_opened: 8,
      total_resolved: 8,
      sla_compliance_pct: 92,
      by_status: undefined,
    })

    expect(insight.tone).toBe('positive')
  })
})

describe('translateExecutiveStatus', () => {
  it('traduz estados técnicos e preserva desconhecidos', () => {
    expect(translateExecutiveStatus('Pending Approval')).toBe('Aguardando aprovação')
    expect(translateExecutiveStatus('Custom')).toBe('Custom')
  })
})
