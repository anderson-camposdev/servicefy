export type ExecutiveInsightTone = 'critical' | 'warning' | 'positive' | 'neutral'

export interface ExecutiveMetricsLike {
  total_opened: number
  total_resolved: number
  sla_compliance_pct: number | null
  by_status?: Record<string, number> | null
}

export interface ExecutiveBriefMetrics extends ExecutiveMetricsLike {
  mttr_hours: number | null
  mttr_minutes: number | null
  previous_total_opened: number
  previous_total_resolved: number
  previous_sla_compliance_pct: number | null
  previous_mttr_minutes: number | null
  backlog_at_end: number
  backlog_at_start: number
  critical_backlog: number
  breached_resolved: number
  reopen_rate_pct: number | null
  aging_buckets: Record<string, number>
}

export interface ExecutiveDecision {
  tone: 'critical' | 'warning' | 'positive' | 'neutral'
  title: string
  rationale: string
  recommendation: string
}

export interface ExecutiveBrief {
  demandBalance: number
  resolutionRate: number | null
  backlogDelta: number
  openedChangePct: number | null
  resolvedChangePct: number | null
  slaDeltaPp: number | null
  mttrDeltaMinutes: number | null
  agingRiskCount: number
  leadingQueue: { status: string; count: number; share: number } | null
  decisions: ExecutiveDecision[]
}

export interface ExecutiveInsight {
  tone: ExecutiveInsightTone
  title: string
  description: string
  action: string
}

const BLOCKED_STATES = ['Pending Approval', 'On Hold', 'Pending User']

export function buildExecutiveInsight(metrics: ExecutiveMetricsLike): ExecutiveInsight {
  const statuses = metrics.by_status ?? {}
  const statusTotal = Object.values(statuses).reduce((sum, value) => sum + value, 0)
  if (metrics.total_opened === 0 && metrics.total_resolved === 0 && statusTotal === 0) {
    return {
      tone: 'neutral',
      title: 'Ainda não há dados para interpretar',
      description: 'O período selecionado não possui chamados ou movimentações registradas.',
      action: 'Amplie o período para comparar o desempenho.',
    }
  }

  const compliance = metrics.sla_compliance_pct
  if (compliance !== null && compliance < 70) {
    return {
      tone: 'critical',
      title: 'Risco de SLA exige ação',
      description: `A conformidade está em ${compliance.toFixed(1)}%, abaixo do limite operacional de 70%.`,
      action: 'Priorize chamados vencidos e revise capacidade e regras de escalonamento.',
    }
  }

  const blocked = BLOCKED_STATES.reduce((sum, state) => sum + (statuses[state] ?? 0), 0)
  const blockedRatio = statusTotal > 0 ? blocked / statusTotal : 0
  if (blocked >= 3 && blockedRatio >= 0.3) {
    return {
      tone: 'warning',
      title: 'Pendências estão limitando o fluxo',
      description: `${blocked} chamados (${Math.round(blockedRatio * 100)}%) aguardam aprovação, usuário ou dependência externa.`,
      action: 'Atue sobre a maior fila de espera antes de aumentar a entrada.',
    }
  }

  const backlogDelta = metrics.total_opened - metrics.total_resolved
  if (backlogDelta > 0) {
    return {
      tone: 'warning',
      title: 'A entrada superou as resoluções',
      description: `Foram abertos ${backlogDelta} chamados a mais do que os resolvidos no período.`,
      action: 'Verifique as filas com maior concentração e redistribua capacidade.',
    }
  }

  if (compliance !== null && compliance < 90) {
    return {
      tone: 'warning',
      title: 'SLA está abaixo da faixa saudável',
      description: `A conformidade está em ${compliance.toFixed(1)}%; a referência operacional é 90% ou mais.`,
      action: 'Investigue prioridades e serviços com maior tempo de solução.',
    }
  }

  return {
    tone: 'positive',
    title: 'Operação estável no período',
    description: compliance === null
      ? 'O volume resolvido acompanha a entrada, mas ainda não há amostra suficiente para SLA.'
      : `As resoluções acompanham a entrada e a conformidade de SLA está em ${compliance.toFixed(1)}%.`,
    action: 'Mantenha o acompanhamento e investigue desvios por status.',
  }
}

export function translateExecutiveStatus(status: string): string {
  const labels: Record<string, string> = {
    New: 'Novo',
    'In Progress': 'Em atendimento',
    'Pending Approval': 'Aguardando aprovação',
    'On Hold': 'Em espera',
    'Pending User': 'Aguardando usuário',
    Resolved: 'Resolvido',
    Closed: 'Fechado',
  }
  return labels[status] ?? status
}

