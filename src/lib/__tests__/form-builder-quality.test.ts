import { describe, expect, it } from 'vitest'
import { assessFormBuilderQuality } from '../form-builder-quality'
import type { RequestFormField } from '../database.types'

const field = (patch: Partial<RequestFormField>): RequestFormField => ({
  id: crypto.randomUUID(),
  label: 'Campo',
  type: 'text',
  required: false,
  ...patch,
})

describe('qualidade do construtor de formulários', () => {
  it('considera pronto um formulário válido', () => {
    expect(assessFormBuilderQuality([
      field({ label: 'Patrimônio' }),
      field({ label: 'Sistema', type: 'select', options: ['ERP', 'CRM'] }),
    ])).toEqual({ score: 100, issues: [], ready: true })
  })

  it('identifica rótulos ausentes e duplicados, inclusive herdados', () => {
    const result = assessFormBuilderQuality(
      [field({ label: '' }), field({ label: 'Matrícula' })],
      [field({ label: 'matrícula' })],
    )
    expect(result.issues).toContain('Há campos sem rótulo.')
    expect(result.issues).toContain('Existem rótulos duplicados.')
    expect(result.ready).toBe(false)
  })

  it('exige opções úteis em campos de seleção', () => {
    const result = assessFormBuilderQuality([field({ type: 'select', options: [' ', ''] })])
    expect(result.issues).toContain('Campos de seleção precisam de opções.')
  })
})
