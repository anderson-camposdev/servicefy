import { useState, useEffect, useCallback, useRef } from 'react'
import {
  User, Building2, AlertTriangle, Clock, Tag, Users, Send, Paperclip,
  BookOpen, CheckCircle, History, FileText, ListTree, Link2, Lock, Pause, Timer,
} from 'lucide-react'
import { incidentsService, messagesService } from '../lib/services'
import { useAuth } from '../auth'
import type { IncidentRow, IncidentHistoryRow, TicketMessageRow } from '../lib/database.types'
import type { WorkspaceTicket } from './workspace.types'

/**
 * Cockpit do Analista — Single-Pane sob abas de contexto, com ciclo de
 * comunicação real (ticket_messages + Supabase Realtime), Assumir e
 * Encerramento padrão ServiceNow (close_code/close_notes).
 */
const FALLBACK_TICKET: WorkspaceTicket = {
  id: 'INC-08722',
  title: 'Sistema ERP Lento no Faturamento',
  status: 'Em Atendimento',
  priority: 'Alta',
  requester: 'Adrianne Colombo',
  department: 'Financeiro',
  client: 'Grupo Wish',
  date: '10 min atrás',
}

type IncidentDetail = IncidentRow & { history: IncidentHistoryRow[] }
type ContextTab = 'detalhes' | 'historico' | 'subchamados' | 'relacionamentos'

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

// Duração legível (cronômetro de SLA / tempo decorrido)
const fmtDuration = (ms: number) => {
  const abs = Math.abs(ms)
  const s = Math.floor(abs / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

// Estados OPERACIONAIS no select rápido. O encerramento (Resolved/Closed)
// é governado pela seção de Resolução, que exige close_code + close_notes.
const STATE_OPTIONS = ['New', 'In Progress', 'On Hold', 'Pending User']

const CONTEXT_TABS: { id: ContextTab; label: string; icon: React.ReactNode }[] = [
  { id: 'detalhes', label: 'Detalhes', icon: <FileText className="w-4 h-4" /> },
  { id: 'historico', label: 'Histórico de Chamados', icon: <History className="w-4 h-4" /> },
  { id: 'subchamados', label: 'Sub Chamados', icon: <ListTree className="w-4 h-4" /> },
  { id: 'relacionamentos', label: 'Relacionamentos', icon: <Link2 className="w-4 h-4" /> },
]

// Códigos de encerramento (padrão ServiceNow)
const CLOSE_CODES: { group: string; options: string[] }[] = [
  { group: 'Solução Definitiva', options: ['Correção de Aplicação', 'Ajuste de Configuração', 'Substituição de Hardware'] },
  { group: 'Workaround', options: ['Solução de Contorno Aplicada', 'Ativação de Contingência'] },
  { group: 'Cancelado', options: ['Abertura em Duplicidade', 'Erro de Operação do Usuário'] },
  { group: 'Encerrado sem Ação', options: ['Falta de Retorno do Solicitante'] },
]

const MOCK_MESSAGES: TicketMessageRow[] = [
  { id: 'm1', incident_id: '', company_id: '', sender_id: null, sender_name: 'Adrianne Colombo', actor_type: 'user', body: 'Segue o print do erro em anexo. Obrigado!', is_internal: false, created_at: new Date().toISOString() },
]

// ─── Subcomponentes de UI ─────────────────────────────────────
function SummaryCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400 mb-3">
        <span className="text-indigo-500">{icon}</span>
        <h3 className="text-[11px] font-bold uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-2.5 text-sm">{children}</div>
    </div>
  )
}

function Field({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`font-semibold ${accent ?? 'text-slate-800'}`}>{value || '—'}</p>
    </div>
  )
}

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-indigo-600">{icon}</span>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {hint && <span className="text-xs text-slate-400 font-medium">{hint}</span>}
    </div>
  )
}

function EmptyContext({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">{icon}</div>
        <h3 className="text-lg font-bold text-slate-700">{title}</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">{desc}</p>
        <span className="mt-4 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
          Em desenvolvimento
        </span>
      </div>
    </div>
  )
}

