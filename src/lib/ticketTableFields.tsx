// ============================================================
// ServiceFY — Registro de campos para as tabelas de chamados
// (incidentes/solicitações, problemas, mudanças) usadas pelo
// TicketDataTable (colunas customizáveis, filtro e agrupamento).
//
// Curadoria intencional: cada linha (IncidentRow/ProblemRow/ChangeRow)
// tem dezenas de colunas internas (SLA, auditoria, aprovação...) que não
// fazem sentido como coluna de tabela. Aqui só entram campos que um
// usuário realmente quer ver/filtrar/agrupar.
// ============================================================

import type { ReactNode } from 'react'
import { translateState } from './statusLabels'
import type { ProblemRow, ChangeRow, ChangeState, ChangeRisk } from './database.types'

export interface TicketFieldDef<T> {
  key: string
  label: string
  accessor: (row: T) => string | number | boolean | null | undefined
  /** Célula customizada (badges, ícones). Se ausente, usa texto simples do accessor. */
  render?: (row: T) => ReactNode
  /** Determina a UI do filtro: 'select' lista valores únicos presentes nas linhas; 'text' é "contém". */
  kind: 'text' | 'select' | 'date' | 'boolean'
  defaultVisible?: boolean
  /** Não aparece no picker de colunas — sempre visível (ex.: número do chamado, assunto). */
  alwaysVisible?: boolean
  /** false para campos que não fazem sentido como agrupamento (ex.: texto livre longo). */
  groupable?: boolean
}

const badge = (text: string, className: string): ReactNode => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${className}`}>
    {text}
  </span>
)

// ─── Incidentes / Solicitações (TicketManagementDashboard) ──────────────────
// Espelha o shape achatado `Row` já produzido por TicketManagementDashboard
// (real: mapeado de IncidentRow; mock: objetos de exemplo) — estruturalmente
// compatível, sem precisar importar o tipo local `Row` daquele arquivo.
export interface TicketListRow {
  id: string
  title: string
  status: string
  priority: string
  requester?: string
  client?: string
  sla?: string
  date?: string
  techGroup?: string
  ticketType?: string
  description?: string | null
  category?: string | null
  impact?: string | null
  urgency?: string | null
  assignedToName?: string | null
  updatedAt?: string
  resolvedAt?: string | null
  closedAt?: string | null
  tags?: string[]
  openedVia?: string | null
  closeCode?: string | null
}

const INCIDENT_PRIORITY_CLASS: Record<string, string> = {
  'P1 - Critical': 'bg-red-50 text-red-700 border-red-200',
  'P2 - High': 'bg-orange-50 text-orange-700 border-orange-200',
  'P3 - Moderate': 'bg-amber-50 text-amber-700 border-amber-200',
  'P4 - Low': 'bg-sky-50 text-sky-700 border-sky-200',
  'P5 - Planning': 'bg-slate-100 text-slate-600 border-slate-200',
}

const typeBadge = (type: string | null | undefined): ReactNode => {
  const isReq = type === 'request'
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
        isReq ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-rose-50 text-rose-700 border-rose-200'
      }`}
      title={isReq ? 'Requisição (catálogo)' : 'Incidente (falha)'}
    >
      {isReq ? '🧩 Requisição' : '🔧 Incidente'}
    </span>
  )
}

