type BiFilterState = {
  periodDays: number
  groupName: string | null
  priority: string | null
}

import type { BiWidgetDef } from './bi/dashboards'
import type { BiPivotConfig, BiPivotVisual } from './bi/reportsService'

const RECORD_LABELS: Record<string, string> = {
  incident: 'Incidentes',
  request: 'Solicitações',
  problem: 'Problemas',
  change: 'Mudanças',
}

const VISUAL_LABELS: Record<string, string> = {
  bar: 'Barras',
  line: 'Linha',
  donut: 'Distribuição',
  table: 'Tabela',
  pivot: 'Tabela dinâmica',
  kpi: 'Indicador',
  gauge: 'Medidor',
}

export function countActiveBiFilters(filters: BiFilterState) {
  return Number(filters.periodDays !== 30) + Number(Boolean(filters.groupName)) + Number(Boolean(filters.priority))
}

export function getBiWidgetGridClass(span = 4) {
  if (span >= 12) return 'col-span-12'
  if (span >= 8) return 'col-span-12 xl:col-span-8'
  if (span >= 6) return 'col-span-12 lg:col-span-6'
  if (span >= 4) return 'col-span-12 md:col-span-6 xl:col-span-4'
  return 'col-span-12 sm:col-span-6 xl:col-span-3'
}

export function getBiMeasureValue(
  row: { dims?: Record<string, unknown>; measures?: Record<string, number | string | null> } | undefined,
  measure: string,
) {
  const value = row?.measures?.[measure]
  return value == null ? null : Number(value)
}

export function isBiCubeRowReady(row: unknown): row is { dims: Record<string, string | null>; measures: Record<string, number | null> } {
  if (!row || typeof row !== 'object') return false
  const candidate = row as { dims?: unknown; measures?: unknown }
  return Boolean(candidate.dims && typeof candidate.dims === 'object' && candidate.measures && typeof candidate.measures === 'object')
}

export function getReportSummary(recordTypes: string[], visual: string) {
  const records = recordTypes.map(type => RECORD_LABELS[type] ?? type)
  const recordSummary = records.length > 1
    ? `${records.slice(0, -1).join(', ')} e ${records.at(-1)?.toLocaleLowerCase('pt-BR')}`
    : records[0] ?? 'Todos os registros'
  return `${recordSummary} · ${VISUAL_LABELS[visual] ?? visual}`
}

export function presentBiError(_message: string) {
  return 'Não foi possível carregar os dados analíticos. Tente novamente.'
}

export function widgetToPivotConfig(widget: BiWidgetDef, filters: BiFilterState): BiPivotConfig {
  const visualMap: Partial<Record<BiWidgetDef['visual'], BiPivotVisual>> = {
    bar: 'bar',
    stacked_bar: 'bar',
    donut: 'donut',
    line: 'line',
    heatmap: 'heatmap',
    kpi: 'kpi',
    gauge: 'kpi',
    backlog_trend: 'line',
  }
  const globalFilters = [
    ...(filters.groupName ? [{ dim: 'group_name', op: 'eq' as const, value: filters.groupName }] : []),
    ...(filters.priority ? [{ dim: 'priority', op: 'eq' as const, value: filters.priority }] : []),
  ]

  return {
    recordTypes: widget.recordTypes,
    rows: widget.visual === 'kpi' || widget.visual === 'gauge' ? [] : widget.dimensions.slice(0, 1),
    cols: widget.dimensions.length > 1 ? [widget.dimensions[1]] : [],
    measures: widget.measures.length ? widget.measures : ['count'],
    filters: [...(widget.filters ?? []), ...globalFilters],
    dateField: widget.dateField ?? 'created_at',
    periodDays: filters.periodDays,
    visual: visualMap[widget.visual] ?? 'table',
  }
}

export function formatOperationalMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  if (hours === 0) return `${minutes}min`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`
}

export function getDrilldownMeasurePresentation(measureKey: string | undefined, value: number | null) {
  const measures = {
    mttr_avg: { label: 'MTTR', field: 'mttr_minutes' },
    mttr_median: { label: 'MTTR', field: 'mttr_minutes' },
    mtta_avg: { label: 'MTTA', field: 'mtta_minutes' },
    mtta_median: { label: 'MTTA', field: 'mtta_minutes' },
    avg_paused_minutes: { label: 'Pausa', field: 'paused_minutes' },
    avg_age_minutes: { label: 'Idade', field: 'age_minutes' },
  } as const
  const definition = measureKey ? measures[measureKey as keyof typeof measures] : undefined
  return definition ? { ...definition, formatted: formatOperationalMinutes(value) } : null
}
