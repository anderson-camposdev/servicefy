// ============================================================
// ServiceFY — Tabela de chamados customizável (genérica)
//
// Reusada pelas listas de Incidentes/Solicitações, Problemas e Mudanças:
// escolha, reordenação e classificação de colunas, filtro por coluna e agrupamento, com
// preferências persistidas por usuário em localStorage (mesmo padrão já
// usado para os cartões de métrica em TicketManagementDashboard).
//
// Puramente client-side, sobre as linhas já carregadas pela tela — não
// introduz paginação nem chamadas novas ao banco.
// ============================================================

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Settings, X, ChevronDown, ChevronRight, Plus, ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from 'lucide-react'
import { useAuth } from '../auth'
import type { TicketFieldDef } from '../lib/ticketTableFields'
import {
  compareTicketValues,
  moveColumn,
  sortTicketRows,
  type TicketSortDirection,
} from '../lib/ticketTableSorting'

interface ActiveFilter {
  fieldKey: string
  /** campos 'select'/'boolean': valores aceitos (OR entre eles) */
  values?: string[]
  /** campos 'text'/'date': substring (contém) */
  text?: string
}

interface StoredPrefs {
  visibleKeys: string[]
  filters: ActiveFilter[]
  groupBy: string | null
  sort: { fieldKey: string; direction: TicketSortDirection } | null
}

interface TicketDataTableProps<T> {
  rows: T[]
  fields: TicketFieldDef<T>[]
  /** chave da tela (ex.: 'incidents' | 'requests' | 'problems' | 'changes') — combinada com o usuário logado */
  storageKey: string
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  /** coluna fixa à direita (botões de ação) — não entra na customização */
  actions?: (row: T) => ReactNode
  leadingCheckbox?: boolean
  loading?: boolean
  emptyLabel?: string
}

const NONE = '—'
const fmtValue = (v: string | number | boolean | null | undefined): string =>
  v === null || v === undefined || v === '' ? NONE : String(v)