export function buildExecutiveBrief(metrics: ExecutiveBriefMetrics): ExecutiveBrief {
  const statuses = metrics.by_status ?? {}
  const statusTotal = Object.values(statuses).reduce((sum, value) => sum + value, 0)
  const demandBalance = metrics.total_opened - metrics.total_resolved
  const backlogDelta = metrics.backlog_at_end - metrics.backlog_at_start
  const resolutionRate = metrics.total_opened > 0
    ? Math.round((metrics.total_resolved / metrics.total_opened) * 100)
    : null
  const percentChange = (current: number, previous: number) =>
    previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
  const openedChangePct = percentChange(metrics.total_opened, metrics.previous_total_opened)
  const resolvedChangePct = percentChange(metrics.total_resolved, metrics.previous_total_resolved)
  const slaDeltaPp = metrics.sla_compliance_pct !== null && metrics.previous_sla_compliance_pct !== null
    ? Number((metrics.sla_compliance_pct - metrics.previous_sla_compliance_pct).toFixed(1))
    : null
  const mttrDeltaMinutes = metrics.mttr_minutes !== null && metrics.previous_mttr_minutes !== null
    ? Number((metrics.mttr_minutes - metrics.previous_mttr_minutes).toFixed(1))
    : null
  const agingRiskCount = (metrics.aging_buckets['16-30'] ?? 0) + (metrics.aging_buckets['30+'] ?? 0)

  const activeEntries = Object.entries(statuses)
    .filter(([status]) => !['Resolved', 'Closed'].includes(status))
    .sort((a, b) => b[1] - a[1])
  const leadingQueue = activeEntries[0]
    ? {
        status: activeEntries[0][0],
        count: activeEntries[0][1],
        share: statusTotal > 0 ? Math.round((activeEntries[0][1] / statusTotal) * 100) : 0,
      }
    : null

  const hasSample = metrics.total_opened > 0 || metrics.total_resolved > 0 || statusTotal > 0

  const decisions: ExecutiveDecision[] = []
  if (metrics.sla_compliance_pct !== null && metrics.sla_compliance_pct < 90) {
    const gap = 90 - metrics.sla_compliance_pct
    decisions.push({
      tone: metrics.sla_compliance_pct < 70 ? 'critical' : 'warning',
      title: 'Recuperar a conformidade de SLA',
      rationale: `O indicador está ${gap.toFixed(1)} p.p. abaixo da faixa executiva de 90%.`,
      recommendation: 'Concentrar a revisão nos chamados vencidos, prioridades altas e regras de escalonamento.',
    })
  }
  if (backlogDelta > 0) {
    decisions.push({
      tone: backlogDelta >= Math.max(5, metrics.backlog_at_start * 0.2) ? 'critical' : 'warning',
      title: 'Reequilibrar entrada e capacidade',
      rationale: `O backlog no fechamento aumentou em ${backlogDelta} chamados, de ${metrics.backlog_at_start} para ${metrics.backlog_at_end}.`,
      recommendation: 'Redistribuir capacidade para a maior fila ativa e revisar as causas de entrada recorrente.',
    })
  }
  if (metrics.critical_backlog > 0) {
    decisions.push({
      tone: 'critical',
      title: 'Atuar sobre o backlog crítico',
      rationale: `${metrics.critical_backlog} chamados P1/P2 permaneciam abertos no fechamento.`,
      recommendation: 'Revisar responsáveis, impedimentos e previsão de recuperação de cada chamado crítico.',
    })
  }
  if (metrics.mttr_hours !== null && metrics.mttr_hours > 8) {
    decisions.push({
      tone: 'warning',
      title: 'Reduzir o tempo médio de solução',
      rationale: `O MTTR está em ${metrics.mttr_hours.toFixed(1)} horas úteis.`,
      recommendation: 'Investigar repasses, esperas e categorias com maior tempo de ciclo.',
    })
  }
  if (decisions.length === 0) {
    decisions.push({
      tone: hasSample ? 'positive' : 'neutral',
      title: hasSample ? 'Preservar a estabilidade operacional' : 'Construir uma amostra confiável',
      rationale: hasSample
        ? 'Entrada, resolução e SLA estão dentro de uma faixa saudável.'
        : 'O período não contém volume suficiente para uma leitura executiva.',
      recommendation: hasSample
        ? 'Manter o acompanhamento semanal e atuar preventivamente sobre desvios.'
        : 'Ampliar o período ou confirmar a ingestão dos dados operacionais.',
    })
  }

  return {
    demandBalance,
    resolutionRate,
    backlogDelta,
    openedChangePct,
    resolvedChangePct,
    slaDeltaPp,
    mttrDeltaMinutes,
    agingRiskCount,
    leadingQueue,
    decisions: decisions.slice(0, 3),
  }
}
