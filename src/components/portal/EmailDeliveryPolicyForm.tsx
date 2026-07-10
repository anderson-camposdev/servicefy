import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface EmailDeliveryPolicyFormProps {
  companyId: string
}

const EVENTS = [
  { type: 'ticket_opened', label: 'Novo chamado registrado' },
  { type: 'status_changed', label: 'Status do chamado atualizado' },
  { type: 'assignment_changed', label: 'Chamado atribuido' },
  { type: 'ticket_closed', label: 'Chamado fechado' },
  { type: 'public_comment', label: 'Comentario publico' },
] as const

type EventType = typeof EVENTS[number]['type']
type Policies = Record<EventType, boolean>

const EMPTY_POLICIES: Policies = {
  ticket_opened: false,
  status_changed: false,
  assignment_changed: false,
  ticket_closed: false,
  public_comment: false,
}

export function EmailDeliveryPolicyForm({ companyId }: EmailDeliveryPolicyFormProps) {
  const [policies, setPolicies] = useState<Policies>(EMPTY_POLICIES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadPolicies = async () => {
      setLoading(true)
      setError('')
      const { data, error: loadError } = await supabase
        .from('tenant_email_delivery_policies')
        .select('event_type,allow_global_fallback')
        .eq('company_id', companyId)
        .order('event_type')

      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
      } else {
        const nextPolicies = { ...EMPTY_POLICIES }
        for (const policy of data ?? []) {
          if (policy.event_type in nextPolicies) {
            nextPolicies[policy.event_type as EventType] = policy.allow_global_fallback === true
          }
        }
        setPolicies(nextPolicies)
      }
      setLoading(false)
    }

    void loadPolicies()
    return () => { cancelled = true }
  }, [companyId])

  const save = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    const results = await Promise.all(EVENTS.map(event => supabase.rpc('save_tenant_email_delivery_policy', {
      p_company_id: companyId,
      p_event_type: event.type,
      p_allow_global_fallback: policies[event.type],
    })))
    const saveError = results.find(result => result.error)?.error
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }
    setSuccess('Política de contingência salva.')
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando política de contingência...</div>
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-extrabold text-slate-900">Canal de contingência</h2>
        <p className="mt-1 text-sm text-slate-500">Autorize o envio pelo SMTP global quando o SMTP do tenant falhar.</p>
      </div>
      <div className="space-y-3">
        {EVENTS.map(event => (
          <label key={event.type} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <span>{event.label}</span>
            <input
              aria-label={`Fallback global para ${event.label}`}
              type="checkbox"
              checked={policies[event.type]}
              onChange={change => {
                setPolicies(current => ({ ...current, [event.type]: change.target.checked }))
                setSuccess('')
              }}
              disabled={saving}
              className="h-4 w-4 accent-indigo-600"
            />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p>}
      <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
        <button type="button" aria-label="Salvar política de contingência" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar política
        </button>
      </div>
    </section>
  )
}
