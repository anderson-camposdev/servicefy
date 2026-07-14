// ============================================================
// ServiceFY BI v2 — Chamadas às RPCs analíticas (bi_cube etc.)
// As RPCs vivem no schema public e aplicam o guard de tenant no
// servidor: para MSP passamos p_company_id = null (cross-tenant)
// ou o tenant selecionado; para usuários comuns o servidor força
// a company do próprio usuário independente do que enviarmos.
// ============================================================

import { supabase } from '../supabase'
import { isProviderTenantId } from '../services'
import type {
  BiCubeQuery, BiCubeRow, BiDrilldownRow, BiFilter,
  BiRecordType, BiDateField, BiBacklogTrendPoint,
} from './types'

/** MSP enxerga todos os tenants quando não há um tenant selecionado. */
function toServerCompanyId(companyId: string): string | null {
  return isProviderTenantId(companyId) ? null : companyId
}

function serializeFilters(filters?: BiFilter[]): unknown[] {
  return (filters ?? []).map(f => ({
    dim: f.dim,
    op: f.op,
    value: Array.isArray(f.value) ? f.value : f.value ?? null,
  }))
}

export const cubeService = {
  async runCube(q: BiCubeQuery): Promise<BiCubeRow[]> {
    const { data, error } = await supabase.rpc('bi_cube', {
      p_company_id: toServerCompanyId(q.companyId),
      p_record_types: q.recordTypes,
      p_dimensions: q.dimensions,
      p_measures: q.measures,
      p_filters: serializeFilters(q.filters),
      p_date_from: q.dateFrom.toISOString(),
      p_date_to: q.dateTo.toISOString(),
      p_date_field: q.dateField ?? 'created_at',
      p_limit: q.limit ?? 1000,
    })
    if (error) throw error
    return (data ?? []) as BiCubeRow[]
  },

  async drilldown(params: {
    companyId: string
    recordTypes: BiRecordType[]
    filters?: BiFilter[]
    dateFrom: Date
    dateTo: Date
    dateField?: BiDateField
    limit?: number
    offset?: number
  }): Promise<{ rows: BiDrilldownRow[]; total: number }> {
    const { data, error } = await supabase.rpc('bi_drilldown', {
      p_company_id: toServerCompanyId(params.companyId),
      p_record_types: params.recordTypes,
      p_filters: serializeFilters(params.filters),
      p_date_from: params.dateFrom.toISOString(),
      p_date_to: params.dateTo.toISOString(),
      p_date_field: params.dateField ?? 'created_at',
      p_limit: params.limit ?? 100,
      p_offset: params.offset ?? 0,
    })
    if (error) throw error
    const rows = (data ?? []) as BiDrilldownRow[]
    return { rows, total: rows[0]?.total_count ?? 0 }
  },

  /** Valores distintos de uma dimensão para os seletores de filtro (top 50). */
  async dimensionValues(params: {
    companyId: string
    dimension: string
    search?: string
    recordTypes?: BiRecordType[]
  }): Promise<Array<{ value: string; occurrences: number }>> {
    const { data, error } = await supabase.rpc('bi_dimension_values', {
      p_company_id: toServerCompanyId(params.companyId),
      p_dimension: params.dimension,
      p_search: params.search ?? null,
      p_record_types: params.recordTypes ?? ['incident', 'request', 'problem', 'change'],
    })
    if (error) throw error
    return (data ?? []) as Array<{ value: string; occurrences: number }>
  },

  async getBacklogTrend(params: {
    companyId: string
    recordTypes: BiRecordType[]
    dateFrom: Date
    dateTo: Date
  }): Promise<BiBacklogTrendPoint[]> {
    const { data, error } = await supabase.rpc('bi_backlog_trend', {
      p_company_id: toServerCompanyId(params.companyId),
      p_record_types: params.recordTypes,
      p_date_from: params.dateFrom.toISOString().slice(0, 10),
      p_date_to: params.dateTo.toISOString().slice(0, 10),
    })
    if (error) throw error
    return (data ?? []) as BiBacklogTrendPoint[]
  },
}
