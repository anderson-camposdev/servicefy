import { useState, useEffect, useCallback, useRef } from 'react'
import { Send } from 'lucide-react'
import { messagesService } from '../lib/services'
import type { TicketMessageRow } from '../lib/database.types'

/**
 * TicketChat — timeline de mensagens do chamado, reutilizável.
 *
 * Usado no Portal do Usuário (actor 'user') e potencialmente em outras
 * superfícies. Conecta ao Supabase + assina Realtime. Por segurança,
 * filtra notas internas (is_internal) no cliente — o RLS já as bloqueia
 * para end_user, mas mantemos a blindagem em dupla camada.
 */
interface TicketChatProps {
  incidentId: string
  companyId: string
  senderId?: string | null
  senderName: string
  actorType?: 'user' | 'analyst'
  /** Oculta notas internas da equipe (default: true, visão do solicitante). */
  hideInternal?: boolean
  /** Bloqueia o envio (chamado Fechado). Em Resolved o chat segue aberto. */
  locked?: boolean
}

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

export default function TicketChat({
  incidentId, companyId, senderId, senderName, actorType = 'user', hideInternal = true, locked = false,
}: TicketChatProps) {
  const [messages, setMessages] = useState<TicketMessageRow[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  // Carrega + assina Realtime
  useEffect(() => {
    let cancelled = false
    messagesService.list(incidentId)
      .then(rows => { if (!cancelled) setMessages(rows) })
      .catch(err => {
        // Não bloqueia a UI: o Realtime ainda entrega novas mensagens e o
        // envio segue disponível. Apenas registra para diagnóstico.
        console.warn('[TicketChat] carga inicial falhou:', err?.message ?? err)
      })

    const channel = messagesService.subscribeToIncident(incidentId, (row) => {
      setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
    })
    return () => { cancelled = true; channel.unsubscribe() }
  }, [incidentId])

  const visible = hideInternal ? messages.filter(m => !m.is_internal) : messages

  // Auto-scroll ao chegar mensagem nova
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [visible.length])

  const send = useCallback(async () => {
    if (!text.trim()) return
    setSending(true); setError(null)
    try {
      await messagesService.send({
        incidentId, companyId, body: text.trim(), isInternal: false,
        senderId: senderId ?? null, senderName, actorType,
      })
      // Gravação soberana: a mensagem aparece na timeline via Realtime.
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar.')
    } finally {
      setSending(false)
    }
  }, [text, incidentId, companyId, senderId, senderName, actorType])

  return (
    <div className="flex flex-col h-96 border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {visible.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Ainda não há mensagens. Escreva abaixo para falar com o time de suporte.</p>
        )}
        {visible.map(m => {
          const mine = m.actor_type === actorType
          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${mine ? 'bg-slate-800 text-white' : m.actor_type === 'system' ? 'bg-slate-300 text-slate-600' : 'bg-primary-container text-on-primary-container'}`}>
                {(m.sender_name || '?').charAt(0)}
              </div>
              <div className={`border p-3 rounded-2xl shadow-sm max-w-[80%] ${mine ? 'bg-white border-slate-200 rounded-tr-none' : 'bg-white border-slate-200 rounded-tl-none'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-xs text-slate-700">{m.sender_name || (m.actor_type === 'system' ? 'Sistema' : 'Suporte')}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{fmt(m.created_at)}</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {error && <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</div>}

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3">
        {locked ? (
          <p className="text-center text-xs text-slate-400 py-1.5">Chamado fechado — a conversa foi encerrada.</p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder="Escreva sua mensagem… (Enter para enviar)"
              className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => void send()}
              disabled={sending || !text.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" /> {sending ? '…' : 'Enviar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
