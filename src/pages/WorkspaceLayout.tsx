import { useState } from 'react'
import { X, LayoutGrid } from 'lucide-react'
import TicketManagementDashboard from './TicketManagementDashboard'
import AnalystCockpit from './AnalystCockpit'
import type { WorkspaceTicket, CompanyLite } from './workspace.types'

/**
 * WorkspaceLayout — contêiner principal do analista com ABAS INTERNAS
 * (estilo Sensr). A primeira aba (root) é a Gestão de Tickets e não pode
 * ser fechada. Clicar num chamado abre uma aba de detalhe (Cockpit) sem
 * recarregar a página nem abrir abas reais do navegador.
 *
 * Todas as abas permanecem montadas (alternadas via CSS) para preservar
 * estado e evitar refetch ao trocar de aba.
 */
const ROOT_ID = '__root__'

interface WorkspaceTab {
  id: string
  title: string
  ticket?: WorkspaceTicket
}

interface WorkspaceLayoutProps {
  companyId?: string
  isProvider?: boolean
  companies?: CompanyLite[]
}

const WorkspaceLayout = ({ companyId, isProvider, companies }: WorkspaceLayoutProps) => {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([{ id: ROOT_ID, title: 'Gestão de Tickets' }])
  const [activeId, setActiveId] = useState<string>(ROOT_ID)

  const openTicket = (ticket: WorkspaceTicket) => {
    setTabs(prev => (prev.some(t => t.id === ticket.id) ? prev : [...prev, { id: ticket.id, title: ticket.id, ticket }]))
    setActiveId(ticket.id)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTabs(prev => prev.filter(t => t.id !== id))
    setActiveId(cur => (cur === id ? ROOT_ID : cur))
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* Barra de Abas Internas */}
      <div className="flex items-stretch gap-1 bg-slate-200/60 px-2 pt-2 overflow-x-auto hide-scrollbar shrink-0">
        {tabs.map(tab => {
          const active = tab.id === activeId
          const isRoot = tab.id === ROOT_ID
          return (
            <button
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={`group flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                active ? 'bg-slate-50 text-slate-900 shadow-sm' : 'bg-slate-200/50 text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              {isRoot && <LayoutGrid className="w-4 h-4 text-indigo-600" />}
              {tab.title}
              {!isRoot && (
                <span
                  onClick={(e) => closeTab(tab.id, e)}
                  className="ml-1 p-0.5 rounded hover:bg-slate-300 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label="Fechar aba"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Conteúdo das Abas (todas montadas; só a ativa fica visível) */}
      <div className="flex-1 min-h-0 bg-slate-50">
        <div className={activeId === ROOT_ID ? 'h-full' : 'hidden'}>
          <TicketManagementDashboard
            onOpenTicket={openTicket}
            companyId={companyId}
            isProvider={isProvider}
            companies={companies}
          />
        </div>
        {tabs.filter(t => t.id !== ROOT_ID).map(tab => (
          <div key={tab.id} className={activeId === tab.id ? 'h-full' : 'hidden'}>
            <AnalystCockpit ticket={tab.ticket} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default WorkspaceLayout
