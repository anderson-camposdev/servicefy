import { describe, expect, it } from 'vitest'
import {
  countActiveBiFilters,
  getBiWidgetGridClass,
  getBiMeasureValue,
  isBiCubeRowReady,
  widgetToPivotConfig,
  getDrilldownMeasurePresentation,
  getReportSummary,
  presentBiError,
} from '../bi-presentation'

describe('BI presentation', () => {
  it('conta apenas filtros opcionais ativos', () => {
    expect(countActiveBiFilters({ periodDays: 30, groupName: null, priority: null })).toBe(0)
    expect(countActiveBiFilters({ periodDays: 90, groupName: 'Service Desk', priority: 'P1 - Critical' })).toBe(3)
  })

  it('mantém widgets legíveis em telas estreitas', () => {
    expect(getBiWidgetGridClass(3)).toContain('col-span-12')
    expect(getBiWidgetGridClass(3)).toContain('xl:col-span-3')
    expect(getBiWidgetGridClass(12)).toBe('col-span-12')
  })

  it('tolera linhas analíticas ainda sem medidas materializadas', () => {
    expect(getBiMeasureValue(undefined, 'backlog')).toBeNull()
    expect(getBiMeasureValue({ dims: {}, measures: {} }, 'backlog')).toBeNull()
    expect(getBiMeasureValue({ dims: {}, measures: { backlog: 12 } }, 'backlog')).toBe(12)
  })

  it('descarta linhas incompletas antes de montar gráficos', () => {
    expect(isBiCubeRowReady({ dims: {}, measures: {} })).toBe(true)
    expect(isBiCubeRowReady({ dims: undefined, measures: {} })).toBe(false)
    expect(isBiCubeRowReady(null)).toBe(false)
  })

  it('converte um widget pronto em uma análise editável preservando contexto', () => {
    const config = widgetToPivotConfig({
      id: 'by-priority',
      title: 'Por prioridade',
      visual: 'bar',
      recordTypes: ['incident'],
      dimensions: ['priority'],
      measures: ['count'],
      filters: [{ dim: 'state', op: 'neq', value: 'Closed' }],
    }, {
      periodDays: 90,
      groupName: 'Service Desk',
      priority: null,
    })

    expect(config.recordTypes).toEqual(['incident'])
    expect(config.rows).toEqual(['priority'])
    expect(config.periodDays).toBe(90)
    expect(config.filters).toContainEqual({ dim: 'group_name', op: 'eq', value: 'Service Desk' })
    expect(config.visual).toBe('bar')
  })

  it('apresenta MTTR agregado e individual em horas úteis', () => {
    const presentation = getDrilldownMeasurePresentation('mttr_avg', 275)
    expect(presentation).toEqual({ label: 'MTTR', field: 'mttr_minutes', formatted: '4h 35min' })
    expect(getDrilldownMeasurePresentation('mttr_avg', null)?.formatted).toBe('—')
    expect(getDrilldownMeasurePresentation('count', 12)).toBeNull()
  })

  it('resume o relatório em linguagem operacional', () => {
    expect(getReportSummary(['incident', 'change'], 'bar')).toBe('Incidentes e mudanças · Barras')
  })

  it('não expõe detalhes internos no erro apresentado', () => {
    expect(presentBiError('relation bi_cube does not exist')).toBe('Não foi possível carregar os dados analíticos. Tente novamente.')
  })
})