const AnalystCockpit = ({ ticket = FALLBACK_TICKET }: { ticket?: WorkspaceTicket }) => {
  const { profile } = useAuth()
  const realMode = Boolean(ticket.incidentId && ticket.companyId)

  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeContext, setActiveContext] = useState<ContextTab>('detalhes')

  // Chat / mensagens
  const [messages, setMessages] = useState<TicketMessageRow[]>([])
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)

  // Ações de estado
  const [stateOverride, setStateOverride] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [closeCode, setCloseCode] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [timeSpent, setTimeSpent] = useState('')
  const [resolving, setResolving] = useState(false)
  const [changingState, setChangingState] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  // Status atual acessível dentro de callbacks do Realtime (sempre fresco).
  const statusRef = useRef<string>('')

  // Relógio vivo para o cronômetro de SLA / tempo decorrido
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Carrega o incidente + histórico
  useEffect(() => {
    if (!ticket.incidentId || !ticket.companyId) { setDetail(null); return }
    let cancelled = false
    setLoading(true); setError(null)
    incidentsService.getById(ticket.incidentId, ticket.companyId)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar o chamado.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticket.incidentId, ticket.companyId])

  // Carrega mensagens + assina Realtime
  useEffect(() => {
    if (!ticket.incidentId) { setMessages(MOCK_MESSAGES); return }
    let cancelled = false
    messagesService.list(ticket.incidentId)
      .then(rows => { if (!cancelled) setMessages(rows) })
      .catch(() => { /* silencioso: o canal ainda traz novidades */ })

    const channel = messagesService.subscribeToIncident(ticket.incidentId, (row) => {
      setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
      // Reabertura ao vivo: msg do solicitante num chamado Resolved → In Progress
      // (espelha o trigger reopen_incident_on_user_message no banco).
      if (row.actor_type === 'user' && statusRef.current === 'Resolved') {
        setStateOverride('In Progress')
        setActionMsg('Chamado reaberto automaticamente: o solicitante enviou uma nova mensagem.')
      }
    })
    return () => { cancelled = true; channel.unsubscribe() }
  }, [ticket.incidentId])

  const sendMessage = useCallback(async (isInternal: boolean) => {
    if (!msgText.trim() || !ticket.incidentId || !ticket.companyId) return
    setSending(true)
    try {
      await messagesService.send({
        incidentId: ticket.incidentId,
        companyId: ticket.companyId,
        body: msgText.trim(),
        isInternal,
        senderId: profile?.id ?? null,
        senderName: profile?.name ?? 'Analista',
        actorType: 'analyst',
      })
      // Gravação soberana: a mensagem aparece na timeline via Realtime.
      setMsgText('')
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Falha ao enviar.')
    } finally {
      setSending(false)
    }
  }, [msgText, ticket.incidentId, ticket.companyId, profile])

  const handleAssumir = useCallback(async () => {
    if (!ticket.incidentId || !ticket.companyId || !profile) return
    setAssigning(true); setActionMsg(null)
    try {
      await incidentsService.assign(ticket.incidentId, ticket.companyId, profile.id, profile.name)
      setStateOverride('In Progress')
      setActionMsg('Você assumiu o chamado.')
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Falha ao assumir.')
    } finally {
      setAssigning(false)
    }
  }, [ticket.incidentId, ticket.companyId, profile])

  const handleResolve = useCallback(async () => {
    if (!ticket.incidentId || !ticket.companyId) return
    // Trava de governança ServiceNow: código + notas obrigatórios.
    if (!closeCode || !closeNotes.trim()) {
      setActionMsg('Para resolver, selecione o Código de Encerramento e preencha as Notas de Resolução.')
      return
    }
    setResolving(true); setActionMsg(null)
    try {
      const notes = timeSpent ? `${closeNotes}\n\n[Tempo gasto: ${timeSpent}]` : closeNotes
      await incidentsService.resolve(ticket.incidentId, ticket.companyId, closeCode, notes, profile?.name ?? 'Analista')
      setStateOverride('Resolved')
      setActionMsg('Chamado resolvido.')
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Falha ao resolver.')
    } finally {
      setResolving(false)
    }
  }, [ticket.incidentId, ticket.companyId, closeCode, closeNotes, timeSpent, profile])

  const changeState = useCallback(async (newState: string) => {
    if (!ticket.incidentId || !ticket.companyId || !profile) return
    // Governança: encerrar exige passar pela seção de Resolução (close code).
    if (newState === 'Resolved' || newState === 'Closed') {
      setActionMsg('Para encerrar, use a seção "Resolução" e informe o Código de Encerramento + Notas.')
      return
    }
    setChangingState(true); setActionMsg(null)
    try {
      await incidentsService.update(ticket.incidentId, ticket.companyId, { state: newState as IncidentRow['state'] }, profile.name)
      setStateOverride(newState)
      setActionMsg(`Estado alterado para "${newState}".`)
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Falha ao alterar estado.')
    } finally {
      setChangingState(false)
    }
  }, [ticket.incidentId, ticket.companyId, profile])

  // Valores de exibição
  const number = ticket.id
  const status = stateOverride ?? detail?.state ?? ticket.status
  statusRef.current = status
  const title = detail?.short_description ?? ticket.title
  const priority = detail?.priority ?? ticket.priority
  const requester = detail?.caller_name || ticket.requester || 'Solicitante'
  const group = detail?.assigned_group_name ?? ticket.techGroup ?? '—'
  const assignee = (stateOverride && profile ? profile.name : detail?.assigned_to_name) ?? 'Não atribuído'
  const company = ticket.client ?? '—'
  const category = detail?.category ?? '—'
  const slaLabel = detail
    ? (detail.sla_breached ? 'SLA Violado' : (detail.sla_deadline ? fmt(detail.sla_deadline) : '—'))
    : (ticket.sla || '—')
  const description = realMode
    ? (detail?.description || detail?.short_description || 'Sem descrição registrada.')
    : 'Olá equipe, o sistema está apresentando muita lentidão desde a atualização de ontem. Não consigo emitir as notas fiscais do fechamento. Podem ajudar com urgência?'
  const auditRows = detail ? detail.history : []
  const canAct = realMode && Boolean(profile)
  const isResolved = status === 'Resolved' || status === 'Closed'
  const isClosed = status === 'Closed'
  // Só permite edição de impacto quando NÃO encerrado (read-only pós-resolução).
  const canEdit = canAct && !isResolved
  // Chat permanece aberto em Resolved (cliente confirma/reabre); bloqueia só em Closed.
  const canChat = canAct && !isClosed

  // ─── Cronômetro de SLA / tempo decorrido (congela ao resolver) ─
  const openedAt = detail?.created_at ? new Date(detail.created_at).getTime() : null
  // Quando encerrado, o relógio para em resolved_at (ou closed_at).
  const frozenAt = isResolved
    ? (detail?.resolved_at ? new Date(detail.resolved_at).getTime()
       : detail?.closed_at ? new Date(detail.closed_at).getTime()
       : now)
    : now
  const elapsedMs = openedAt !== null ? frozenAt - openedAt : null
  const deadlineAt = detail?.sla_deadline ? new Date(detail.sla_deadline).getTime() : null
  const remainingMs = deadlineAt !== null ? deadlineAt - frozenAt : null
  const slaBreached = !isResolved && (Boolean(detail?.sla_breached) || (remainingMs !== null && remainingMs < 0))

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 font-sans">

      {/* BARRA SUPERIOR (STICKY): ações + abas de contexto */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="px-6 pt-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-extrabold text-slate-900 truncate">{number}</h1>
              <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0">{status}</span>
              {/* Cronômetro de SLA / tempo decorrido */}
              {elapsedMs !== null && (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 border ${
                    isResolved
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : slaBreached
                        ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                  title={deadlineAt ? `Prazo SLA: ${fmt(detail!.sla_deadline!)}` : 'Tempo desde a abertura'}
                >
                  <Timer className="w-3 h-3" />
                  {isResolved
                    ? `Encerrado · ${elapsedMs !== null ? fmtDuration(elapsedMs) : ''}`.trim()
                    : remainingMs !== null
                      ? (slaBreached ? `SLA estourado há ${fmtDuration(remainingMs)}` : `SLA: ${fmtDuration(remainingMs)} restante`)
                      : `${fmtDuration(elapsedMs ?? 0)} em aberto`}
                </span>
              )}
              {loading && <span className="text-xs text-slate-400 animate-pulse">carregando…</span>}
            </div>
            <p className="text-xs text-slate-500 truncate">{title}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors">
              <BookOpen className="w-4 h-4" /> <span className="hidden lg:inline">Base de Conhecimento</span>
            </button>
            {isResolved ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-bold rounded-lg">
                <Lock className="w-4 h-4" /> Somente leitura · {status}
              </span>
            ) : (
              <>
                <button
                  onClick={handleAssumir}
                  disabled={!canEdit || assigning}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> {assigning ? 'Assumindo…' : 'Assumir'}
                </button>
                <button
                  onClick={() => changeState('On Hold')}
                  disabled={!canEdit || changingState || status === 'On Hold'}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors"
                >
                  <Pause className="w-4 h-4" /> <span className="hidden lg:inline">Em Espera</span>
                </button>
                {/* Máquina de estados (operacionais) */}
                <select
                  value={status}
                  onChange={e => changeState(e.target.value)}
                  disabled={!canEdit || changingState}
                  title="Alterar estado"
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {STATE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        {/* Menu de Contexto do Ticket (sub-abas) */}
        <div className="px-4 pt-2 flex items-center gap-1 overflow-x-auto hide-scrollbar">
          {CONTEXT_TABS.map(tab => {
            const active = tab.id === activeContext
            return (
              <button
                key={tab.id}
                onClick={() => setActiveContext(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
                  active ? 'border-indigo-600 text-indigo-700 bg-slate-50' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeContext === 'historico' && <EmptyContext icon={<History className="w-7 h-7" />} title="Histórico de Chamados" desc="Outros chamados deste solicitante e empresa aparecerão aqui." />}
      {activeContext === 'subchamados' && <EmptyContext icon={<ListTree className="w-7 h-7" />} title="Sub Chamados" desc="Tarefas filhas e chamados derivados serão gerenciados aqui." />}
      {activeContext === 'relacionamentos' && <EmptyContext icon={<Link2 className="w-7 h-7" />} title="Relacionamentos" desc="Incidentes, problemas e mudanças relacionados serão exibidos aqui." />}

      {activeContext === 'detalhes' && (
        <>
          {(error || actionMsg) && (
            <div className={`m-6 mb-0 text-sm rounded-xl p-3 ${error ? 'bg-red-50 border border-red-200 text-red-600' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
              {error || actionMsg}
            </div>
          )}

          <div className="p-6 space-y-8 max-w-6xl mx-auto">

            {/* GRID DE RESUMO (4 COLUNAS) */}
            <section>
              <SectionTitle icon={<User className="w-5 h-5" />} title="Resumo do Chamado" />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryCard icon={<User className="w-4 h-4" />} title="Empresa & Solicitante">
                  <Field label="Solicitante" value={requester} />
                  <Field label="Empresa" value={company} accent="text-indigo-600" />
                  <Field label="Abertura" value={detail ? fmt(detail.created_at) : (ticket.date ?? '—')} />
                </SummaryCard>
                <SummaryCard icon={<AlertTriangle className="w-4 h-4" />} title="Status & Prioridade">
                  <Field label="Prioridade" value={priority} accent="text-orange-600" />
                  <Field label="Urgência" value={priority.includes('P1') || priority === 'Crítica' ? 'Alta' : 'Média'} />
                  <Field label="Estado" value={status} />
                </SummaryCard>
                <SummaryCard icon={<Tag className="w-4 h-4" />} title="Categorização & SLA">
                  <Field label="Categoria" value={category} />
                  <Field
                    label={isResolved ? 'SLA' : (remainingMs !== null ? 'SLA restante' : 'Tempo em aberto')}
                    value={
                      isResolved ? 'Encerrado'
                      : remainingMs !== null ? (slaBreached ? `Estourado há ${fmtDuration(remainingMs)}` : fmtDuration(remainingMs))
                      : elapsedMs !== null ? fmtDuration(elapsedMs)
                      : slaLabel
                    }
                    accent={isResolved ? 'text-emerald-600' : slaBreached ? 'text-red-600' : 'text-slate-800'}
                  />
                  <Field label="Tipo" value={(detail?.ticket_type ?? ticket.ticketType) === 'request' ? 'Requisição' : 'Incidente'} />
                </SummaryCard>
                <SummaryCard icon={<Users className="w-4 h-4" />} title="Grupo & Responsável">
                  <Field label="Responsável" value={assignee} />
                  <Field label="Grupo Técnico" value={group} />
                </SummaryCard>
              </div>
            </section>

            {/* DESCRIÇÃO E CHAT */}
            <section>
              <SectionTitle icon={<FileText className="w-5 h-5" />} title="Descrição & Conversa" />
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-5">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Descrição Original</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{description}</p>
                </div>

                <div className="space-y-4">
                  {messages.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Nenhuma mensagem ainda.</p>}
                  {messages.map(m => (
                    <div key={m.id} className={`flex gap-3 ${m.actor_type === 'analyst' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${m.is_internal ? 'bg-amber-100 text-amber-700' : m.actor_type === 'analyst' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {(m.sender_name || '?').charAt(0)}
                      </div>
                      <div className={`border p-3.5 rounded-2xl shadow-sm max-w-[80%] ${m.is_internal ? 'bg-amber-50 border-amber-200' : m.actor_type === 'analyst' ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{m.sender_name || (m.actor_type === 'system' ? 'Sistema' : 'Usuário')}</span>
                          {m.is_internal && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"><Lock className="w-2.5 h-2.5" /> Interno</span>}
                          <span className="text-xs text-slate-400 ml-auto">{fmt(m.created_at)}</span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input de resposta */}
                <div className="border border-slate-200 rounded-xl p-3 focus-within:ring-2 ring-indigo-500 transition-all">
                  <textarea
                    rows={2}
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    disabled={!canChat}
                    className="w-full bg-transparent resize-none outline-none text-sm p-1 disabled:opacity-60"
                    placeholder={isClosed ? 'Chamado fechado — conversa encerrada.' : canChat ? 'Responder ao solicitante ou registrar nota interna...' : 'Disponível no chamado real (após login)'}
                  ></textarea>
                  <div className="flex justify-between items-center mt-1 pt-2 border-t border-slate-100">
                    <button className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"><Paperclip className="w-4 h-4" /></button>
                    <div className="flex gap-2">
                      <button onClick={() => sendMessage(true)} disabled={!canChat || sending || !msgText.trim()} className="px-4 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">Nota Interna</button>
                      <button onClick={() => sendMessage(false)} disabled={!canChat || sending || !msgText.trim()} className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50">
                        <Send className="w-4 h-4" /> {sending ? 'Enviando…' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* FORMULÁRIO DINÂMICO */}
            <section>
              <SectionTitle icon={<FileText className="w-5 h-5" />} title="Formulário de Solicitação" hint="campos preenchidos na abertura" />
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { label: 'Nome da Empresa', value: company },
                  { label: 'CNPJ', value: '12.345.678/0001-90' },
                  { label: 'Endereço', value: 'Av. Paulista, 1000 — São Paulo/SP' },
                  { label: 'Centro de Custo', value: 'TI-OPS-04' },
                  { label: 'Ramal', value: '4021' },
                  { label: 'Sistema Afetado', value: 'ERP / Faturamento' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{f.label}</label>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">{f.value}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* RESOLUÇÃO E NOTAS */}
            <section>
              <SectionTitle icon={<CheckCircle className="w-5 h-5" />} title="Resolução & Notas Técnicas" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Resolução com Close Code */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">Resolução (encerramento)</span>
                    {isResolved && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded"><Lock className="w-3 h-3" /> Encerrado</span>}
                  </div>

                  {isResolved ? (
                    // Read-only pós-resolução (documento histórico para auditoria)
                    <div className="p-4 space-y-3">
                      <Field label="Código de Encerramento" value={detail?.close_code ?? closeCode ?? '—'} accent="text-emerald-700" />
                      <div>
                        <p className="text-[11px] text-slate-400">Notas de Resolução</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap mt-0.5">{detail?.close_notes ?? closeNotes ?? '—'}</p>
                      </div>
                      {detail?.resolved_at && <Field label="Resolvido em" value={fmt(detail.resolved_at)} />}
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Código de Encerramento <span className="text-red-500">*</span></label>
                        <select
                          value={closeCode}
                          onChange={e => setCloseCode(e.target.value)}
                          disabled={!canEdit}
                          className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-50 ${!closeCode ? 'border-slate-200' : 'border-slate-200'}`}
                        >
                          <option value="">Selecione…</option>
                          {CLOSE_CODES.map(grp => (
                            <optgroup key={grp.group} label={grp.group}>
                              {grp.options.map(opt => (
                                <option key={opt} value={`${grp.group} / ${opt}`}>{opt}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Notas de Resolução <span className="text-red-500">*</span></label>
                        <textarea
                          rows={4}
                          value={closeNotes}
                          onChange={e => setCloseNotes(e.target.value)}
                          disabled={!canEdit}
                          className="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
                          placeholder="Descreva a solução aplicada (visível ao cliente)..."
                        ></textarea>
                      </div>
                      {(!closeCode || !closeNotes.trim()) && (
                        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Código de Encerramento e Notas são obrigatórios para resolver.
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Tempo gasto</label>
                        <input value={timeSpent} onChange={e => setTimeSpent(e.target.value)} type="text" placeholder="ex: 1h 30m" disabled={!canEdit} className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50" />
                        <button
                          onClick={handleResolve}
                          disabled={!canEdit || resolving || !closeCode || !closeNotes.trim()}
                          className="ml-auto px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {resolving ? 'Resolvendo…' : 'Resolver Chamado'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notas Técnicas internas (atalho para nota) */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-amber-50">
                    <span className="text-sm font-bold text-amber-800">Notas Técnicas (interno)</span>
                    <span className="text-[10px] font-bold uppercase text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Privado</span>
                  </div>
                  <div className="p-4 text-sm text-slate-500">
                    Use o botão <b>"Nota Interna"</b> no campo de conversa acima para registrar notas técnicas — elas ficam ocultas do solicitante (RLS) e visíveis só para a equipe.
                  </div>
                </div>
              </div>
            </section>

            {/* TABELA DE HISTÓRICO (AUDITORIA) */}
            <section>
              <SectionTitle icon={<History className="w-5 h-5" />} title="Histórico de Auditoria" />
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <th className="px-4 py-3">Usuário</th>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Ação Detalhada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!realMode && (
                        <tr className="text-slate-600">
                          <td className="px-4 py-2.5 font-medium">{requester}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">{fmt(new Date().toISOString())}</td>
                          <td className="px-4 py-2.5"><span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Abertura</span></td>
                          <td className="px-4 py-2.5">Chamado registrado pelo portal.</td>
                        </tr>
                      )}
                      {realMode && auditRows.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">Sem registros de auditoria.</td></tr>
                      )}
                      {auditRows.map(h => (
                        <tr key={h.id} className="text-slate-600 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium">{h.changed_by_name}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">{fmt(h.created_at)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${h.field_name === 'comment' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                              {h.field_name === 'comment' ? 'Comentário' : 'Alteração'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {h.field_name === 'comment'
                              ? h.comment
                              : <span><b>{h.field_name}</b>{h.old_value ? <> de <span className="text-red-500 line-through">{h.old_value}</span></> : null} para <b className="text-emerald-600">{h.new_value}</b></span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <div className="flex items-center gap-2 text-slate-400 text-xs justify-center pt-2">
              <Building2 className="w-3.5 h-3.5" /> {company} · {number}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AnalystCockpit
