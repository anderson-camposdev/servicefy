// ============================================================
// ServiceFY — Leituras derivadas de tickets para o cockpit.
// Funções puras (sem I/O) para manter a lógica testável fora do
// componente: histórico do solicitante e resumos operacionais.
// ============================================================

interface RequesterHistoryRowLike {
  id: string
  state: string
  created_at: string
  sla_breached: boolean
}

const OPEN_STATES = new Set(['New', 'In Progress', 'On Hold', 'Pending User'])

/**
 * Prepara o histórico do solicitante para exibição: remove o chamado em foco,
 * ordena do mais recente para o mais antigo e limita o volume na tela.
 */
export function filterRequesterHistory<T extends RequesterHistoryRowLike>(
  rows: T[],
  currentTicketId: string,
  limit = 10,
): T[] {
  return rows
    .filter(item => item.id !== currentTicketId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

export function summarizeRequesterHistory(rows: RequesterHistoryRowLike[]): {
  total: number
  open: number
  breached: number
} {
  return {
    total: rows.length,
    open: rows.filter(item => OPEN_STATES.has(item.state)).length,
    breached: rows.filter(item => item.sla_breached).length,
  }
}
