// ============================================================
// useIncidentCatalog — Carrega catálogo hierárquico de incidentes
// Item → Sub-item → Sintoma (com SLA automático)
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { incidentCatalogService } from '../lib/services'
import type { IncidentCatalogItem, IncidentCatalogSubitem, IncidentCatalogSymptom } from '../types'

export interface IncidentCatalogCascadeEntry {
  item: IncidentCatalogItem
  subitems: Array<IncidentCatalogSubitem & { symptoms: IncidentCatalogSymptom[] }>
}

// Seleção atual do usuário no seletor em cascata
export interface IncidentCatalogSelection {
  item:    IncidentCatalogItem | null
  subitem: IncidentCatalogSubitem | null
  symptom: IncidentCatalogSymptom | null
}

// SLA calculado automaticamente a partir do sintoma selecionado
export interface ComputedSLA {
  responseDeadline:   Date | null  // data/hora limite de resposta
  resolutionDeadline: Date | null  // data/hora limite de solução
  responseMins:       number
  resolutionMins:     number
  priority:           string
}

interface UseIncidentCatalogReturn {
  catalog:        IncidentCatalogCascadeEntry[]
  selection:      IncidentCatalogSelection
  computedSla:    ComputedSLA | null
  loading:        boolean
  error:          string | null
  // Ações de seleção em cascata
  selectItem:    (item: IncidentCatalogItem | null) => void
  selectSubitem: (subitem: IncidentCatalogSubitem | null) => void
  selectSymptom: (symptom: IncidentCatalogSymptom | null) => void
  reset:         () => void
  // Dados filtrados para cada nível
  availableSubitems: Array<IncidentCatalogSubitem & { symptoms: IncidentCatalogSymptom[] }>
  availableSymptoms: IncidentCatalogSymptom[]
  // Recarregar
  reload: () => void
}

function computeSLA(symptom: IncidentCatalogSymptom | null): ComputedSLA | null {
  if (!symptom) return null
  const now = new Date()
  return {
    responseDeadline:   new Date(now.getTime() + symptom.slaResponseMins   * 60 * 1000),
    resolutionDeadline: new Date(now.getTime() + symptom.slaResolutionMins * 60 * 1000),
    responseMins:       symptom.slaResponseMins,
    resolutionMins:     symptom.slaResolutionMins,
    priority:           symptom.defaultPriority,
  }
}

// Mapeia dados do banco (snake_case) para tipos do domínio (camelCase)
function mapItem(row: any): IncidentCatalogItem {
  return {
    id:          row.id,
    companyId:   row.company_id,
    name:        row.name,
    description: row.description,
    icon:        row.icon ?? '🔧',
    active:      row.active,
    sortOrder:   row.sort_order,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

function mapSubitem(row: any): IncidentCatalogSubitem {
  return {
    id:          row.id,
    itemId:      row.item_id,
    companyId:   row.company_id,
    name:        row.name,
    description: row.description,
    active:      row.active,
    sortOrder:   row.sort_order,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

function mapSymptom(row: any): IncidentCatalogSymptom {
  return {
    id:                  row.id,
    subitemId:           row.subitem_id,
    itemId:              row.item_id,
    companyId:           row.company_id,
    name:                row.name,
    description:         row.description,
    slaResponseMins:     row.sla_response_mins,
    slaResolutionMins:   row.sla_resolution_mins,
    defaultPriority:     row.default_priority,
    autoAssignGroupId:   row.auto_assign_group_id,
    active:              row.active,
    sortOrder:           row.sort_order,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  }
}

const EMPTY_SELECTION: IncidentCatalogSelection = { item: null, subitem: null, symptom: null }

export function useIncidentCatalog(companyId: string | null): UseIncidentCatalogReturn {
  const [catalog,   setCatalog]   = useState<IncidentCatalogCascadeEntry[]>([])
  const [selection, setSelection] = useState<IncidentCatalogSelection>(EMPTY_SELECTION)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [tick,      setTick]      = useState(0)

  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!companyId) { setCatalog([]); return }

    let cancelled = false
    setLoading(true)
    setError(null)

    incidentCatalogService
      .loadCascade(companyId)
      .then(raw => {
        if (cancelled) return
        const mapped = raw.map(({ item, subitems }) => ({
          item:     mapItem(item),
          subitems: subitems.map(sub => ({
            ...mapSubitem(sub),
            symptoms: (sub as any).symptoms?.map(mapSymptom) ?? [],
          })),
        }))
        setCatalog(mapped)
      })
      .catch(err => {
        if (!cancelled) setError(err?.message ?? 'Erro ao carregar catálogo de incidentes')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [companyId, tick])

  const selectItem = useCallback((item: IncidentCatalogItem | null) => {
    setSelection({ item, subitem: null, symptom: null })
  }, [])

  const selectSubitem = useCallback((subitem: IncidentCatalogSubitem | null) => {
    setSelection(prev => ({ ...prev, subitem, symptom: null }))
  }, [])

  const selectSymptom = useCallback((symptom: IncidentCatalogSymptom | null) => {
    setSelection(prev => ({ ...prev, symptom }))
  }, [])

  const reset = useCallback(() => setSelection(EMPTY_SELECTION), [])

  // Sub-itens disponíveis para o item selecionado
  const availableSubitems = selection.item
    ? catalog.find(c => c.item.id === selection.item!.id)?.subitems ?? []
    : []

  // Sintomas disponíveis para o sub-item selecionado
  const availableSymptoms = selection.subitem
    ? availableSubitems.find(s => s.id === selection.subitem!.id)?.symptoms ?? []
    : []

  const computedSla = computeSLA(selection.symptom)

  return {
    catalog,
    selection,
    computedSla,
    loading,
    error,
    selectItem,
    selectSubitem,
    selectSymptom,
    reset,
    availableSubitems,
    availableSymptoms,
    reload,
  }
}
