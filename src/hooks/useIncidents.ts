// ============================================================
// useIncidents — Real-time hook for the Incidents dashboard
// Connects to Supabase, supports filtering, paging, and
// live updates via Postgres CDC (real-time subscriptions)
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { incidentsService, DEFAULT_TICKET_PAGE_SIZE, type IncidentFilters } from '../lib/services'
import type { IncidentRow, IncidentHistoryRow, IncidentState, TicketPriority } from '../lib/database.types'

export type { IncidentRow, IncidentHistoryRow }

export interface UseIncidentsReturn {
  incidents: IncidentRow[]
  kpis: { total: number; critical: number; inProgress: number; slaBreached: number; unassigned: number }
  loading: boolean
  error: string | null
  search: string
  stateFilter: IncidentState | 'all'
  priorityFilter: TicketPriority | 'all'
  filterCompanyId: string
  /** Página atual (base 0). A fila é paginada no servidor. */
  page: number
  pageSize: number
  setPage: (v: number) => void
  setPageSize: (v: number) => void
  setSearch: (v: string) => void
  setStateFilter: (v: IncidentState | 'all') => void
  setPriorityFilter: (v: TicketPriority | 'all') => void
  setFilterCompanyId: (v: string) => void
  refetch: () => void
  upsertIncident: (incident: IncidentRow) => void
  updateState: (id: string, state: IncidentState, actorName: string, comment?: string) => Promise<void>
  addComment: (incidentId: string, comment: string, actorName: string) => Promise<void>
}

const DEFAULT_KPIS = { total: 0, critical: 0, inProgress: 0, slaBreached: 0, unassigned: 0 }
const summarizeIncidents = (rows: IncidentRow[]) => ({
  total: rows.length,
  critical: rows.filter(row => row.priority === 'P1 - Critical').length,
  inProgress: rows.filter(row => row.state === 'In Progress').length,
  slaBreached: rows.filter(row => row.sla_breached).length,
  unassigned: rows.filter(row => !row.assigned_to_id).length,
})

export function useIncidents(companyId: string, callerId?: string, ticketType?: 'incident' | 'request' | 'all'): UseIncidentsReturn {
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [kpis, setKpis] = useState(DEFAULT_KPIS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<IncidentState | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all')
  const [filterCompanyId, setFilterCompanyId] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_TICKET_PAGE_SIZE)

  // Debounce timer for search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const filters: IncidentFilters = {
        companyId,
        search: search || undefined,
        state: stateFilter !== 'all' ? stateFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        filterCompanyId: filterCompanyId !== 'all' ? filterCompanyId : undefined,
        callerId,
        ticketType: ticketType !== 'all' ? ticketType : undefined,
        limit: pageSize,
        offset: page * pageSize,
      }
      const rows = await incidentsService.list(filters)
      // Os KPIs NUNCA podem sair das linhas da página: contar no cliente
      // sobre um recorte dava "Total na fila: 1.000" com 50.010 chamados.
      // O portal do usuário (callerId) é a exceção — ali a lista do próprio
      // solicitante cabe numa página e o resumo local é fiel.
      const kpiData = callerId
        ? summarizeIncidents(rows)
        : await incidentsService.getQueueKpis(companyId, filterCompanyId, ticketType !== 'all' ? ticketType : undefined)
      setIncidents(rows)
      setKpis(kpiData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar incidentes.')
    } finally {
      setLoading(false)
    }
  }, [companyId, search, stateFilter, priorityFilter, filterCompanyId, callerId, ticketType, page, pageSize])

  // Trocar de filtro reinicia a paginação: manter a página 5 ao filtrar
  // uma lista que agora tem 2 páginas mostraria uma tela vazia.
  useEffect(() => {
    setPage(0)
  }, [search, stateFilter, priorityFilter, filterCompanyId, ticketType])

  // Initial load + filter changes
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Debounce search input
  const handleSearch = useCallback((value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    setSearch(value)
  }, [])

  const upsertIncident = useCallback((row: IncidentRow) => {
    if (callerId && row.caller_id !== callerId) return
    if (ticketType && ticketType !== 'all' && row.ticket_type !== ticketType) return
    setIncidents(previous => {
      const next = [row, ...previous.filter(candidate => candidate.id !== row.id)]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      if (callerId) setKpis(summarizeIncidents(next))
      return next
    })
  }, [callerId, ticketType])

  // Real-time subscription
  useEffect(() => {
    if (!companyId) return

    const channel = incidentsService.subscribeToCompany(
      companyId,
      // On INSERT — add to top of list
      (newRow) => {
        upsertIncident(newRow)
      },
      // On UPDATE — merge the updated row
      (updatedRow) => {
        setIncidents(prev => {
          const next = prev.map(i => i.id === updatedRow.id ? updatedRow : i)
          if (callerId) setKpis(summarizeIncidents(next))
          return next
        })
        if (!callerId) {
          incidentsService.getQueueKpis(companyId, filterCompanyId, ticketType !== 'all' ? ticketType : undefined).then(setKpis).catch(console.error)
        }
      },
      callerId,
    )

    return () => {
      channel.unsubscribe()
    }
  }, [companyId, filterCompanyId, callerId, upsertIncident, ticketType])

  const updateState = useCallback(async (id: string, state: IncidentState, actorName: string, comment?: string) => {
    await incidentsService.update(id, companyId, { state }, actorName, comment)
    // Real-time will handle UI update, but also update locally for speed
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, state } : i))
  }, [companyId])

  const addComment = useCallback(async (incidentId: string, comment: string, actorName: string) => {
    await incidentsService.addComment(incidentId, companyId, comment, actorName)
  }, [companyId])

  return {
    incidents,
    kpis,
    loading,
    error,
    search,
    stateFilter,
    priorityFilter,
    filterCompanyId,
    page,
    pageSize,
    setPage,
    setPageSize,
    setSearch: handleSearch,
    setStateFilter,
    setPriorityFilter,
    setFilterCompanyId,
    refetch: fetchData,
    upsertIncident,
    updateState,
    addComment,
  }
}
