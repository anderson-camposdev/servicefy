// ============================================================
// Flowfy BI v2 — Shelves do PivotExplorer
// Zonas Linhas / Colunas / Medidas / Filtros como chips removíveis.
// O chip de filtro abre um editor com operador + valores sugeridos
// (RPC bi_dimension_values).
// ============================================================

import { useEffect, useState } from 'react'
import { X, Rows3, Columns3, Sigma, Filter } from 'lucide-react'
import { cubeService } from '../../../lib/bi/cubeService'
import type { BiDimensionDef, BiFilter, BiFilterOp, BiMeasureDef, BiRecordType } from '../../../lib/bi/types'
import type { BiChartTheme } from '../theme/echartsTheme'

const OP_LABELS: Record<BiFilterOp, string> = {
  eq: 'é', neq: 'não é', in: 'um de', not_in: 'exceto',
  contains: 'contém', gte: '≥', lte: '≤', is_null: 'vazio', not_null: 'preenchido',
}

interface ShelvesProps {
  rows: string[]
  cols: string[]
  measures: string[]
  filters: BiFilter[]
  dimensionsByKey: Map<string, BiDimensionDef>
  measuresByKey: Map<string, BiMeasureDef>
  companyId: string
  recordTypes: BiRecordType[]
  theme: BiChartTheme
  onRemoveRow: (key: string) => void
  onRemoveCol: (key: string) => void
  onRemoveMeasure: (key: string) => void
  onUpdateFilter: (index: number, filter: BiFilter) => void
  onRemoveFilter: (index: number) => void
}

export default function Shelves(props: ShelvesProps) {
  const { theme } = props
  const [editingFilter, setEditingFilter] = useState<number | null>(null)

  const chipStyle: React.CSSProperties = {
    backgroundColor: `${theme.primary}1d`,
    color: theme.primary,
  }
  const zoneStyle: React.CSSProperties = {
    borderColor: theme.isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.18)',
  }

  const dimLabel = (key: string) => props.dimensionsByKey.get(key)?.label ?? key

  const zone = (
    icon: React.ReactNode, title: string, chips: React.ReactNode, empty: string,
  ) => (
    <div className="flex min-h-[42px] flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-2 py-1.5" style={zoneStyle}>
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.mutedColor }}>
        {icon}{title}
      </span>
      {chips}
      {!chips && <span className="text-[10px] italic" style={{ color: theme.mutedColor }}>{empty}</span>}
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row">
        {zone(<Rows3 size={11} />, 'Linhas',
          props.rows.length ? props.rows.map(k => (
            <Chip key={k} label={dimLabel(k)} style={chipStyle} onRemove={() => props.onRemoveRow(k)} />
          )) : null,
          'clique num campo → ícone de linhas')}
        {zone(<Columns3 size={11} />, 'Colunas',
          props.cols.length ? props.cols.map(k => (
            <Chip key={k} label={dimLabel(k)} style={chipStyle} onRemove={() => props.onRemoveCol(k)} />
          )) : null,
          'opcional (1 campo)')}
        {zone(<Sigma size={11} />, 'Medidas',
          props.measures.length ? props.measures.map(k => (
            <Chip key={k} label={props.measuresByKey.get(k)?.label ?? k} style={chipStyle} onRemove={() => props.onRemoveMeasure(k)} />
          )) : null,
          'selecione ao menos uma')}
      </div>

      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-2 py-1.5" style={zoneStyle}>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.mutedColor }}>
          <Filter size={11} />Filtros
        </span>
        {props.filters.map((f, i) => (
          <button
            key={`${f.dim}-${i}`}
            type="button"
            onClick={() => setEditingFilter(editingFilter === i ? null : i)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={chipStyle}
          >
            {dimLabel(f.dim)} {OP_LABELS[f.op]}{' '}
            {f.op === 'is_null' || f.op === 'not_null' ? '' :
              Array.isArray(f.value) ? `[${f.value.length}]` : `"${f.value ?? '…'}"`}
            <X size={11} className="hover:opacity-60" onClick={e => { e.stopPropagation(); props.onRemoveFilter(i); setEditingFilter(null) }} />
          </button>
        ))}
        {!props.filters.length && <span className="text-[10px] italic" style={{ color: theme.mutedColor }}>sem filtros</span>}
      </div>

      {editingFilter != null && props.filters[editingFilter] && (
        <FilterEditor
          filter={props.filters[editingFilter]}
          label={dimLabel(props.filters[editingFilter].dim)}
          companyId={props.companyId}
          recordTypes={props.recordTypes}
          theme={theme}
          onChange={f => props.onUpdateFilter(editingFilter, f)}
          onClose={() => setEditingFilter(null)}
        />
      )}
    </div>
  )
}

