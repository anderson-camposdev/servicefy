// ============================================================
// ServiceFY — Administração do Agente Virtual (Central de Configurações)
// CRUD de ações (palavras-chave, confirmação, confiança mínima) + console
// de teste de conversa (mesma RPC do widget do portal) + histórico de
// execuções. A segurança real é a RLS/RPC da migration 085.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, Bot, Edit2, Plus, Trash2, RefreshCw, AlertTriangle, Loader2,
  History, ListChecks, MessageSquareText, CheckCircle2,
} from 'lucide-react'
import { virtualAgentService, type ItsmReadiness, type SaveActionInput } from '../lib/virtual-agent-service'
import type { VirtualAgentActionRow, VirtualAgentExecutionRow } from '../lib/database.types'
import TriageChat from '../components/TriageChat'

interface Props { companyId: string; activeRole: string; onBack: () => void }

const RESULT_LABEL: Record<string, { label: string; cls: string }> = {
  success:     { label: 'Sucesso',       cls: 'bg-emerald-100 text-emerald-700' },
  failed:      { label: 'Falhou',        cls: 'bg-red-100 text-red-700' },
  transferred: { label: 'Transferido',   cls: 'bg-primary-container text-on-primary-container' },
  blocked:     { label: 'Bloqueado',     cls: 'bg-slate-200 text-slate-600' },
  pending:     { label: 'Aguardando…',   cls: 'bg-amber-100 text-amber-700' },
}

export function normalizeVirtualAgentList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export function normalizeReadiness(
  value: (Partial<ItsmReadiness> & Pick<ItsmReadiness, 'ready' | 'companyName'>) | null | undefined,
): ItsmReadiness | null {
  if (!value) return null
  return {
    companyId: value.companyId ?? '',
    companyName: value.companyName,
    ready: value.ready,
    checks: normalizeVirtualAgentList(value.checks),
    checkedAt: value.checkedAt ?? '',
  }
}

