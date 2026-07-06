import { useState, useEffect } from 'react'
import { Search, Clock, AlertTriangle, CheckCircle, MoreHorizontal, Building2, LayoutGrid, List, ChevronRight, Settings, X, User, Users, Plus } from 'lucide-react'
import NewTicketModal from './NewTicketModal'
import { useIncidents } from '../hooks/useIncidents'
import { translateState } from '../lib/statusLabels'
import { useAuth } from '../auth'
import type { WorkspaceTicket, CompanyLite } from './workspace.types'

/**
 * Gestão de Tickets MSP (multi-cliente, Kanban/Tabela).
 *
 * Fiação real: quando recebe `companyId`, lê incidentes via useIncidents
 * (RLS já isola por tenant / libera o provedor). Sem `companyId` cai nos
 * mocks (modo preview). Clicar num ticket chama onOpenTicket (abre aba).
 */
interface TicketManagementDashboardProps {
  onOpenTicket?: (ticket: WorkspaceTicket) => void
  companyId?: string
  isProvider?: boolean
  companies?: CompanyLite[]
  ticketType?: 'incident' | 'request'
}

type Row = WorkspaceTicket & { 
  column: string
  companyId?: string
  assignedToId?: string | null
  slaBreached?: boolean
  slaDeadline?: string | null
  updatedAt?: string
  resolvedAt?: string | null
  ticketType?: string
}

// ─── Mocks (modo preview, sem companyId) ──────────────────────
const mockClients: CompanyLite[] = [
  { id: 'all', name: 'Todos os Clientes' },
  { id: 'allied', name: 'Allied IT' },
  { id: 'wish', name: 'Grupo Wish' },
  { id: 'sephora', name: 'Sephora' },
]

const mockRows: Row[] = [
  { 
    id: 'INC-08722', 
    date: '08/06/2026 10:54', 
    title: 'Sistema ERP com lentidão extrema', 
    client: 'Grupo Wish', 
    priority: 'Alta', 
    sla: '1h 15m', 
    requester: 'Karen Ribeiro', 
    status: 'Aberto', 
    techGroup: 'Sistemas', 
    column: 'open',
    assignedToId: 'u-some-analyst',
    slaBreached: false,
    slaDeadline: new Date(Date.now() + 3600000 * 1.5).toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    ticketType: 'incident',
    companyId: 'wish',
  },
  { 
    id: 'REQ-09101', 
    date: '08/06/2026 11:30', 
    title: 'Solicitação de Acesso - VPN', 
    client: 'Sephora', 
    priority: 'Baixa', 
    sla: '12h 00m', 
    requester: 'Lucas Pietro', 
    status: 'Em Atendimento', 
    techGroup: 'Acessos e Contas', 
    column: 'progress',
    assignedToId: null, // Unassigned!
    slaBreached: false,
    slaDeadline: new Date(Date.now() + 43200000).toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    ticketType: 'request',
    companyId: 'sephora',
  },
  { 
    id: 'INC-08550', 
    date: '08/06/2026 09:15', 
    title: 'Falha no link principal', 
    client: 'Allied IT', 
    priority: 'Crítica', 
    sla: 'Violado', 
    requester: 'Roberto Teixeira', 
    status: 'Em Atendimento', 
    techGroup: 'Infraestrutura', 
    column: 'progress',
    assignedToId: 'u-sys-1', // Assigned to sysadmin / current user!
    slaBreached: true, // SLA Breached!
    slaDeadline: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    ticketType: 'incident',
    companyId: 'allied',
  },
  { 
    id: 'INC-08200', 
    date: '08/06/2026 08:00', 
    title: 'Acesso bloqueado ERP', 
    client: 'Sephora', 
    priority: 'Alta', 
    sla: 'Resolvido', 
    requester: 'Diana Prince', 
    status: 'Resolvido', 
    techGroup: 'Sistemas', 
    column: 'resolved',
    assignedToId: 'u-sys-1',
    slaBreached: false,
    slaDeadline: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString(), // Resolved today!
    ticketType: 'incident',
    companyId: 'sephora',
  },
]

