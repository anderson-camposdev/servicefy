import { useState } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { serviceCatalogService } from '../lib/services'
import type { FormTemplateRow } from '../lib/database.types'
import FormFieldsBuilder from './FormFieldsBuilder'

interface FormTemplateManagerProps {
  companyId: string
  templates: FormTemplateRow[]
  onChange: (templates: FormTemplateRow[]) => void
}

export default function FormTemplateManager({ companyId, templates, onChange }: FormTemplateManagerProps) {
  const [name, setName] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setError(null)
    try {
      const template = await serviceCatalogService.createFormTemplate({
        tenant_id: companyId,
        name: trimmedName,
        fields: [],
      })
      onChange([...templates, template].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      setName('')
      setExpandedId(template.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar template.')
    }
  }

  const remove = async (template: FormTemplateRow) => {
    if (!confirm(`Excluir o template "${template.name}"? Os catálogos vinculados manterão os campos já salvos.`)) return
    setError(null)
    try {
      await serviceCatalogService.deleteFormTemplate(template.id)
      onChange(templates.filter(candidate => candidate.id !== template.id))
      if (expandedId === template.id) setExpandedId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao excluir template.')
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <FileText className="h-4 w-4 text-indigo-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-700">Biblioteca de Formulários</h3>
          <p className="text-xs text-slate-500">Crie conjuntos de campos reutilizáveis para Incidentes e Requisições.</p>
        </div>
      </div>

      {error && <div className="m-3 rounded-lg border border-red-100 bg-red-50 p-2 text-sm text-red-600">{error}</div>}

      <div className="divide-y divide-slate-100">
        {templates.map(template => (
          <div key={template.id} className="p-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setExpandedId(current => current === template.id ? null : template.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-bold text-slate-800">{template.name}</span>
                <span className="text-xs text-slate-400">Clique para editar os campos reutilizáveis</span>
              </button>
              <button type="button" onClick={() => remove(template)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {expandedId === template.id && (
              <FormFieldsBuilder
                entityKey={template.id}
                value={template.fields}
                title="Campos do Template"
                description="Estes campos serão herdados por todos os itens vinculados a este template."
                onSave={async fields => {
                  const updated = await serviceCatalogService.updateFormTemplate(template.id, {
                    fields: fields as unknown as FormTemplateRow['fields'],
                  })
                  onChange(templates.map(candidate => candidate.id === template.id ? updated : candidate))
                }}
              />
            )}
          </div>
        ))}
        {templates.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">Nenhum template criado.</div>}
      </div>

      <div className="flex gap-2 border-t border-slate-100 bg-slate-50 p-3">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') create() }}
          placeholder="Ex: Formulário de Acessos Padrão"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button type="button" onClick={create} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Criar Template
        </button>
      </div>
    </section>
  )
}
