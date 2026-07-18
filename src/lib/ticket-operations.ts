export type SlaHealth = 'breached' | 'at-risk' | 'healthy' | 'completed' | 'unknown'

interface OperationalTicket {
  status?: string | null
  priority?: string | null
  slaBreached?: boolean
  slaDeadline?: string | null
}
const TERMINAL_STATES = new Set(['resolved', 'closed', 'resolvido', 'fechado', 'cancelled', 'cancelado'])

export function getSlaHealth(
  ticket: OperationalTicket,
  now = new Date(),
  warningHours = 4,
): SlaHealth {
  if (TERMINAL_STATES.has((ticket.status || '').toLocaleLowerCase('pt-BR'))) return 'completed'
  if (ticket.slaBreached) return 'breached'
  if (!ticket.slaDeadline) return 'unknown'

  const deadline = new Date(ticket.slaDeadline).getTime()
  if (!Number.isFinite(deadline)) return 'unknown'

  const remainingMs = deadline - now.getTime()
  if (remainingMs <= 0) return 'breached'
  if (remainingMs <= warningHours * 60 * 60 * 1000) return 'at-risk'
  return 'healthy'
}

export function compareOperationalPriority<T extends OperationalTicket>(left: T, right: T, now = new Date()): number {
  const slaRank: Record<SlaHealth, number> = {
    breached: 0,
    'at-risk': 1,
    healthy: 2,
    unknown: 3,
    completed: 4,
  }
  const slaDifference = slaRank[getSlaHealth(left, now)] - slaRank[getSlaHealth(right, now)]
  if (slaDifference !== 0) return slaDifference

  return priorityRank(left.priority) - priorityRank(right.priority)
}

function priorityRank(priority?: string | null): number {
  const normalized = (priority || '').toLocaleLowerCase('pt-BR')
  if (normalized.includes('p1') || normalized.includes('critical') || normalized.includes('crítica')) return 0
  if (normalized.includes('p2') || normalized.includes('high') || normalized.includes('alta')) return 1
  if (normalized.includes('p3') || normalized.includes('medium') || normalized.includes('moderada')) return 2
  if (normalized.includes('p4') || normalized.includes('low') || normalized.includes('baixa')) return 3
  return 4
}
