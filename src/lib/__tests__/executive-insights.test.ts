import { describe, expect, it } from 'vitest'
import { buildExecutiveBrief, buildExecutiveInsight, translateExecutiveStatus } from '../executive-insights'

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

describe('buildExecutiveBrief', () => {
  it('transforma métricas em comparações auditáveis e decisões priorizadas', () => {
    const brief = buildExecutiveBrief({
      total_opened: 100,
      previous_total_opened: 80,
      total_resolved: 72,
      previous_total_resolved: 76,
      sla_compliance_pct: 68,
      previous_sla_compliance_pct: 77,
      mttr_hours: 11.5,
      mttr_minutes: 690,
      previous_mttr_minutes: 540,
      backlog_at_end: 48,
      backlog_at_start: 20,
      critical_backlog: 9,
      breached_resolved: 23,
      reopen_rate_pct: 12,
      aging_buckets: { '30+': 8 },
      by_status: { New: 18, 'In Progress': 20, 'Pending Approval': 12, 'Pending User': 10, Resolved: 40 },
    })

    expect(brief.demandBalance).toBe(28)
    expect(brief.resolutionRate).toBe(72)
    expect(brief.backlogDelta).toBe(28)
    expect(brief.openedChangePct).toBe(25)
    expect(brief.slaDeltaPp).toBe(-9)
    expect(brief.decisions[0].title).toContain('SLA')
    expect(brief.decisions.some(item => item.title.includes('capacidade'))).toBe(true)
  })

  it('reconhece operação estável sem criar score artificial', () => {
    const brief = buildExecutiveBrief({
      total_opened: 80,
      previous_total_opened: 84,
      total_resolved: 86,
      previous_total_resolved: 82,
      sla_compliance_pct: 96,
      previous_sla_compliance_pct: 94,
      mttr_hours: 2.4,
      mttr_minutes: 144,
      previous_mttr_minutes: 160,
      backlog_at_end: 14,
      backlog_at_start: 20,
      critical_backlog: 0,
      breached_resolved: 2,
      reopen_rate_pct: 2,
      aging_buckets: {},
      by_status: { New: 4, 'In Progress': 10, Resolved: 66 },
    })

    expect(brief.demandBalance).toBe(-6)
    expect(brief.backlogDelta).toBe(-6)
    expect(brief.decisions[0].tone).toBe('positive')
  })

  it('mantém indicadores seguros quando não há abertura no período', () => {
    const brief = buildExecutiveBrief({
      total_opened: 0,
      previous_total_opened: 0,
      total_resolved: 0,
      previous_total_resolved: 0,
      sla_compliance_pct: null,
      previous_sla_compliance_pct: null,
      mttr_hours: null,
      mttr_minutes: null,
      previous_mttr_minutes: null,
      backlog_at_end: 0,
      backlog_at_start: 0,
      critical_backlog: 0,
      breached_resolved: 0,
      reopen_rate_pct: null,
      aging_buckets: {},
      by_status: {},
    })

    expect(brief.resolutionRate).toBeNull()
    expect(brief.openedChangePct).toBeNull()
  })
})
