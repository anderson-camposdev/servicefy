// ============================================================
// ServiceFY — Administração do Agente Virtual (Central de Configurações)
// CRUD de ações (palavras-chave, confirmação, confiança mínima) + console
// de teste de conversa (mesma RPC do widget do portal) + histórico de
// execuções. A segurança real é a RLS/RPC da migration 085.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Bot, Plus, Trash2, RefreshCw, AlertTriangle, Send, Loader2,
  History, ListChecks, MessageSquareText, CheckCircle2, XCircle,
} from 'lucide-react'
import { virtualAgentService, type SaveActionInput } from '../lib/virtual-agent-service'
import type { VirtualAgentActionRow, VirtualAgentExecutionRow, VirtualAgentReply } from '../lib/database.types'

interface Props { companyId: string; activeRole: string; onBack: () => void }

const RESULT_LABEL: Record<string, { label: string; cls: string }> = {
  success:     { label: 'Sucesso',       cls: 'bg-emerald-100 text-emerald-700' },
  failed:      { label: 'Falhou',        cls: 'bg-red-100 text-red-700' },
  transferred: { label: 'Transferido',   cls: 'bg-indigo-100 text-indigo-700' },
  blocked:     { label: 'Bloqueado',     cls: 'bg-slate-200 text-slate-600' },
  pending:     { label: 'Aguardando…',   cls: 'bg-amber-100 text-amber-700' },
}

interface ChatEntry { from: 'user' | 'bot'; text: string; executionId?: string | null; requiresConfirmation?: boolean }

export default function VirtualAgentAdmin({ companyId, onBack }: Props) {
  const [tab, setTab] = useState<'actions' | 'test' | 'history'>('actions')
  const [actions, setActions] = useState<VirtualAgentActionRow[]>([])
  const [executions, setExecutions] = useState<VirtualAgentExecutionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [a, e] = await Promise.all([
        virtualAgentService.listActions(companyId),
        virtualAgentService.listExecutions(companyId),
      ])
      setActions(a); setExecutions(e)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6"><div className="mx-auto max-w-6xl">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Central de Configurações</button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><Bot className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Agente Virtual</h1>
            <p className="text-sm text-slate-500">Ações controladas, confirmação e transferência para humano.</p>
          </div>
        </div>
        <button onClick={() => void load()} className="rounded-xl border bg-white p-2.5"><RefreshCw className="h-4 w-4" /></button>
      </header>

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('actions')} className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-bold ${tab === 'actions' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}><ListChecks className="h-4 w-4" /> Ações</button>
        <button onClick={() => setTab('test')} className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-bold ${tab === 'test' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}><MessageSquareText className="h-4 w-4" /> Testar conversa</button>
        <button onClick={() => setTab('history')} className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-bold ${tab === 'history' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}><History className="h-4 w-4" /> Histórico</button>
      </div>

      {error && <div className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{error}</div>}

      {tab === 'actions' && (
        <ActionsPanel companyId={companyId} actions={actions} loading={loading} onChanged={load} onError={setError} onFlash={flash} />
      )}
      {tab === 'test' && <TestConsole onError={setError} />}
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

  const add = async () => {
    if (!form.actionKey.trim() || !form.name.trim()) { onError('Informe a chave e o nome da ação.'); return }
    try {
      const input: SaveActionInput = {
        companyId, actionKey: form.actionKey.trim(), name: form.name.trim(),
        enabled: form.enabled, requiresConfirmation: form.requiresConfirmation,
        minConfidence: form.minConfidence,
        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      }
      await virtualAgentService.saveAction(input)
      setForm({ actionKey: '', name: '', keywords: '', requiresConfirmation: false, minConfidence: 0.15, enabled: true })
      onFlash('Ação criada.'); onChanged()
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
        <h2 className="font-extrabold">Nova ação</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-bold">Chave (action_key)<input value={form.actionKey} onChange={e => setForm(f => ({ ...f, actionKey: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="ex: reset_password" /></label>
          <label className="block text-xs font-bold">Nome<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Redefinir senha" /></label>
          <label className="block text-xs font-bold">Palavras-chave (vírgula)<input value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="senha, redefinir, esqueci" /></label>
          <label className="block text-xs font-bold">Confiança mínima (0–1)<input type="number" step="0.01" min="0" max="1" value={form.minConfidence} onChange={e => setForm(f => ({ ...f, minConfidence: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.requiresConfirmation} onChange={e => setForm(f => ({ ...f, requiresConfirmation: e.target.checked }))} /> Exige confirmação (Sim/Não)</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> Ativa</label>
          <button onClick={() => void add()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Adicionar ação</button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-extrabold"><ListChecks className="h-4 w-4 text-indigo-600" /> Ações configuradas</h2>
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
              <button onClick={() => void toggleEnabled(a)} className="rounded-lg border px-2.5 py-1 text-xs font-bold text-slate-600">{a.enabled ? 'Desativar' : 'Ativar'}</button>
              <button onClick={() => void remove(a)} title="Excluir" className="rounded-lg p-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}</div>}
      </section>
    </div>
  )
}

// ─── Console de teste (mesma RPC do widget) ─────────────────────
function TestConsole({ onError }: { onError: (m: string) => void }) {
  const [messages, setMessages] = useState<ChatEntry[]>([{ from: 'bot', text: 'Olá! Sou o assistente virtual. Pergunte sobre seus chamados, peça para abrir uma solicitação, ou fale "humano" para transferir.' }])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const applyReply = (reply: VirtualAgentReply) => {
    if (reply.conversationId) setConversationId(reply.conversationId)
    setMessages(m => [...m, { from: 'bot', text: reply.reply, executionId: reply.executionId, requiresConfirmation: reply.requiresConfirmation }])
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setMessages(m => [...m, { from: 'user', text }])
    setInput(''); setSending(true)
    try {
      const reply = await virtualAgentService.processMessage(text, conversationId)
      applyReply(reply)
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Falha ao processar mensagem.') }
    finally { setSending(false) }
  }

  const confirm = async (executionId: string, confirmed: boolean) => {
    setSending(true)
    try {
      const reply = await virtualAgentService.confirmAction(executionId, confirmed)
      setMessages(m => [...m, { from: 'bot', text: reply.reply }])
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Falha ao confirmar.') }
    finally { setSending(false) }
  }

  return (
    <div className="mt-6 mx-auto max-w-2xl rounded-2xl border bg-white shadow-sm">
      <div className="flex h-[420px] flex-col gap-3 overflow-y-auto p-5">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.from === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
            {m.text}
            {m.from === 'bot' && m.requiresConfirmation && m.executionId && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => void confirm(m.executionId!, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5" /> Sim</button>
                <button onClick={() => void confirm(m.executionId!, false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-600"><XCircle className="h-3.5 w-3.5" /> Não</button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t p-3">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void send() }}
          placeholder="Digite uma mensagem de teste…" className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
        <button onClick={() => void send()} disabled={sending || !input.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── Histórico ─────────────────────────────────────────────────
function HistoryPanel({ executions, loading, actions }: { executions: VirtualAgentExecutionRow[]; loading: boolean; actions: VirtualAgentActionRow[] }) {
  const actionName = (id: string | null) => actions.find(a => a.id === id)?.name ?? id ?? '—'
  return (
    <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-extrabold"><History className="h-4 w-4 text-indigo-600" /> Execuções recentes</h2>
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
