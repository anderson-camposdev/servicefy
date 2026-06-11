import type { Json, RequestFormField } from './database.types'

export type FormFieldValue = string | boolean | string[]
export type FormAnswers = Record<string, FormFieldValue>

const supportedTypes: RequestFormField['type'][] = [
  'text',
  'textarea',
  'select',
  'checkbox',
  'datetime',
  'number',
  'date',
]

export function parseFormFields(value: Json | RequestFormField[] | null | undefined): RequestFormField[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(field => field && typeof field === 'object' && !Array.isArray(field))
      .map((field, index) => {
        const record = field as unknown as Record<string, unknown>
        const rawType = typeof record.type === 'string' ? record.type : 'text'
        const type = supportedTypes.includes(rawType as RequestFormField['type'])
          ? rawType as RequestFormField['type']
          : 'text'

        return {
          id: typeof record.id === 'string' ? record.id : `field-${index}`,
          label: typeof record.label === 'string' ? record.label : `Campo ${index + 1}`,
          type,
          required: Boolean(record.required),
          options: Array.isArray(record.options)
            ? record.options.filter((option): option is string => typeof option === 'string')
            : [],
        }
      })
  } catch {
    return []
  }
}

export function normalizeFormFields(fields: RequestFormField[]): RequestFormField[] {
  return fields.map(field => {
    const options = (field.options ?? [])
      .map(option => option.trim())
      .filter((option, index, all) => Boolean(option) && all.indexOf(option) === index)

    return {
      id: field.id,
      label: field.label.trim(),
      type: field.type,
      required: field.required,
      options: field.type === 'select' || field.type === 'checkbox' ? options : undefined,
    }
  })
}

export function mergeFormFields(templateFields: RequestFormField[], exclusiveFields: RequestFormField[]): RequestFormField[] {
  const templateIds = new Set(templateFields.map(field => field.id))
  return normalizeFormFields([
    ...templateFields,
    ...exclusiveFields.filter(field => !templateIds.has(field.id)),
  ])
}

export function extractExclusiveFields(fields: RequestFormField[], templateFields: RequestFormField[]): RequestFormField[] {
  const templateIds = new Set(templateFields.map(field => field.id))
  return fields.filter(field => !templateIds.has(field.id))
}

export function isEmptyFormValue(value: FormFieldValue | undefined): boolean {
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'boolean') return !value
  return !String(value ?? '').trim()
}

export function buildLabeledFormData(fields: RequestFormField[], answers: FormAnswers): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field, index) => {
      const value = answers[field.id]
      const normalizedValue = typeof value === 'boolean'
        ? value ? 'Sim' : 'Não'
        : Array.isArray(value) ? value : String(value ?? '').trim()

      return [field.label.trim() || `Campo ${index + 1}`, normalizedValue]
    }),
  )
}
