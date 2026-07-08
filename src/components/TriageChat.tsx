// ============================================================
// ServiceFY — TriageChat: UI de chat conduzido do agente de triagem.
//
// Dirige a máquina de estados pura (triage-conductor) apresentando as
// perguntas como mensagens + botões de resposta rápida, e coleta campo a
// campo até abrir o incidente/solicitação. A criação reusa os serviços
// governados (openRequest/openServiceRequest); a transcrição e o estado são
// persistidos via RPC (virtual_agent_triage_sync/complete). Consultar
// chamados e falar com humano reusam o agente de palavra-chave (085/087).
//
// Compartilhado pelo widget do portal e pelo console de teste do admin.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth'
import { serviceCatalogService, departmentsService } from '../lib/services'
import { parseFormFields } from '../lib/catalogFormFields'
import { virtualAgentService } from '../lib/virtual-agent-service'
import {
  initialState, renderTurn, nextTurn, labeledAnswers,
  type TriageCatalog, type TriageState, type TriageTurn, type TriageFormField,
} from '../lib/triage-conductor'

interface ChatMessage { from: 'bot' | 'user'; text: string }

// Erros do Supabase/Postgrest são objetos planos (PostgrestError), não
// instâncias de Error — "cause instanceof Error" sempre falha para eles e
// mascara a causa real atrás de uma mensagem genérica. Aqui também lemos
// `.message`/`.details` quando existirem, para não esconder o problema.
function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message
  if (cause && typeof cause === 'object' && 'message' in cause && typeof (cause as { message?: unknown }).message === 'string') {
    return (cause as { message: string }).message
  }
  return fallback
}

