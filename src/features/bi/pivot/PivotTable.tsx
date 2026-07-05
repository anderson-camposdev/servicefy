// ============================================================
// Flowfy BI v2 — Tabela pivô
// Renderiza o PivotModel (agregados já pivotados no client) com
// até 2 níveis de linha, colunas dinâmicas, totais e drill-down
// ao clicar numa célula.
// ============================================================

import type { PivotModel } from './pivotEngine'
import type { BiMeasureDef } from '../../../lib/bi/types'
import { formatMeasure } from '../../../lib/bi/types'
import type { BiChartTheme } from '../theme/echartsTheme'

interface PivotTableProps {
  model: PivotModel
  dimLabels: Map<string, string>
  measureDefs: Map<string, BiMeasureDef>
  theme: BiChartTheme
  /** drill-down: valores das dims de linha + (opcional) valor da coluna */
  onCellClick?: (rowValues: Array<{ dim: string; value: string }>, colValue?: { dim: string; value: string }) => void
}

export default function PivotTable({ model, dimLabels, measureDefs, theme, onCellClick }: PivotTableProps) {
  const borderColor = theme.isDark ? 'rgba(148,163,184,.12)' : 'rgba(100,116,139,.15)'
  const headBg = theme.isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)'
  const colKeys = model.colDim ? model.colKeys : ['']
  const showRowTotal = !!model.colDim && model.colKeys.length > 1

  const fmt = (m: string, v: number | null | undefined) =>
    v == null ? '—' : formatMeasure(v, measureDefs.get(m)?.format ?? 'number')

  const handleCell = (row: (typeof model.rows)[number], colKey: string) => {
    if (!onCellClick) return
    const rowValues = model.rowDims
      .map((dim, i) => ({ dim, value: row.keys[i] }))
      .filter((rv): rv is { dim: string; value: string } => rv.value != null)
    const colValue = model.colDim && colKey !== '' ? { dim: model.colDim, value: colKey } : undefined
    onCellClick(rowValues, colValue)
  }

  if (!model.rows.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm" style={{ color: theme.mutedColor }}>
        Sem dados para a combinação selecionada
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border" style={{ borderColor }}>
      <table className="w-full border-collapse text-xs">
        <thead>
          {/* Linha 1: coluna(s) dim de coluna */}
          {model.colDim && (
            <tr style={{ backgroundColor: headBg }}>
              <th className="sticky left-0 px-3 py-2 text-left font-semibold"
                  colSpan={model.rowDims.length}
                  style={{ color: theme.mutedColor, backgroundColor: headBg }}>
                {dimLabels.get(model.colDim) ?? model.colDim} →
              </th>
              {model.colKeys.map(ck => (
                <th key={ck} colSpan={model.measures.length}
                    className="border-l px-3 py-2 text-center font-semibold"
                    style={{ color: theme.textColor, borderColor }}>
                  {ck || '(vazio)'}
                </th>
              ))}
              {showRowTotal && (
                <th colSpan={model.measures.length}
                    className="border-l px-3 py-2 text-center font-bold"
                    style={{ color: theme.textColor, borderColor }}>
                  Total
                </th>
              )}
            </tr>
          )}
          {/* Linha 2: dims de linha + medidas repetidas por coluna */}
          <tr style={{ backgroundColor: headBg }}>
            {model.rowDims.map(d => (
              <th key={d} className="px-3 py-2 text-left font-semibold" style={{ color: theme.mutedColor }}>
                {dimLabels.get(d) ?? d}
              </th>
            ))}
            {colKeys.map(ck => model.measures.map(m => (
              <th key={`${ck}-${m}`} className="border-l px-3 py-2 text-right font-medium"
                  style={{ color: theme.mutedColor, borderColor }}>
                {measureDefs.get(m)?.label ?? m}
              </th>
            )))}
            {showRowTotal && model.measures.map(m => (
              <th key={`total-${m}`} className="border-l px-3 py-2 text-right font-bold"
                  style={{ color: theme.mutedColor, borderColor }}>
                {measureDefs.get(m)?.label ?? m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, ri) => (
            <tr key={ri} className="border-t transition-colors hover:opacity-90" style={{ borderColor }}>
              {row.keys.map((k, i) => (
                <td key={i} className="px-3 py-1.5 font-medium" style={{ color: theme.textColor }}>
                  {k ?? '(vazio)'}
                </td>
              ))}
              {colKeys.map(ck => model.measures.map(m => (
                <td
                  key={`${ck}-${m}`}
                  className="cursor-pointer border-l px-3 py-1.5 text-right tabular-nums"
                  style={{ color: theme.textColor, borderColor }}
                  onClick={() => handleCell(row, ck)}
                  title="Clique para ver os tickets"
                >
                  {fmt(m, row.cells[ck]?.[m])}
                </td>
              )))}
              {showRowTotal && model.measures.map(m => (
                <td key={`total-${m}`} className="border-l px-3 py-1.5 text-right font-bold tabular-nums"
                    style={{ color: theme.textColor, borderColor }}>
                  {fmt(m, row.totals[m])}
                </td>
              ))}
            </tr>
          ))}
          {/* Total geral */}
          <tr className="border-t-2" style={{ borderColor, backgroundColor: headBg }}>
            <td className="px-3 py-2 font-bold" colSpan={model.rowDims.length} style={{ color: theme.textColor }}>
              Total Geral
            </td>
            {colKeys.map(ck => model.measures.map(m => (
              <td key={`${ck}-${m}`} className="border-l px-3 py-2 text-right font-bold tabular-nums"
                  style={{ color: theme.textColor, borderColor }}>
                {model.grandTotal[m] != null && !model.colDim ? fmt(m, model.grandTotal[m]) : ''}
              </td>
            )))}
            {showRowTotal && model.measures.map(m => (
              <td key={`gt-${m}`} className="border-l px-3 py-2 text-right font-bold tabular-nums"
                  style={{ color: theme.textColor, borderColor }}>
                {fmt(m, model.grandTotal[m] ?? null)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