const KANBAN_COLUMNS = [
  { id: 'open', title: 'Abertos', color: 'border-slate-300' },
  { id: 'progress', title: 'Em Atendimento', color: 'border-indigo-400' },
  { id: 'waiting', title: 'Aguardando', color: 'border-amber-400' },
  { id: 'resolved', title: 'Resolvidos', color: 'border-green-400' },
]

// ─── Helpers de mapeamento (estado/prioridade → UI) ───────────
function stateToColumn(state: string): string {
  if (state === 'New') return 'open'
  if (state === 'In Progress') return 'progress'
  if (state === 'On Hold' || state === 'Pending User') return 'waiting'
  if (state === 'Resolved' || state === 'Closed') return 'resolved'
  return 'open'
}

function priorityClass(priority: string): string {
  const isCritical = priority.includes('P1') || priority === 'Crítica'
  const isHigh = priority.includes('P2') || priority === 'Alta'
  if (isCritical) return 'bg-red-100 text-red-700'
  if (isHigh) return 'bg-orange-100 text-orange-700'
  return 'bg-slate-100 text-slate-600'
}

// Badge que diferencia Incidente x Requisição na fila unificada
function TypeBadge({ type }: { type?: string }) {
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

// ─── CONFIGURAÇÃO DE MÉTRICAS (8 OPÇÕES DISPONÍVEIS) ─────────
const AVAILABLE_METRICS = [
  {
    key: 'total',
    title: 'Total na Fila',
    icon: List,
    color: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
    activeColor: 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900',
    filterFn: () => true,
    countFn: (rows: Row[]) => rows.length,
  },
  {
    key: 'critical',
    title: 'Críticos P1',
    icon: AlertTriangle,
    color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    activeColor: 'bg-red-600 text-white border-red-600 shadow-md ring-2 ring-red-600',
    filterFn: (r: Row) => r.priority === 'Crítica' || r.priority === 'P1 - Critical' || r.priority.includes('P1'),
    countFn: (rows: Row[]) => rows.filter(r => r.priority === 'Crítica' || r.priority === 'P1 - Critical' || r.priority.includes('P1')).length,
  },
  {
    key: 'inProgress',
    title: 'Em Atendimento',
    icon: Clock,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    activeColor: 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-600',
    filterFn: (r: Row) => r.status === 'Em Atendimento' || r.status === 'In Progress',
    countFn: (rows: Row[]) => rows.filter(r => r.status === 'Em Atendimento' || r.status === 'In Progress').length,
  },
  {
    key: 'slaBreached',
    title: 'SLA Violado',
    icon: AlertTriangle,
    color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
    activeColor: 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-600',
    filterFn: (r: Row) => r.slaBreached === true || r.sla === 'Violado',
    countFn: (rows: Row[]) => rows.filter(r => r.slaBreached === true || r.sla === 'Violado').length,
  },
  {
    key: 'slaToExpire',
    title: 'SLA a Vencer',
    icon: Clock,
    color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    activeColor: 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-600',
    filterFn: (r: Row) => !r.slaBreached && r.status !== 'Resolved' && r.status !== 'Closed' && r.status !== 'Resolvido' && r.status !== 'Fechado' && r.sla !== 'Violado' && !!r.slaDeadline,
    countFn: (rows: Row[]) => rows.filter(r => !r.slaBreached && r.status !== 'Resolved' && r.status !== 'Closed' && r.status !== 'Resolvido' && r.status !== 'Fechado' && r.sla !== 'Violado' && !!r.slaDeadline).length,
  },
  {
    key: 'myQueue',
    title: 'Minha Fila',
    icon: User,
    color: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
    activeColor: 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-600',
    filterFn: (r: Row, profileId?: string) => r.assignedToId === profileId,
    countFn: (rows: Row[], profileId?: string) => rows.filter(r => r.assignedToId === profileId).length,
  },
  {
    key: 'unassigned',
    title: 'Não Atribuídos',
    icon: Users,
    color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
    activeColor: 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-600',
    filterFn: (r: Row) => !r.assignedToId,
    countFn: (rows: Row[]) => rows.filter(r => !r.assignedToId).length,
  },
  {
    key: 'resolvedToday',
    title: 'Resolvidos Hoje',
    icon: CheckCircle,
    color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
    activeColor: 'bg-green-600 text-white border-green-600 shadow-md ring-2 ring-green-600',
    filterFn: (r: Row) => (r.status === 'Resolved' || r.status === 'Resolvido' || r.status === 'Closed' || r.status === 'Fechado') && (r.resolvedAt ? new Date(r.resolvedAt).toDateString() === new Date().toDateString() : (r.updatedAt ? new Date(r.updatedAt).toDateString() === new Date().toDateString() : true)),
    countFn: (rows: Row[]) => rows.filter(r => (r.status === 'Resolved' || r.status === 'Resolvido' || r.status === 'Closed' || r.status === 'Fechado') && (r.resolvedAt ? new Date(r.resolvedAt).toDateString() === new Date().toDateString() : (r.updatedAt ? new Date(r.updatedAt).toDateString() === new Date().toDateString() : true))).length,
  }
]

const DEFAULT_METRIC_KEYS = ['total', 'critical', 'inProgress', 'slaBreached']

const TicketManagementDashboard = ({ onOpenTicket, companyId, isProvider, companies, ticketType }: TicketManagementDashboardProps) => {
  const realMode = Boolean(companyId)
  const { incidents, loading, filterCompanyId, setFilterCompanyId, setSearch } = useIncidents(companyId ?? '', undefined, ticketType)
  const { profile } = useAuth()

  const [localClient, setLocalClient] = useState('all')
  const [localSearch, setLocalSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [showNewTicket, setShowNewTicket] = useState(false)

  // Estados dos Indicadores e Customização Self-Service
  const [activeFilterCard, setActiveFilterCard] = useState<string | null>(null)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>([])

  // Carrega preferências do localStorage baseado no ID do usuário
  useEffect(() => {
    const key = profile?.id ? `flowfy_dashboard_metrics_${profile.id}` : 'flowfy_dashboard_metrics_guest'
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedMetricKeys(parsed)
          return
        }
      } catch (e) {
        console.error('Falha ao parsear métricas salvas:', e)
      }
    }
    setSelectedMetricKeys(DEFAULT_METRIC_KEYS)
  }, [profile?.id])

  const companyName = (id: string) => companies?.find(c => c.id === id)?.name ?? '—'

  // Linhas: reais (incidents) ou mock
  const rows: Row[] = realMode
    ? incidents.map(i => ({
        id: i.number,
        title: i.short_description,
        status: i.state,
        priority: i.priority,
        requester: i.caller_name,
        client: companyName(i.company_id),
        techGroup: i.assigned_group_name ?? '—',
        sla: i.sla_breached ? 'Violado' : '—',
        date: new Date(i.created_at).toLocaleString('pt-BR'),
        column: stateToColumn(i.state),
        ticketType: i.ticket_type,
        incidentId: i.id,
        caseId: i.case_id ?? null,
        companyId: i.company_id,
        assignedToId: i.assigned_to_id,
        slaBreached: i.sla_breached,
        slaDeadline: i.sla_deadline,
        updatedAt: i.updated_at,
        resolvedAt: i.resolved_at,
      }))
    : mockRows.filter(r => !ticketType || r.ticketType === ticketType)

  // 1. Filtro de cliente (provedor): real usa o filtro do hook; preview usa local
  const activeClient = realMode ? filterCompanyId : localClient
  const setActiveClient = realMode ? setFilterCompanyId : setLocalClient
  const showClientChips = !realMode || (isProvider && (companies?.length ?? 0) > 0)
  const clientChips: CompanyLite[] = realMode
    ? [{ id: 'all', name: 'Todos os Clientes' }, ...(companies ?? [])]
    : mockClients

  const clientFilteredRows = activeClient === 'all'
    ? rows
    : rows.filter(r => r.companyId === activeClient || r.client === activeClient || (activeClient === 'allied' && r.client === 'Allied IT') || (activeClient === 'wish' && r.client === 'Grupo Wish') || (activeClient === 'sephora' && r.client === 'Sephora'))

  // 2. Filtro por Busca
  const searchedRows = realMode
    ? clientFilteredRows
    : clientFilteredRows.filter(r => 
        r.id.toLowerCase().includes(localSearch.toLowerCase()) || 
        r.title.toLowerCase().includes(localSearch.toLowerCase()) ||
        (r.requester ?? '').toLowerCase().includes(localSearch.toLowerCase())
      )

  // 3. Filtro por tipo (Incidente x Requisição) - removido, divisor físico por ticketType
  const typedRows = searchedRows

  // 4. Filtro Ativo pelo Card selecionado
  const profileIdForMetrics = profile?.id || 'u-sys-1'
  const finalFilteredRows = activeFilterCard
    ? typedRows.filter(r => {
        const metric = AVAILABLE_METRICS.find(m => m.key === activeFilterCard)
        return metric ? metric.filterFn(r, profileIdForMetrics) : true
      })
    : typedRows

  const handleSearchChange = (value: string) => {
    if (realMode) setSearch(value)
    else setLocalSearch(value)
  }

  const openTicket = (row: Row) => onOpenTicket?.(row)

  // Empresa-alvo para abertura: o cliente filtrado (se houver) ou o tenant atual.
  const newTicketCompanyId = (activeClient && activeClient !== 'all') ? activeClient : (companyId ?? '')
  const newTicketLabel = ticketType === 'request' ? 'Nova Requisição' : 'Novo Incidente'
  const canOpenNew = realMode && Boolean(profile) && Boolean(newTicketCompanyId)

  return (
    <div data-testid="ticket-dashboard" className="flex flex-col h-full min-h-0 min-w-0 w-full max-w-full bg-slate-50 overflow-hidden font-sans text-slate-900">

      {canOpenNew && profile && (
        <NewTicketModal
          open={showNewTicket}
          onClose={() => setShowNewTicket(false)}
          companyId={newTicketCompanyId}
          analyst={{ id: profile.id, name: profile.name }}
          defaultTicketType={ticketType ?? 'incident'}
        />
      )}

      {/* 1. BARRA SUPERIOR: Filtros e Controle de Visão */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 xl:px-6 py-3 flex items-center justify-between shrink-0 gap-2 xl:gap-4 min-w-0">
        {showClientChips ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1 shrink-0">
              <Building2 className="w-4 h-4" /> Clientes
            </span>
            {clientChips.map(client => (
              <button
                key={client.id}
                onClick={() => setActiveClient(client.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border whitespace-nowrap ${
                  activeClient === client.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {client.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm font-bold text-slate-700">Fila de Atendimento</div>
        )}

        <div className="flex min-w-0 items-center gap-2 xl:gap-4 pl-2 xl:pl-4 border-l border-slate-200 shrink-0">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={realMode ? undefined : localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar ID ou assunto..."
              className="pl-9 pr-4 py-1.5 bg-slate-100 border-transparent rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all w-36 sm:w-44 xl:w-56 2xl:w-64"
            />
          </div>

          {canOpenNew && (
            <button
              onClick={() => setShowNewTicket(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-all shrink-0"
            >
              <Plus className="w-4 h-4" /><span className="hidden 2xl:inline">{newTicketLabel}</span><span className="2xl:hidden">Novo</span>
            </button>
          )}

          {/* TOGGLE: Kanban vs Tabela */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="Visão em Lista"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="Visão em Kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. ÁREA SELF-SERVICE: Contadores */}
      <div className="px-3 sm:px-4 xl:px-6 py-3 xl:py-4 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 xl:gap-3 shrink-0 min-w-0">
        <div className="grid min-w-0 gap-2 xl:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
          {selectedMetricKeys.map(key => {
            const metric = AVAILABLE_METRICS.find(m => m.key === key)
            if (!metric) return null
            const Icon = metric.icon
            const count = metric.countFn(typedRows, profileIdForMetrics)
            const isActive = activeFilterCard === key
            
            return (
              <button
                key={key}
                onClick={() => setActiveFilterCard(isActive ? null : key)}
                className={`flex min-w-0 w-full items-center gap-2 xl:gap-3 p-2.5 xl:p-3 rounded-xl border text-left transition-all duration-200 select-none active:scale-98 ${
                  isActive ? metric.activeColor : `${metric.color} border-slate-200 shadow-xs hover:shadow-md`
                }`}
              >
                <div className={`p-2 rounded-lg rounded-tr-none transition-colors ${isActive ? 'bg-white/20' : 'bg-white/60 shadow-2xs'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl xl:text-2xl font-black leading-none">{count}</p>
                  <p className="truncate text-[10px] xl:text-xs font-semibold uppercase tracking-wide xl:tracking-wider mt-1.5 opacity-90">{metric.title}</p>
                </div>
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setIsCustomizing(true)}
          className="flex items-center justify-center gap-2 px-3 2xl:px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-2xs hover:shadow-xs shrink-0 group"
          title="Personalizar cards do topo"
        >
          <Settings className="w-4 h-4 text-slate-500 group-hover:rotate-90 transition-transform duration-300" />
          <span className="hidden 2xl:inline">Customizar Visão</span>
        </button>
      </div>

      {/* 3. ÁREA PRINCIPAL: Tabela ou Kanban */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden px-3 sm:px-4 xl:px-6 pb-3 xl:pb-6">

        {viewMode === 'table' ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
            <div data-testid="ticket-table-scroll" className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3 w-10 text-center"><input type="checkbox" className="rounded border-slate-300" /></th>
                    <th className="p-3 w-[170px] 2xl:w-[185px]">Ticket ID</th>
                    <th className="hidden 2xl:table-cell p-3 w-[160px]">Abertura</th>
                    <th className="p-3 w-[145px]">Empresa</th>
                    <th className="hidden 2xl:table-cell p-3 w-[145px]">Solicitante</th>
                    <th className="p-3">Assunto</th>
                    <th className="hidden xl:table-cell p-3 w-[135px]">Status</th>
                    <th className="p-3 w-[125px]">Prioridade</th>
                    <th className="p-3 w-[85px]">SLA</th>
                    <th className="hidden 2xl:table-cell p-3 w-[145px]">Grupo Técnico</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {realMode && loading && finalFilteredRows.length === 0 && (
                    <tr><td colSpan={11} className="p-8 text-center text-slate-400 text-sm">
                      <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-2 align-middle" />
                      Carregando chamados…
                    </td></tr>
                  )}
                  {!loading && finalFilteredRows.length === 0 && (
                    <tr><td colSpan={11} className="p-8 text-center text-slate-400 text-sm">Nenhum chamado encontrado.</td></tr>
                  )}
                  {finalFilteredRows.map((ticket) => (
                    <tr key={ticket.id} onClick={() => openTicket(ticket)} className="hover:bg-indigo-50/50 transition-colors cursor-pointer group">
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded border-slate-300" /></td>
                      <td className="p-3 font-extrabold text-indigo-600 whitespace-nowrap overflow-hidden">
                        <span className="flex min-w-0 items-center gap-2 truncate">{ticket.id} <TypeBadge type={ticket.ticketType} /></span>
                      </td>
                      <td className="hidden 2xl:table-cell p-3 text-slate-500 text-xs truncate">{ticket.date}</td>
                      <td className="p-3 font-medium overflow-hidden"><span className="flex min-w-0 items-center gap-1 truncate"><Building2 className="w-3 h-3 text-slate-400"/> {ticket.client}</span></td>
                      <td className="hidden 2xl:table-cell p-3 text-slate-600 truncate">{ticket.requester}</td>
                      <td className="p-3 font-semibold text-slate-900 truncate" title={ticket.title}>{ticket.title}</td>
                      <td className="hidden xl:table-cell p-3 text-slate-600 truncate">{translateState(ticket.status)}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md ${priorityClass(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-600 overflow-hidden"><span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {ticket.sla}</span></td>
                      <td className="hidden 2xl:table-cell p-3 overflow-hidden">
                        {ticket.techGroup !== '—' ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-md shadow-xs">
                            {ticket.techGroup}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Sem equipe</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 bg-slate-50 border-t border-slate-200 p-3 px-4 text-xs text-slate-500 flex justify-between items-center">
              <span>{realMode ? `${finalFilteredRows.length} chamado(s)` : `Mostrando 1 a ${finalFilteredRows.length} de ${finalFilteredRows.length} chamados`}</span>
              <div className="flex gap-1">
                <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white">Anterior</button>
                <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white bg-white font-bold">Próximo</button>
              </div>
            </div>
          </div>

        ) : (

          <div
            data-testid="ticket-kanban-grid"
            className="grid h-full min-h-0 gap-4 overflow-x-hidden overflow-y-auto overscroll-contain pr-1"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gridAutoRows: 'minmax(280px, 1fr)',
            }}
          >
            {KANBAN_COLUMNS.map(col => {
              const colRows = finalFilteredRows.filter(t => t.column === col.id)
              return (
                <div
                  key={col.id}
                  data-testid="ticket-kanban-column"
                  className="min-h-[280px] min-w-0 overflow-hidden flex flex-col bg-slate-100/50 rounded-2xl border border-slate-200"
                >
                  <div className={`p-4 border-t-4 rounded-t-2xl flex justify-between items-center bg-slate-100 ${col.color}`}>
                    <h3 className="font-bold text-slate-800 uppercase tracking-wide text-sm">{col.title}</h3>
                    <span className="bg-white px-2.5 py-0.5 rounded-full text-xs font-bold text-slate-500 shadow-sm">{colRows.length}</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
                    {colRows.map(ticket => (
                      <div key={ticket.id} onClick={() => openTicket(ticket)} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                        <div className="flex justify-between items-center mb-3 gap-2">
                          <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{ticket.id}</span>
                          <TypeBadge type={ticket.ticketType} />
                          <MoreHorizontal className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mb-2 leading-snug line-clamp-2">{ticket.title}</h4>
                        <div className="space-y-2 mb-1 text-xs">
                          <span className="flex items-center gap-1 font-medium text-slate-600"><Building2 className="w-3 h-3" /> {ticket.client}</span>
                          <span className="text-slate-500 block truncate">{ticket.requester}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* Customization Modal */}
      {isCustomizing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs transition-all">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 p-0">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-800 text-base">Customizar Painel</h3>
              </div>
              <button 
                onClick={() => setIsCustomizing(false)} 
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Selecione quais indicadores deseja exibir no topo do painel:
              </p>

              <div className="space-y-2">
                {AVAILABLE_METRICS.map(metric => {
                  const Icon = metric.icon
                  const isChecked = selectedMetricKeys.includes(metric.key)
                  
                  return (
                    <label 
                      key={metric.key}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all select-none ${
                        isChecked 
                          ? 'border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/60' 
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            if (selectedMetricKeys.length > 1) {
                              setSelectedMetricKeys(prev => prev.filter(k => k !== metric.key))
                            }
                          } else {
                            setSelectedMetricKeys(prev => [...prev, metric.key])
                          }
                        }}
                        className="w-4.5 h-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <div className={`p-1.5 rounded-lg ${isChecked ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">{metric.title}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  const key = profile?.id ? `flowfy_dashboard_metrics_${profile.id}` : 'flowfy_dashboard_metrics_guest'
                  const saved = localStorage.getItem(key)
                  if (saved) {
                    try {
                      setSelectedMetricKeys(JSON.parse(saved))
                    } catch(e) {
                      setSelectedMetricKeys(DEFAULT_METRIC_KEYS)
                    }
                  } else {
                    setSelectedMetricKeys(DEFAULT_METRIC_KEYS)
                  }
                  setIsCustomizing(false)
                }}
                className="px-4 py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const key = profile?.id ? `flowfy_dashboard_metrics_${profile.id}` : 'flowfy_dashboard_metrics_guest'
                  localStorage.setItem(key, JSON.stringify(selectedMetricKeys))
                  setIsCustomizing(false)
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-extrabold rounded-xl transition-all shadow-md hover:shadow-lg"
              >
                Salvar Preferências
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default TicketManagementDashboard
