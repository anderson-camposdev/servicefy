import { ClipboardList } from 'lucide-react'
import type { FormAnswers, FormFieldValue } from '../lib/catalogFormFields'
import type { RequestFormField } from '../lib/database.types'

interface DynamicFormFieldsProps {
  fields: RequestFormField[]
  answers: FormAnswers
  errors: Record<string, string>
  onChange: (fieldId: string, value: FormFieldValue) => void
  title: string
}

export default function DynamicFormFields({ fields, answers, errors, onChange, title }: DynamicFormFieldsProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
          <ClipboardList className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500">Preencha os dados configurados para este atendimento.</p>
        </div>
      </div>

      {fields.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-400">
          Este item não exige informações adicionais.
        </p>
      )}

      <div className="space-y-4">
        {fields.map(field => {
          const inputClass = `w-full rounded-xl border bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:ring-2 ${
            errors[field.id]
              ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
              : 'border-slate-200 focus:border-indigo-300 focus:ring-indigo-100'
          }`
          const options = field.options ?? []
          const selectedOptions = Array.isArray(answers[field.id]) ? answers[field.id] as string[] : []

          return (
            <fieldset key={field.id} className="block">
              <legend className="mb-1.5 text-xs font-bold text-slate-600">
                {field.label}
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </legend>

              {field.type === 'textarea' ? (
                <textarea
                  rows={4}
                  required={field.required}
                  value={String(answers[field.id] ?? '')}
                  onChange={event => onChange(field.id, event.target.value)}
                  className={`${inputClass} resize-none`}
                />
              ) : field.type === 'select' ? (
                <select
                  required={field.required}
                  value={String(answers[field.id] ?? '')}
                  onChange={event => onChange(field.id, event.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecione uma opção</option>
                  {options.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === 'checkbox' && options.length > 0 ? (
                <div className={`grid gap-2 rounded-xl border bg-white p-3 shadow-sm sm:grid-cols-2 ${errors[field.id] ? 'border-red-300' : 'border-slate-200'}`}>
                  {options.map(option => (
                    <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedOptions.includes(option)}
                        onChange={event => {
                          const next = event.target.checked
                            ? [...selectedOptions, option]
                            : selectedOptions.filter(selected => selected !== option)
                          onChange(field.id, next)
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : field.type === 'checkbox' ? (
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ${errors[field.id] ? 'border-red-300' : 'border-slate-200'}`}>
                  <input
                    type="checkbox"
                    checked={answers[field.id] === true}
                    onChange={event => onChange(field.id, event.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Sim
                </label>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type === 'date' ? 'date' : 'text'}
                  inputMode={field.type === 'number' ? 'numeric' : undefined}
                  required={field.required}
                  value={String(answers[field.id] ?? '')}
                  onChange={event => onChange(field.id, event.target.value)}
                  className={inputClass}
                />
              )}

              {errors[field.id] && <span className="mt-1 block text-xs font-medium text-red-600">{errors[field.id]}</span>}
            </fieldset>
          )
        })}
      </div>
    </section>
  )
}
