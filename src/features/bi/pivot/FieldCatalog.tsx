// ============================================================
// ServiceFY BI v2 — Catálogo de campos do PivotExplorer
// Lista TODAS as dimensões (padrão, tempo e campos de formulário
// do tenant) e as medidas, com busca. Clique adiciona ao shelf
// escolhido (Linhas / Colunas / Filtros / Medidas).
// ============================================================

import { useMemo, useState } from 'react'
import { Search, Rows3, Columns3, Filter, Sigma } from 'lucide-react'
import type { BiDimensionDef, BiMeasureDef, BiRecordType } from '../../../lib/bi/types'
import type { BiChartTheme } from '../theme/echartsTheme'

export type ShelfTarget = 'rows' | 'cols' | 'filters'

interface FieldCatalogProps {
  dimensions: BiDimensionDef[]
  measures: BiMeasureDef[]
  recordTypes: BiRecordType[]
  theme: BiChartTheme
  onAddDimension: (key: string, target: ShelfTarget) => void
  onToggleMeasure: (key: string) => void
  activeMeasures: string[]
}

export default function FieldCatalog({
  dimensions, measures, recordTypes, theme, onAddDimension, onToggleMeasure, activeMeasures,
}: FieldCatalogProps) {
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dimensions
      .filter(d => d.recordTypes.some(rt => recordTypes.includes(rt)))
      .filter(d => !q || d.label.toLowerCase().includes(q) || d.key.toLowerCase().includes(q))
  }, [dimensions, recordTypes, search])

  const groups = useMemo(() => ({
    standard: visible.filter(d => !d.isTimeDim && !d.isFormField),
    time: visible.filter(d => d.isTimeDim),
    form: visible.filter(d => d.isFormField),
  }), [visible])

  const visibleMeasures = useMemo(() => {
    const q = search.trim().toLowerCase()
    return measures.filter(m => !q || m.label.toLowerCase().includes(q))
  }, [measures, search])

  const borderColor = theme.isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.18)'

  const renderGroup = (title: string, dims: BiDimensionDef[]) => {
    if (!dims.length) return null
    return (
      <div key={title}>
        <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.mutedColor }}>
          {title}
        </p>
        {dims.map(d => (
          <div
            key={d.key}
            className="group flex items-center justify-between rounded-md px-2 py-1 text-xs"
            style={{ color: theme.textColor }}
          >
            <span className="truncate" title={d.key}>{d.label}</span>
            <span className="hidden shrink-0 gap-0.5 group-hover:flex">
              <button type="button" title="Adicionar às Linhas" onClick={() => onAddDimension(d.key, 'rows')}
                      className="rounded p-0.5 hover:opacity-70" style={{ color: theme.primary }}>
                <Rows3 size={13} />
              </button>
              <button type="button" title="Adicionar às Colunas" onClick={() => onAddDimension(d.key, 'cols')}
                      className="rounded p-0.5 hover:opacity-70" style={{ color: theme.primary }}>
                <Columns3 size={13} />
              </button>
              <button type="button" title="Adicionar aos Filtros" onClick={() => onAddDimension(d.key, 'filters')}
                      className="rounded p-0.5 hover:opacity-70" style={{ color: theme.primary }}>
                <Filter size={13} />
              </button>
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-xl border p-3"
         style={{ borderColor, backgroundColor: theme.isDark ? 'rgba(255,255,255,.03)' : '#ffffff' }}>
      <div className="mb-2 flex items-center gap-2 rounded-lg border px-2 py-1.5"
           style={{ borderColor }}>
        <Search size={13} style={{ color: theme.mutedColor }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar campo…"
          className="w-full bg-transparent text-xs focus:outline-none"
          style={{ color: theme.textColor }}
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {renderGroup('Campos padrão', groups.standard)}
        {renderGroup('Tempo', groups.time)}
        {renderGroup('Campos de formulário', groups.form)}

        {visibleMeasures.length > 0 && (
          <div>
            <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.mutedColor }}>
              Medidas
            </p>
            {visibleMeasures.map(m => {
              const active = activeMeasures.includes(m.key)
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => onToggleMeasure(m.key)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:opacity-80"
                  style={{ color: active ? theme.primary : theme.textColor, fontWeight: active ? 600 : 400 }}
                >
                  <Sigma size={12} style={{ color: active ? theme.primary : theme.mutedColor }} />
                  <span className="truncate">{m.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
