import { useState, useEffect } from 'react'
import { X, LayoutGrid } from 'lucide-react'
import TicketManagementDashboard from './TicketManagementDashboard'
import AnalystCockpit from './AnalystCockpit'
import type { WorkspaceTicket, CompanyLite } from './workspace.types'
import { incidentsService } from '../lib/services'

/**
 * WorkspaceLayout — contêiner principal do analista com ABAS INTERNAS
 * (estilo Sensr). A primeira aba (root) é a Gestão de Tickets e não pode
 * ser fechada. Clicar num chamado abre uma aba de detalhe (Cockpit) sem
 * recarregar a página nem abrir abas reais do navegador.
 *
 * Gestão de Mudanças NÃO é aba daqui — é destino próprio na navegação
 * lateral (App.tsx, view 'mudancas'). Ter os dois era duplicidade: o
 * mesmo dashboard alcançável por dois caminhos.
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
  ticketType?: 'incident' | 'request'
  initialTicketNumber?: string
}

const WorkspaceLayout = ({ companyId, isProvider, companies, ticketType, initialTicketNumber }: WorkspaceLayoutProps) => {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id: ROOT_ID, title: 'Gestão de Tickets' },
  ])
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

  useEffect(() => {
    if (initialTicketNumber) {
      if (!tabs.some(t => t.title === initialTicketNumber)) {
        incidentsService.getByNumber(initialTicketNumber, companyId || '').then(inc => {
          const workspaceTicket: WorkspaceTicket = {
            id: inc.id,
            title: inc.short_description || inc.number,
            status: inc.state,
            priority: inc.priority,
            date: inc.created_at,
            requester: inc.caller_name || 'Desconhecido',
            techGroup: inc.assigned_group_name || undefined,
            ticketType: ticketType || 'incident'
          }
          openTicket(workspaceTicket)
        }).catch(err => {
          console.error('Ticket not found for deep link:', err)
        })
      }
    }
  }, [initialTicketNumber, companyId])

  // Sincroniza a aba ativa com a URL (sem disparar navegação do React Router)
  useEffect(() => {
    if (activeId === ROOT_ID) {
      window.history.pushState({}, '', ticketType === 'request' ? '/requisicoes' : '/incidentes')
    } else {
      const activeTab = tabs.find(t => t.id === activeId)
      const ticketNumber = activeTab?.ticket?.number || (activeTab?.title?.startsWith('INC') ? activeTab.title : null)
      if (ticketNumber) {
        window.history.pushState({}, '', `/ticket/${ticketNumber}`)
      }
    }
  }, [activeId, ticketType, tabs])

  // Classes limpas baseadas no tema dinâmico
  const barBg = 'bg-surface-container/60 border-b border-outline-variant'

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-background text-on-background">
      {/* Barra de Abas Internas */}
      <div className={`flex items-stretch gap-1 px-2 pt-2 overflow-x-auto hide-scrollbar shrink-0 ${barBg}`}>
        {tabs.map(tab => {
          const active = tab.id === activeId
          const isRoot = tab.id === ROOT_ID
          
          let tabStyle = ''
          if (active) {
            tabStyle = 'bg-surface text-primary border-b-2 border-b-primary font-bold'
          } else {
            tabStyle = 'bg-transparent text-on-surface-variant border-transparent hover:text-on-surface hover:bg-surface-container rounded-t-lg'
          }

          return (
            <button
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={`group flex items-center gap-2 px-4 py-2 text-sm whitespace-nowrap transition-all ${tabStyle}`}
            >
              {tab.id === ROOT_ID && (
                <LayoutGrid className="w-4 h-4 text-primary" />
              )}
              {tab.title}
              {!isRoot && (
                <span
                  onClick={(e) => closeTab(tab.id, e)}
                  className="ml-1 p-0.5 rounded transition-colors text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
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
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-background">
        <div className={activeId === ROOT_ID ? 'h-full min-h-0 min-w-0 overflow-hidden' : 'hidden'}>
          <TicketManagementDashboard
            onOpenTicket={openTicket}
            companyId={companyId}
            isProvider={isProvider}
            companies={companies}
            ticketType={ticketType}
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
