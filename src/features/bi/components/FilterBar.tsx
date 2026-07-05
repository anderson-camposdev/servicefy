// ============================================================
// ServiceFY BI v2 — Barra de filtros globais dos dashboards
// Período (presets), grupo solucionador e prioridade. Os valores
// selecionados são combinados às consultas de todos os widgets.
// ============================================================

import type { BiChartTheme } from '../theme/echartsTheme'

export interface GlobalFilters {
  periodDays: number
  groupName: string | null
  priority: string | null
}

export const PERIOD_PRESETS = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 15 dias', days: 15 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
  { label: 'Últimos 180 dias', days: 180 },
]

export const PRIORITY_OPTIONS = [
  'P1 - Critical', 'P2 - High', 'P3 - Moderate', 'P4 - Low', 'P5 - Planning',
]

interface FilterBarProps {
  filters: GlobalFilters
  groups: string[]
  theme: BiChartTheme
  showPriority?: boolean
  onChange: (next: GlobalFilters) => void
}

export default function FilterBar({ filters, groups, theme, showPriority = true, onChange }: FilterBarProps) {
  const selectStyle: React.CSSProperties = {
    backgroundColor: theme.isDark ? 'rgba(255,255,255,.05)' : '#ffffff',
    color: theme.textColor,
    borderColor: theme.isDark ? 'rgba(148,163,184,.2)' : 'rgba(100,116,139,.25)',
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded-lg border px-3 py-1.5 text-xs focus:outline-none"
        style={selectStyle}
        value={filters.periodDays}
        onChange={e => onChange({ ...filters, periodDays: Number(e.target.value) })}
      >
        {PERIOD_PRESETS.map(p => (
          <option key={p.days} value={p.days}>{p.label}</option>
        ))}
      </select>

      <select
        className="max-w-[200px] rounded-lg border px-3 py-1.5 text-xs focus:outline-none"
        style={selectStyle}
        value={filters.groupName ?? ''}
        onChange={e => onChange({ ...filters, groupName: e.target.value || null })}
      >
        <option value="">Todos os grupos</option>
        {groups.map(g => <option key={g} value={g}>{g}</option>)}
      </select>

      {showPriority && (
        <select
          className="rounded-lg border px-3 py-1.5 text-xs focus:outline-none"
          style={selectStyle}
          value={filters.priority ?? ''}
          onChange={e => onChange({ ...filters, priority: e.target.value || null })}
        >
          <option value="">Todas as prioridades</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
    </div>
  )
}
