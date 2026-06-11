import { useState, useEffect, useCallback, useRef } from 'react'
import {
  User, Building2, AlertTriangle, Tag, Users, Send,
  BookOpen, CheckCircle, History, FileText, ListTree, Link2, Lock, Pause, Timer, Edit3,
} from 'lucide-react'
import { incidentsService, messagesService, assignmentGroupsService } from '../lib/services'
import { translateState, STATE_LABELS_PT, PENDING_REASONS } from '../lib/statusLabels'
import { useAuth } from '../auth'
import { useToast } from '../context'
import type { IncidentRow, IncidentHistoryRow, TicketMessageRow, AssignmentGroupRow, ProfileRow } from '../lib/database.types'
import type { WorkspaceTicket } from './workspace.types'

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

function calculatePriority(impact: string, urgency: string): 'P1 - Critical' | 'P2 - High' | 'P3 - Moderate' | 'P4 - Low' {
  if (impact === 'Critical') {
    return (urgency === 'High' || urgency === 'Medium') ? 'P1 - Critical' : 'P2 - High'
  }
  if (impact === 'High') {
    if (urgency === 'High') return 'P1 - Critical'
    if (urgency === 'Medium') return 'P2 - High'
    return 'P3 - Moderate'
  }
  if (impact === 'Medium') {
    if (urgency === 'High') return 'P2 - High'
    if (urgency === 'Medium') return 'P3 - Moderate'
    return 'P4 - Low'
  }
  if (impact === 'Low') {
    if (urgency === 'High') return 'P3 - Moderate'
    return 'P4 - Low'
  }
  return 'P3 - Moderate'
}

const translateImpact = (val: string | null | undefined) => {
  if (val === 'Low') return 'Apenas eu (Low)'
  if (val === 'Medium') return 'Meu departamento (Medium)'
  if (val === 'High') return 'Toda a empresa (High)'
  if (val === 'Critical') return 'O negócio / Clientes (Critical)'
  return val || '—'
}

const translateUrgency = (val: string | null | undefined) => {
  if (val === 'Low') return 'Consigo trabalhar, mas incomoda (Low)'
  if (val === 'Medium') return 'Uma tarefa importante está parada (Medium)'
  if (val === 'High') return 'Estou totalmente travado (High)'
  return val || '—'
}