export default function TriageChat({ companyId }: { companyId: string }) {
  const { profile } = useAuth()
  const callerId = profile?.id ?? null
  const callerName = profile?.name ?? 'Usuário'

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<TriageCatalog | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [turn, setTurn] = useState<TriageTurn | null>(null)
  const [conductorState, setConductorState] = useState<TriageState>(initialState)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [ended, setEnded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef<string | null>(null)
  const syncQueueRef = useRef<Promise<string | null>>(Promise.resolve(null))

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, turn])

  // ── Carrega o catálogo do tenant e monta o TriageCatalog ──────────────────
  useEffect(() => {
    let cancelled = false
    setPhase('loading'); setError('')
    Promise.all([
      serviceCatalogService.listCategories(companyId, { activeOnly: true }),
      serviceCatalogService.listServices(companyId, { activeOnly: true }),
      serviceCatalogService.listAllServiceSymptoms(companyId, { activeOnly: true }),
      serviceCatalogService.listRequestCategories(companyId, { activeOnly: true }),
      serviceCatalogService.listRequestSubcategories(companyId, { activeOnly: true }),
      serviceCatalogService.listRequestItems(companyId, { activeOnly: true }),
      departmentsService.list(companyId, { activeOnly: true }),
    ]).then(([cats, services, symptoms, reqCats, reqSubs, reqItems, departments]) => {
      if (cancelled) return
      const built: TriageCatalog = {
        departments: departments.map(d => ({ id: d.id, name: d.name })),
        incidentCategories: cats.map(c => ({ id: c.id, name: c.name, department_id: c.department_id ?? null })),
        incidentServices: services.map(s => ({ id: s.id, name: s.name, category_id: s.category_id })),
        incidentSymptoms: symptoms.map(sy => ({
          id: sy.id,
          system_symptom_id: sy.symptom_id,
          service_id: sy.service_id,
          name: sy.symptom?.name ?? 'Sintoma',
          form_fields: parseFormFields(sy.form_fields) as TriageFormField[],
          sla_hours: sy.sla_hours,
          assignment_group_id: sy.assignment_group_id,
          assignment_group_name: sy.group?.name ?? null,
        })),
        requestCategories: reqCats.map(c => ({ id: c.id, name: c.name, department_id: c.department_id ?? null })),
        requestSubcategories: reqSubs.map(s => ({ id: s.id, name: s.name, category_id: s.category_id })),
        requestItems: reqItems.map(it => ({
          id: it.id,
          name: it.name,
          request_category_id: it.request_category_id ?? null,
          request_subcategory_id: it.request_subcategory_id ?? null,
          form_fields: parseFormFields(it.form_fields) as TriageFormField[],
          assignment_group_id: it.assignment_group_id,
          assignment_group_name: it.group?.name ?? null,
          requires_approval: Boolean(it.requires_approval),
        })),
      }
      setCatalog(built)
      const first = renderTurn(initialState(), built)
      setConductorState(first.state)
      setTurn(first)
      setMessages([{ from: 'bot', text: first.prompt }])
      setPhase('ready')
    }).catch(cause => {
      if (cancelled) return
      setError(errorMessage(cause, 'Falha ao carregar o catálogo.'))
      setPhase('error')
    })
    return () => { cancelled = true }
  }, [companyId])

  // Persistência best-effort da transcrição + estado (não bloqueia a conversa).
  const sync = useCallback((state: TriageState, inbound: string, outbound: string): Promise<string | null> => {
    // Mantém os turnos na ordem e sempre usa o id devolvido pelo primeiro sync.
    // Sem a fila, respostas rápidas podiam criar requests concorrentes com id nulo
    // e a conclusão do chamado ficava sem conversa para auditar.
    const queued = syncQueueRef.current.then(async () => {
      try {
        const id = await virtualAgentService.triageSync({
          conversationId: conversationIdRef.current,
          state: state as unknown as Record<string, unknown>,
          inbound,
          outbound,
        })
        if (id) conversationIdRef.current = id
      } catch { /* auditoria é best-effort */ }
      return conversationIdRef.current
    })
    syncQueueRef.current = queued
    return queued
  }, [])

  const pushBot = (t: string) => setMessages(m => [...m, { from: 'bot', text: t }])

  const createTicket = useCallback(async (state: TriageState) => {
    const s = state.selections
    setBusy(true)
    try {
      let number = ''
      let incidentId = ''
      if (s.ticketType === 'incident') {
        const inc = await serviceCatalogService.openRequest({
          companyId, serviceId: s.serviceId!, serviceName: s.serviceName!,
          symptomId: s.symptomId!, symptomName: s.symptomName!,
          slaHours: s.slaHours ?? 24,
          assignmentGroupId: s.assignmentGroupId ?? null,
          assignmentGroupName: s.assignmentGroupName ?? null,
          description: s.description, callerId, callerName,
          impact: s.impact, urgency: s.urgency,
          formData: labeledAnswers(state),
        })
        number = inc.number; incidentId = inc.id
      } else {
        const inc = await serviceCatalogService.openServiceRequest({
          companyId,
          item: {
            id: s.requestItemId!, name: s.requestItemName!,
            assignment_group_id: s.assignmentGroupId ?? null,
            request_subcategory_id: s.requestSubcategoryId ?? null,
            groupName: s.assignmentGroupName ?? null,
          },
          formData: labeledAnswers(state), description: s.description, callerId, callerName,
        })
        number = inc.number; incidentId = inc.id
      }

      const parts = [`Pronto! Abri o chamado **${number}** para você. 🎉`]
      if (s.assignmentGroupName) parts.push(`A equipe **${s.assignmentGroupName}** vai cuidar disso.`)
      if (s.requiresApproval) parts.push('Este item passa por aprovação antes do atendimento começar.')
      parts.push('Você pode acompanhar em "Meus Chamados".')
      const reply = parts.join(' ')
      pushBot(reply)
      setEnded(true)

      const activeConversationId = await sync({ ...state, step: 'done' }, '', reply)
      if (activeConversationId) {
        try {
          await virtualAgentService.triageComplete(activeConversationId, incidentId, {
            number, ticket_type: s.ticketType, group: s.assignmentGroupName ?? null,
          })
        } catch { /* auditoria best-effort */ }
      }
    } catch (cause) {
      pushBot('Não consegui abrir o chamado agora: ' + errorMessage(cause, 'erro desconhecido') + '. Você pode tentar de novo dizendo "recomeçar".')
    } finally {
      setBusy(false)
    }
  }, [companyId, callerId, callerName, sync])

  // Processa a resposta do usuário: dirige a FSM e trata intents/criação.
  const submit = useCallback(async (userInput: string) => {
    if (!catalog || !turn || busy || ended) return
    const value = userInput.trim()
    if (!value) return
    setMessages(m => [...m, { from: 'user', text: value }])
    setText('')

    const next = nextTurn(conductorState, catalog, value)

    // Reuso do agente de palavra-chave para consultar chamados / falar com humano.
    if (next.intent === 'check_tickets' || next.intent === 'handoff') {
      setBusy(true)
      try {
        const msg = next.intent === 'check_tickets' ? 'consultar meus chamados' : 'falar com um atendente humano'
        const reply = await virtualAgentService.processMessage(msg, conversationIdRef.current)
        if (reply.conversationId) conversationIdRef.current = reply.conversationId
        pushBot(reply.reply)
        if (next.intent === 'handoff') { setEnded(true); return }
        // volta ao menu para continuar
        const menu = renderTurn(initialState(), catalog)
        setConductorState(menu.state); setTurn(menu)
        pushBot(menu.prompt)
      } catch (cause) {
        pushBot('Não consegui completar agora: ' + errorMessage(cause, 'erro') + '.')
      } finally { setBusy(false) }
      return
    }

    if (next.readyToCreate) {
      setConductorState(next.state)
      // Garante conversa + confirmação persistidas antes de criar o chamado;
      // createTicket então registra a resposta final e a execução na mesma conversa.
      await sync(next.state, value, '')
      await createTicket(next.state)
      return
    }

    setConductorState(next.state)
    setTurn(next)
    pushBot(next.prompt)
    if (next.inputType === 'terminal') setEnded(true)
    void sync(next.state, value, next.prompt)
  }, [catalog, turn, busy, ended, conductorState, createTicket, sync])

  const restart = () => {
    if (!catalog) return
    const first = renderTurn(initialState(), catalog)
    setConductorState(first.state); setTurn(first)
    setMessages([{ from: 'bot', text: first.prompt }]); setEnded(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando o catálogo…</div>
  }
  if (phase === 'error') {
    return <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-red-600">{error}<button onClick={restart} className="rounded-lg border px-3 py-1.5 font-bold text-slate-600">Tentar de novo</button></div>
  }

  const showText = turn?.inputType === 'text' || turn?.inputType === 'multi'
  const options = turn?.options ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm ${m.from === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
            {m.text}
          </div>
        ))}

        {!ended && options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map(o => (
              <button
                key={o.id}
                disabled={busy}
                onClick={() => void submit(o.label)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >{o.label}</button>
            ))}
            {turn?.inputType === 'multi' && (
              <button disabled={busy} onClick={() => void submit('pronto')} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">Pronto</button>
            )}
          </div>
        )}

        {ended && (
          <button onClick={restart} className="inline-flex w-fit items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold text-slate-600"><RefreshCw className="h-3.5 w-3.5" /> Abrir outro chamado</button>
        )}
        {busy && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> processando…</div>}
        <div ref={bottomRef} />
      </div>

      {!ended && (
        <div className="flex gap-2 border-t border-slate-200 p-3">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void submit(text) }}
            disabled={busy}
            placeholder={showText ? 'Digite sua resposta…' : 'Ou escreva aqui…'}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
          />
          <button onClick={() => void submit(text)} disabled={busy || !text.trim()} className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  )
}
