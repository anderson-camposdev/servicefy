import { useState } from 'react'
import { Search, Clock, AlertTriangle, CheckCircle, MoreHorizontal, Building2, LayoutGrid, List, ChevronRight } from 'lucide-react'
import { useIncidents } from '../hooks/useIncidents'
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
}

type Row = WorkspaceTicket & { column: string; companyId?: string }

// ─── Mocks (modo preview, sem companyId) ──────────────────────
const mockClients: CompanyLite[] = [
  { id: 'all', name: 'Todos os Clientes' },
  { id: 'allied', name: 'Allied IT' },
  { id: 'wish', name: 'Grupo Wish' },
  { id: 'sephora', name: 'Sephora' },
]

const mockRows: Row[] = [
  { id: 'INC-08722', date: '08/06/2026 10:54', title: 'Sistema ERP com lentidão extrema', client: 'Grupo Wish', priority: 'Alta', sla: '1h 15m', requester: 'Karen Ribeiro', status: 'Aberto', techGroup: 'Sistemas', column: 'open' },
  { id: 'REQ-09101', date: '08/06/2026 11:30', title: 'Solicitação de Acesso - VPN', client: 'Sephora', priority: 'Baixa', sla: '12h 00m', requester: 'Lucas Pietro', status: 'Em Atendimento', techGroup: 'Acessos e Contas', column: 'progress' },
  { id: 'INC-08550', date: '08/06/2026 09:15', title: 'Falha no link principal', client: 'Allied IT', priority: 'Crítica', sla: '0h 20m', requester: 'Roberto Teixeira', status: 'Em Atendimento', techGroup: 'Infraestrutura', column: 'progress' },
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

const TicketManagementDashboard = ({ onOpenTicket, companyId, isProvider, companies }: TicketManagementDashboardProps) => {
  const realMode = Boolean(companyId)
  const { incidents, kpis, loading, filterCompanyId, setFilterCompanyId, setSearch } = useIncidents(companyId ?? '')

  const [localClient, setLocalClient] = useState('all')
  const [localSearch, setLocalSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')

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
        companyId: i.company_id,
      }))
    : mockRows

  // Filtro de cliente (provedor): real usa o filtro do hook; preview usa local
  const activeClient = realMode ? filterCompanyId : localClient
  const setActiveClient = realMode ? setFilterCompanyId : setLocalClient
  const showClientChips = !realMode || (isProvider && (companies?.length ?? 0) > 0)
  const clientChips: CompanyLite[] = realMode
    ? [{ id: 'all', name: 'Todos os Clientes' }, ...(companies ?? [])]
    : mockClients

  // Contadores
  const counters = realMode
    ? [
        { id: 1, title: 'Total na Fila', count: kpis.total, color: 'bg-slate-50 text-slate-700 border-slate-200', icon: List },
        { id: 2, title: 'Críticos (P1)', count: kpis.critical, color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
        { id: 3, title: 'Em Atendimento', count: kpis.inProgress, color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
        { id: 4, title: 'SLA Violado', count: kpis.slaBreached, color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
      ]
    : [
        { id: 1, title: 'Meus Incidentes Críticos', count: 4, color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
        { id: 2, title: 'Aguardando Fornecedor', count: 12, color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
        { id: 3, title: 'Resolvidos Hoje', count: 45, color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
      ]

  const handleSearchChange = (value: string) => {
    if (realMode) setSearch(value)
    else setLocalSearch(value)
  }

  const openTicket = (row: Row) => onOpenTicket?.(row)

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans text-slate-900">

      {/* 1. BARRA SUPERIOR: Filtros e Controle de Visão */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 gap-4">
        {showClientChips ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
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

        <div className="flex items-center gap-4 pl-4 border-l border-slate-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={realMode ? undefined : localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar ID ou assunto..."
              className="pl-9 pr-4 py-1.5 bg-slate-100 border-transparent rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all w-64"
            />
          </div>

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
      <div className="px-6 py-4 flex items-center gap-4 shrink-0 overflow-x-auto hide-scrollbar">
        {counters.map(counter => {
          const Icon = counter.icon
          return (
            <div key={counter.id} className={`flex items-center gap-4 p-3 rounded-xl border min-w-[220px] cursor-pointer hover:shadow-md transition-shadow ${counter.color}`}>
              <div className="p-2 bg-white/50 rounded-lg rounded-tr-none">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-black leading-none">{counter.count}</p>
                <p className="text-xs font-semibold uppercase tracking-wider mt-1 opacity-80">{counter.title}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. ÁREA PRINCIPAL: Tabela ou Kanban */}
      <div className="flex-1 min-h-0 overflow-auto px-6 pb-6">

        {viewMode === 'table' ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3 w-10 text-center"><input type="checkbox" className="rounded border-slate-300" /></th>
                    <th className="p-3">Ticket ID</th>
                    <th className="p-3">Abertura</th>
                    <th className="p-3">Empresa</th>
                    <th className="p-3">Solicitante</th>
                    <th className="p-3 max-w-[300px]">Assunto</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Prioridade</th>
                    <th className="p-3">SLA</th>
                    <th className="p-3">Grupo Técnico</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {realMode && loading && rows.length === 0 && (
                    <tr><td colSpan={11} className="p-8 text-center text-slate-400 text-sm">
                      <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-2 align-middle" />
                      Carregando chamados…
                    </td></tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={11} className="p-8 text-center text-slate-400 text-sm">Nenhum chamado encontrado.</td></tr>
                  )}
                  {rows.map((ticket) => (
                    <tr key={ticket.id} onClick={() => openTicket(ticket)} className="hover:bg-indigo-50/50 transition-colors cursor-pointer group">
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded border-slate-300" /></td>
                      <td className="p-3 font-extrabold text-indigo-600 whitespace-nowrap">
                        <span className="flex items-center gap-2">{ticket.id} <TypeBadge type={ticket.ticketType} /></span>
                      </td>
                      <td className="p-3 text-slate-500 text-xs">{ticket.date}</td>
                      <td className="p-3 font-medium"><span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-slate-400"/> {ticket.client}</span></td>
                      <td className="p-3 text-slate-600">{ticket.requester}</td>
                      <td className="p-3 font-semibold text-slate-900 truncate max-w-[300px]" title={ticket.title}>{ticket.title}</td>
                      <td className="p-3 text-slate-600">{ticket.status}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md ${priorityClass(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-600"><span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {ticket.sla}</span></td>
                      <td className="p-3 text-slate-600">{ticket.techGroup}</td>
                      <td className="p-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 p-3 px-4 text-xs text-slate-500 flex justify-between items-center">
              <span>{realMode ? `${rows.length} chamado(s)` : 'Mostrando 1 a 25 de 6.779 chamados'}</span>
              <div className="flex gap-1">
                <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white">Anterior</button>
                <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white bg-white font-bold">Próximo</button>
              </div>
            </div>
          </div>

        ) : (

          <div className="flex gap-6 h-full min-w-max">
            {KANBAN_COLUMNS.map(col => {
              const colRows = rows.filter(t => t.column === col.id)
              return (
                <div key={col.id} className="w-[340px] flex flex-col max-h-full bg-slate-100/50 rounded-2xl border border-slate-200">
                  <div className={`p-4 border-t-4 rounded-t-2xl flex justify-between items-center bg-slate-100 ${col.color}`}>
                    <h3 className="font-bold text-slate-800 uppercase tracking-wide text-sm">{col.title}</h3>
                    <span className="bg-white px-2.5 py-0.5 rounded-full text-xs font-bold text-slate-500 shadow-sm">{colRows.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
    </div>
  )
}

export default TicketManagementDashboard