const AnalystCockpit = ({ ticket = FALLBACK_TICKET }: { ticket?: WorkspaceTicket }) => {
  const { profile } = useAuth()
  const { toast } = useToast()
  const realMode = Boolean(ticket.incidentId && ticket.companyId)
  // God Mode: admin/sysadmin têm passe livre nas travas de governança.
  const isAdmin = Boolean(profile && ['sysadmin', 'company_admin', 'admin'].includes(profile.role))

  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeContext, setActiveContext] = useState<ContextTab>('detalhes')

  // Chat / mensagens
  const [messages, setMessages] = useState<TicketMessageRow[]>([])

  // Ações de estado
  const [stateOverride, setStateOverride] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [closeCode, setCloseCode] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [timeSpent, setTimeSpent] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Assignment groups & members states
  const [activeGroups, setActiveGroups] = useState<AssignmentGroupRow[]>([])
  const [groupMembers, setGroupMembers] = useState<ProfileRow[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)

  // Form states for 'Condução do Chamado'
  const [formComment, setFormComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [formState, setFormState] = useState('')
  const [formGroupId, setFormGroupId] = useState('')
  const [formAssigneeId, setFormAssigneeId] = useState('')
  const [formImpact, setFormImpact] = useState('Low')
  const [formUrgency, setFormUrgency] = useState('Low')
  const [formPendingReason, setFormPendingReason] = useState('')
  const [savingConducao, setSavingConducao] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

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

  // Sync form states when detail loads
  useEffect(() => {
    if (detail) {
      setFormState(detail.state || '')
      setFormGroupId(detail.assignment_group_id || detail.assigned_group_id || '')
      setFormAssigneeId(detail.assigned_to_id || '')
      setFormImpact(detail.impact || 'Low')
      setFormUrgency(detail.urgency || 'Low')
      setFormPendingReason(detail.pending_reason || '')
      setIsEditing(false)
    }
  }, [detail])

  // Sync form state when stateOverride changes
  useEffect(() => {
    if (stateOverride) {
      setFormState(stateOverride)
    }
  }, [stateOverride])

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

  const handleStartService = useCallback(async () => {
    if (!ticket.incidentId || !ticket.companyId || !profile) return
    setAssigning(true); setActionMsg(null)
    try {
      const updated = await incidentsService.startService(ticket.incidentId, ticket.companyId)
      setDetail(current => current ? { ...current, ...updated } : current)
      setStateOverride('In Progress')
      setFormState('In Progress')
      setFormAssigneeId(updated.assigned_to_id || profile.id)
      setFormGroupId(updated.assignment_group_id || updated.assigned_group_id || '')
      const msg = 'Atendimento iniciado e SLA de resposta registrado.'
      setActionMsg(msg)
      toast.success(msg)
      refreshIncident()
      refreshMessages()
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Falha ao iniciar atendimento.'
      setActionMsg(errMsg)
      toast.error(`Erro ao iniciar atendimento: ${errMsg}`)
    } finally {
      setAssigning(false)
    }
  }, [ticket.incidentId, ticket.companyId, profile, toast, refreshIncident, refreshMessages])

  const openEditForm = useCallback(() => {
    if (detail) {
      setFormState(detail.state || '')
      setFormGroupId(detail.assignment_group_id || detail.assigned_group_id || '')
      setFormAssigneeId(detail.assigned_to_id || '')
      setFormImpact(detail.impact || 'Low')
      setFormUrgency(detail.urgency || 'Low')
      setFormPendingReason(detail.pending_reason || '')
      setFormComment('')
      setCloseCode(detail.close_code || '')
      setCloseNotes(detail.close_notes || '')
    }
    setError(null)
    setActionMsg(null)
    setIsEditing(true)
    setActiveContext('detalhes')
  }, [detail])


  // Atalho "Pendente": abre o formulário de condução já com o estado
  // preenchido (Pendente exige Motivo + justificativa obrigatórios).
  const openPendingForm = useCallback(() => {
    setFormState('On Hold')
    setIsEditing(true)
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
      if (!formPendingReason) {
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

      const changes: any = {
        state: formState as any,
        assignment_group_id: formGroupId || null,
        assigned_group_name: selectedGroupName,
        assigned_to_id: formAssigneeId || null,
        assigned_to_name: selectedAssigneeName,
        impact: formImpact,
        urgency: formUrgency,
        priority: calculatePriority(formImpact, formUrgency),
        pending_reason: formState === 'On Hold' ? formPendingReason : null,
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
      setIsEditing(false) // Close editing mode automatically
      refreshIncident()
      refreshMessages()
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Falha ao registrar condução.'
      setError(errMsg)
      toast.error(`Falha no banco de dados: ${errMsg}`)
    } finally {
      setSavingConducao(false)
    }
  }, [ticket.incidentId, ticket.companyId, detail?.company_id, formState, formGroupId, formAssigneeId, formImpact, formUrgency, formPendingReason, formComment, isInternal, activeGroups, groupMembers, closeCode, closeNotes, timeSpent, detail, profile, toast, refreshIncident, refreshMessages, isAdmin])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setError(null)
    setActionMsg(null)
    if (detail) {
      setFormState(detail.state || '')
      setFormGroupId(detail.assignment_group_id || detail.assigned_group_id || '')
      setFormAssigneeId(detail.assigned_to_id || '')
      setFormImpact(detail.impact || 'Low')
      setFormUrgency(detail.urgency || 'Low')
      setFormComment('')
      setCloseCode(detail.close_code || '')
      setCloseNotes(detail.close_notes || '')
    }
  }, [detail])

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
  const formDataEntries = detail?.form_data && typeof detail.form_data === 'object' && !Array.isArray(detail.form_data)
    ? Object.entries(detail.form_data)
    : []
  const auditRows = detail ? detail.history : []
  const isTechnicalUser = profile && ['admin', 'sysadmin', 'analyst', 'agent', 'company_admin'].includes(profile.role)
  const visibleMessages = isTechnicalUser ? messages : messages.filter(m => !m.is_internal)
  const visibleAuditRows = isTechnicalUser ? auditRows : auditRows.filter(h => h.is_public)
  const canAct = realMode && Boolean(profile)
  const isResolved = status === 'Resolved' || status === 'Closed'
  // Edição liberada quando NÃO encerrado — OU sempre, se for admin (override).
  const canEdit = canAct && (!isResolved || isAdmin)


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
              <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0">{translateState(status)}</span>
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
            {isResolved && !isAdmin ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-bold rounded-lg">
                <Lock className="w-4 h-4" /> Somente leitura · {translateState(status)}
              </span>
            ) : (
              <>
                {isResolved && isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-2 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold rounded-lg" title="Override administrativo ativo">
                    <Lock className="w-3.5 h-3.5" /> God Mode
                  </span>
                )}
                {canEdit && !isEditing && (
                  <button
                    onClick={openEditForm}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
                  >
                    <Edit3 className="w-4 h-4" /> Atualizar Chamado
                  </button>
                )}
                {canEdit && isEditing && (
                  <button
                    onClick={handleCancelEdit}
                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={handleStartService}
                  disabled={!canEdit || assigning || Boolean(detail?.responded_at)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> {assigning ? 'Iniciando…' : detail?.responded_at ? 'Atendimento iniciado' : 'Iniciar Atendimento'}
                </button>
                <button
                  onClick={openPendingForm}
                  disabled={!canEdit || status === 'On Hold'}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors"
                >
                  <Pause className="w-4 h-4" /> <span className="hidden lg:inline">Pendente</span>
                </button>
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
                  <Field label="Impacto" value={translateImpact(detail?.impact)} />
                  <Field label="Urgência" value={translateUrgency(detail?.urgency)} />
                  <Field label="Estado" value={translateState(status)} />
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

            {/* CENTRAL DE CONDUÇÃO DO CHAMADO */}
            {/* CENTRAL DE CONDUÇÃO DO CHAMADO */}
            {canEdit && (
              isEditing ? (
                <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Send className="w-5 h-5 text-indigo-600" />
                      <h2 className="text-lg font-bold text-slate-900">Condução do Chamado</h2>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">Atualização unificada do chamado</span>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Seletor de Visibilidade (Abas) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Visibilidade da Mensagem</label>
                      <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setIsInternal(false)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            !isInternal
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-800 bg-transparent'
                          }`}
                        >
                          <User className="w-4 h-4" /> Responder ao Cliente
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsInternal(true)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            isInternal
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-800 bg-transparent'
                          }`}
                        >
                          <Lock className="w-4 h-4" /> Nota Interna
                        </button>
                      </div>
                    </div>

                    {/* Campo de Texto */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Mensagem / Ação</label>
                      <textarea
                        rows={4}
                        value={formComment}
                        onChange={e => setFormComment(e.target.value)}
                        placeholder={
                          isInternal
                            ? 'Descreva detalhes técnicos ou anotações internas (oculto para o cliente)...'
                            : 'Escreva sua resposta ou orientação para o cliente...'
                        }
                        className="w-full border border-slate-200 rounded-xl p-3.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-all"
                      />
                    </div>

                    {/* Campos de Controle Integrados */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                      {/* Dropdown Estado */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Estado (Status)</label>
                        <select
                          value={formState}
                          onChange={e => setFormState(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer text-slate-700 font-medium"
                        >
                          {Object.entries(STATE_LABELS_PT)
                            .filter(([value]) => value !== 'Pending User')        // legado, substituído por Pendente + motivo
                            .filter(([value]) => value !== 'Closed' || isAdmin)   // Fechado só para admin
                            .map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                      </div>

                      {/* Dropdown Grupo Solucionador */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Grupo Solucionador</label>
                        {loadingGroups ? (
                          <div className="text-sm text-slate-400 py-2.5 animate-pulse">Carregando grupos...</div>
                        ) : (
                          <select
                            value={formGroupId}
                            onChange={e => {
                              const newGroupId = e.target.value
                              setFormGroupId(newGroupId)
                              // Limpeza de Responsável ao Transferir Grupo
                              if (newGroupId !== (detail?.assignment_group_id || detail?.assigned_group_id || '')) {
                                setFormAssigneeId('')
                              }
                            }}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer text-slate-700 font-medium"
                          >
                            <option value="">Nenhum grupo atribuído</option>
                            {activeGroups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Dropdown Analista Responsável */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Analista Responsável</label>
                        <select
                          disabled={!formGroupId && !detail?.assigned_to_id}
                          value={formAssigneeId}
                          onChange={e => setFormAssigneeId(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer text-slate-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {!formGroupId && !detail?.assigned_to_id ? (
                            <option value="">Selecione um grupo primeiro</option>
                          ) : (
                            <>
                              <option value="">Não atribuído</option>
                              {detail?.assigned_to_id && !groupMembers.some(member => member.id === detail.assigned_to_id) && (
                                <option value={detail.assigned_to_id}>{detail.assigned_to_name || 'Analista atual'}</option>
                              )}
                              {groupMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Priorização Automática ITIL */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-100 mt-2">
                      {/* Dropdown Impacto */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Impacto</label>
                        <select
                          value={formImpact}
                          onChange={e => setFormImpact(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer text-slate-700 font-medium"
                        >
                          <option value="Low">Apenas eu (Low)</option>
                          <option value="Medium">Meu departamento (Medium)</option>
                          <option value="High">Toda a empresa (High)</option>
                          <option value="Critical">O negócio / Clientes (Critical)</option>
                        </select>
                      </div>

                      {/* Dropdown Urgência */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Urgência</label>
                        <select
                          value={formUrgency}
                          onChange={e => setFormUrgency(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer text-slate-700 font-medium"
                        >
                          <option value="Low">Consigo trabalhar (Low)</option>
                          <option value="Medium">Tarefa importante parada (Medium)</option>
                          <option value="High">Totalmente travado (High)</option>
                        </select>
                      </div>

                      {/* Prioridade Final Calculada */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Prioridade (Calculada)</label>
                        <div className="h-[42px] flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-bold text-indigo-700 shadow-inner">
                          {calculatePriority(formImpact, formUrgency)}
                        </div>
                      </div>
                    </div>

                    {/* Motivo da Pendência (obrigatório quando Pendente) */}
                    {formState === 'On Hold' && (
                      <div className="border-t border-slate-100 pt-5">
                        <label className="block text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">
                          Motivo da Pendência <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formPendingReason}
                          onChange={e => setFormPendingReason(e.target.value)}
                          className="w-full md:w-1/2 border border-amber-200 bg-amber-50 rounded-xl px-3 py-2.5 text-sm text-amber-900 font-medium outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                        >
                          <option value="">Selecione o motivo…</option>
                          {PENDING_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <p className="text-[11px] text-amber-600 mt-1.5">Ao deixar Pendente, é obrigatório informar o motivo e uma mensagem/justificativa.</p>
                      </div>
                    )}

                    {/* Campos de Resolução Condicionais */}
                    {(formState === 'Resolved' || formState === 'Closed') && (
                      <div className="border-t border-slate-100 pt-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Dados de Resolução do Chamado</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Código de Encerramento <span className="text-red-500">*</span></label>
                            <select
                              value={closeCode}
                              onChange={e => setCloseCode(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer text-slate-700 font-medium"
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
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tempo Gasto</label>
                            <input
                              value={timeSpent}
                              onChange={e => setTimeSpent(e.target.value)}
                              type="text"
                              placeholder="ex: 1h 30m"
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Notas de Resolução <span className="text-red-500">*</span></label>
                          <textarea
                            rows={3}
                            value={closeNotes}
                            onChange={e => setCloseNotes(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-3.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-all text-slate-700"
                            placeholder="Descreva a solução aplicada (visível ao cliente)..."
                          />
                        </div>
                      </div>
                    )}

                    {/* Ação Gravar Condução */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={savingConducao}
                        onClick={handleGravarConducao}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        {savingConducao ? 'Gravando…' : 'Gravar Condução'}
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">Atualização do Chamado</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Clique em "Atualizar Chamado" para responder ao cliente ou alterar a equipe e o estado.</p>
                    </div>
                  </div>
                  <button
                    onClick={openEditForm}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Edit3 className="w-4 h-4" /> Atualizar Chamado
                  </button>
                </section>
              )
            )}

            {/* DESCRIÇÃO E CHAT */}
            <section>
              <SectionTitle icon={<FileText className="w-5 h-5" />} title="Descrição & Conversa" />
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-5">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Descrição Original</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{description}</p>
                </div>

                {formDataEntries.length > 0 && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-indigo-500">Dados do Formulário Customizado</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {formDataEntries.map(([label, value]) => (
                        <Field key={label} label={label} value={formatFormValue(value)} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {visibleMessages.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Nenhuma mensagem ainda.</p>}
                  {visibleMessages.map(m => (
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
                    <div className="p-6 text-center text-slate-400 text-sm">
                      <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                      O chamado ainda não foi resolvido.
                      <p className="text-xs text-slate-400 mt-1">Para resolvê-lo, clique no botão <b>"Atualizar Chamado"</b> no topo ou no painel principal e altere o Estado para <b>"Resolvido"</b>.</p>
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
                      {realMode && visibleAuditRows.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">Sem registros de auditoria.</td></tr>
                      )}
                      {visibleAuditRows.map(h => (
                        <tr key={h.id} className="text-slate-600 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium">{h.changed_by_name}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">{fmt(h.created_at)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              isOpeningHistory(h.field_name)
                                ? 'bg-emerald-50 text-emerald-700'
                                : h.field_name === 'comment'
                                  ? 'bg-indigo-50 text-indigo-600'
                                  : h.field_name === 'Início de Atendimento'
                                    ? 'bg-sky-50 text-sky-700'
                                    : 'bg-slate-100 text-slate-600'
                            }`}>
                              {historyTypeLabel(h.field_name)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {isOpeningHistory(h.field_name) || h.field_name === 'Início de Atendimento'
                              ? h.comment
                              : h.field_name === 'comment'
                              ? h.comment
                              : <span><b>{h.field_name === 'state' ? 'Estado' : h.field_name}</b>{h.old_value ? <> de <span className="text-red-500 line-through">{h.field_name === 'state' ? translateState(h.old_value) : h.old_value}</span></> : null} para <b className="text-emerald-600">{h.field_name === 'state' ? translateState(h.new_value) : h.new_value}</b></span>}
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
