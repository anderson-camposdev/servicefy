import { useEffect, useMemo, useState } from 'react'
import { extractExclusiveFields, mergeFormFields, parseFormFields } from '../lib/catalogFormFields'
import type { FormTemplateRow, Json, RequestFormField } from '../lib/database.types'
import FormFieldsBuilder from './FormFieldsBuilder'

interface TemplateFormConfiguratorProps {
  entityKey: string
  value: Json | null | undefined
  templateId?: string | null
  templates: FormTemplateRow[]
  onSave: (fields: RequestFormField[], templateId: string | null) => Promise<void>
}

export default function TemplateFormConfigurator({
  entityKey,
  value,
  templateId,
  templates,
  onSave,
}: TemplateFormConfiguratorProps) {
  const [selectedId, setSelectedId] = useState(templateId ?? '')
  const [switching, setSwitching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setSelectedId(templateId ?? '')
    setMessage(null)
  }, [entityKey, templateId])

  const selectedTemplate = useMemo(
    () => templates.find(template => template.id === selectedId) ?? null,
    [selectedId, templates],
  )
  const persistedTemplate = useMemo(
    () => templates.find(template => template.id === templateId) ?? null,
    [templateId, templates],
  )
  const inheritedFields = useMemo(
    () => parseFormFields(selectedTemplate?.fields),
    [selectedTemplate],
  )
  const exclusiveFields = useMemo(
    () => extractExclusiveFields(parseFormFields(value), parseFormFields(persistedTemplate?.fields)),
    [value, persistedTemplate],
  )

  const changeTemplate = async (nextId: string) => {
    const nextTemplate = templates.find(template => template.id === nextId)
    const nextTemplateFields = parseFormFields(nextTemplate?.fields)
    setSwitching(true)
    setMessage(null)
    try {
      await onSave(mergeFormFields(nextTemplateFields, exclusiveFields), nextId || null)
      setSelectedId(nextId)
      setMessage(nextId ? 'Template aplicado ao catálogo.' : 'Template removido do catálogo.')
    } catch {
      setMessage('Não foi possível aplicar o template.')
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Template de formulário</span>
          <select
            value={selectedId}
            onChange={event => changeTemplate(event.target.value)}
            disabled={switching}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-60"
          >
            <option value="">Sem template, somente campos exclusivos</option>
            {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        {message && <p className={`mt-2 text-xs ${message.includes('possível') ? 'text-red-600' : 'text-emerald-600'}`}>{message}</p>}
      </div>

      <FormFieldsBuilder
        entityKey={`${entityKey}:${selectedId}`}
        value={exclusiveFields}
        inheritedFields={inheritedFields}
        addLabel="Adicionar Campo Exclusivo"
        description="Escolha um template reutilizável e complemente apenas com os campos específicos deste item."
        onSave={async fields => onSave(mergeFormFields(inheritedFields, fields), selectedId || null)}
      />
    </div>
  )
}
