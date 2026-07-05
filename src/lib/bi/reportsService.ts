// ============================================================
// Flowfy BI v2 — Relatórios salvos (bi_saved_reports)
// CRUD do formato v2 (PivotConfig) + conversor lazy dos relatórios
// v1 do FlowfyBI antigo (migrateV1Config). Ao salvar, sempre grava
// schema_version = 2.
// ============================================================

import { supabase } from '../supabase'
import type { BiRecordType, BiFilter, BiDateField } from './types'

export type BiPivotVisual = 'table' | 'bar' | 'donut' | 'line' | 'heatmap' | 'kpi'

/** query_config v2 — a consulta self-service completa */
export interface BiPivotConfig {
  recordTypes: BiRecordType[]
  /** dimensões em linhas (até 2) */
  rows: string[]
  /** dimensão em colunas (até 1) */
  cols: string[]
  measures: string[]
  filters: BiFilter[]
  dateField: BiDateField
  periodDays: number
  visual: BiPivotVisual
}

export interface BiSavedReport {
  id: string
  name: string
  config: BiPivotConfig
  isPublic: boolean
  schemaVersion: number
  createdAt: string
  /** true se veio do formato v1 e ainda não foi regravado */
  migratedFromV1: boolean
}

export const DEFAULT_PIVOT_CONFIG: BiPivotConfig = {
  recordTypes: ['incident', 'request'],
  rows: ['priority'],
  cols: [],
  measures: ['count'],
  filters: [],
  dateField: 'created_at',
  periodDays: 30,
  visual: 'table',
}

// ─── Conversor v1 → v2 ────────────────────────────────────────

interface V1Condition { field: string; operator: string; value: string; value2?: string }
interface V1Config {
  dateRange?: string
  metricType?: string
  conditions?: V1Condition[]
  visualization?: { type?: string; groupBy?: string; subGroupBy?: string }
}

const V1_FIELD_MAP: Record<string, string> = {
  current_status: 'state',
  ticket_type: 'record_type',
  priority_level: 'priority',
  impact: 'impact',
  urgency: 'urgency',
  sla_response_status: 'is_response_breached',
  sla_resolution_status: 'is_resolution_breached',
  assigned_group_name: 'group_name',
  assigned_to_name: 'assigned_to_name',
  category_l1: 'service_category_name',
  category_l2: 'service_name',
  category_l3: 'symptom_name',
  aging_days: 'aging_bucket',
}

const V1_PRIORITY_MAP: Record<string, string> = {
  '1': 'P1 - Critical', '2': 'P2 - High', '3': 'P3 - Moderate', '4': 'P4 - Low', '5': 'P5 - Planning',
}

const V1_OP_MAP: Record<string, BiFilter['op'] | null> = {
  equals: 'eq',
  not_equals: 'neq',
  in: 'in',
  contains: 'contains',
  starts_with: 'contains',   // aproximação
  not_contains: null,        // sem equivalente v2 — descartado
  is_empty: 'is_null',
  greater_than: 'gte',
  less_than: 'lte',
  today: null, last_30_days: null, between: null, // datas cobertas pelo período
}

const V1_VISUAL_MAP: Record<string, BiPivotVisual> = {
  scorecard: 'kpi',
  bar_chart: 'bar',
  donut_chart: 'donut',
  data_table: 'table',
  line_chart: 'line',
  aging_report: 'bar',
  heatmap: 'heatmap',
}

function mapV1Value(field: string, value: string): string {
  if (field === 'priority_level') return V1_PRIORITY_MAP[value] ?? value
  if (field === 'sla_response_status' || field === 'sla_resolution_status') {
    return value === 'Estourado' ? 'true' : 'false'
  }
  return value
}

export function migrateV1Config(v1: V1Config): BiPivotConfig {
  const metricType = v1.metricType ?? 'all'
  const recordTypes: BiRecordType[] =
    metricType === 'incidents' ? ['incident']
    : metricType === 'requests' ? ['request']
    : ['incident', 'request']

  const periodDays =
    v1.dateRange === 'today' ? 1
    : v1.dateRange === 'last_7_days' ? 7
    : v1.dateRange === 'last_15_days' ? 15
    : 30

  const filters: BiFilter[] = []
  for (const c of v1.conditions ?? []) {
    const dim = V1_FIELD_MAP[c.field]
    const op = V1_OP_MAP[c.operator]
    if (!dim || op === null || op === undefined) continue // campo/op sem equivalente: descartado
    filters.push({
      dim,
      op,
      value: op === 'in'
        ? c.value.split(',').map(v => mapV1Value(c.field, v.trim()))
        : op === 'is_null' ? undefined : mapV1Value(c.field, c.value),
    })
  }

  const v1Visual = v1.visualization?.type ?? 'data_table'
  const visual = V1_VISUAL_MAP[v1Visual] ?? 'table'
  const groupByDim = v1Visual === 'aging_report'
    ? 'aging_bucket'
    : V1_FIELD_MAP[v1.visualization?.groupBy ?? ''] ?? 'state'
  const subGroupDim = V1_FIELD_MAP[v1.visualization?.subGroupBy ?? '']

  return {
    recordTypes,
    rows: visual === 'kpi' ? [] : [groupByDim],
    cols: visual !== 'kpi' && subGroupDim && subGroupDim !== groupByDim ? [subGroupDim] : [],
    measures: ['count'],
    filters,
    dateField: 'created_at',
    periodDays,
    visual,
  }
}

// ─── CRUD ─────────────────────────────────────────────────────

interface RawSavedReport {
  id: string
  name: string
  chart_type: string
  query_config: unknown
  is_public: boolean
  schema_version: number
  created_at: string
}

function toSavedReport(raw: RawSavedReport): BiSavedReport {
  const isV2 = raw.schema_version >= 2
  return {
    id: raw.id,
    name: raw.name,
    config: isV2
      ? (raw.query_config as BiPivotConfig)
      : migrateV1Config(raw.query_config as V1Config),
    isPublic: raw.is_public,
    schemaVersion: raw.schema_version,
    createdAt: raw.created_at,
    migratedFromV1: !isV2,
  }
}

export const reportsService = {
  async list(companyId: string): Promise<BiSavedReport[]> {
    const { data, error } = await supabase
      .from('bi_saved_reports')
      .select('id, name, chart_type, query_config, is_public, schema_version, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as RawSavedReport[]).map(toSavedReport)
  },

  async save(params: {
    companyId: string
    name: string
    config: BiPivotConfig
    isPublic: boolean
    /** presente = atualizar relatório existente */
    id?: string
  }): Promise<string> {
    const payload = {
      name: params.name,
      chart_type: params.config.visual,
      query_config: params.config as unknown as Record<string, unknown>,
      is_public: params.isPublic,
      schema_version: 2,
      report_kind: 'pivot',
    }
    if (params.id) {
      const { error } = await supabase
        .from('bi_saved_reports')
        .update(payload)
        .eq('id', params.id)
      if (error) throw error
      return params.id
    }
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('bi_saved_reports')
      .insert({ ...payload, company_id: params.companyId, created_by: userData?.user?.id })
      .select('id')
      .single()
    if (error) throw error
    return (data as { id: string }).id
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('bi_saved_reports').delete().eq('id', id)
    if (error) throw error
  },
}
