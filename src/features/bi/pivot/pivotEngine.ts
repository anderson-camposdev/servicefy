// ============================================================
// ServiceFY BI v2 — Motor de pivô client-side
// Recebe as tuplas ACHATADAS e já agregadas do bi_cube (linhas +
// coluna) e monta o modelo de tabela dinâmica: chaves de linha
// (até 2 níveis), chaves de coluna, células e subtotais.
// Nunca toca em linhas cruas — só reorganiza agregados.
// ============================================================

import type { BiCubeRow } from '../../../lib/bi/types'

export interface PivotModel {
  /** dims usadas nas linhas (1-2) e coluna (0-1) */
  rowDims: string[]
  colDim: string | null
  measures: string[]
  /** valores distintos da dimensão de coluna, ordenados */
  colKeys: string[]
  /** linhas do corpo, ordenadas pela 1ª medida do total da linha (desc) */
  rows: PivotRow[]
  /** totais gerais por medida */
  grandTotal: Record<string, number>
}

export interface PivotRow {
  /** valores das dims de linha, ex: ['Hardware', 'P1 - Critical'] */
  keys: (string | null)[]
  /** célula por colKey ('' quando não há colDim) por medida */
  cells: Record<string, Record<string, number | null>>
  /** total da linha por medida (soma para medidas somáveis; null para médias/%) */
  totals: Record<string, number | null>
}

/** Medidas cuja agregação de subtotal por soma é válida. Médias/percentuais não são somáveis. */
const SUMMABLE = new Set(['count', 'backlog', 'resolved_count', 'breached_count', 'reopened_count'])

export function buildPivotModel(
  cubeRows: BiCubeRow[],
  rowDims: string[],
  colDim: string | null,
  measures: string[],
): PivotModel {
  const colKeySet = new Set<string>()
  const rowMap = new Map<string, PivotRow>()

  for (const r of cubeRows) {
    const rowKeys = rowDims.map(d => r.dims[d] ?? null)
    const rowId = JSON.stringify(rowKeys)
    const colKey = colDim ? String(r.dims[colDim] ?? '(vazio)') : ''
    if (colDim) colKeySet.add(colKey)

    let row = rowMap.get(rowId)
    if (!row) {
      row = { keys: rowKeys, cells: {}, totals: {} }
      rowMap.set(rowId, row)
    }
    row.cells[colKey] = {}
    for (const m of measures) {
      const v = r.measures[m]
      row.cells[colKey][m] = v == null ? null : Number(v)
    }
  }

  const colKeys = [...colKeySet].sort()

  // Totais de linha e geral (apenas medidas somáveis; para as demais fica null — evita médias erradas)
  const grandTotal: Record<string, number> = {}
  const rows = [...rowMap.values()]
  for (const row of rows) {
    for (const m of measures) {
      if (!SUMMABLE.has(m)) { row.totals[m] = null; continue }
      let sum = 0
      for (const colKey of Object.keys(row.cells)) {
        sum += row.cells[colKey][m] ?? 0
      }
      row.totals[m] = sum
      grandTotal[m] = (grandTotal[m] ?? 0) + sum
    }
  }

  const firstMeasure = measures[0]
  rows.sort((a, b) => {
    const av = a.totals[firstMeasure] ?? firstCell(a, firstMeasure) ?? -Infinity
    const bv = b.totals[firstMeasure] ?? firstCell(b, firstMeasure) ?? -Infinity
    return (bv as number) - (av as number)
  })

  return { rowDims, colDim, measures, colKeys, rows, grandTotal }
}

function firstCell(row: PivotRow, measure: string): number | null {
  for (const colKey of Object.keys(row.cells)) {
    const v = row.cells[colKey][measure]
    if (v != null) return v
  }
  return null
}
