import { describe, expect, it } from 'vitest'
import {
  countActiveBiFilters,
  getBiWidgetGridClass,
  getBiMeasureValue,
  isBiCubeRowReady,
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

  it('resume o relatório em linguagem operacional', () => {
    expect(getReportSummary(['incident', 'change'], 'bar')).toBe('Incidentes e mudanças · Barras')
  })

  it('não expõe detalhes internos no erro apresentado', () => {
    expect(presentBiError('relation bi_cube does not exist')).toBe('Não foi possível carregar os dados analíticos. Tente novamente.')
  })
})
