import { useState } from 'react'
import { FileText, Plus, Trash2, X } from 'lucide-react'
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
  const [showCreate, setShowCreate] = useState(false)

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
      setShowCreate(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar formulário.')
    }
  }

  const remove = async (template: FormTemplateRow) => {
    if (!confirm(`Excluir o formulário "${template.name}"? Os catálogos vinculados manterão os campos já salvos.`)) return
    setError(null)
    try {
      await serviceCatalogService.deleteFormTemplate(template.id)
      onChange(templates.filter(candidate => candidate.id !== template.id))
      if (expandedId === template.id) setExpandedId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao excluir formulário.')
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 text-slate-500" />
          <div>
            <h3 className="text-base font-bold text-slate-950">Biblioteca de formulários</h3>
            <p className="mt-1 text-sm text-slate-500">Crie conjuntos de campos reutilizáveis para incidentes e solicitações.</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowCreate(value => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? 'Cancelar' : 'Novo formulário'}
        </button>
      </div>

      {error && <div className="m-3 rounded-lg border border-red-100 bg-red-50 p-2 text-sm text-red-600">{error}</div>}

      <div className="divide-y divide-slate-100">
        {templates.map(template => (
          <div key={template.id} className="p-3">
            <div className="flex items-center gap-3">
              <input
                value={template.name}
                onChange={event => onChange(templates.map(candidate => candidate.id === template.id ? { ...candidate, name: event.target.value } : candidate))}
                onBlur={async event => {
                  const trimmed = event.target.value.trim()
                  if (!trimmed || trimmed === template.name) return
                  try {
                    const updated = await serviceCatalogService.updateFormTemplate(template.id, { name: trimmed })
                    onChange(templates.map(candidate => candidate.id === template.id ? updated : candidate))
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Falha ao renomear formulário.')
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-bold text-slate-800 outline-none hover:border-slate-200 focus:border-indigo-300 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setExpandedId(current => current === template.id ? null : template.id)}
                className="shrink-0 text-xs font-semibold text-slate-500 hover:text-indigo-600"
              >
                {expandedId === template.id ? 'Fechar campos' : 'Editar campos'}
              </button>
              <button type="button" onClick={() => remove(template)} className="rounded-lg p-2 text-red-600/70 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {expandedId === template.id && (
              <FormFieldsBuilder
                entityKey={template.id}
                value={template.fields}
                title="Campos do Formulário"
                description="Estes campos serão herdados por todos os itens vinculados a este formulário."
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
        {templates.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">Nenhum formulário criado ainda. Formulários criados aqui podem ser reaproveitados em vários itens do catálogo, sem precisar recriar os campos toda vez.</div>}
      </div>

      {showCreate && <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') create() }}
          placeholder="Ex: Formulário de Acessos Padrão"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button type="button" onClick={create} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> Criar formulário
        </button>
      </div>}
    </section>
  )
}
