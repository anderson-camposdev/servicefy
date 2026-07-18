type BiFilterState = {
  periodDays: number
  groupName: string | null
  priority: string | null
}

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
