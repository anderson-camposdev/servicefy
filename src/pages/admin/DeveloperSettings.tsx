// ============================================================
// ServiceFY — Fase 25: API Pública e Webhooks Outbound
//
// Cadastro de webhooks outbound (company_admin). A entrega real acontece
// fora de banda (webhook-dispatcher, drenando webhook_events_queue) — esta
// tela só gerencia assinaturas via a RPC save_outbound_webhook (o segredo
// HMAC vai para o Vault, nunca é lido de volta aqui).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Code2, Loader2, Plus, Trash2, Webhook, X } from 'lucide-react'
import { outboundWebhooksService } from '../../lib/services'
import type { OutboundWebhookEvent, OutboundWebhookRow } from '../../lib/database.types'
import { getWebhookHealth, validateWebhookDraft } from '../../lib/developer-experience'

interface DeveloperSettingsProps {
  companyId: string
}

const AVAILABLE_EVENTS: { value: OutboundWebhookEvent; label: string }[] = [
  { value: 'ticket.created', label: 'Ticket criado' },
  { value: 'ticket.resolved', label: 'Ticket resolvido' },
]

export default function DeveloperSettings({ companyId }: DeveloperSettingsProps) {
  const [webhooks, setWebhooks] = useState<OutboundWebhookRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<OutboundWebhookRow | 'new' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setWebhooks(await outboundWebhooksService.list(companyId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar webhooks.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remover este webhook? Entregas pendentes na fila para ele serão descartadas.')) return
    try {
      await outboundWebhooksService.remove(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover webhook.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-5 lg:p-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary-container p-3 text-on-primary-container"><Code2 className="w-6 h-6" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Webhooks</h1>
            <p className="mt-1 text-sm text-slate-500">Acompanhe a saúde das entregas e gerencie os eventos enviados às suas integrações.</p>
          </div>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Webhook
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : webhooks.length === 0 ? (
          <div className="p-12 text-center">
            <Webhook className="mx-auto mb-3 w-10 h-10 text-slate-300" />
            <p className="font-bold text-slate-600">Nenhum webhook cadastrado</p>
            <p className="mt-1 text-sm text-slate-400">Cadastre uma URL para receber eventos de tickets em tempo real.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {webhooks.map(webhook => {
              const health = getWebhookHealth(webhook.is_active, webhook.consecutive_failures)
              const healthStyle = {
                healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                warning: 'border-amber-200 bg-amber-50 text-amber-800',
                critical: 'border-red-200 bg-red-50 text-red-700',
                inactive: 'border-slate-200 bg-slate-100 text-slate-600',
              }[health.tone]
              return (
              <div key={webhook.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <button onClick={() => setEditing(webhook)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm font-bold text-slate-800">{webhook.target_url}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${healthStyle}`}>
                      {health.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{health.detail} · {webhook.events_subscribed.length} evento{webhook.events_subscribed.length === 1 ? '' : 's'} assinado{webhook.events_subscribed.length === 1 ? '' : 's'}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">{webhook.events_subscribed.join(' · ') || 'Nenhum evento selecionado'}</p>
                </button>
                <button onClick={() => handleDelete(webhook.id)} className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-red-600/70 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors" title="Remover webhook" aria-label={`Remover webhook ${webhook.target_url}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {editing && (
        <WebhookEditorModal
          companyId={companyId}
          webhook={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load() }}
        />
      )}
    </div>
  )
}

interface WebhookEditorModalProps {
  companyId: string
  webhook: OutboundWebhookRow | null
  onClose: () => void
  onSaved: () => void
}

function WebhookEditorModal({ companyId, webhook, onClose, onSaved }: WebhookEditorModalProps) {
  const [targetUrl, setTargetUrl] = useState(webhook?.target_url ?? '')
  const [events, setEvents] = useState<OutboundWebhookEvent[]>(webhook?.events_subscribed ?? [])
  const [isActive, setIsActive] = useState(webhook?.is_active ?? true)
  const [secret, setSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toggleEvent = (value: OutboundWebhookEvent) => {
    setEvents(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  }

  const handleSubmit = async () => {
    const trimmedUrl = targetUrl.trim()
    const validationError = validateWebhookDraft({
      targetUrl: trimmedUrl,
      events,
      secret,
      isNew: !webhook,
    })
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await outboundWebhooksService.save(companyId, webhook?.id ?? null, trimmedUrl, events, isActive, secret)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar webhook.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">{webhook ? 'Editar Webhook' : 'Novo Webhook'}</h2>
          <button onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="webhook-url" className="block text-xs font-bold text-slate-700 mb-1.5">URL de destino <span className="text-red-500">*</span></label>
            <input
              id="webhook-url"
              type="url"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              disabled={submitting}
              placeholder="https://sua-empresa.com/webhooks/servicefy"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 font-mono"
            />
          </div>

          <div>
            <span className="block text-xs font-bold text-slate-700 mb-1.5">Eventos <span className="text-red-500">*</span></span>
            <div className="space-y-1.5">
              {AVAILABLE_EVENTS.map(event => (
                <label key={event.value} className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={events.includes(event.value)}
                    onChange={() => toggleEvent(event.value)}
                    disabled={submitting}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <span className="text-sm text-slate-700">{event.label}</span>
                  <code className="text-xs text-slate-400">{event.value}</code>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="webhook-secret" className="block text-xs font-bold text-slate-700 mb-1.5">
              Segredo de assinatura (HMAC-SHA256) {webhook ? <span className="font-normal text-slate-400">— deixe em branco para manter o atual</span> : <span className="text-red-500">*</span>}
            </label>
            <input
              id="webhook-secret"
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              disabled={submitting}
              placeholder={webhook ? '••••••••' : 'um segredo forte e único para este endpoint'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-400">Cada entrega inclui o header <code>X-ServiceFY-Signature</code> com a assinatura HMAC-SHA256 do corpo, usando este segredo.</p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              disabled={submitting}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <span className="text-sm font-semibold text-slate-700">Ativo</span>
          </label>

          {error && <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
