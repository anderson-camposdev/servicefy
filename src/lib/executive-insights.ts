export type ExecutiveInsightTone = 'critical' | 'warning' | 'positive' | 'neutral'

export interface ExecutiveMetricsLike {
  total_opened: number
  total_resolved: number
  sla_compliance_pct: number | null
  by_status?: Record<string, number> | null
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
