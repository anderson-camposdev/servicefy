import type { RequestFormField } from './database.types'

export interface FormBuilderQuality {
  score: number
  issues: string[]
  ready: boolean
}
export function assessFormBuilderQuality(
  fields: RequestFormField[],
  inheritedFields: RequestFormField[] = [],
): FormBuilderQuality {
  const issues: string[] = []
  const allFields = [...inheritedFields, ...fields]
  const labels = allFields.map(field => field.label.trim().toLocaleLowerCase('pt-BR'))

  if (fields.some(field => !field.label.trim())) {
    issues.push('Há campos sem rótulo.')
  }
  if (new Set(labels.filter(Boolean)).size !== labels.filter(Boolean).length) {
    issues.push('Existem rótulos duplicados.')
  }
  if (fields.some(field => (field.type === 'select' || field.type === 'checkbox') && !field.options?.map(option => option.trim()).filter(Boolean).length)) {
    issues.push('Campos de seleção precisam de opções.')
  }

  const score = Math.max(0, 100 - issues.length * 30)
  return { score, issues, ready: issues.length === 0 }
}
