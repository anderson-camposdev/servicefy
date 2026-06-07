// ============================================================
// useRequestCatalog — Catálogo hierárquico de requisições
// Item → Sub-item (com flag 'requiresManagerApproval')
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { requestCatalogService } from '../lib/services'
import type { RequestCatalogItem, RequestCatalogSubitem, Role } from '../types'

export interface RequestCatalogCascadeEntry {
  item:     RequestCatalogItem
  subitems: RequestCatalogSubitem[]
}

export interface RequestCatalogSelection {
  item:    RequestCatalogItem | null
  subitem: RequestCatalogSubitem | null
}

interface UseRequestCatalogReturn {
  catalog:           RequestCatalogCascadeEntry[]
  selection:         RequestCatalogSelection
  loading:           boolean
  error:             string | null
  // Indica se o sub-item selecionado exige aprovação do gestor
  requiresApproval:  boolean
  // Ações de seleção
  selectItem:        (item: RequestCatalogItem | null) => void
  selectSubitem:     (subitem: RequestCatalogSubitem | null) => void
  reset:             () => void
  // Dados filtrados por nível
  availableSubitems: RequestCatalogSubitem[]
  // Recarregar
  reload:            () => void
}

// Mapeamento snake_case → camelCase
function mapItem(row: any): RequestCatalogItem {
  return {
    id:          row.id,
    companyId:   row.company_id,
    name:        row.name,
    description: row.description,
    icon:        row.icon ?? '📋',
    active:      row.active,
    sortOrder:   row.sort_order,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

function mapSubitem(row: any): RequestCatalogSubitem {
  return {
    id:                      row.id,
    itemId:                  row.item_id,
    companyId:               row.company_id,
    name:                    row.name,
    description:             row.description,
    requiresManagerApproval: row.requires_manager_approval ?? false,
    approvalEmailTemplate:   row.approval_email_template,
    estimatedDeliveryDays:   row.estimated_delivery_days ?? 3,
    cost:                    row.cost,
    currency:                row.currency ?? 'BRL',
    visibleToRoles:          row.visible_to_roles ?? ['end_user'],
    formFields:              row.form_fields ?? [],
    active:                  row.active,
    sortOrder:               row.sort_order,
    createdAt:               row.created_at,
    updatedAt:               row.updated_at,
  }
}

const EMPTY_SELECTION: RequestCatalogSelection = { item: null, subitem: null }

export function useRequestCatalog(
  companyId: string | null,
  userRole?: Role
): UseRequestCatalogReturn {
  const [catalog,   setCatalog]   = useState<RequestCatalogCascadeEntry[]>([])
  const [selection, setSelection] = useState<RequestCatalogSelection>(EMPTY_SELECTION)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [tick,      setTick]      = useState(0)

  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!companyId) { setCatalog([]); return }

    let cancelled = false
    setLoading(true)
    setError(null)

    requestCatalogService
      .loadCascade(companyId, userRole)
      .then(raw => {
        if (cancelled) return
        const mapped = raw.map(({ item, subitems }) => ({
          item:     mapItem(item),
          subitems: subitems.map(mapSubitem),
        }))
        setCatalog(mapped)
      })
      .catch(err => {
        if (!cancelled) setError(err?.message ?? 'Erro ao carregar catálogo de requisições')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [companyId, userRole, tick])

  const selectItem = useCallback((item: RequestCatalogItem | null) => {
    setSelection({ item, subitem: null })
  }, [])

  const selectSubitem = useCallback((subitem: RequestCatalogSubitem | null) => {
    setSelection(prev => ({ ...prev, subitem }))
  }, [])

  const reset = useCallback(() => setSelection(EMPTY_SELECTION), [])

  // Sub-itens do item selecionado
  const availableSubitems = selection.item
    ? catalog.find(c => c.item.id === selection.item!.id)?.subitems ?? []
    : []

  // Flag de aprovação do sub-item selecionado
  const requiresApproval = selection.subitem?.requiresManagerApproval ?? false

  return {
    catalog,
    selection,
    loading,
    error,
    requiresApproval,
    selectItem,
    selectSubitem,
    reset,
    availableSubitems,
    reload,
  }
}
