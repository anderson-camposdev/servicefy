import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Plus, Save, Trash2 } from 'lucide-react'
import { normalizeFormFields, parseFormFields } from '../lib/catalogFormFields'
import { assessFormBuilderQuality } from '../lib/form-builder-quality'
import type { Json, RequestFormField } from '../lib/database.types'

interface FormFieldsBuilderProps {
  entityKey: string
  value: Json | RequestFormField[] | null | undefined
  onSave: (fields: RequestFormField[]) => Promise<void>
  inheritedFields?: RequestFormField[]
  title?: string
  description?: string
  addLabel?: string
}

const typeLabels: Record<RequestFormField['type'], string> = {
  text: 'Texto Curto',
  textarea: 'Texto Longo',
  select: 'Seleção / Dropdown',
  checkbox: 'Checkbox / Seleção Múltipla',
  datetime: 'Data / Hora',
  number: 'Número',
  date: 'Data (legado)',
}

export default function FormFieldsBuilder({
  entityKey,
  value,
  onSave,
  inheritedFields = [],
  title = 'Campos do Formulário Customizado',
  description = 'Defina exatamente o que o usuário deverá preencher antes de abrir o chamado.',
  addLabel = 'Adicionar Campo',
}: FormFieldsBuilderProps) {
  const [fields, setFields] = useState<RequestFormField[]>(() => parseFormFields(value))
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(normalizeFormFields(parseFormFields(value))))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const nextFields = parseFormFields(value)
    setFields(nextFields)
    setSavedSnapshot(JSON.stringify(normalizeFormFields(nextFields)))
    setMessage(null)
  }, [entityKey])

  const addField = () => {
    setFields(current => [
      ...current,
      {
        id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: '',
        type: 'text',
        required: false,
      },
    ])
    setMessage(null)
  }

  const updateField = (id: string, patch: Partial<RequestFormField>) => {
    setFields(current => current.map(field => field.id === id ? { ...field, ...patch } : field))
    setMessage(null)
  }

  const moveField = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= fields.length) return
    setFields(current => {
      const next = [...current]
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
    setMessage(null)
  }

  const quality = useMemo(() => assessFormBuilderQuality(fields, inheritedFields), [fields, inheritedFields])
  const hasChanges = useMemo(
    () => JSON.stringify(normalizeFormFields(fields)) !== savedSnapshot,
    [fields, savedSnapshot],
  )

  const save = async () => {
    const normalized = normalizeFormFields(fields)
    if (normalized.some(field => !field.label)) {
      setMessage('Informe o rótulo de todos os campos.')
      return
    }

    const normalizedLabels = [...inheritedFields, ...normalized].map(field => field.label.toLocaleLowerCase('pt-BR'))
    if (new Set(normalizedLabels).size !== normalizedLabels.length) {
      setMessage('Use um rótulo diferente para cada campo.')
      return
    }

    if (normalized.some(field => field.type === 'select' && !field.options?.length)) {
      setMessage('Campos de seleção precisam ter ao menos uma opção.')
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      await onSave(normalized)
      setFields(normalized)
      setSavedSnapshot(JSON.stringify(normalized))
      setMessage('Campos salvos com sucesso.')
    } catch {
      setMessage('Não foi possível salvar os campos.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-surface-container-low p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-800">{title}</h4>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={addField}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-primary-container"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      </div>

      <div className={`mt-4 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        quality.ready ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'
      }`}>
        <div className="flex items-start gap-2.5">
          {quality.ready
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
          <div>
            <p className="text-xs font-bold text-slate-800">{quality.ready ? 'Formulário pronto para uso' : 'Revise antes de salvar'}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {quality.ready ? `${fields.length + inheritedFields.length} campo(s) configurado(s).` : quality.issues.join(' ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Alterações não salvas</span>}
          <span className="text-sm font-black text-slate-700">{quality.score}%</span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {inheritedFields.length > 0 && (
          <div className="rounded-xl border border-indigo-200 bg-white p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600">Campos herdados do template</div>
            <div className="space-y-2">
              {inheritedFields.map(field => (
                <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-container px-3 py-2 text-xs text-on-primary-container">
                  <span className="font-semibold text-slate-800">{field.label}</span>
                  <span className="rounded bg-white px-2 py-0.5">{typeLabels[field.type]}</span>
                  {field.required && <span className="font-semibold text-rose-600">Obrigatório</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {fields.map((field, index) => (
          <div key={field.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_auto_auto_auto] lg:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Label / Rótulo</span>
                <input
                  value={field.label}
                  onChange={event => updateField(field.id, { label: event.target.value })}
                  placeholder={index === 0 ? 'Ex: Número de Patrimônio' : 'Ex: Mensagem de Erro'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Tipo de Campo</span>
                <select
                  value={field.type}
                  onChange={event => {
                    const type = event.target.value as RequestFormField['type']
                    updateField(field.id, {
                      type,
                      options: type === 'select' || type === 'checkbox' ? field.options ?? [] : undefined,
                    })
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                >
                  {(['text', 'textarea', 'select', 'checkbox', 'datetime', 'number'] as const).map(type => (
                    <option key={type} value={type}>{typeLabels[type]}</option>
                  ))}
                  {field.type === 'date' && <option value="date">{typeLabels.date}</option>}
                </select>
              </label>
              <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={event => updateField(field.id, { required: event.target.checked })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Obrigatório?
              </label>
              <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} title="Mover campo para cima" className="flex w-9 items-center justify-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-30">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} title="Mover campo para baixo" className="flex w-9 items-center justify-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-30">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setFields(current => current.filter(candidate => candidate.id !== field.id))}
                title="Remover campo"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-red-600/70 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {(field.type === 'select' || field.type === 'checkbox') && (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {field.type === 'checkbox' ? 'Opções de Seleção Múltipla' : 'Opções do Dropdown'}
                </span>
                <input
                  value={(field.options ?? []).join(', ')}
                  onChange={event => updateField(field.id, { options: event.target.value.split(',') })}
                  placeholder={field.type === 'checkbox' ? 'Opcional. Vazio = Sim/Não; ou ex: Windows, macOS, Linux' : 'Ex: Dell, Lenovo, Apple'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <span className="mt-1 block text-[11px] text-slate-400">Separe múltiplas opções por vírgula.</span>
              </label>
            )}
          </div>
        ))}

        {fields.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center text-xs text-slate-500">
            Nenhum campo exclusivo configurado. Use o botão acima para adicionar um campo específico.
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-indigo-100 pt-4">
        <span className={`text-xs ${message?.includes('sucesso') ? 'text-emerald-600' : 'text-red-600'}`}>{message}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || !quality.ready || !hasChanges}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando...' : 'Salvar campos'}
        </button>
      </div>
    </section>
  )
}
