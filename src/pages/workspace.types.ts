// ============================================================
// ServiceFY ITSM — Workspace (abas internas do analista)
// Tipo compartilhado de ticket usado entre a Gestão de Tickets
// (lista/kanban) e o Cockpit (detalhe em aba).
// ============================================================

export interface CompanyLite {
  id: string
  name: string
}

export interface WorkspaceTicket {
  id: string
  title: string
  status: string
  priority: string
  // Campos contextuais (podem faltar dependendo da origem)
  requester?: string
  department?: string
  client?: string
  sla?: string
  date?: string
  techGroup?: string
  /** incident (falha) ou request (requisição via catálogo). */
  ticketType?: 'incident' | 'request'
  // Referências reais para o Cockpit buscar o detalhe/histórico no Supabase
  incidentId?: string
  caseId?: string | null
  companyId?: string
}
