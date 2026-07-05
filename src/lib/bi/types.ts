// ============================================================
// ServiceFY BI v2 — Tipos do motor analítico
// Espelha o contrato das RPCs bi_cube / bi_drilldown / catálogo
// (migrations 061–064).
// ============================================================

export type BiRecordType = 'incident' | 'request' | 'problem' | 'change'

export type BiFilterOp =
  | 'eq' | 'neq' | 'in' | 'not_in'
  | 'contains' | 'gte' | 'lte'
  | 'is_null' | 'not_null'

export interface BiFilter {
  dim: string
  op: BiFilterOp
  /** string para ops escalares; string[] para in/not_in; ausente para is_null/not_null */
  value?: string | string[]
}

export type BiDateField = 'created_at' | 'resolved_at' | 'closed_at'

export interface BiCubeQuery {
  companyId: string
  recordTypes: BiRecordType[]
  /** keys de bi_dimensions ou 'form.<label>' — máx 3 */
  dimensions: string[]
  /** keys de bi_measures — 1 a 8 */
  measures: string[]
  filters?: BiFilter[]
  dateFrom: Date
  dateTo: Date
  dateField?: BiDateField
  limit?: number
}

export interface BiCubeRow {
  dims: Record<string, string | null>
  measures: Record<string, number | null>
}

export interface BiDrilldownRow {
  id: string
  record_type: BiRecordType
  number: string
  short_description: string
  state: string
  priority: string | null
  group_name: string | null
  assigned_to_name: string | null
  created_at: string
  sla_breached: boolean
  total_count: number
}

export interface BiDimensionDef {
  key: string
  label: string
  recordTypes: BiRecordType[]
  dataType: 'text' | 'date' | 'number' | 'boolean'
  isTimeDim: boolean
  /** true para dimensões descobertas em form_data */
  isFormField?: boolean
  sortOrder: number
}

export type BiMeasureFormat = 'number' | 'minutes' | 'percent'

export interface BiMeasureDef {
  key: string
  label: string
  format: BiMeasureFormat
  sortOrder: number
}

export interface BiBacklogTrendPoint {
  snapshot_date: string
  record_type: BiRecordType
  open_count: number
  breached_count: number
}

// ─── Formatadores ─────────────────────────────────────────────

/** 275 -> "4h 35m"; 30 -> "30m"; 1500 -> "1d 1h" (dia útil de 8h não aplicado: dias corridos de 24h ficariam errados para min úteis, então exibimos h/m). */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return '—'
  const m = Math.round(mins)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest > 0 ? `${h}h ${rest}m` : `${h}h`
}

export function formatPercent(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function formatNumber(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR')
}

export function formatMeasure(value: number | null | undefined, format: BiMeasureFormat): string {
  switch (format) {
    case 'minutes': return formatMinutes(value)
    case 'percent': return formatPercent(value)
    default:        return formatNumber(value)
  }
}

export const RECORD_TYPE_LABELS: Record<BiRecordType, string> = {
  incident: 'Incidentes',
  request: 'Solicitações',
  problem: 'Problemas',
  change: 'Mudanças',
}