export default function VirtualAgentAdmin({ companyId, onBack }: Props) {
  const [tab, setTab] = useState<'actions' | 'test' | 'history'>('actions')
  const [actions, setActions] = useState<VirtualAgentActionRow[]>([])
  const [executions, setExecutions] = useState<VirtualAgentExecutionRow[]>([])
  const [readiness, setReadiness] = useState<ItsmReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [a, e, r] = await Promise.all([
        virtualAgentService.listActions(companyId),
        virtualAgentService.listExecutions(companyId),
        virtualAgentService.getReadiness(companyId),
      ])
      setActions(normalizeVirtualAgentList(a))
      setExecutions(normalizeVirtualAgentList(e))
      setReadiness(normalizeReadiness(r))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6"><div className="mx-auto max-w-6xl">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Central de Configurações</button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary-container p-3 text-on-primary-container"><Bot className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Agente Virtual</h1>
            <p className="text-sm text-slate-500">Ações controladas, confirmação e transferência para humano.</p>
          </div>
        </div>
        <button onClick={() => void load()} className="rounded-xl border bg-white p-2.5"><RefreshCw className="h-4 w-4" /></button>
      </header>

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('actions')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold ${tab === 'actions' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}><ListChecks className="h-4 w-4" /> Ações</button>
        <button onClick={() => setTab('test')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold ${tab === 'test' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}><MessageSquareText className="h-4 w-4" /> Testar conversa</button>
        <button onClick={() => setTab('history')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold ${tab === 'history' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}><History className="h-4 w-4" /> Histórico</button>
      </div>

      {error && <div className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{error}</div>}

      {readiness && (
        <section className={`mt-5 rounded-2xl border p-5 ${readiness.ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className={`font-extrabold ${readiness.ready ? 'text-emerald-900' : 'text-amber-900'}`}>
                Prontidão do Service Desk{readiness.companyName ? ` · ${readiness.companyName}` : ''}
              </h2>
              <p className={`mt-1 text-xs ${readiness.ready ? 'text-emerald-700' : 'text-amber-700'}`}>{readiness.ready ? 'Configuração apta para abrir e consultar chamados.' : 'Existem configurações obrigatórias pendentes.'}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${readiness.ready ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>{readiness.ready ? 'PRONTO' : 'ATENÇÃO'}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {readiness.checks.map(check => (
              <div key={check.key} className="rounded-xl border border-white/70 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  {check.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  {check.label}
                </div>
                <p className="mt-1 pl-6 text-[11px] text-slate-500">{check.details}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'actions' && (
        <ActionsPanel companyId={companyId} actions={actions} loading={loading} onChanged={load} onError={setError} onFlash={flash} />
      )}
      {tab === 'test' && <TestConsole companyId={companyId} />}
      {tab === 'history' && <HistoryPanel executions={executions} loading={loading} actions={actions} />}

      {toast && <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg"><CheckCircle2 className="h-4 w-4 text-emerald-400" />{toast}</div>}
    </div></div>
  )
}

// ─── Ações ─────────────────────────────────────────────────────
function ActionsPanel({ companyId, actions, loading, onChanged, onError, onFlash }: {
  companyId: string; actions: VirtualAgentActionRow[]; loading: boolean
  onChanged: () => void; onError: (m: string) => void; onFlash: (m: string) => void
}) {
  const [form, setForm] = useState({
    actionKey: '', name: '', keywords: '', requiresConfirmation: false, minConfidence: 0.15, enabled: true,
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  const startEdit = (a: VirtualAgentActionRow) => {
    setEditingId(a.id)
    setForm({
      actionKey: a.action_key, name: a.name,
      keywords: (a.config.keywords ?? []).join(', '),
      requiresConfirmation: a.requires_confirmation,
      minConfidence: a.min_confidence,
      enabled: a.enabled,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm({ actionKey: '', name: '', keywords: '', requiresConfirmation: false, minConfidence: 0.15, enabled: true })
  }

  const add = async () => {
    if (!form.actionKey.trim() || !form.name.trim()) { onError('Informe a chave e o nome da ação.'); return }
    try {
      const input: SaveActionInput = {
        id: editingId ?? undefined,
        companyId, actionKey: form.actionKey.trim(), name: form.name.trim(),
        enabled: form.enabled, requiresConfirmation: form.requiresConfirmation,
        minConfidence: form.minConfidence,
        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      }
      await virtualAgentService.saveAction(input)
      const wasEditing = Boolean(editingId)
      cancelEdit()
      onFlash(wasEditing ? 'Ação atualizada.' : 'Ação criada.'); onChanged()
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Falha ao salvar ação.') }
  }

  const toggleEnabled = async (a: VirtualAgentActionRow) => {
    try {
      await virtualAgentService.saveAction({
        id: a.id, companyId, actionKey: a.action_key, name: a.name,
        enabled: !a.enabled, requiresConfirmation: a.requires_confirmation,
        minConfidence: a.min_confidence, keywords: a.config.keywords ?? [],
      })
      onChanged()
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Falha ao atualizar.') }
  }

  const remove = async (a: VirtualAgentActionRow) => {
    if (!window.confirm(`Excluir a ação "${a.name}"? O bot deixará de reconhecer esse pedido.`)) return
    try { await virtualAgentService.deleteAction(a.id); onFlash('Ação excluída.'); onChanged() }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Falha ao excluir.') }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">{editingId ? 'Editar ação' : 'Nova ação'}</h2>
          {editingId && <button onClick={cancelEdit} className="text-xs font-bold text-slate-500 hover:text-slate-800">Cancelar</button>}
        </div>
        <div className="mt-4 space-y-3">
          {editingId ? (
            <label className="block text-xs font-bold">Chave (action_key)<input value={form.actionKey} disabled title="Identificador usado internamente pelo agente virtual — não pode ser alterado após a criação." className="mt-1 w-full cursor-not-allowed rounded-xl border bg-slate-100 px-3 py-2.5 text-sm text-slate-500" /></label>
          ) : (
            <label className="block text-xs font-bold">Chave (action_key)<input value={form.actionKey} onChange={e => setForm(f => ({ ...f, actionKey: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="ex: reset_password" /></label>
          )}
          <label className="block text-xs font-bold">Nome<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Redefinir senha" /></label>
          <label className="block text-xs font-bold">Palavras-chave (vírgula)<input value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="senha, redefinir, esqueci" /></label>
          <label className="block text-xs font-bold">Confiança mínima (0–1)<input type="number" step="0.01" min="0" max="1" value={form.minConfidence} onChange={e => setForm(f => ({ ...f, minConfidence: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.requiresConfirmation} onChange={e => setForm(f => ({ ...f, requiresConfirmation: e.target.checked }))} /> Exige confirmação (Sim/Não)</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> Ativa</label>
          <button onClick={() => void add()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary hover:opacity-90">{editingId ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editingId ? 'Salvar alterações' : 'Adicionar ação'}</button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-extrabold"><ListChecks className="h-4 w-4 text-primary" /> Ações configuradas</h2>
        {loading ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> :
          actions.length === 0 ? <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhuma ação configurada.</div> :
          <div className="mt-4 space-y-2">{actions.map(a => (
            <article key={a.id} className="flex items-center gap-3 rounded-xl border p-4">
              <span className={'h-2.5 w-2.5 rounded-full ' + (a.enabled ? 'bg-emerald-500' : 'bg-slate-300')} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-bold">
                  {a.name}
                  {a.requires_confirmation && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Exige confirmação</span>}
                </div>
                <div className="truncate text-xs text-slate-500">{a.action_key} · confiança mín. {a.min_confidence} · {(a.config.keywords ?? []).join(', ') || 'sem palavras-chave'}</div>
              </div>
              <button onClick={() => startEdit(a)} title="Editar" className="rounded-lg border p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-900"><Edit2 className="h-3.5 w-3.5" /></button>
              <button onClick={() => void toggleEnabled(a)} className="rounded-lg border px-2.5 py-1 text-xs font-bold text-slate-600">{a.enabled ? 'Desativar' : 'Ativar'}</button>
              <button onClick={() => void remove(a)} title="Excluir" className="rounded-lg p-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}</div>}
      </section>
    </div>
  )
}

// ─── Console de teste (mesma RPC do widget) ─────────────────────
function TestConsole({ companyId }: { companyId: string }) {
  // Mesmo condutor do widget do portal — o admin testa a experiência real.
  return (
    <div className="mt-6 mx-auto max-w-2xl">
      <p className="mb-3 text-sm text-slate-500">Teste a experiência de triagem exatamente como o usuário final a vê no portal.</p>
      <div className="h-[480px] overflow-hidden rounded-2xl border bg-white shadow-sm">
        <TriageChat companyId={companyId} />
      </div>
    </div>
  )
}

// ─── Histórico ─────────────────────────────────────────────────
function HistoryPanel({ executions, loading, actions }: { executions: VirtualAgentExecutionRow[]; loading: boolean; actions: VirtualAgentActionRow[] }) {
  const actionName = (id: string | null) => actions.find(a => a.id === id)?.name ?? id ?? '—'
  return (
    <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-extrabold"><History className="h-4 w-4 text-primary" /> Execuções recentes</h2>
      {loading ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> :
        executions.length === 0 ? <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhuma execução registrada ainda.</div> :
        <div className="mt-4 space-y-2">{executions.map(e => (
          <article key={e.id} className="flex items-center gap-3 rounded-xl border p-4 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${RESULT_LABEL[e.result_status]?.cls ?? 'bg-slate-100 text-slate-600'}`}>{RESULT_LABEL[e.result_status]?.label ?? e.result_status}</span>
            <div className="min-w-0 flex-1">
              <span className="font-bold text-slate-800">{actionName(e.action_id)}</span>
              <span className="ml-2 text-xs text-slate-400">confiança {e.confidence != null ? Math.round(e.confidence * 100) + '%' : '—'} · {new Date(e.created_at).toLocaleString('pt-BR')}</span>
            </div>
          </article>
        ))}</div>}
    </section>
  )
}