export const INCIDENT_REQUEST_FIELDS: TicketFieldDef<TicketListRow>[] = [
  {
    key: 'id', label: 'Ticket ID', accessor: r => r.id, kind: 'text', alwaysVisible: true,
    render: r => (
      <span className="flex min-w-0 items-center gap-2 font-extrabold text-indigo-600">
        {r.id} {typeBadge(r.ticketType)}
      </span>
    ),
  },
  { key: 'title', label: 'Assunto', accessor: r => r.title, kind: 'text', alwaysVisible: true },
  { key: 'date', label: 'Abertura', accessor: r => r.date, kind: 'text', defaultVisible: true },
  { key: 'client', label: 'Empresa', accessor: r => r.client, kind: 'select', defaultVisible: true },
  { key: 'requester', label: 'Solicitante', accessor: r => r.requester, kind: 'select', defaultVisible: true },
  {
    key: 'status', label: 'Status', accessor: r => r.status, kind: 'select', defaultVisible: true,
    render: r => translateState(r.status),
  },
  {
    key: 'priority', label: 'Prioridade', accessor: r => r.priority, kind: 'select', defaultVisible: true,
    render: r => badge(r.priority || '—', INCIDENT_PRIORITY_CLASS[r.priority] || 'bg-slate-100 text-slate-600 border-slate-200'),
  },
  { key: 'sla', label: 'SLA', accessor: r => r.sla, kind: 'select', defaultVisible: true },
  {
    key: 'techGroup', label: 'Grupo Técnico', accessor: r => r.techGroup, kind: 'select', defaultVisible: true,
    render: r => r.techGroup && r.techGroup !== '—' ? (
      <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-md">
        {r.techGroup}
      </span>
    ) : <span className="text-slate-400 italic text-xs">Sem equipe</span>,
  },
  { key: 'description', label: 'Descrição', accessor: r => r.description, kind: 'text', groupable: false },
  { key: 'category', label: 'Categoria', accessor: r => r.category, kind: 'select' },
  { key: 'impact', label: 'Impacto', accessor: r => r.impact, kind: 'select' },
  { key: 'urgency', label: 'Urgência', accessor: r => r.urgency, kind: 'select' },
  { key: 'assignedToName', label: 'Responsável', accessor: r => r.assignedToName, kind: 'select' },
  { key: 'updatedAt', label: 'Atualizado em', accessor: r => r.updatedAt, kind: 'date' },
  { key: 'resolvedAt', label: 'Resolvido em', accessor: r => r.resolvedAt, kind: 'date' },
  { key: 'closedAt', label: 'Fechado em', accessor: r => r.closedAt, kind: 'date' },
  { key: 'tags', label: 'Tags', accessor: r => (r.tags && r.tags.length ? r.tags.join(', ') : null), kind: 'text', groupable: false },
  { key: 'openedVia', label: 'Origem', accessor: r => r.openedVia, kind: 'select' },
  { key: 'closeCode', label: 'Código de Encerramento', accessor: r => r.closeCode, kind: 'select' },
]

// ─── Problemas (App.tsx → ProblemDashboard) ──────────────────────────────────
const PROBLEM_PRIORITY_CLASS: Record<string, string> = {
  'P1 - Critical': 'bg-red-50 text-red-600 border-red-200',
  'P2 - High': 'bg-orange-50 text-orange-600 border-orange-200',
  'P3 - Moderate': 'bg-amber-50 text-amber-600 border-amber-200',
  'P4 - Low': 'bg-sky-50 text-sky-600 border-sky-200',
  'P5 - Planning': 'bg-slate-100 text-slate-500 border-slate-200',
}

export const PROBLEM_FIELDS: TicketFieldDef<ProblemRow>[] = [
  { key: 'number', label: 'Número', accessor: r => r.number, kind: 'text', alwaysVisible: true },
  { key: 'short_description', label: 'Descrição', accessor: r => r.short_description, kind: 'text', alwaysVisible: true },
  {
    key: 'priority', label: 'Prioridade', accessor: r => r.priority, kind: 'select', defaultVisible: true,
    render: r => badge(r.priority, PROBLEM_PRIORITY_CLASS[r.priority] || 'bg-slate-100 text-slate-500 border-slate-200'),
  },
  {
    key: 'state', label: 'Estado', accessor: r => r.state, kind: 'select', defaultVisible: true,
    render: r => translateState(r.state),
  },
  { key: 'category', label: 'Categoria', accessor: r => r.category, kind: 'select', defaultVisible: true },
  { key: 'root_cause', label: 'Causa Raiz', accessor: r => r.root_cause, kind: 'text', defaultVisible: true },
  {
    key: 'known_error', label: 'KEDB', accessor: r => (r.known_error ? 'Sim' : 'Não'), kind: 'select', defaultVisible: true,
    render: r => r.known_error ? badge('KEDB', 'bg-amber-50 text-amber-700 border-amber-200') : <span className="text-slate-300">—</span>,
  },
  { key: 'workaround', label: 'Contorno (Workaround)', accessor: r => r.workaround, kind: 'text', groupable: false },
  { key: 'assigned_to_name', label: 'Responsável', accessor: r => r.assigned_to_name, kind: 'select' },
  { key: 'assigned_group_name', label: 'Grupo', accessor: r => r.assigned_group_name, kind: 'select' },
  { key: 'created_at', label: 'Criado em', accessor: r => r.created_at, kind: 'date' },
  { key: 'updated_at', label: 'Atualizado em', accessor: r => r.updated_at, kind: 'date' },
  { key: 'resolved_at', label: 'Resolvido em', accessor: r => r.resolved_at, kind: 'date' },
]