function Chip({ label, style, onRemove }: { label: string; style: React.CSSProperties; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={style}>
      {label}
      <button type="button" onClick={onRemove} className="hover:opacity-60"><X size={11} /></button>
    </span>
  )
}

// ─── Editor de filtro com valores sugeridos ──────────────────

function FilterEditor({ filter, label, companyId, recordTypes, theme, onChange, onClose }: {
  filter: BiFilter
  label: string
  companyId: string
  recordTypes: BiRecordType[]
  theme: BiChartTheme
  onChange: (f: BiFilter) => void
  onClose: () => void
}) {
  const [values, setValues] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    cubeService.dimensionValues({ companyId, dimension: filter.dim, recordTypes })
      .then(list => { if (!cancelled) setValues(list.map(v => v.value)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId, filter.dim, recordTypes])

  const selected = Array.isArray(filter.value) ? filter.value : filter.value ? [filter.value] : []
  const needsValue = filter.op !== 'is_null' && filter.op !== 'not_null'
  const multi = filter.op === 'in' || filter.op === 'not_in'

  const toggleValue = (v: string) => {
    if (multi) {
      const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
      onChange({ ...filter, value: next })
    } else {
      onChange({ ...filter, value: v })
      onClose()
    }
  }

  const boxStyle: React.CSSProperties = {
    backgroundColor: theme.isDark ? '#111c33' : '#ffffff',
    borderColor: theme.isDark ? 'rgba(148,163,184,.2)' : 'rgba(100,116,139,.25)',
  }

  return (
    <div className="rounded-xl border p-3" style={boxStyle}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: theme.textColor }}>Filtro: {label}</span>
        <button type="button" onClick={onClose} style={{ color: theme.mutedColor }}><X size={14} /></button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(OP_LABELS) as BiFilterOp[]).map(op => (
          <button
            key={op}
            type="button"
            onClick={() => onChange({ ...filter, op, value: op === 'in' || op === 'not_in' ? selected : selected[0] })}
            className="rounded-full border px-2 py-0.5 text-[10px]"
            style={{
              color: filter.op === op ? theme.primary : theme.mutedColor,
              borderColor: filter.op === op ? theme.primary : (theme.isDark ? 'rgba(148,163,184,.2)' : 'rgba(100,116,139,.25)'),
              fontWeight: filter.op === op ? 700 : 400,
            }}
          >
            {OP_LABELS[op]}
          </button>
        ))}
      </div>
      {needsValue && (
        <div className="max-h-36 overflow-y-auto">
          {loading ? (
            <span className="text-[11px]" style={{ color: theme.mutedColor }}>Carregando valores…</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {values.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleValue(v)}
                  className="rounded-md border px-2 py-0.5 text-[11px]"
                  style={{
                    color: selected.includes(v) ? theme.primary : theme.textColor,
                    borderColor: selected.includes(v) ? theme.primary : (theme.isDark ? 'rgba(148,163,184,.2)' : 'rgba(100,116,139,.25)'),
                    fontWeight: selected.includes(v) ? 700 : 400,
                  }}
                >
                  {v}
                </button>
              ))}
              {(filter.op === 'contains' || filter.op === 'gte' || filter.op === 'lte') && (
                <input
                  defaultValue={typeof filter.value === 'string' ? filter.value : ''}
                  placeholder="Digite o valor…"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      onChange({ ...filter, value: (e.target as HTMLInputElement).value })
                      onClose()
                    }
                  }}
                  className="rounded-md border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
                  style={{ color: theme.textColor, borderColor: theme.isDark ? 'rgba(148,163,184,.2)' : 'rgba(100,116,139,.25)' }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
