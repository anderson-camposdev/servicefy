// ============================================================
// ServiceFY BI v2 — Catálogo de dimensões e medidas
// Lê bi_dimensions / bi_measures (whitelist global, migration 062)
// e as dimensões dinâmicas de formulário do tenant
// (bi_form_dimensions). Cache em memória por sessão.
// ============================================================

import { supabase } from '../supabase'
import { MSP_COMPANY_ID } from '../services'
import type { BiDimensionDef, BiMeasureDef, BiRecordType } from './types'

interface RawDimension {
  key: string
  label_pt: string
  record_types: BiRecordType[]
  data_type: BiDimensionDef['dataType']
  is_time_dim: boolean
  sort_order: number
}

interface RawMeasure {
  key: string
  label_pt: string
  format: BiMeasureDef['format']
  sort_order: number
}

interface RawFormDimension {
  key: string
  label: string
  data_type: BiDimensionDef['dataType']
  source: string
}

let staticDimensionsCache: BiDimensionDef[] | null = null
let measuresCache: BiMeasureDef[] | null = null
const formDimensionsCache = new Map<string, BiDimensionDef[]>()

export const catalogService = {
  async getStaticDimensions(): Promise<BiDimensionDef[]> {
    if (staticDimensionsCache) return staticDimensionsCache
    const { data, error } = await supabase
      .from('bi_dimensions')
      .select('key, label_pt, record_types, data_type, is_time_dim, sort_order')
      .order('sort_order')
    if (error) throw error
    staticDimensionsCache = ((data ?? []) as RawDimension[]).map(d => ({
      key: d.key,
      label: d.label_pt,
      recordTypes: d.record_types,
      dataType: d.data_type,
      isTimeDim: d.is_time_dim,
      sortOrder: d.sort_order,
    }))
    return staticDimensionsCache
  },

  async getFormDimensions(companyId: string): Promise<BiDimensionDef[]> {
    // MSP sem tenant selecionado: sem dimensões de formulário (são por tenant).
    if (companyId === MSP_COMPANY_ID) return []
    const cached = formDimensionsCache.get(companyId)
    if (cached) return cached
    const { data, error } = await supabase.rpc('bi_form_dimensions', {
      p_company_id: companyId,
    })
    if (error) throw error
    const dims = ((data ?? []) as RawFormDimension[]).map((d, i) => ({
      key: d.key,
      label: d.label,
      recordTypes: ['incident', 'request'] as BiRecordType[],
      dataType: d.data_type,
      isTimeDim: false,
      isFormField: true,
      sortOrder: 1000 + i,
    }))
    formDimensionsCache.set(companyId, dims)
    return dims
  },

  /** Catálogo completo (estáticas + formulário) filtrado por record types. */
  async getDimensions(companyId: string, recordTypes?: BiRecordType[]): Promise<BiDimensionDef[]> {
    const [staticDims, formDims] = await Promise.all([
      this.getStaticDimensions(),
      this.getFormDimensions(companyId),
    ])
    const all = [...staticDims, ...formDims]
    if (!recordTypes || recordTypes.length === 0) return all
    return all.filter(d => d.recordTypes.some(rt => recordTypes.includes(rt)))
  },

  async getMeasures(): Promise<BiMeasureDef[]> {
    if (measuresCache) return measuresCache
    const { data, error } = await supabase
      .from('bi_measures')
      .select('key, label_pt, format, sort_order')
      .order('sort_order')
    if (error) throw error
    measuresCache = ((data ?? []) as RawMeasure[]).map(m => ({
      key: m.key,
      label: m.label_pt,
      format: m.format,
      sortOrder: m.sort_order,
    }))
    return measuresCache
  },

  /** Invalidar após o admin editar form_templates/catálogo. */
  invalidateFormDimensions(companyId?: string) {
    if (companyId) formDimensionsCache.delete(companyId)
    else formDimensionsCache.clear()
  },
}
