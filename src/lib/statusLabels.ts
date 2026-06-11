// ============================================================
// Flowfy ITSM — Localização (PT-BR) dos estados do chamado
// Os valores no banco permanecem em inglês; aqui só a EXIBIÇÃO.
// ============================================================

export const STATE_LABELS_PT: Record<string, string> = {
  New: 'Novo',
  'In Progress': 'Em Atendimento',
  'On Hold': 'Pendente',
  'Pending User': 'Pendente (Usuário)', // legado — não ofertado no dropdown
  Resolved: 'Resolvido',
  Closed: 'Fechado',
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
