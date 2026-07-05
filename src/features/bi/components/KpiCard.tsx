// ============================================================
// Flowfy BI v2 — Scorecard (KPI) com delta vs período anterior
// ============================================================

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { BiMeasureFormat } from '../../../lib/bi/types'
import { formatMeasure } from '../../../lib/bi/types'
import type { BiChartTheme } from '../theme/echartsTheme'

interface KpiCardProps {
  title: string
  value: number | null
  format: BiMeasureFormat
  /** valor do período anterior (para o delta); null = sem comparação */
  previousValue?: number | null
  /** true quando "menor é melhor" (MTTR, violações) */
  lowerIsBetter?: boolean
  theme: BiChartTheme
  /** cor da faixa superior (da paleta); default = primária do tenant */
  accentColor?: string
  onClick?: () => void
  loading?: boolean
}

export default function KpiCard({
  title, value, format, previousValue, lowerIsBetter, theme, accentColor, onClick, loading,
}: KpiCardProps) {
  const accent = accentColor ?? theme.primary
  const delta = previousValue != null && previousValue !== 0 && value != null
    ? ((value - previousValue) / Math.abs(previousValue)) * 100
    : null

  const improved = delta == null ? null : lowerIsBetter ? delta < 0 : delta > 0
  const deltaColor = delta == null || Math.abs(delta) < 0.05
    ? theme.mutedColor
    : improved ? theme.good : theme.bad

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-full w-full flex-col items-start justify-between overflow-hidden rounded-xl p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2"
      style={{ backgroundColor: '#ffffff', border: '1px solid rgba(100,116,139,.12)' }}
    >
      {/* faixa de cor no topo (gradiente da paleta) */}
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }}
      />
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.mutedColor }}>
        {title}
      </span>
      <span className="mt-2 text-3xl font-bold tabular-nums" style={{ color: theme.textColor }}>
        {loading ? '…' : formatMeasure(value, format)}
      </span>
      <span className="mt-1 flex items-center gap-1 text-xs" style={{ color: deltaColor }}>
        {delta == null ? (
          <span style={{ color: theme.mutedColor }}>vs período anterior: —</span>
        ) : (
          <>
            {Math.abs(delta) < 0.05
              ? <Minus size={12} />
              : delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {`${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs período anterior`}
          </>
        )}
      </span>
    </button>
  )
}
