// ============================================================
// ServiceFY — Widget do Agente Virtual (portal do usuário final)
// Balão flutuante que fala com as mesmas RPCs do console de teste
// admin (migration 085). A segurança real é a RLS/RPC — este widget
// só aparece se o módulo estiver habilitado para o tenant.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Bot, X, Send, Loader2, CheckCircle2, XCircle, MessageCircle } from 'lucide-react'
import { virtualAgentService } from '../lib/virtual-agent-service'
import { platformAdminService } from '../lib/platform-admin-service'
import type { VirtualAgentReply } from '../lib/database.types'

interface ChatEntry { from: 'user' | 'bot'; text: string; executionId?: string | null; requiresConfirmation?: boolean }

const GREETING = 'Olá! Sou o assistente virtual do portal. Posso consultar seus chamados, abrir uma solicitação simples, ou te transferir para um atendente humano — é só pedir.'

export default function VirtualAgentWidget({ companyId }: { companyId?: string }) {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatEntry[]>([{ from: 'bot', text: GREETING }])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    platformAdminService.getSettingsOverview(companyId)
      .then(overview => {
        if (cancelled) return
        setEnabled(overview.entitlements.some(item => item.module_key === 'virtual_agent' && item.enabled))
      })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  if (!enabled) return null

  const applyReply = (reply: VirtualAgentReply) => {
    if (reply.conversationId) setConversationId(reply.conversationId)
    setMessages(m => [...m, { from: 'bot', text: reply.reply, executionId: reply.executionId, requiresConfirmation: reply.requiresConfirmation }])
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setError('')
    setMessages(m => [...m, { from: 'user', text }])
    setInput(''); setSending(true)
    try {
      const reply = await virtualAgentService.processMessage(text, conversationId)
      applyReply(reply)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não consegui processar sua mensagem agora.')
    } finally { setSending(false) }
  }

  const confirm = async (executionId: string, confirmed: boolean) => {
    setError(''); setSending(true)
    try {
      const reply = await virtualAgentService.confirmAction(executionId, confirmed)
      setMessages(m => [...m, { from: 'bot', text: reply.reply }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não consegui confirmar essa ação.')
    } finally { setSending(false) }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="flex h-[500px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between gap-2 bg-indigo-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2 font-bold"><Bot className="h-5 w-5" /> Assistente virtual</div>
            <button onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-5 w-5" /></button>
          </header>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.from === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {m.text}
                {m.from === 'bot' && m.requiresConfirmation && m.executionId && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => void confirm(m.executionId!, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5" /> Sim</button>
                    <button onClick={() => void confirm(m.executionId!, false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-600"><XCircle className="h-3.5 w-3.5" /> Não</button>
                  </div>
                )}
              </div>
            ))}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 border-t border-slate-200 p-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send() }}
              placeholder="Digite sua mensagem…"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button onClick={() => void send()} disabled={sending || !input.trim()} className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3.5 text-white shadow-2xl hover:bg-indigo-700"
        >
          <MessageCircle className="h-5 w-5" /> <span className="font-bold">Assistente</span>
        </button>
      )}
    </div>
  )
}
