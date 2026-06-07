// ============================================================
// useIncidents — Real-time hook for the Incidents dashboard
// Connects to Supabase, supports filtering, paging, and
// live updates via Postgres CDC (real-time subscriptions)
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { incidentsService, type IncidentFilters } from '../lib/services'
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
  setSearch: (v: string) => void
  setStateFilter: (v: IncidentState | 'all') => void
  setPriorityFilter: (v: TicketPriority | 'all') => void
  setFilterCompanyId: (v: string) => void
  refetch: () => void
  updateState: (id: string, state: IncidentState, actorName: string, comment?: string) => Promise<void>
  addComment: (incidentId: string, comment: string, actorName: string) => Promise<void>
}

const DEFAULT_KPIS = { total: 0, critical: 0, inProgress: 0, slaBreached: 0, unassigned: 0 }

export function useIncidents(companyId: string): UseIncidentsReturn {
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [kpis, setKpis] = useState(DEFAULT_KPIS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<IncidentState | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all')
  const [filterCompanyId, setFilterCompanyId] = useState<string>('all')

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
      }
      const [rows, kpiData] = await Promise.all([
        incidentsService.list(filters),
        incidentsService.getKPIs(companyId, filterCompanyId),
      ])
      setIncidents(rows)
      setKpis(kpiData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar incidentes.')
    } finally {
      setLoading(false)
    }
  }, [companyId, search, stateFilter, priorityFilter, filterCompanyId])

  // Initial load + filter changes
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Debounce search input
  const handleSearch = useCallback((value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    setSearch(value)
  }, [])

  // Real-time subscription
  useEffect(() => {
    if (!companyId) return

    const channel = incidentsService.subscribeToCompany(
      companyId,
      // On INSERT — add to top of list
      (newRow) => {
        setIncidents(prev => [newRow, ...prev])
        setKpis(prev => ({
          ...prev,
          total: prev.total + 1,
          critical:   newRow.priority === 'P1 - Critical' ? prev.critical + 1 : prev.critical,
          inProgress: newRow.state === 'In Progress'      ? prev.inProgress + 1 : prev.inProgress,
          slaBreached: newRow.sla_breached               ? prev.slaBreached + 1 : prev.slaBreached,
          unassigned: !newRow.assigned_to_id             ? prev.unassigned + 1 : prev.unassigned,
        }))
      },
      // On UPDATE — merge the updated row
      (updatedRow) => {
        setIncidents(prev => prev.map(i => i.id === updatedRow.id ? updatedRow : i))
        // Re-fetch KPIs (easier to keep consistent)
        incidentsService.getKPIs(companyId, filterCompanyId).then(setKpis).catch(console.error)
      }
    )

    return () => {
      channel.unsubscribe()
    }
  }, [companyId, filterCompanyId])

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
    setSearch: handleSearch,
    setStateFilter,
    setPriorityFilter,
    setFilterCompanyId,
    refetch: fetchData,
    updateState,
    addComment,
  }
}
