import { useState, useEffect, useCallback, useRef } from 'react'
import {
  User, Building2, AlertTriangle, Send,
  BookOpen, CheckCircle, History, FileText, ListTree, Link2, Lock, Pause, Edit3,
  ShieldAlert, PlayCircle, ArrowRightLeft, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { incidentsService, messagesService, assignmentGroupsService, pendingReasonsService, responseMacrosService, cmdbService } from '../lib/services'
import type { CmdbImpactRow } from '../lib/services'
import { translateState } from '../lib/statusLabels'
import { useAuth } from '../auth'
import { useToast } from '../context'
import type { IncidentRow, IncidentHistoryRow, IncidentState, TicketMessageRow, AssignmentGroupRow, ProfileRow, PendingReasonRow, ResponseMacroRow } from '../lib/database.types'
import type { WorkspaceTicket } from './workspace.types'
import KnowledgeCockpitPanel from './KnowledgeCockpitPanel'
import SlaEventTimeline from './SlaEventTimeline'
import TicketTasksPanel from '../components/TicketTasksPanel'
import ResolutionModal from '../components/portal/ResolutionModal'
import { priorityString, IMPACT_OPTIONS, URGENCY_OPTIONS } from '../lib/priority'

/**
 * Cockpit do Analista — Single-Pane sob abas de contexto, com ciclo de
 * comunicação real (ticket_messages + Supabase Realtime), início de atendimento e
 * Encerramento padrão ServiceNow (close_code/close_notes).
 */
const FALLBACK_TICKET: WorkspaceTicket = {
  id: 'INC0010003',
  title: 'VPN lenta apos atualizacao',
  status: 'New',
  priority: 'P3 - Moderate',
  requester: 'Juliana Costa',
  department: 'Financeiro',
  client: 'Acme Corp',
  date: '10 min atrás',
  incidentId: 'c09d0ba8-971c-4544-8617-4aa0b2ed4174',
  companyId: '11111111-1111-1111-1111-111111111111',
}

type IncidentDetail = IncidentRow & { history: IncidentHistoryRow[] }
type ContextTab = 'detalhes' | 'historico' | 'subchamados' | 'relacionamentos'

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

// Extrai a mensagem REAL de erros do Supabase (PostgrestError não é instanceof Error).
const dbErrMsg = (e: unknown, fallback: string): string => {
  if (e instanceof Error && e.message) return e.message
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown }
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.details === 'string' && o.details) return o.details
    if (typeof o.hint === 'string' && o.hint) return o.hint
  }
  return fallback
}

const formatFormValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '—')
}