// ─── Mudanças (ChangeManagementDashboard) ────────────────────────────────────
const CHANGE_STATE_COLORS: Record<ChangeState, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  'Awaiting CAB Approval': 'bg-amber-50 text-amber-700 border-amber-200',
  'CAB Approved': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'CAB Rejected': 'bg-rose-50 text-rose-700 border-rose-200',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Implementation': 'bg-purple-50 text-purple-700 border-purple-200',
  Completed: 'bg-green-50 text-green-700 border-green-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Cancelled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}
const CHANGE_RISK_COLORS: Record<ChangeRisk, string> = {
  Low: 'bg-blue-50 text-blue-700 border-blue-100',
  Medium: 'bg-amber-50 text-amber-700 border-amber-100',
  High: 'bg-orange-50 text-orange-700 border-orange-100',
  Critical: 'bg-rose-50 text-rose-700 border-rose-100',
}

export const CHANGE_FIELDS: TicketFieldDef<ChangeRow>[] = [
  { key: 'number', label: 'Número', accessor: r => r.number, kind: 'text', alwaysVisible: true },
  { key: 'short_description', label: 'Título', accessor: r => r.short_description, kind: 'text', alwaysVisible: true },
  {
    key: 'type', label: 'Tipo', accessor: r => r.type, kind: 'select', defaultVisible: true,
    render: r => badge(r.type, 'bg-slate-50 text-slate-600 border-slate-200'),
  },
  {
    key: 'risk', label: 'Risco', accessor: r => r.risk, kind: 'select', defaultVisible: true,
    render: r => badge(r.risk, CHANGE_RISK_COLORS[r.risk] || 'bg-slate-50 text-slate-600 border-slate-200'),
  },
  {
    key: 'state', label: 'Estado', accessor: r => r.state, kind: 'select', defaultVisible: true,
    render: r => badge(translateState(r.state), CHANGE_STATE_COLORS[r.state] || 'bg-slate-50 text-slate-600 border-slate-200'),
  },
  {
    key: 'change_window', label: 'Janela Agendada', kind: 'date', defaultVisible: true, groupable: false,
    accessor: r => r.change_window_start ?? null,
    render: r => r.change_window_start ? (
      <div className="flex flex-col text-xs text-slate-500 font-medium">
        <span>De: {new Date(r.change_window_start).toLocaleString('pt-BR')}</span>
        <span>Até: {r.change_window_end ? new Date(r.change_window_end).toLocaleString('pt-BR') : '—'}</span>
      </div>
    ) : <span className="text-slate-400 italic text-xs">Janela não definida</span>,
  },
  { key: 'requested_by_name', label: 'Solicitado por', accessor: r => r.requested_by_name, kind: 'select' },
  { key: 'implementer_name', label: 'Implementador', accessor: r => r.implementer_name, kind: 'select' },
  { key: 'justification', label: 'Justificativa', accessor: r => r.justification, kind: 'text', groupable: false },
  { key: 'implementation_plan', label: 'Plano de Implementação', accessor: r => r.implementation_plan, kind: 'text', groupable: false },
  { key: 'test_plan', label: 'Plano de Teste', accessor: r => r.test_plan, kind: 'text', groupable: false },
  { key: 'backout_plan', label: 'Plano de Rollback', accessor: r => r.backout_plan, kind: 'text', groupable: false },
  { key: 'created_at', label: 'Criado em', accessor: r => r.created_at, kind: 'date' },
  { key: 'updated_at', label: 'Atualizado em', accessor: r => r.updated_at, kind: 'date' },
  { key: 'completed_at', label: 'Concluído em', accessor: r => r.completed_at, kind: 'date' },
]