export default function TicketDataTable<T>({
  rows, fields, storageKey, getRowId, onRowClick, actions, leadingCheckbox = true, loading, emptyLabel = 'Nenhum registro encontrado.',
}: TicketDataTableProps<T>) {
  const { profile } = useAuth()
  const persistKey = `flowfy_ticket_table_${storageKey}_${profile?.id ?? 'guest'}`
  const defaultVisibleKeys = useMemo(() => fields.filter(f => f.defaultVisible || f.alwaysVisible).map(f => f.key), [fields])

  const [visibleKeys, setVisibleKeys] = useState<string[]>(defaultVisibleKeys)
  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const [groupBy, setGroupBy] = useState<string | null>(null)
  const [sort, setSort] = useState<StoredPrefs['sort']>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [draggedKey, setDraggedKey] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const [isCustomizing, setIsCustomizing] = useState(false)
  const [draftVisibleKeys, setDraftVisibleKeys] = useState<string[]>(visibleKeys)
  const [addingFilterFor, setAddingFilterFor] = useState<string | null>(null)

  // Carrega preferências salvas (colunas + filtros + agrupamento) ao trocar de tela/usuário.
  useEffect(() => {
    const saved = localStorage.getItem(persistKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<StoredPrefs>
        const savedVisibleKeys = Array.isArray(parsed.visibleKeys)
          ? parsed.visibleKeys.filter(key => fields.some(field => field.key === key))
          : []
        const alwaysVisibleKeys = fields.filter(field => field.alwaysVisible).map(field => field.key)
        setVisibleKeys(savedVisibleKeys.length
          ? Array.from(new Set([...savedVisibleKeys, ...alwaysVisibleKeys]))
          : defaultVisibleKeys)
        setFilters(Array.isArray(parsed.filters) ? parsed.filters : [])
        setGroupBy(typeof parsed.groupBy === 'string' ? parsed.groupBy : null)
        setSort(
          parsed.sort
          && fields.some(field => field.key === parsed.sort?.fieldKey)
          && (parsed.sort.direction === 'asc' || parsed.sort.direction === 'desc')
            ? parsed.sort
            : null,
        )
        return
      } catch { /* preferências corrompidas — cai no default abaixo */ }
    }
    setVisibleKeys(defaultVisibleKeys)
    setFilters([])
    setGroupBy(null)
    setSort(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey])

  const persist = (next: Partial<StoredPrefs>) => {
    const merged: StoredPrefs = {
      visibleKeys: next.visibleKeys ?? visibleKeys,
      filters: next.filters ?? filters,
      groupBy: next.groupBy !== undefined ? next.groupBy : groupBy,
      sort: next.sort !== undefined ? next.sort : sort,
    }
    localStorage.setItem(persistKey, JSON.stringify(merged))
  }

  const fieldsByKey = useMemo(() => new Map(fields.map(f => [f.key, f])), [fields])
  const visibleFields = visibleKeys.map(k => fieldsByKey.get(k)).filter((f): f is TicketFieldDef<T> => Boolean(f))
  const groupField = groupBy ? fieldsByKey.get(groupBy) ?? null : null

  // Valores únicos presentes nas linhas atuais — alimenta o filtro tipo "select" sem RPC nova.
  const uniqueValuesFor = (field: TicketFieldDef<T>): string[] => {
    const set = new Set<string>()
    rows.forEach(r => set.add(fmtValue(field.accessor(r))))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }

  const filteredRows = useMemo(() => {
    if (filters.length === 0) return rows
    return rows.filter(row => filters.every(filter => {
      const field = fieldsByKey.get(filter.fieldKey)
      if (!field) return true
      const value = fmtValue(field.accessor(row))
      if (field.kind === 'select' || field.kind === 'boolean') {
        return !filter.values || filter.values.length === 0 || filter.values.includes(value)
      }
      return !filter.text || value.toLowerCase().includes(filter.text.toLowerCase())
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters])

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows
    const field = fieldsByKey.get(sort.fieldKey)
    if (!field) return filteredRows
    return sortTicketRows(filteredRows, field.accessor, field.kind, sort.direction)
  }, [filteredRows, fieldsByKey, sort])

  const groups = useMemo(() => {
    if (!groupField) return null
    const map = new Map<string, T[]>()
    for (const row of sortedRows) {
      const key = fmtValue(groupField.accessor(row))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return Array.from(map.entries()).sort((a, b) => sort?.fieldKey === groupField.key
      ? compareTicketValues(a[0], b[0], groupField.kind, sort.direction)
      : a[0].localeCompare(b[0], 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRows, groupField, sort])

  const reorderColumns = (sourceKey: string, targetKey: string) => {
    const next = moveColumn(visibleKeys, sourceKey, targetKey)
    if (next === visibleKeys) return
    setVisibleKeys(next)
    persist({ visibleKeys: next })
  }

  const toggleSort = (fieldKey: string) => {
    const next: NonNullable<StoredPrefs['sort']> = {
      fieldKey,
      direction: sort?.fieldKey === fieldKey && sort.direction === 'asc' ? 'desc' : 'asc',
    }
    setSort(next)
    persist({ sort: next })
  }

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const totalCols = visibleFields.length + (leadingCheckbox ? 1 : 0) + (actions ? 1 : 0)

  const renderRow = (row: T) => (
    <tr
      key={getRowId(row)}
      onClick={() => onRowClick?.(row)}
      className={`border-b border-slate-100 last:border-0 transition-colors ${onRowClick ? 'hover:bg-indigo-50/50 cursor-pointer group' : 'hover:bg-slate-50/50'}`}
    >
      {leadingCheckbox && (
        <td className="p-3 w-10 text-center" onClick={e => e.stopPropagation()}>
          <input type="checkbox" className="rounded border-slate-300" />
        </td>
      )}
      {visibleFields.map(field => (
        <td key={field.key} className="p-3 align-top text-sm text-slate-700 max-w-[260px] truncate" title={fmtValue(field.accessor(row))}>
          {field.render ? field.render(row) : fmtValue(field.accessor(row))}
        </td>
      ))}
      {actions && (
        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>{actions(row)}</td>
      )}
    </tr>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      {/* Barra de ferramentas: colunas, agrupar por, filtros ativos */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
        <button
          onClick={() => { setDraftVisibleKeys(visibleKeys); setIsCustomizing(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all"
        >
          <Settings className="w-3.5 h-3.5 text-slate-500" /> Colunas
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Agrupar por</span>
          <select
            aria-label="Agrupar por"
            value={groupBy ?? ''}
            onChange={e => { const v = e.target.value || null; setGroupBy(v); persist({ groupBy: v }) }}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none font-semibold text-slate-700"
          >
            <option value="">Nenhum</option>
            {fields.filter(f => f.groupable !== false).map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map(filter => {
            const field = fieldsByKey.get(filter.fieldKey)
            if (!field) return null
            const label = field.kind === 'select' || field.kind === 'boolean'
              ? `${field.label}: ${filter.values?.length ? filter.values.join(', ') : '…'}`
              : `${field.label}: "${filter.text ?? ''}"`
            return (
              <span key={filter.fieldKey} className="flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 text-[11px] font-semibold max-w-[220px]">
                <span className="truncate">{label}</span>
                <button
                  onClick={() => { const next = filters.filter(f => f.fieldKey !== filter.fieldKey); setFilters(next); persist({ filters: next }) }}
                  className="hover:opacity-60 shrink-0"
                ><X className="w-3 h-3" /></button>
              </span>
            )
          })}

          {addingFilterFor === null ? (
            <button
              onClick={() => setAddingFilterFor('')}
              className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-slate-300 rounded-full text-[11px] font-bold text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              <Plus className="w-3 h-3" /> Filtro
            </button>
          ) : (
            <FilterPicker
              fields={fields}
              existingKeys={filters.map(f => f.fieldKey)}
              pickedKey={addingFilterFor}
              onPickField={setAddingFilterFor}
              uniqueValuesFor={uniqueValuesFor}
              onApply={filter => {
                const next = [...filters.filter(f => f.fieldKey !== filter.fieldKey), filter]
                setFilters(next); persist({ filters: next }); setAddingFilterFor(null)
              }}
              onCancel={() => setAddingFilterFor(null)}
            />
          )}
        </div>

        <span className="ml-auto hidden text-[10px] font-semibold text-slate-400 lg:inline">
          Arraste as colunas para mover · clique no título para ordenar
        </span>
      </div>

      {/* Tabela */}
      <div data-testid="ticket-table-scroll" className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
            <tr className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              {leadingCheckbox && <th className="p-3 w-10 text-center"><input type="checkbox" className="rounded border-slate-300" /></th>}
              {visibleFields.map((field, index) => {
                const direction = sort?.fieldKey === field.key ? sort.direction : null
                const nextDirection = direction === 'asc' ? 'decrescente' : 'crescente'
                return (
                  <th
                    key={field.key}
                    draggable
                    aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
                    onDragStart={event => {
                      setDraggedKey(field.key)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', field.key)
                    }}
                    onDragEnter={() => setDragOverKey(field.key)}
                    onDragOver={event => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={event => {
                      event.preventDefault()
                      const sourceKey = draggedKey || event.dataTransfer.getData('text/plain')
                      if (sourceKey) reorderColumns(sourceKey, field.key)
                      setDraggedKey(null)
                      setDragOverKey(null)
                    }}
                    onDragEnd={() => {
                      setDraggedKey(null)
                      setDragOverKey(null)
                    }}
                    className={`p-0 transition-colors ${
                      dragOverKey === field.key && draggedKey !== field.key ? 'bg-indigo-100 ring-2 ring-inset ring-indigo-400' : ''
                    } ${draggedKey === field.key ? 'opacity-50' : ''}`}
                  >
                    <button
                      type="button"
                      aria-label={`Classificar por ${field.label} em ordem ${nextDirection}`}
                      title={`Classificar em ordem ${nextDirection}. Alt + setas move a coluna.`}
                      onClick={() => toggleSort(field.key)}
                      onKeyDown={event => {
                        if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
                        event.preventDefault()
                        const targetIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1
                        const target = visibleFields[targetIndex]
                        if (target) reorderColumns(field.key, target.key)
                      }}
                      className="group/header flex w-full items-center gap-1.5 p-3 text-left hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500"
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300 group-hover/header:text-slate-500" aria-hidden="true" />
                      <span>{field.label}</span>
                      {direction === 'asc'
                        ? <ArrowUp className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
                        : direction === 'desc'
                          ? <ArrowDown className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
                          : <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover/header:opacity-100" aria-hidden="true" />}
                    </button>
                  </th>
                )
              })}
              {actions && <th className="p-3 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading && filteredRows.length === 0 && (
              <tr><td colSpan={totalCols} className="p-8 text-center text-slate-400 text-sm">
                <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-2 align-middle" />
                Carregando…
              </td></tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr><td colSpan={totalCols} className="p-8 text-center text-slate-400 text-sm">{emptyLabel}</td></tr>
            )}
            {!groupField && sortedRows.map(renderRow)}
            {groupField && groups && groups.map(([key, groupRows]) => {
              const collapsed = collapsedGroups.has(key)
              return (
                <FragmentGroup key={key}>
                  <tr className="bg-slate-100/70 border-y border-slate-200">
                    <td colSpan={totalCols} className="px-3 py-2">
                      <button onClick={() => toggleGroupCollapse(key)} className="flex items-center gap-2 text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {groupField.label}: {key}
                        <span className="text-slate-400 font-semibold normal-case">({groupRows.length})</span>
                      </button>
                    </td>
                  </tr>
                  {!collapsed && groupRows.map(renderRow)}
                </FragmentGroup>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 bg-slate-50 border-t border-slate-200 p-3 px-4 text-xs text-slate-500">
        {filteredRows.length} registro(s){filters.length > 0 && rows.length !== filteredRows.length ? ` (de ${rows.length})` : ''}
      </div>

      {/* Modal: customizar colunas */}
      {isCustomizing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-800 text-base">Customizar Colunas</h3>
              </div>
              <button onClick={() => setIsCustomizing(false)} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-2 max-h-[420px] overflow-y-auto">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Selecione quais campos aparecem como coluna:
              </p>
              {fields.map(field => {
                const alwaysOn = Boolean(field.alwaysVisible)
                const checked = alwaysOn || draftVisibleKeys.includes(field.key)
                return (
                  <label
                    key={field.key}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 select-none transition-all ${
                      alwaysOn ? 'opacity-60 cursor-not-allowed border-slate-200'
                        : checked ? 'border-indigo-500 bg-indigo-50/40 cursor-pointer hover:bg-indigo-50/60' : 'border-slate-200 cursor-pointer hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={alwaysOn}
                      onChange={() => setDraftVisibleKeys(prev => prev.includes(field.key) ? prev.filter(k => k !== field.key) : [...prev, field.key])}
                      className="w-4.5 h-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm font-bold text-slate-800">{field.label}{alwaysOn && <span className="ml-1.5 text-[10px] font-semibold text-slate-400 uppercase">fixo</span>}</span>
                  </label>
                )
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button onClick={() => setIsCustomizing(false)} className="px-4 py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-xl transition-all">
                Cancelar
              </button>
              <button
                onClick={() => {
                  const next = Array.from(new Set([...draftVisibleKeys, ...fields.filter(f => f.alwaysVisible).map(f => f.key)]))
                  setVisibleKeys(next); persist({ visibleKeys: next }); setIsCustomizing(false)
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

// Evita import extra de React.Fragment com key — pequeno wrapper local.
function FragmentGroup({ children }: { children: ReactNode }) {
  return <>{children}</>
}

// ─── Seletor de novo filtro (campo → valores/texto) ──────────────────────────
function FilterPicker<T>({ fields, existingKeys, pickedKey, onPickField, uniqueValuesFor, onApply, onCancel }: {
  fields: TicketFieldDef<T>[]
  existingKeys: string[]
  pickedKey: string
  onPickField: (key: string) => void
  uniqueValuesFor: (field: TicketFieldDef<T>) => string[]
  onApply: (filter: ActiveFilter) => void
  onCancel: () => void
}) {
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [textValue, setTextValue] = useState('')
  const field = fields.find(f => f.key === pickedKey) ?? null
  const available = fields.filter(f => !existingKeys.includes(f.key))

  if (!field) {
    return (
      <div className="relative">
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Filtrar por</p>
          <div className="max-h-52 overflow-y-auto">
            {available.map(f => (
              <button key={f.key} onClick={() => onPickField(f.key)} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={onCancel} className="mt-1 block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-400 hover:bg-slate-50">Cancelar</button>
        </div>
      </div>
    )
  }

  const isSelectLike = field.kind === 'select' || field.kind === 'boolean'
  const values = isSelectLike ? uniqueValuesFor(field) : []

  return (
    <div className="relative">
      <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">Filtro: {field.label}</span>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        {isSelectLike ? (
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {values.map(v => (
              <label key={v} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(v)}
                  onChange={() => setSelectedValues(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
                  className="rounded border-slate-300 text-indigo-600"
                />
                {v}
              </label>
            ))}
          </div>
        ) : (
          <input
            autoFocus
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            placeholder="Contém…"
            onKeyDown={e => { if (e.key === 'Enter' && textValue.trim()) onApply({ fieldKey: field.key, text: textValue.trim() }) }}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-200"
          />
        )}
        <button
          onClick={() => isSelectLike
            ? selectedValues.length && onApply({ fieldKey: field.key, values: selectedValues })
            : textValue.trim() && onApply({ fieldKey: field.key, text: textValue.trim() })}
          disabled={isSelectLike ? selectedValues.length === 0 : !textValue.trim()}
          className="mt-2.5 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
        >
          Aplicar
        </button>
      </div>
    </div>
  )
}