const isOpeningHistory = (fieldName: string) => ['Criação', 'Abertura', 'created'].includes(fieldName)
const historyTypeLabel = (fieldName: string) => {
  if (isOpeningHistory(fieldName)) return 'Criação'
  if (fieldName === 'comment') return 'Comentário'
  if (fieldName === 'Início de Atendimento') return 'Atendimento'
  return 'Alteração'
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

export interface SlaStateResult {
  status: 'fulfilled' | 'breached' | 'warning' | 'normal' | 'paused' | 'none'
  text: string
  showDeadline: boolean
}

export function calculateSlaState(
  deadline: string | null | undefined,
  achievedAt: string | null | undefined,
  isBreached: boolean | undefined,
  nowTime: number,
  createdAt: string | null | undefined,
  pausedAt?: string | null
): SlaStateResult {
  if (!deadline) {
    return {
      status: 'none',
      text: 'Sem prazo definido',
      showDeadline: false
    }
  }

  const targetTime = new Date(deadline).getTime()
  const startTime = createdAt ? new Date(createdAt).getTime() : targetTime - (4 * 3600 * 1000)
  const totalDuration = targetTime - startTime

  let status: 'fulfilled' | 'breached' | 'warning' | 'normal' | 'paused' = 'normal'
  let text = ''

  if (achievedAt) {
    // Fase 19: is_resolution_breached é calculado no banco no instante da
    // transição (zzz_consolidate_sla_resolution) — comparando achievedAt
    // contra o deadline já ajustado por pausa. Aqui só refletimos o veredito,
    // sem recalcular: se o banco disse que estourou, mostramos "estourado",
    // não "cumprido", mesmo que o achievedAt em si pareça dentro do prazo.
    if (isBreached) {
      status = 'breached'
      const overshoot = new Date(achievedAt).getTime() - targetTime
      text = overshoot > 0
        ? `Estourado (resolvido ${fmtDuration(overshoot)} após o prazo)`
        : `Estourado — resolvido em ${fmt(achievedAt)}`
    } else {
      status = 'fulfilled'
      text = `Cumprido em ${fmt(achievedAt)}`
    }
  } else if (pausedAt) {
    status = 'paused'
    const remainingAtPause = targetTime - new Date(pausedAt).getTime()
    text = remainingAtPause < 0
      ? `Pausado (estourado há ${fmtDuration(Math.abs(remainingAtPause))})`
      : `Pausado — ${fmtDuration(remainingAtPause)} restante`
  } else {
    const remaining = targetTime - nowTime

    if (isBreached || remaining < 0) {
      status = 'breached'
      text = remaining < 0 ? `Estourado há ${fmtDuration(Math.abs(remaining))}` : 'Estourado'
    } else {
      text = `${fmtDuration(remaining)} restante`
      if (remaining <= 0.25 * totalDuration || remaining <= 3600 * 1000) {
        status = 'warning'
      }
    }
  }

  const showDeadline = !achievedAt && status !== 'breached' && status !== 'paused'
  return { status, text, showDeadline }
}



// Matriz visual de prioridades ITIL (P1..P5) — usada nos badges e no command bar NOC.
const PRIORITY_STYLES: Record<number, { badge: string; dot: string; label: string }> = {
  1: { badge: 'bg-p1-bg border-p1/30 text-p1-fg font-extrabold shadow-sm', dot: 'bg-p1 animate-ping', label: 'P1 · Crítica' },
  2: { badge: 'bg-p2-bg border-p2/30 text-p2-fg font-bold shadow-sm',      dot: 'bg-p2',             label: 'P2 · Alta' },
  3: { badge: 'bg-p3-bg border-p3/30 text-p3-fg font-bold shadow-sm',      dot: 'bg-p3',             label: 'P3 · Moderada' },
  4: { badge: 'bg-p4-bg border-p4/30 text-p4-fg font-semibold',            dot: 'bg-p4',             label: 'P4 · Baixa' },
  5: { badge: 'bg-p5-bg border-p5/20 text-p5-fg font-semibold',            dot: 'bg-p5',             label: 'P5 · Planejada' },
}

const CONTEXT_TABS: { id: ContextTab; label: string; icon: React.ReactNode }[] = [
  { id: 'detalhes', label: 'Detalhes', icon: <FileText className="w-4 h-4" /> },
  { id: 'historico', label: 'Histórico de Chamados', icon: <History className="w-4 h-4" /> },
  { id: 'subchamados', label: 'Sub Chamados', icon: <ListTree className="w-4 h-4" /> },
  { id: 'relacionamentos', label: 'Relacionamentos', icon: <Link2 className="w-4 h-4" /> },
]

const MOCK_MESSAGES: TicketMessageRow[] = [
  { id: 'm1', incident_id: '', company_id: '', sender_id: null, sender_name: 'Adrianne Colombo', actor_type: 'user', body: 'Segue o print do erro em anexo. Obrigado!', is_internal: false, created_at: new Date().toISOString() },
]

// ─── Subcomponentes de UI ─────────────────────────────────────


function Field({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/70">{label}</p>
      <p className={`text-sm font-semibold ${accent ?? 'text-text-main'}`}>{value || '—'}</p>
    </div>
  )
}

function EmptyContext({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="p-12 flex flex-col items-center justify-center text-center border border-dashed bg-surface border-outline-variant rounded-xl">
        <div className="w-14 h-14 flex items-center justify-center mb-4 rounded-xl bg-surface-container text-on-surface-variant">{icon}</div>
        <h3 className="text-lg font-bold text-text-main">{title}</h3>
        <p className="text-sm mt-1 max-w-sm text-on-surface-variant">{desc}</p>
        <span className="mt-4 text-[10px] font-bold uppercase tracking-wider px-3 py-1 border bg-primary/10 text-primary border-primary/20 rounded-full">
          Em desenvolvimento
        </span>
      </div>
    </div>
  )
}

// Rótulos das PERGUNTAS (fonte única em ../lib/priority).
const translateImpact = (val: string | null | undefined) => {
  const opt = IMPACT_OPTIONS.find(([v]) => v === val)
  return opt ? `${opt[1]} (${opt[0]})` : (val || '—')
}

const translateUrgency = (val: string | null | undefined) => {
  const opt = URGENCY_OPTIONS.find(([v]) => v === val)
  return opt ? `${opt[1]} (${opt[0]})` : (val || '—')
}

const AnalystCockpit = ({ ticket = FALLBACK_TICKET }: { ticket?: WorkspaceTicket }) => {
  const { profile } = useAuth()
  const { toast } = useToast()
  const isAlpha = false
  const isBeta = false

  // Classes limpas e independentes de tenant baseadas no tema dinâmico
  const cardClass = 'bg-surface border border-outline-variant rounded-xl shadow-sm'
  const headerBg = 'bg-surface-container/30 border-b border-outline-variant'
  const inputClass = 'bg-surface border border-outline-variant rounded-lg text-text-main placeholder-on-surface-variant/50 focus:ring-2 focus:ring-primary text-sm outline-none px-3 py-2'
  const buttonPrimaryClass = 'bg-primary text-on-primary rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98]'
  const buttonSecondaryClass = 'border border-outline-variant text-text-main hover:bg-surface-container rounded-lg'

  const realMode = Boolean(ticket.incidentId && ticket.companyId)
  // God Mode: admin/sysadmin têm passe livre nas travas de governança.
  const isAdmin = Boolean(profile && ['sysadmin', 'company_admin', 'admin'].includes(profile.role))

  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeContext, setActiveContext] = useState<ContextTab>('detalhes')
  const [impactCis, setImpactCis] = useState<CmdbImpactRow[]>([])
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [impactExpanded, setImpactExpanded] = useState(true)

  // Helper to render Priority badges (P1–P5, dinâmico via priority_level das triggers)
  const renderPriorityBadge = (prio: string | null | undefined, level?: number | null) => {
    // Resolve o nível 1..5: prioriza o priority_level real; senão, lê do texto legado.
    let lvl = level && level >= 1 && level <= 5 ? level : 0
    if (!lvl) {
      const t = prio || ''
      if (t.includes('P1')) lvl = 1
      else if (t.includes('P2')) lvl = 2
      else if (t.includes('P3')) lvl = 3
      else if (t.includes('P4')) lvl = 4
      else if (t.includes('P5')) lvl = 5
      else lvl = 3
    }
    const cfg = PRIORITY_STYLES[lvl]
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border uppercase tracking-wider ${cfg.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    )
  }

  // Helper to render SLA countdown timer.
  const renderSlaTimer = (
    label: string,
    deadline: string | null | undefined,
    achievedAt: string | null | undefined,
    isBreached: boolean | undefined,
    nowTime: number,
    createdAt: string | null | undefined,
    pausedAt?: string | null
  ) => {
    const { status, text, showDeadline } = calculateSlaState(
      deadline,
      achievedAt,
      isBreached,
      nowTime,
      createdAt,
      pausedAt
    )

    if (status === 'none') {
      return (
        <div className="border border-outline-variant p-4 flex flex-col justify-center bg-surface-container/30 rounded-xl shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
          <span className="text-xs font-semibold italic mt-1">{text}</span>
        </div>
      )
    }

    const styles = {
      fulfilled: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      breached: 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse',
      warning: 'bg-amber-50 border-amber-200 text-amber-700',
      normal: 'bg-slate-50 border-zinc-200 text-slate-700',
      paused: 'bg-sky-50 border-sky-200 text-sky-700'
    }[status]

    return (
      <div className={`border rounded-xl p-4 flex flex-col justify-center transition-all shadow-sm ${styles}`}>
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">{label}</span>
        <span className="text-sm font-extrabold tracking-tight mt-1">{text}</span>
        {showDeadline && (
          <span className="text-[9px] opacity-75 mt-0.5">Prazo: {fmt(deadline!)}</span>
        )}
      </div>
    )
  }

  // Chat / mensagens
  const [messages, setMessages] = useState<TicketMessageRow[]>([])

  // Ações de estado
  const [stateOverride, setStateOverride] = useState<string | null>(null)
  const [closeCode, setCloseCode] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [timeSpent, setTimeSpent] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Assignment groups & members states
  const [activeGroups, setActiveGroups] = useState<AssignmentGroupRow[]>([])
  const [groupMembers, setGroupMembers] = useState<ProfileRow[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [responseMacros, setResponseMacros] = useState<ResponseMacroRow[]>([])

  // Form states for 'Condução do Chamado'
  const [formComment, setFormComment] = useState('')
  const [kbOpen, setKbOpen] = useState(false)
  const [isInternal, setIsInternal] = useState(false)
  const [formState, setFormState] = useState('')
  const [formGroupId, setFormGroupId] = useState('')
  const [formAssigneeId, setFormAssigneeId] = useState('')
  const [formImpact, setFormImpact] = useState('Low')
  const [formUrgency, setFormUrgency] = useState('Low')
  const [formPendingReasonId, setFormPendingReasonId] = useState('')

  useEffect(() => {
    if (!ticket.companyId) return
    let cancelled = false
    responseMacrosService.list(ticket.companyId)
      .then(rows => { if (!cancelled) setResponseMacros(rows) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [ticket.companyId])

  const applyResponseMacro = useCallback((macroId: string) => {
    const macro = responseMacros.find(item => item.id === macroId)
    if (!macro) return
    const body = macro.body
      .replaceAll('{{usuario.nome}}', detail?.caller_name ?? ticket.requester ?? 'Cliente')
      .replaceAll('{{chamado.numero}}', detail?.number ?? ticket.id)
      .replaceAll('{{chamado.titulo}}', detail?.short_description ?? ticket.title)
    setFormComment(body)
    if (macro.visibility === 'internal') setIsInternal(true)
    if (macro.visibility === 'public') setIsInternal(false)
    void responseMacrosService.recordUse(macro.id).catch(console.error)
  }, [responseMacros, detail, ticket])
  const [pendingReasons, setPendingReasons] = useState<PendingReasonRow[]>([])
  const [savingConducao, setSavingConducao] = useState(false)
  // 'idle' → seletor de ação; 'start' → primeiro atendimento; 'update' → atualização; 'transfer' → transferência; 'resolve' → resolução; 'reopen' → reabertura
  const [conducaoMode, setConducaoMode] = useState<'idle' | 'start' | 'update' | 'pending' | 'transfer' | 'resolve' | 'reopen'>('idle')
  const actionDialogRef = useRef<HTMLDivElement>(null)

  // Status atual acessível dentro de callbacks do Realtime (sempre fresco).
  const statusRef = useRef<string>('')

  // Compensação de Drift de Relógio (Clock Drift Compensation)
  const [serverClockOffset, setServerClockOffset] = useState<number>(0)
  useEffect(() => {
    const fetchServerTime = async () => {
      try {
        const url = import.meta.env.VITE_SUPABASE_URL as string
        if (!url) return
        const start = Date.now()
        const res = await fetch(url, { method: 'HEAD' })
        const serverDateHeader = res.headers.get('date')
        if (serverDateHeader) {
          const serverTime = new Date(serverDateHeader).getTime()
          const end = Date.now()
          const latency = (end - start) / 2
          const offset = (serverTime + latency) - end
          setServerClockOffset(offset)
        }
      } catch (err) {
        console.error('Failed to sync server time:', err)
      }
    }
    fetchServerTime()
  }, [])

  // Relógio vivo para o cronômetro de SLA / tempo decorrido
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + serverClockOffset), 1000)
    return () => clearInterval(t)
  }, [serverClockOffset])

  // Os fluxos de condução são modais. Escape fecha somente quando não há
  // uma operação sendo persistida, evitando perda de contexto durante o save.
  useEffect(() => {
    if (conducaoMode === 'idle') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingConducao) {
        setConducaoMode('idle')
        setError(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [conducaoMode, savingConducao])

  useEffect(() => {
    if (conducaoMode === 'idle') return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    actionDialogRef.current?.focus()
    return () => trigger?.focus()
  }, [conducaoMode])

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

  // Sync form states when detail loads
  useEffect(() => {
    if (detail) {
      setFormState(detail.state || '')
      setFormGroupId(detail.assignment_group_id || detail.assigned_group_id || '')
      setFormAssigneeId(detail.assigned_to_id || '')
      setFormImpact(detail.impact || 'Low')
      setFormUrgency(detail.urgency || 'Low')
      setFormPendingReasonId(detail.pending_reason_id || '')
      setConducaoMode('idle')
    }
  }, [detail])

  // Sync form state when stateOverride changes
  useEffect(() => {
    if (stateOverride) {
      setFormState(stateOverride)
    }
  }, [stateOverride])

  // Carrega os Motivos de Pendência do tenant (governança de SLA — migration 035)
  useEffect(() => {
    const cid = detail?.company_id || ticket.companyId
    if (!cid) { setPendingReasons([]); return }
    let cancelled = false
    pendingReasonsService.list(cid)
      .then(rows => { if (!cancelled) setPendingReasons(rows) })
      .catch(() => { if (!cancelled) setPendingReasons([]) })
    return () => { cancelled = true }
  }, [detail?.company_id, ticket.companyId])

  // Carrega a árvore de impactos em cascata (CMDB) — migration 098
  useEffect(() => {
    const caseId = detail?.case_id ?? ticket.caseId ?? null
    const companyId = detail?.company_id ?? ticket.companyId ?? null
    if (!caseId || !companyId) {
      setImpactCis([])
      return
    }

    let cancelled = false
    setLoadingImpact(true)

    // Resolve o CI associado ao caso primeiro
    cmdbService.getCiForCase(caseId)
      .then(ciId => {
        if (cancelled) return
        if (!ciId) {
          setImpactCis([])
          setLoadingImpact(false)
          return
        }
        // Busca a predição de impactos
        return cmdbService.predictIncidentImpact(companyId, ciId, 'upstream')
      })
      .then(impact => {
        if (!cancelled && impact) {
          setImpactCis(impact)
        }
      })
      .catch(err => {
        console.error('Erro ao resolver impactos do CMDB:', err)
        if (!cancelled) setImpactCis([])
      })
      .finally(() => {
        if (!cancelled) setLoadingImpact(false)
      })

    return () => {
      cancelled = true
    }
  }, [detail?.case_id, ticket.caseId, detail?.company_id, ticket.companyId])


  // Load active assignment groups for this company
  useEffect(() => {
    const cid = detail?.company_id || ticket.companyId
    if (!cid) {
      setActiveGroups([])
      return
    }
    let cancelled = false
    setLoadingGroups(true)
    assignmentGroupsService.listActive(cid)
      .then(res => {
        if (!cancelled) setActiveGroups(res)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoadingGroups(false)
      })
    return () => { cancelled = true }
  }, [detail?.company_id, ticket.companyId])

  // Load group members when formGroupId changes
  useEffect(() => {
    if (!formGroupId) {
      setGroupMembers([])
      return
    }
    let cancelled = false
    assignmentGroupsService.listMembers(formGroupId)
      .then(res => {
        if (!cancelled) setGroupMembers(res)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [formGroupId])

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

  const refreshIncident = useCallback(async () => {
    if (!ticket.incidentId || !ticket.companyId) return
    try {
      const data = await incidentsService.getById(ticket.incidentId, ticket.companyId)
      setDetail(data)
    } catch (e) {
      console.error('Falha ao recarregar chamado:', e)
    }
  }, [ticket.incidentId, ticket.companyId])

  const refreshMessages = useCallback(async () => {
    if (!ticket.incidentId) return
    try {
      const rows = await messagesService.list(ticket.incidentId)
      setMessages(rows)
    } catch (e) {
      console.error('Falha ao recarregar mensagens:', e)
    }
  }, [ticket.incidentId])

  // Assina Realtime para incident_history
  useEffect(() => {
    if (!ticket.incidentId || !ticket.companyId) return
    const channel = incidentsService.subscribeToHistory(ticket.incidentId, ticket.companyId, (row) => {
      setDetail(prev => {
        if (!prev) return null
        // Se a linha já existe no histórico local, não duplica
        if (prev.history.some(h => h.id === row.id)) return prev
        const newHistory = [row, ...prev.history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        return { ...prev, history: newHistory }
      })
    })
    return () => { channel.unsubscribe() }
  }, [ticket.incidentId, ticket.companyId])

  const openEditForm = useCallback(() => {
    if (detail) {
      // Garante que o estado não fique em Resolved/Closed no modo update
      // O modal de atualização não é uma rota alternativa para pendência ou
      // encerramento. Chamados pendentes retomam explicitamente Em Andamento
      // quando uma atualização operacional é salva.
      // Se for admin, mantemos o status original se for Resolved ou Closed.
      const isClosedOrResolved = detail.state === 'Resolved' || detail.state === 'Closed'
      const safeState = (isAdmin && isClosedOrResolved)
        ? detail.state
        : (detail.state === 'New' ? 'New' : 'In Progress')
      setFormState(safeState)
      setFormGroupId(detail.assignment_group_id || detail.assigned_group_id || '')
      setFormAssigneeId(detail.assigned_to_id || '')
      setFormImpact(detail.impact || 'Low')
      setFormUrgency(detail.urgency || 'Low')
      setFormPendingReasonId(detail.pending_reason_id || '')
      setFormComment('')
    }
    setError(null)
    setActionMsg(null)
    setConducaoMode('update')
    setActiveContext('detalhes')
  }, [detail, isAdmin])

  const openResolveForm = useCallback(() => {
    if (detail) {
      setCloseCode(detail.close_code || '')
      setCloseNotes(detail.close_notes || '')
      setTimeSpent('')
      setFormComment('')
      setIsInternal(false)
    }
    setError(null)
    setActionMsg(null)
    setConducaoMode('resolve')
    setActiveContext('detalhes')
  }, [detail])

  const openStartForm = useCallback(() => {
    setFormComment('')
    setIsInternal(false)
    setError(null)
    setActionMsg(null)
    setConducaoMode('start')
    setActiveContext('detalhes')
  }, [])

  const handleStartAtendimento = useCallback(async () => {
    if (!ticket.incidentId || !ticket.companyId || !profile) return
    setSavingConducao(true)
    setError(null)
    try {
      const updated = await incidentsService.startService(ticket.incidentId, ticket.companyId)
      if (formComment.trim()) {
        await incidentsService.conduct(ticket.incidentId, ticket.companyId, {
          changes: {},
          comment: formComment.trim(),
          isInternal: false,
          senderId: profile.id,
          senderName: profile.name ?? 'Analista',
        })
      }
      setDetail(current => current ? { ...current, ...updated } : current)
      setStateOverride('In Progress')
      setFormState('In Progress')
      toast.success('Atendimento iniciado! SLA de resposta registrado.')
      setConducaoMode('idle')
      refreshIncident()
      refreshMessages()
    } catch (e) {
      const errMsg = dbErrMsg(e, 'Falha ao iniciar atendimento.')
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setSavingConducao(false)
    }
  }, [ticket.incidentId, ticket.companyId, profile, formComment, toast, refreshIncident, refreshMessages])

  const handleTransfer = useCallback(async () => {
    const cid = detail?.company_id || ticket.companyId
    if (!ticket.incidentId || !cid) return
    if (!formGroupId) { setError('Selecione o Grupo Solucionador para transferir.'); return }
    setSavingConducao(true)
    setError(null)
    try {
      const updated = await incidentsService.conduct(ticket.incidentId, cid, {
        changes: {
          assignment_group_id: formGroupId || null,
          assigned_to_id: formAssigneeId || null,
        },
        comment: formComment.trim() || undefined,
        isInternal: true,
        senderId: profile?.id ?? null,
        senderName: profile?.name ?? 'Analista',
      })
      setDetail(prev => prev ? { ...prev, ...updated } : null)
      toast.success('Chamado transferido com sucesso!')
      setConducaoMode('idle')
      refreshIncident()
      refreshMessages()
    } catch (e) {
      const errMsg = dbErrMsg(e, 'Falha ao transferir chamado.')
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setSavingConducao(false)
    }
  }, [ticket.incidentId, ticket.companyId, detail?.company_id, formGroupId, formAssigneeId, formComment, profile, toast, refreshIncident, refreshMessages])

  const openReopenForm = useCallback(() => {
    setFormComment('')
    setError(null)
    setActionMsg(null)
    setConducaoMode('reopen')
    setActiveContext('detalhes')
  }, [])

  const handleReopen = useCallback(async () => {
    const cid = detail?.company_id || ticket.companyId
    if (!ticket.incidentId || !cid) return
    setSavingConducao(true)
    setError(null)
    try {
      const updated = await incidentsService.conduct(ticket.incidentId, cid, {
        changes: { state: 'In Progress', close_code: null, close_notes: null, resolved_at: null },
        comment: formComment.trim() || 'Chamado reaberto.',
        isInternal: false,
        senderId: profile?.id ?? null,
        senderName: profile?.name ?? 'Analista',
      })
      setDetail(prev => prev ? { ...prev, ...updated } : null)
      setStateOverride('In Progress')
      toast.success('Chamado reaberto com sucesso!')
      setConducaoMode('idle')
      refreshIncident()
      refreshMessages()
    } catch (e) {
      const errMsg = dbErrMsg(e, 'Falha ao reabrir chamado.')
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setSavingConducao(false)
    }
  }, [ticket.incidentId, ticket.companyId, detail?.company_id, formComment, profile, toast, refreshIncident, refreshMessages])

  // Atalho "Pendente": abre o formulário de condução já com o estado
  // preenchido (Pendente exige Motivo + justificativa obrigatórios).
  const openPendingForm = useCallback(() => {
    setFormState('On Hold')
    // Exige uma decisão consciente a cada nova pendência; não reaproveita um
    // motivo antigo que possa ter ficado registrado no chamado.
    setFormPendingReasonId('')
    setFormComment('')
    setIsInternal(true)
    setError(null)
    setActionMsg(null)
    setConducaoMode('pending')
    setActiveContext('detalhes')
  }, [])

  const handleGravarConducao = useCallback(async () => {
    const cid = detail?.company_id || ticket.companyId
    if (!ticket.incidentId || !cid) return

    // Validations
    if (!isAdmin && formState === 'Resolved' && (!closeCode || !closeNotes.trim())) {
      const msg = 'Para resolver o chamado, preencha o Código de Encerramento e Notas de Resolução.'
      setError(msg)
      toast.error(msg)
      return
    }

    if (!isAdmin && formState === 'Closed' && !detail?.close_code && (!closeCode || !closeNotes.trim())) {
      const msg = 'Para fechar o chamado, preencha o Código de Encerramento e Notas de Resolução.'
      setError(msg)
      toast.error(msg)
      return
    }

    // Se o grupo solucionador for alterado para diferente do atual, exige um comentário (nota de transferência)
    const currentGroupId = detail?.assignment_group_id || ''
    if (formGroupId && formGroupId !== currentGroupId && !formComment.trim()) {
      const msg = 'Ao transferir o chamado de equipe, preencha o campo de Mensagem/Ação justificando a transferência.'
      setError(msg)
      toast.error(msg)
      return
    }

    // Pendência: exige Motivo da Pendência + comentário obrigatório
    if (formState === 'On Hold') {
      if (!formPendingReasonId) {
        const msg = 'Para colocar o chamado como Pendente, selecione o Motivo da Pendência.'
        setError(msg); toast.error(msg); return
      }
      if (!formComment.trim()) {
        const msg = 'Para colocar o chamado como Pendente, preencha o campo de Mensagem/Ação com a justificativa.'
        setError(msg); toast.error(msg); return
      }
    }

    setSavingConducao(true)
    setActionMsg(null)
    setError(null)

    try {
      const selectedGroupName = activeGroups.find(g => g.id === formGroupId)?.name ?? null
      const selectedAssigneeName = groupMembers.find(m => m.id === formAssigneeId)?.name
        ?? (formAssigneeId === detail?.assigned_to_id ? detail.assigned_to_name : null)

      const changes: Partial<IncidentRow> = {
        state: formState as IncidentState,
        assignment_group_id: formGroupId || null,
        assigned_group_name: selectedGroupName,
        assigned_to_id: formAssigneeId || null,
        assigned_to_name: selectedAssigneeName,
        impact: formImpact as IncidentRow['impact'],
        urgency: formUrgency as IncidentRow['urgency'],
        priority: priorityString(formImpact, formUrgency),
        pending_reason_id: formState === 'On Hold' ? (formPendingReasonId || null) : null,
        pending_reason: formState === 'On Hold'
          ? (pendingReasons.find(r => r.id === formPendingReasonId)?.name ?? null)
          : null,
      }

      // If resolving/closing and closeCode/closeNotes are filled, include them
      if (formState === 'Resolved' || formState === 'Closed') {
        changes.close_code = closeCode || null
        changes.close_notes = closeNotes ? (timeSpent ? `${closeNotes}\n\n[Tempo gasto: ${timeSpent}]` : closeNotes) : null
        if (formState === 'Resolved' && !detail?.resolved_at) {
          changes.resolved_at = new Date().toISOString()
        }
        if (formState === 'Closed' && !detail?.closed_at) {
          changes.closed_at = new Date().toISOString()
        }
      } else if (detail?.resolved_at || detail?.closed_at) {
        // Reabertura (God Mode / fluxo): volta a um estado operacional →
        // zera os carimbos de encerramento para o SLA voltar a correr.
        changes.resolved_at = null
        changes.closed_at = null
      }

      const updated = await incidentsService.conduct(ticket.incidentId, cid, {
        changes,
        comment: formComment.trim() || undefined,
        isInternal,
        senderId: profile?.id ?? null,
        senderName: profile?.name ?? 'Analista',
      })

      // Update local states
      setDetail(prev => prev ? { ...prev, ...updated } : null)
      setStateOverride(updated.state)
      setFormComment('')

      const successMsg = 'Atualização gravada com sucesso!'
      setActionMsg(successMsg)
      toast.success(successMsg)
      setConducaoMode('idle')
      refreshIncident()
      refreshMessages()
    } catch (e) {
      const errMsg = dbErrMsg(e, 'Falha ao registrar condução.')
      setError(errMsg)
      toast.error(`Falha no banco de dados: ${errMsg}`)
    } finally {
      setSavingConducao(false)
    }
  }, [ticket.incidentId, ticket.companyId, detail?.company_id, formState, formGroupId, formAssigneeId, formImpact, formUrgency, formPendingReasonId, pendingReasons, formComment, isInternal, activeGroups, groupMembers, closeCode, closeNotes, timeSpent, detail, profile, toast, refreshIncident, refreshMessages, isAdmin])

  const handleCancelEdit = useCallback(() => {
    setConducaoMode('idle')
    setError(null)
    setActionMsg(null)
    if (detail) {
      setFormState(detail.state || '')
      setFormGroupId(detail.assignment_group_id || detail.assigned_group_id || '')
      setFormAssigneeId(detail.assigned_to_id || '')
      setFormImpact(detail.impact || 'Low')
      setFormUrgency(detail.urgency || 'Low')
      setFormComment('')
      setCloseCode('')
      setCloseNotes('')
      setTimeSpent('')
    }
  }, [detail])

  // Fase 18 — Motor de Resolução Estruturada (ITIL v4): resolution_code +
  // resolution_notes + kb_candidate, validados no banco (trg_guard_
  // resolution_governance, migration 115) e coletados pelo ResolutionModal.
  const handleResolveStructured = useCallback(async (resolutionCode: string, resolutionNotes: string, kbCandidate: boolean) => {
    const cid = detail?.company_id || ticket.companyId
    if (!ticket.incidentId || !cid) throw new Error('Ticket ou empresa não resolvidos.')

    const updated = await incidentsService.resolveStructured(
      ticket.incidentId, cid, resolutionCode, resolutionNotes, kbCandidate, profile?.name ?? 'Analista',
    )
    setDetail(prev => prev ? { ...prev, ...updated } : null)
    setStateOverride('Resolved')
    toast.success('Chamado resolvido com sucesso!')
    setConducaoMode('idle')
    refreshIncident()
    refreshMessages()
  }, [ticket.incidentId, ticket.companyId, detail?.company_id, profile, toast, refreshIncident, refreshMessages])

  // Valores de exibição
  const number = ticket.id
  const status = stateOverride ?? detail?.state ?? ticket.status
  useEffect(() => {
    statusRef.current = status
  }, [status])
  const title = detail?.short_description ?? ticket.title
  const priority = detail?.priority ?? ticket.priority
  const requester = detail?.caller_name || ticket.requester || 'Solicitante'
  const group = detail?.assigned_group_name ?? ticket.techGroup ?? '—'
  const assignee = (stateOverride && profile ? profile.name : detail?.assigned_to_name) ?? 'Não atribuído'
  const company = ticket.client ?? '—'
  const category = detail?.category ?? '—'

  const description = realMode
    ? (detail?.description || detail?.short_description || 'Sem descrição registrada.')
    : 'Olá equipe, o sistema está apresentando muita lentidão desde a atualização de ontem. Não consigo emitir as notas fiscais do fechamento. Podem ajudar com urgência?'
  const formDataEntries = detail?.form_data && typeof detail.form_data === 'object' && !Array.isArray(detail.form_data)
    ? Object.entries(detail.form_data)
    : []
  const auditRows = detail ? detail.history : []
  const isTechnicalUser = profile && ['admin', 'sysadmin', 'analyst', 'agent', 'company_admin'].includes(profile.role)
  const visibleMessages = isTechnicalUser ? messages : messages.filter(m => !m.is_internal)
  const visibleAuditRows = isTechnicalUser ? auditRows : auditRows.filter(h => h.is_public)
  const canAct = realMode && Boolean(profile)
  const isResolved = status === 'Resolved' || status === 'Closed'
  // Chamado novo: primeiro atendimento ainda não foi realizado
  const isNew = status === 'New' && !detail?.responded_at
  // Edição liberada quando NÃO encerrado — OU sempre, se for admin (override).
  const canEdit = canAct && (!isResolved || isAdmin)


  return (
    <div className="h-full overflow-y-auto bg-background text-text-main font-sans">
      {/* BARRA SUPERIOR (STICKY): ações + abas de contexto */}
      <div className="sticky top-0 z-20 backdrop-blur bg-surface/95 border-b border-outline-variant shadow-sm">
        <div className="px-6 pt-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate text-text-main">{number}</h1>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${{
                'New':         'bg-new-bg text-new-fg',
                'In Progress': 'bg-progress-bg text-progress-fg',
                'On Hold':     'bg-hold-bg text-hold-fg',
                'Resolved':    'bg-resolved-bg text-resolved-fg',
                'Closed':      'bg-closed-bg text-closed-fg',
              }[status ?? ''] ?? 'bg-surface-container text-on-surface-variant'}`}>{translateState(status)}</span>
              {loading && <span className="text-xs text-on-surface-variant animate-pulse">carregando…</span>}
            </div>
            <p className="text-xs text-on-surface-variant truncate">{title}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pb-2">
            <button onClick={() => setKbOpen(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors border border-outline-variant text-text-main hover:bg-surface-container rounded-lg">
              <BookOpen className="w-4 h-4" /> <span className="hidden lg:inline">Base de Conhecimento</span>
            </button>
            {isResolved ? (
              <>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-2 border text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg" title="Override administrativo ativo">
                    <Lock className="w-3.5 h-3.5" /> God Mode
                  </span>
                )}
                {canAct && conducaoMode === 'idle' && (
                  <button
                    onClick={openReopenForm}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:opacity-90 active:scale-[0.98] border-2 border-primary text-primary bg-transparent hover:bg-primary/5 rounded-lg"
                  >
                    <PlayCircle className="w-4 h-4" /> Reabrir Chamado
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Workflow: New → só "Iniciar Atendimento" */}
                {canEdit && isNew && conducaoMode === 'idle' && (
                  <button
                    onClick={openStartForm}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:opacity-90 active:scale-[0.98] bg-primary text-on-primary rounded-lg"
                  >
                    <PlayCircle className="w-4 h-4" /> Iniciar Atendimento
                  </button>
                )}
                {canEdit && !isNew && conducaoMode === 'idle' && (
                  <>
                    <button
                      onClick={openEditForm}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:opacity-90 active:scale-[0.98] bg-primary text-on-primary rounded-lg"
                    >
                      <Edit3 className="w-4 h-4" /> Atualizar Chamado
                    </button>
                    <button
                      onClick={openPendingForm}
                      disabled={status === 'On Hold'}
                      className="flex items-center gap-1.5 px-3 py-2 border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-outline-variant text-text-main hover:bg-amber-500/15 hover:text-amber-500 hover:border-amber-500/30 rounded-lg"
                    >
                      <Pause className="w-4 h-4" /> <span className="hidden lg:inline">Colocar em pendência</span>
                    </button>
                    <button
                      onClick={openResolveForm}
                      className="flex items-center gap-1.5 px-3 py-2 border-2 text-sm font-semibold transition-colors border-emerald-500 text-emerald-600 hover:bg-emerald-500/10 rounded-lg"
                    >
                      <CheckCircle className="w-4 h-4" /> <span className="hidden lg:inline">Resolver chamado</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-4 pt-2 flex items-center gap-1 overflow-x-auto hide-scrollbar border-t border-outline-variant">
          {CONTEXT_TABS.map(tab => {
            const active = tab.id === activeContext
            
            let tabBtnStyle = ''
            if (active) {
              tabBtnStyle = 'border-primary text-primary bg-surface-container/30 rounded-t-lg'
            } else {
              tabBtnStyle = 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-t-lg'
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveContext(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${tabBtnStyle}`}
              >
                {tab.icon}{tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeContext === 'historico' && <EmptyContext icon={<History className="w-7 h-7" />} title="Histórico de Chamados" desc="Outros chamados deste solicitante e empresa aparecerão aqui." />}
      {activeContext === 'subchamados' && (
        <div className="max-w-7xl mx-auto p-6">
          <TicketTasksPanel 
            companyId={ticket.companyId!} 
            ticketId={ticket.incidentId!} 
            ticketType={(detail?.ticket_type ?? ticket.ticketType) === 'request' ? 'request' : 'incident'}
            groups={activeGroups}
          />
        </div>
      )}
      {activeContext === 'relacionamentos' && <EmptyContext icon={<Link2 className="w-7 h-7" />} title="Relacionamentos" desc="Incidentes, problemas e mudanças relacionados serão exibidos aqui." />}

      {activeContext === 'detalhes' && (
        <>
          {(error || actionMsg) && (
            <div className={`m-6 mb-0 text-sm rounded-xl p-3 ${error ? 'bg-error/10 border border-error/20 text-error' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'}`}>
              {error || actionMsg}
            </div>
          )}

          <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Banners de estado especial no topo */}
            {detail && (
              <div className="space-y-3">
                {detail.sla_managed_by_client && (
                  <div className="flex items-start gap-2 bg-sky-500/10 border border-sky-500/25 rounded-xl px-4 py-3">
                    <ShieldAlert className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-sky-700 dark:text-sky-200">
                      <b>Sob gestão do time do cliente.</b> O relógio de SLA da Allied está congelado para não penalizar as métricas da consultoria.
                    </p>
                  </div>
                )}
                {detail.paused_at && (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
                    <Pause className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-200">
                      <b>SLA pausado</b> desde {fmt(detail.paused_at)}
                      {detail.pending_reason ? <> · Motivo: <b>{detail.pending_reason}</b></> : null}.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Resumo operacional: contexto essencial para decisão do analista */}
            {detail && (
              <section data-testid="operational-summary" className={`${cardClass} p-5 space-y-5`}>
                <div className="flex items-center gap-2 border-b pb-3 border-outline-variant">
                  <Building2 className="w-5 h-5 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-text-main">Resumo operacional</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Field label="Solicitante" value={requester} />
                  <Field label="Empresa" value={company} accent="text-primary font-bold" />
                  <Field label="Abertura" value={fmt(detail.created_at)} />
                  <Field label="Tipo" value={(detail.ticket_type ?? ticket.ticketType) === 'request' ? 'Requisição' : 'Incidente'} />
                  <Field label="Estado" value={translateState(status)} />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider mb-1 text-on-surface-variant">Prioridade</p>
                    {renderPriorityBadge(priority, detail.priority_level)}
                  </div>
                  <Field label="Impacto" value={translateImpact(detail.impact)} />
                  <Field label="Urgência" value={translateUrgency(detail.urgency)} />
                  <Field label="Categoria" value={category} />
                  <Field label="Grupo técnico" value={group} />
                  <Field label="Responsável" value={assignee} />
                </div>
                <div data-testid="operational-summary-slas" className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-outline-variant">
                  {renderSlaTimer('SLA de resposta', detail.sla_response_deadline, detail.responded_at, detail.is_response_breached, now, detail.created_at, detail.paused_at)}
                  {renderSlaTimer('SLA de solução', detail.sla_resolution_deadline, detail.resolved_at, detail.is_resolution_breached, now, detail.created_at, detail.paused_at)}
                </div>
              </section>
            )}

            {/* Painel de Impacto em Cascata (CMDB) — migration 098 */}
            {detail && (
              <section data-testid="cmdb-impact-section" className={`${cardClass} p-5 space-y-4`}>
                <div 
                  onClick={() => setImpactExpanded(prev => !prev)}
                  className="flex items-center justify-between gap-2 border-b pb-3 border-outline-variant cursor-pointer hover:opacity-80 transition-opacity select-none"
                  data-testid="cmdb-impact-header"
                >
                  <div className="flex items-center gap-2">
                    <ListTree className="w-5 h-5 text-primary" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-text-main">Impacto em Cascata (CMDB)</h2>
                  </div>
                  <button className="text-on-surface-variant hover:text-text-main" aria-label="Toggle Impact Section">
                    {impactExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {impactExpanded && (
                  <div data-testid="cmdb-impact-content" className="space-y-3">
                    {loadingImpact ? (
                      <div className="space-y-2 py-2 animate-pulse" data-testid="cmdb-impact-loading">
                        <div className="h-4 bg-surface-container rounded-md w-3/4"></div>
                        <div className="h-4 bg-surface-container rounded-md w-1/2"></div>
                      </div>
                    ) : impactCis.length === 0 ? (
                      <p className="text-sm text-on-surface-variant italic py-2" data-testid="cmdb-impact-empty">
                        Nenhum impacto em cascata detectado
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="cmdb-impact-list">
                        {impactCis.map((ci) => {
                          const isHighOrCritical = ci.criticality === 'high' || ci.criticality === 'critical'
                          return (
                            <div 
                              key={ci.ci_id} 
                              data-testid={`cmdb-impact-card-${ci.criticality}`}
                              className={`p-3 border rounded-xl flex flex-col justify-between transition-colors ${
                                isHighOrCritical 
                                  ? 'bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400' 
                                  : 'bg-surface-container/30 border-outline-variant'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold truncate max-w-[80%]" title={ci.ci_name}>{ci.ci_name}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                                    ci.criticality === 'critical'
                                      ? 'bg-red-600 text-white'
                                      : ci.criticality === 'high'
                                        ? 'bg-orange-500 text-white'
                                        : ci.criticality === 'medium'
                                          ? 'bg-amber-500 text-white'
                                          : 'bg-slate-500 text-white'
                                  }`}>
                                    {ci.criticality}
                                  </span>
                                </div>
                                <p className="text-[10px] text-on-surface-variant mt-1">
                                  Classe: <span className="font-semibold">{ci.class_name}</span>
                                </p>
                              </div>
                              <div className="mt-3 flex items-center justify-between text-[10px] border-t pt-2 border-outline-variant/30">
                                <span className="text-on-surface-variant">Profundidade</span>
                                <span className="font-bold">Nível {ci.depth}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <div className="grid grid-cols-1 gap-6">
              {/* COLUNA ESQUERDA (70% ou col-span-2) */}
              <div className="space-y-6">
                {/* DESCRIÇÃO E CHAT */}
                <section className={`${cardClass} p-5 space-y-5`}>
                  <div className="flex items-center gap-2 border-b pb-3 border-outline-variant">
                    <FileText className="w-5 h-5 text-primary" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-text-main">Descrição & Conversa</h2>
                  </div>
                  <div className="p-4 border bg-surface-container/30 border-outline-variant rounded-xl">
                    <p className="text-[11px] font-bold uppercase tracking-wider mb-2 text-on-surface-variant/80">Descrição Original</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-main">{description}</p>
                  </div>

                  {formDataEntries.length > 0 && (
                    <div className="p-4 border bg-primary/5 border-primary/20 rounded-xl">
                      <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-primary">Dados do Formulário Customizado</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {formDataEntries.map(([label, value]) => (
                          <Field key={label} label={label} value={formatFormValue(value)} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 pt-2">
                    {visibleMessages.length === 0 && <p className="text-sm text-on-surface-variant italic text-center py-2">Nenhuma mensagem ainda.</p>}
                    {visibleMessages.map(m => (
                      <div key={m.id} className={`flex gap-3 ${m.actor_type === 'analyst' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-9 h-9 flex items-center justify-center font-bold text-sm flex-shrink-0 rounded-full ${
                          m.is_internal 
                            ? 'bg-amber-500/10 text-amber-500' 
                            : m.actor_type === 'analyst' 
                              ? 'bg-primary text-on-primary' 
                              : 'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          {(m.sender_name || '?').charAt(0)}
                        </div>
                        <div className={`border p-3.5 shadow-sm max-w-[80%] ${
                          m.is_internal
                            ? 'bg-amber-500/5 border-amber-500/25 text-text-main rounded-2xl'
                            : m.actor_type === 'analyst'
                              ? 'bg-primary/5 border-primary/10 text-text-main rounded-2xl'
                              : 'bg-surface border-outline-variant text-text-main rounded-2xl'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{m.sender_name || (m.actor_type === 'system' ? 'Sistema' : 'Usuário')}</span>
                            {m.is_internal && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded-full">
                                <Lock className="w-2.5 h-2.5" /> Interno
                              </span>
                            )}
                            <span className="text-xs ml-auto text-on-surface-variant">{fmt(m.created_at)}</span>
                          </div>
                          <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">{m.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* RESOLUÇÃO E NOTAS */}
                <section className={`${cardClass} overflow-hidden`}>
                  <div className={`px-5 py-3.5 border-b flex items-center justify-between ${headerBg}`}>
                    <span className="text-sm font-bold text-text-main">Resolução (encerramento)</span>
                    {isResolved && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase border px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/25 rounded-full">
                        <Lock className="w-3 h-3" /> Encerrado
                      </span>
                    )}
                  </div>

                  {isResolved ? (
                    <div className="p-5 space-y-4">
                      <Field label="Código de Encerramento" value={detail?.close_code ?? closeCode ?? '—'} accent="text-emerald-500 font-bold" />
                      <div>
                        <p className={`text-[11px] font-bold uppercase tracking-wider ${
                          isAlpha ? 'text-zinc-500 font-mono' : 'text-on-surface-variant'
                        }`}>Notas de Resolução</p>
                        <p className={`text-sm whitespace-pre-wrap mt-0.5 ${isAlpha ? 'text-zinc-300 font-mono' : 'text-on-surface'}`}>{detail?.close_notes ?? closeNotes ?? '—'}</p>
                      </div>
                      {detail?.resolved_at && <Field label="Resolvido em" value={fmt(detail.resolved_at)} />}
                    </div>
                  ) : (
                    <div className={`p-6 text-center text-sm ${isAlpha ? 'font-mono text-zinc-400' : 'text-on-surface-variant'}`}>
                      <AlertTriangle className={`w-8 h-8 text-amber-500 mx-auto mb-2 ${isAlpha ? 'animate-pulse' : ''}`} />
                      O chamado ainda não foi resolvido.
                      <p className={`text-xs mt-1 ${isAlpha ? 'text-zinc-500' : 'text-on-surface-variant'}`}>
                        Para resolvê-lo, use o botão <b>Resolver chamado</b> na barra superior.
                      </p>
                    </div>
                  )}
                </section>

                {/* HISTÓRICO DE AUDITORIA (LIVRO-CAIXA / EVENTOS DE SLA) */}
                {detail && detail.id && (
                  <SlaEventTimeline incidentId={detail.id} />
                )}

                {/* TABELA DE HISTÓRICO LEGADA (OPCIONAL/AUDITORIA GERAL) */}
                <section className={`${cardClass} overflow-hidden`}>
                  <div className={`px-5 py-3 border-b flex items-center gap-2 ${
                    isAlpha 
                      ? 'border-zinc-800 bg-zinc-900/50' 
                      : isBeta 
                        ? 'border-zinc-200 bg-slate-50/80' 
                        : 'border-outline-variant bg-surface-container/30'
                  }`}>
                    <History className={`w-4 h-4 ${isBeta ? 'text-medical-blue' : 'text-primary'}`} />
                    <h2 className={`text-xs font-bold uppercase tracking-wider ${isAlpha ? 'text-zinc-300 font-mono' : 'text-on-surface'}`}>
                      Histórico de Alterações (Campos)
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className={`${
                        isAlpha 
                          ? 'bg-zinc-950 border-b border-zinc-800' 
                          : isBeta 
                            ? 'bg-slate-50/50 border-b border-zinc-200' 
                            : 'bg-surface-container border-b border-outline-variant'
                      }`}>
                        <tr className={`font-bold uppercase text-[10px] tracking-wider ${isAlpha ? 'text-zinc-500 font-mono' : 'text-on-surface-variant'}`}>
                          <th className="px-4 py-3">Usuário</th>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Ação Detalhada</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${
                        isAlpha 
                          ? 'divide-zinc-900' 
                          : isBeta 
                            ? 'divide-zinc-100' 
                            : 'divide-outline-variant'
                      }`}>
                        {!realMode && (
                          <tr className={isAlpha ? 'text-zinc-300 font-mono' : 'text-on-surface-variant'}>
                            <td className="px-4 py-2.5 font-medium">{requester}</td>
                            <td className="px-4 py-2.5 text-xs whitespace-nowrap">{fmt(new Date().toISOString())}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 ${
                                isAlpha 
                                  ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/30 rounded-lg' 
                                  : isBeta 
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-sm' 
                                    : 'bg-surface-container-high text-on-surface rounded'
                              }`}>Abertura</span>
                            </td>
                            <td className="px-4 py-2.5">Chamado registrado pelo portal.</td>
                          </tr>
                        )}
                        {realMode && visibleAuditRows.length === 0 && (
                          <tr><td colSpan={4} className={`px-4 py-6 text-center text-sm italic ${isAlpha ? 'text-zinc-500 font-mono' : 'text-on-surface-variant'}`}>Sem registros de auditoria.</td></tr>
                        )}
                        {visibleAuditRows.map(h => (
                          <tr key={h.id} className={`text-sm ${
                            isAlpha 
                              ? 'text-zinc-300 hover:bg-zinc-800/30 border-b border-zinc-900' 
                              : isBeta 
                                ? 'text-zinc-700 hover:bg-zinc-50 border-b border-zinc-100' 
                                : 'text-on-surface hover:bg-surface-container/30 border-b border-outline-variant'
                          }`}>
                            <td className="px-4 py-2.5 font-medium">{h.changed_by_name}</td>
                            <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${isAlpha ? 'text-zinc-500 font-mono' : 'text-on-surface-variant'}`}>{fmt(h.created_at)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 ${
                                isAlpha ? 'font-mono rounded-lg' : isBeta ? 'rounded-sm' : 'rounded'
                              } ${
                                isOpeningHistory(h.field_name)
                                  ? isAlpha
                                    ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/30'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                                  : h.field_name === 'comment'
                                    ? isAlpha
                                      ? 'bg-cyan-950/20 text-cyan-400 border border-cyan-800/30'
                                      : 'bg-blue-50 text-medical-blue border border-blue-100'
                                    : h.field_name === 'Início de Atendimento'
                                      ? isAlpha
                                        ? 'bg-sky-950/20 text-sky-400 border border-sky-800/30'
                                        : 'bg-sky-50 text-sky-700 border border-sky-100'
                                      : isAlpha
                                        ? 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                                        : 'bg-zinc-50 text-zinc-600 border border-zinc-200'
                              }`}>
                                {historyTypeLabel(h.field_name)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-sm">
                              {isOpeningHistory(h.field_name) || h.field_name === 'Início de Atendimento'
                                ? h.comment
                                : h.field_name === 'comment'
                                  ? h.comment
                                  : <span><b>{h.field_name === 'state' ? 'Estado' : h.field_name}</b>{h.old_value ? <> de <span className="text-error line-through">{h.field_name === 'state' ? translateState(h.old_value) : h.old_value}</span></> : null} para <b className="text-emerald-500">{h.field_name === 'state' ? translateState(h.new_value) : h.new_value}</b></span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              {/* Modal de condução — a barra superior é o único ponto acionável. */}
              {conducaoMode !== 'idle' && (
              <div
                ref={actionDialogRef}
                tabIndex={-1}
                className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-6"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ticket-action-dialog-title"
                onMouseDown={event => {
                  if (event.target === event.currentTarget && !savingConducao) handleCancelEdit()
                }}
              >
                <div className="relative w-full max-w-2xl max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl">
                  <h2 id="ticket-action-dialog-title" className="sr-only">Ação do chamado</h2>
                  <button
                    type="button"
                    aria-label="Fechar"
                    disabled={savingConducao}
                    onClick={handleCancelEdit}
                    className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>

                {/* MODO ATUALIZAÇÃO */}
                {canEdit && (conducaoMode === 'update' || conducaoMode === 'pending') && (
                  <div className={`${cardClass} overflow-hidden`}>
                    <div className="px-5 py-4 border-b border-outline-variant bg-surface-container/30 flex items-center gap-2">
                      {conducaoMode === 'pending' ? <Pause className="w-4 h-4 text-amber-500" /> : <Edit3 className="w-4 h-4 text-primary" />}
                      <h2 className="text-sm font-bold text-on-surface">{conducaoMode === 'pending' ? 'Colocar em pendência' : 'Atualizar chamado'}</h2>
                    </div>

                    <div className="p-5 space-y-5">
                      {/* Seletor de Visibilidade (Abas) */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">
                          Visibilidade da Mensagem
                        </label>
                        <div className="flex p-0.5 w-full border bg-surface-container border-outline-variant rounded-lg">
                          <button type="button" onClick={() => setIsInternal(false)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${!isInternal ? 'bg-primary text-on-primary rounded-md shadow-sm' : 'text-on-surface-variant hover:text-on-surface bg-transparent'}`}>
                            <User className="w-3.5 h-3.5" /> Cliente
                          </button>
                          <button type="button" onClick={() => setIsInternal(true)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${isInternal ? 'bg-amber-500 text-white rounded-md shadow-sm' : 'text-on-surface-variant hover:text-on-surface bg-transparent'}`}>
                            <Lock className="w-3.5 h-3.5" /> Interno
                          </button>
                        </div>
                      </div>

                      {/* Mensagem */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">
                          {conducaoMode === 'pending' ? <>Justificativa da pendência <span className="text-error">*</span></> : 'Mensagem / Ação'}
                        </label>
                        {responseMacros.length > 0 && (
                          <select defaultValue="" onChange={e => { applyResponseMacro(e.target.value); e.currentTarget.value = '' }}
                            className={`w-full px-2.5 py-2 mb-2 text-xs outline-none cursor-pointer font-medium ${inputClass}`}>
                            <option value="">⚡ Inserir resposta pronta…</option>
                            {responseMacros
                              .filter(macro => macro.visibility === 'both' || (isInternal ? macro.visibility === 'internal' : macro.visibility === 'public'))
                              .map(macro => <option key={macro.id} value={macro.id}>{macro.name}</option>)}
                          </select>
                        )}
                        <textarea rows={3} value={formComment} onChange={e => setFormComment(e.target.value)}
                          placeholder={conducaoMode === 'pending' ? 'Explique por que o chamado ficará pendente...' : isInternal ? 'Anotações técnicas internas (oculto para o cliente)...' : 'Escreva sua resposta ou orientação para o cliente...'}
                          className={`w-full p-3 text-xs outline-none resize-none transition-all ${inputClass}`} />
                      </div>

                      {/* Estado — SEM Resolvido/Fechado (use o botão Resolver para isso) */}
                      <div className="space-y-4">
                        {conducaoMode === 'update' && <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">
                            Estado (Status)
                          </label>
                          <select value={formState} onChange={e => setFormState(e.target.value)}
                            className={`w-full px-2.5 py-2 text-xs outline-none cursor-pointer font-medium ${inputClass}`}>
                            {(isAdmin ? ['New', 'In Progress', 'On Hold', 'Resolved', 'Closed'] : ['New', 'In Progress']).map(value => (
                                <option key={value} value={value}>{translateState(value)}</option>
                              ))}
                          </select>
                          <p className="text-[10px] text-on-surface-variant mt-1">Para resolver o chamado, use o botão <b>Resolver Chamado</b>.</p>
                        </div>}

                        {/* Motivo da Pendência */}
                        {conducaoMode === 'pending' && (
                          <div className="border-t pt-4 space-y-2 border-outline-variant">
                            <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                              Motivo da Pendência <span className="text-error">*</span>
                            </label>
                            <select value={formPendingReasonId} onChange={e => setFormPendingReasonId(e.target.value)}
                              className="w-full px-2.5 py-2 text-xs font-medium outline-none cursor-pointer bg-amber-500/10 border border-amber-500/25 text-amber-500 rounded-xl focus:ring-2 focus:ring-amber-500">
                              <option value="">Selecione o motivo…</option>
                              {pendingReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                            {(() => {
                              const sel = pendingReasons.find(r => r.id === formPendingReasonId)
                              return sel ? (
                                <p className="text-[10px] text-amber-500 flex items-start gap-1.5 leading-normal">
                                  <Pause className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span>{sel.requires_customer_action ? 'Aguarda ação do cliente — SLA pausado.' : 'Pendência interna — SLA pausado.'}</span>
                                </p>
                              ) : null
                            })()}
                            {pendingReasons.length === 0 && (
                              <p className="text-[10px] text-error font-medium">Nenhum motivo cadastrado. Configure em Governança de SLA.</p>
                            )}
                            <p className="text-[10px] leading-relaxed text-amber-600">
                              Ao confirmar, o chamado ficará em pendência e os cronômetros de SLA serão pausados conforme a política configurada.
                            </p>
                          </div>
                        )}

                        {/* Grupo / Analista */}
                        {conducaoMode === 'update' && <>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">Grupo Solucionador</label>
                          {loadingGroups ? (
                            <div className="text-xs py-2 animate-pulse text-on-surface-variant">Carregando grupos...</div>
                          ) : (
                            <select value={formGroupId} onChange={e => { const id = e.target.value; setFormGroupId(id); if (id !== (detail?.assignment_group_id || detail?.assigned_group_id || '')) setFormAssigneeId('') }}
                              className={`w-full px-2.5 py-2 text-xs outline-none cursor-pointer font-medium ${inputClass}`}>
                              <option value="">Nenhum grupo atribuído</option>
                              {activeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">Analista Responsável</label>
                          <select disabled={!formGroupId && !detail?.assigned_to_id} value={formAssigneeId} onChange={e => setFormAssigneeId(e.target.value)}
                            className={`w-full px-2.5 py-2 text-xs outline-none cursor-pointer font-medium disabled:opacity-50 disabled:cursor-not-allowed ${inputClass}`}>
                            {!formGroupId && !detail?.assigned_to_id ? (
                              <option value="">Selecione um grupo primeiro</option>
                            ) : (
                              <>
                                <option value="">Não atribuído</option>
                                {detail?.assigned_to_id && !groupMembers.some(m => m.id === detail.assigned_to_id) && (
                                  <option value={detail.assigned_to_id}>{detail.assigned_to_name || 'Analista atual'}</option>
                                )}
                                {groupMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </>
                            )}
                          </select>
                        </div>
                        </>}
                      </div>

                      {/* Impacto / Urgência / Prioridade */}
                      {conducaoMode === 'update' && (
                      <div className="space-y-4 pt-3 border-t border-outline-variant">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">Impacto — Quem é afetado?</label>
                          <select value={formImpact} onChange={e => setFormImpact(e.target.value)} className={`w-full px-2.5 py-2 text-xs outline-none cursor-pointer font-medium ${inputClass}`}>
                            {IMPACT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">Urgência — Impacto no trabalho?</label>
                          <select value={formUrgency} onChange={e => setFormUrgency(e.target.value)} className={`w-full px-2.5 py-2 text-xs outline-none cursor-pointer font-medium ${inputClass}`}>
                            {URGENCY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-on-surface-variant">Prioridade (Calculada)</label>
                          <div className="py-2.5 flex items-center px-3 text-xs font-bold shadow-inner bg-surface-container border border-outline-variant text-primary rounded-xl">
                            {priorityString(formImpact, formUrgency)}
                          </div>
                        </div>
                      </div>
                      )}

                      {/* Rodapé */}
                      <div className="flex gap-2 pt-3 border-t border-outline-variant justify-end">
                        <button type="button" onClick={handleCancelEdit} className={`px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${buttonSecondaryClass}`}>
                          Cancelar
                        </button>
                        <button type="button" disabled={savingConducao} onClick={handleGravarConducao}
                          className={`px-4 py-2 font-bold text-xs shadow transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer ${buttonPrimaryClass}`}>
                          <Send className="w-3.5 h-3.5" />
                          {savingConducao ? 'Salvando…' : conducaoMode === 'pending' ? 'Confirmar pendência' : 'Salvar atualização'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODO RESOLUÇÃO */}
                {/* Fase 18 — Motor de Resolução Estruturada (ITIL v4): substitui o
                    painel inline de close_code/close_notes por um modal com os
                    códigos de resolução padronizados + kb_candidate. */}
                {canEdit && (
                  <ResolutionModal
                    open={conducaoMode === 'resolve'}
                    ticketLabel={ticket.id}
                    onClose={handleCancelEdit}
                    onConfirm={handleResolveStructured}
                  />
                )}

                {/* MODO PRIMEIRO ATENDIMENTO */}
                {canEdit && conducaoMode === 'start' && (
                  <div className={`${cardClass} overflow-hidden`}>
                    <div className="px-5 py-4 border-b border-primary/20 bg-primary/5 flex items-center gap-2">
                      <PlayCircle className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-bold text-primary">Iniciar Atendimento</h2>
                      <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">SLA Resposta → registrado agora</span>
                    </div>

                    <div className="p-5 space-y-4">
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        Ao confirmar, o <b>SLA de resposta</b> será registrado no momento atual e o estado do chamado mudará para <b>Em Andamento</b>.
                      </p>

                      {/* Primeira mensagem ao cliente (opcional) */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-on-surface-variant">
                          Primeira Resposta ao Cliente <span className="text-on-surface-variant font-normal">(opcional)</span>
                        </label>
                        <textarea rows={4} value={formComment} onChange={e => setFormComment(e.target.value)}
                          placeholder="Escreva aqui a primeira resposta/orientação ao cliente. Ex: Recebemos seu chamado e já estamos investigando..."
                          className={`w-full p-3 text-xs outline-none resize-none transition-all ${inputClass}`} />
                        <p className="text-[10px] text-on-surface-variant mt-1">Deixe em branco para apenas registrar o início do atendimento sem enviar mensagem.</p>
                      </div>

                      {/* Rodapé */}
                      <div className="flex gap-2 pt-3 border-t border-outline-variant justify-end">
                        <button type="button" onClick={handleCancelEdit} className={`px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${buttonSecondaryClass}`}>
                          Cancelar
                        </button>
                        <button type="button" disabled={savingConducao} onClick={handleStartAtendimento}
                          className="px-4 py-2 font-bold text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer rounded-lg bg-primary text-on-primary hover:opacity-90">
                          <PlayCircle className="w-3.5 h-3.5" />
                          {savingConducao ? 'Iniciando…' : 'Iniciar Atendimento'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODO TRANSFERÊNCIA */}
                {canEdit && conducaoMode === 'transfer' && (
                  <div className={`${cardClass} overflow-hidden`}>
                    <div className="px-5 py-4 border-b border-outline-variant bg-surface-container/30 flex items-center gap-2">
                      <ArrowRightLeft className="w-4 h-4 text-on-surface-variant" />
                      <h2 className="text-sm font-bold text-on-surface">Transferir Chamado</h2>
                    </div>

                    <div className="p-5 space-y-4">
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        Redirecione o chamado para outro grupo ou analista. Uma nota interna será registrada automaticamente.
                      </p>

                      {/* Grupo Solucionador */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-on-surface-variant">
                          Grupo Solucionador <span className="text-error">*</span>
                        </label>
                        {loadingGroups ? (
                          <div className="text-xs py-2 animate-pulse text-on-surface-variant">Carregando grupos...</div>
                        ) : (
                          <select value={formGroupId}
                            onChange={e => { const id = e.target.value; setFormGroupId(id); if (id !== (detail?.assignment_group_id || detail?.assigned_group_id || '')) setFormAssigneeId('') }}
                            className={`w-full px-2.5 py-2 text-xs outline-none cursor-pointer font-medium ${inputClass}`}>
                            <option value="">Selecione o grupo destino…</option>
                            {activeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        )}
                      </div>

                      {/* Analista Responsável */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-on-surface-variant">
                          Analista Responsável <span className="text-on-surface-variant font-normal">(opcional)</span>
                        </label>
                        <select disabled={!formGroupId} value={formAssigneeId} onChange={e => setFormAssigneeId(e.target.value)}
                          className={`w-full px-2.5 py-2 text-xs outline-none cursor-pointer font-medium disabled:opacity-50 disabled:cursor-not-allowed ${inputClass}`}>
                          {!formGroupId ? (
                            <option value="">Selecione um grupo primeiro</option>
                          ) : (
                            <>
                              <option value="">Não atribuído</option>
                              {groupMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </>
                          )}
                        </select>
                      </div>

                      {/* Motivo da transferência */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-on-surface-variant">
                          Motivo da Transferência <span className="text-on-surface-variant font-normal">(opcional)</span>
                        </label>
                        <textarea rows={2} value={formComment} onChange={e => setFormComment(e.target.value)}
                          placeholder="Informe o motivo da transferência (nota interna — não visível ao cliente)..."
                          className={`w-full p-3 text-xs outline-none resize-none transition-all ${inputClass}`} />
                      </div>

                      {/* Rodapé */}
                      <div className="flex gap-2 pt-3 border-t border-outline-variant justify-end">
                        <button type="button" onClick={handleCancelEdit} className={`px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${buttonSecondaryClass}`}>
                          Cancelar
                        </button>
                        <button type="button" disabled={savingConducao} onClick={handleTransfer}
                          className={`px-4 py-2 font-bold text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer ${buttonPrimaryClass}`}>
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          {savingConducao ? 'Transferindo…' : 'Confirmar Transferência'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODO REABERTURA */}
                {canAct && conducaoMode === 'reopen' && (
                  <div className={`${cardClass} overflow-hidden`}>
                    <div className="px-5 py-4 border-b border-primary/20 bg-primary/5 flex items-center gap-2">
                      <PlayCircle className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-bold text-primary">Reabrir Chamado</h2>
                    </div>

                    <div className="p-5 space-y-4">
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        O chamado voltará para <b>Em Andamento</b>. Informe o motivo da reabertura.
                      </p>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-on-surface-variant">
                          Motivo da Reabertura <span className="text-on-surface-variant font-normal">(opcional)</span>
                        </label>
                        <textarea rows={3} value={formComment} onChange={e => setFormComment(e.target.value)}
                          placeholder="Ex: O problema voltou a ocorrer após a solução aplicada..."
                          className={`w-full p-3 text-xs outline-none resize-none transition-all ${inputClass}`} />
                      </div>

                      <div className="flex gap-2 pt-3 border-t border-outline-variant justify-end">
                        <button type="button" onClick={handleCancelEdit} className={`px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${buttonSecondaryClass}`}>
                          Cancelar
                        </button>
                        <button type="button" disabled={savingConducao} onClick={handleReopen}
                          className="px-4 py-2 font-bold text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer rounded-lg border-2 border-primary text-primary hover:bg-primary/5">
                          <PlayCircle className="w-3.5 h-3.5" />
                          {savingConducao ? 'Reabrindo…' : 'Confirmar Reabertura'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-on-surface-variant text-xs justify-center pt-2">
              <Building2 className="w-3.5 h-3.5" /> {company} · {number}
            </div>
          </div>
        </>
      )}

      {kbOpen && (
        <KnowledgeCockpitPanel
          companyId={detail?.company_id ?? ticket.companyId ?? ''}
          caseId={detail?.case_id ?? ticket.caseId ?? null}
          initialQuery={`${title} ${detail?.description ?? ''}`.trim()}
          onInsert={text => setFormComment(prev => (prev.trim() ? `${prev}\n\n${text}` : text))}
          onClose={() => setKbOpen(false)}
        />
      )}
    </div>
  )
}

export default AnalystCockpit
