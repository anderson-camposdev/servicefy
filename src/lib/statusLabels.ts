// ============================================================
// ServiceFY ITSM — Localização (PT-BR) dos estados do chamado
// Os valores no banco permanecem em inglês; aqui só a EXIBIÇÃO.
// ============================================================

export const STATE_LABELS_PT: Record<string, string> = {
  // Incident State
  New: 'Novo',
  'In Progress': 'Em Atendimento',
  'On Hold': 'Pendente',
  'Pending User': 'Pendente (Usuário)', // legado — não ofertado no dropdown
  Resolved: 'Resolvido',
  Closed: 'Fechado',

  // Request State
  Draft: 'Rascunho',
  'Awaiting Approval': 'Aguardando Aprovação',
  Approved: 'Aprovado',
  'In Fulfillment': 'Em Atendimento',
  Fulfilled: 'Atendido',
  Rejected: 'Rejeitado',
  Cancelled: 'Cancelado',

  // Problem State
  'Under Investigation': 'Em Investigação',
  'Root Cause Identified': 'Causa Raiz Identificada',
  'Known Error': 'Erro Conhecido',

  // Change State
  'Awaiting CAB Approval': 'Aguardando CAB',
  'CAB Approved': 'Aprovado pelo CAB',
  'CAB Rejected': 'Rejeitado pelo CAB',
  Scheduled: 'Agendado',
  'In Implementation': 'Em Implementação',
  Completed: 'Concluído',
  Failed: 'Falhou',

  // Task State
  Pending: 'Pendente',
  'Work in Progress': 'Em Progresso',
  Canceled: 'Cancelado', // Canceled com um L em TicketTask (TaskState)
}

/** Estado canônico de pendência (valor no banco). */
export const PENDING_STATE = 'On Hold'

/** Motivos de pendência (obrigatório ao colocar o chamado como Pendente). */
export const PENDING_REASONS = [
  'Pendente pelo usuário',
  'Pendente de fornecedor',
  'Pendente de aprovação',
  'Pendente de projeto',
] as const

/** Traduz o estado para PT-BR; mantém o original se não mapeado. */
export function translateState(state: string | null | undefined): string {
  if (!state) return '—'
  return STATE_LABELS_PT[state] ?? state
}
