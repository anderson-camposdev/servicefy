// ============================================================
// ServiceFY ITSM — Workflow Builder v2 (Motor de Automação)
// Conectado ao banco: workflow_rules / workflow_execution_log
// via workflowService (src/lib/services.ts). O motor de execução
// real roda em Postgres (migrations 055-060) — esta UI só edita
// as regras e mostra o histórico real.
// ============================================================

import { useState, useEffect } from 'react'
import {
  Zap, PlayCircle, Plus, ChevronDown, ChevronUp, Search,
  ArrowDown, Bell, Users, AlertTriangle, Mail, RefreshCw,
  Save, Check, Tag, ShieldAlert, X, GitBranch,
  CheckCircle, Pencil, Copy, Trash2, Clock, Settings2,
  History, Code2, Globe, AlarmClock, AlertCircle,
  GripVertical, Layers, Calendar, ChevronRight,
  Monitor, SlidersHorizontal, Loader2, Ticket
} from 'lucide-react'
import { workflowService } from '../lib/services'
import type { WorkflowRuleRow, WorkflowExecutionLogRow } from '../lib/database.types'
import { translateState } from '../lib/statusLabels'
import { evaluateWorkflowQuality, getDefaultWorkflowActionParams } from '../lib/workflow-quality'

// ─── Types ────────────────────────────────────────────────────

type LogicOp = 'AND' | 'OR'
type MainTab = 'config' | 'history' | 'variables'
type TestStatus = 'waiting' | 'running' | 'success' | 'fail'
type TicketSource = 'any' | 'portal' | 'email' | 'api'
type ActualSource = 'portal' | 'email' | 'api'
type TicketTypeScope = 'incident' | 'request'

interface ConditionRow { id: string; field: string; operator: string; value: string; logicOp: LogicOp }
interface ActionRow    { id: string; type: string; params: Record<string, string> }

interface Workflow {
  id: string; name: string; description: string; enabled: boolean
  ticketType: TicketTypeScope
  triggerEvent: string; triggerSource: TicketSource
  scheduleConfig?: { frequency: string; time: string }
  conditions: ConditionRow[]; actions: ActionRow[]
  runsCount: number; lastRun: string; successRate: number
}

interface ExecutionLog {
  id: string; timestamp: string
  status: 'success' | 'error' | 'skipped' | 'partial'
  ticketNumber: string; duration: string; detail: string
}

interface Template {
  id: string; name: string; description: string; emoji: string
  triggerEvent: string; triggerSource: TicketSource
  conditions: Omit<ConditionRow, 'id'>[]; actions: Omit<ActionRow, 'id'>[]
}

interface TestStep { label: string; detail: string; status: TestStatus }

// ─── Constants ────────────────────────────────────────────────

const TICKET_SOURCES = [
  { value: 'any'    as TicketSource, label: 'Qualquer Origem', desc: 'Portal, e-mail ou API', Icon: Zap },
  { value: 'portal' as TicketSource, label: 'Via Portal',       desc: 'Abertura pelo usuário', Icon: Monitor },
  { value: 'email'  as TicketSource, label: 'Via E-mail',       desc: 'Inbound e-mail / IMAP', Icon: Mail },
  { value: 'api'    as TicketSource, label: 'Via API',           desc: 'Integração direta',     Icon: Code2 },
]

const TRIGGER_EVENTS = [
  { value: 'incident_created',  label: 'Chamado criado',          emoji: '📥', hasSource: true  },
  { value: 'incident_updated',  label: 'Chamado atualizado',      emoji: '✏️',  hasSource: false },
  { value: 'incident_resolved', label: 'Chamado resolvido',       emoji: '✅', hasSource: false },
  { value: 'incident_closed',   label: 'Chamado fechado',         emoji: '🔒', hasSource: false },
  { value: 'sla_warning',       label: 'Alerta de SLA (<30min)', emoji: '⚠️',  hasSource: false },
  { value: 'sla_breached',      label: 'SLA violado',             emoji: '🚨', hasSource: false },
  { value: 'comment_added',     label: 'Comentário adicionado',   emoji: '💬', hasSource: false },
  { value: 'scheduled',         label: 'Agendamento (cron)',       emoji: '📅', hasSource: false },
]

const CONDITION_FIELDS = [
  { value: 'priority',    label: 'Prioridade' },
  { value: 'category',   label: 'Categoria' },
  { value: 'state',      label: 'Estado' },
  { value: 'group',      label: 'Grupo Atribuído' },
  { value: 'department', label: 'Departamento' },
  { value: 'idle_hours', label: 'Horas sem atualização' },
]

const OPERATORS = [
  { value: 'equals',       label: 'é igual a' },
  { value: 'not_equals',   label: 'é diferente de' },
  { value: 'contains',     label: 'contém' },
  { value: 'greater_than', label: 'maior que' },
  { value: 'less_than',    label: 'menor que' },
]

const ACTION_TYPES = [
  { value: 'assign_group',      label: 'Atribuir ao Grupo',     Icon: Users,             color: 'text-blue-600 bg-blue-50   border-blue-100' },
  { value: 'change_priority',   label: 'Alterar Prioridade',    Icon: AlertTriangle,     color: 'text-orange-600 bg-orange-50 border-orange-100' },
  { value: 'change_state',      label: 'Alterar Estado',        Icon: RefreshCw,         color: 'text-purple-600 bg-purple-50 border-purple-100' },
  { value: 'set_field',         label: 'Definir Campo',         Icon: SlidersHorizontal, color: 'text-violet-600 bg-violet-50 border-violet-100' },
  { value: 'send_email',        label: 'Enviar E-mail',         Icon: Mail,              color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  { value: 'send_notification', label: 'Notificação no Portal', Icon: Bell,              color: 'text-cyan-600 bg-cyan-50   border-cyan-100' },
  { value: 'add_tag',           label: 'Adicionar Tag',         Icon: Tag,               color: 'text-pink-600 bg-pink-50   border-pink-100' },
  { value: 'escalate',          label: 'Escalar Chamado',       Icon: ShieldAlert,       color: 'text-red-600 bg-red-50     border-red-100' },
  { value: 'delay',             label: 'Aguardar (Delay)',      Icon: AlarmClock,        color: 'text-amber-600 bg-amber-50  border-amber-100' },
  { value: 'webhook',           label: 'Chamar Webhook',        Icon: Globe,             color: 'text-teal-600 bg-teal-50   border-teal-100' },
]

const TEMPLATES: Template[] = [
  {
    id: 't1', name: 'Escalonamento P1', emoji: '🚨',
    description: 'Atribui e notifica gestores em chamados críticos de qualquer origem',
    triggerEvent: 'incident_created', triggerSource: 'any',
    conditions: [{ field: 'priority', operator: 'equals', value: 'P1 - Critical', logicOp: 'AND' }],
    actions: [
      { type: 'assign_group', params: { group: 'Plantão TI' } },
      { type: 'send_email', params: { recipients: 'gestores@empresa.com', template: 'critical_alert' } },
      { type: 'escalate', params: { level: '2' } },
    ],
  },
  {
    id: 't2', name: 'Triagem de E-mail', emoji: '✉️',
    description: 'Categoriza e responde automaticamente chamados abertos via e-mail',
    triggerEvent: 'incident_created', triggerSource: 'email',
    conditions: [],
    actions: [
      { type: 'set_field', params: { field: 'category', value: 'Triagem' } },
      { type: 'set_field', params: { field: 'priority', value: 'P3 - Moderate' } },
      { type: 'send_email', params: { recipients: '{{usuario.email}}', template: 'email_received_ack' } },
      { type: 'assign_group', params: { group: 'Triagem N1' } },
    ],
  },
  {
    id: 't3', name: 'Confirmação Portal', emoji: '🖥️',
    description: 'Notifica e define campos padrão para chamados abertos pelo portal',
    triggerEvent: 'incident_created', triggerSource: 'portal',
    conditions: [],
    actions: [
      { type: 'send_notification', params: { message: 'Seu chamado {{chamado.numero}} foi registrado com sucesso!' } },
    ],
  },
  {
    id: 't4', name: 'Alerta de SLA', emoji: '⚠️',
    description: 'Notifica e escala quando SLA está prestes a vencer',
    triggerEvent: 'sla_warning', triggerSource: 'any',
    conditions: [],
    actions: [
      { type: 'send_notification', params: { message: 'SLA próximo de vencer! Ação urgente.' } },
      { type: 'escalate', params: { level: 'manager' } },
    ],
  },
  {
    id: 't5', name: 'Integração via API', emoji: '⚙️',
    description: 'Processa e tagueia chamados criados via API de integração',
    triggerEvent: 'incident_created', triggerSource: 'api',
    conditions: [],
    actions: [
      { type: 'add_tag', params: { tag: 'api-integration' } },
      { type: 'webhook', params: { url: 'https://hooks.empresa.com/tickets', method: 'POST' } },
    ],
  },
  {
    id: 't6', name: 'Relatório Diário', emoji: '📊',
    description: 'Envia relatório de chamados abertos todo dia às 8h',
    triggerEvent: 'scheduled', triggerSource: 'any',
    conditions: [],
    actions: [
      { type: 'send_email', params: { recipients: 'gestao@empresa.com', template: 'daily_report' } },
    ],
  },
]

const VARIABLES_GROUPS = [
  { label: 'Chamado', icon: '📋', vars: [
    { token: '{{chamado.numero}}',     desc: 'Número do chamado',      example: 'INC0001234' },
    { token: '{{chamado.titulo}}',     desc: 'Título / assunto',       example: 'Impressora não funciona' },
    { token: '{{chamado.prioridade}}', desc: 'Prioridade',             example: 'P1 - Critical' },
    { token: '{{chamado.estado}}',     desc: 'Estado atual',           example: 'Em Atendimento' },
    { token: '{{chamado.categoria}}',  desc: 'Categoria',              example: 'Hardware' },
    { token: '{{chamado.origem}}',     desc: 'Canal de abertura',      example: 'portal / email / api' },
    { token: '{{chamado.url}}',        desc: 'Link direto ao chamado', example: 'https://app.servicefy.com/...' },
  ]},
  { label: 'Solicitante', icon: '👤', vars: [
    { token: '{{usuario.nome}}',         desc: 'Nome completo',  example: 'João Silva' },
    { token: '{{usuario.email}}',        desc: 'E-mail',         example: 'joao@empresa.com' },
    { token: '{{usuario.departamento}}', desc: 'Departamento',   example: 'Financeiro' },
  ]},
  { label: 'Atribuição', icon: '👥', vars: [
    { token: '{{atribuido.nome}}', desc: 'Analista atribuído',   example: 'Ana Costa' },
    { token: '{{grupo.nome}}',     desc: 'Grupo de atendimento', example: 'Suporte N1' },
  ]},
  { label: 'SLA', icon: '⏱️', vars: [
    { token: '{{sla.prazo}}',    desc: 'Prazo de solução',   example: '22/06/2026 18:00' },
    { token: '{{sla.restante}}', desc: 'Tempo restante',      example: '2h 15min' },
    { token: '{{sla.violado}}',  desc: 'SLA violado?',        example: 'Sim / Não' },
  ]},
  { label: 'Data & Hora', icon: '📅', vars: [
    { token: '{{data.hoje}}',  desc: 'Data de hoje', example: '22/06/2026' },
    { token: '{{hora.agora}}', desc: 'Hora atual',   example: '14:32' },
  ]},
]

// ─── Adaptadores banco ↔ UI ────────────────────────────────────
// workflow_rules.conditions/actions são JSONB — carregam exatamente
// o formato que a UI já produzia localmente, então o cast é direto.
// A única normalização necessária é garantir um `id` local em cada
// linha (regras criadas via SQL/seed podem não ter esse campo, que
// só importa para a UI usar como React key).

let _uid = 9000
const genId = () => `g${++_uid}`

const withLocalIds = <T extends { id?: string }>(rows: T[] | null | undefined): (T & { id: string })[] =>
  (rows ?? []).map(r => ({ ...r, id: r.id || genId() }))

function rowToWorkflow(row: WorkflowRuleRow, stats?: { runsCount: number; lastRun: string; successRate: number }): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    enabled: row.active,
    ticketType: (row.ticket_type === 'request' ? 'request' : 'incident'),
    triggerEvent: row.trigger_event,
    triggerSource: row.trigger_source,
    conditions: withLocalIds((row.conditions as any) ?? []),
    actions: withLocalIds<ActionRow>((row.actions as any) ?? []).map(action => ({
      ...action,
      params: { ...getDefaultWorkflowActionParams(action.type), ...action.params },
    })),
    runsCount: stats?.runsCount ?? 0,
    lastRun: stats?.lastRun ?? 'Nunca',
    successRate: stats?.successRate ?? 0,
  }
}

/** Monta o payload de persistência a partir do estado local da UI. */
function workflowToPayload(wf: Workflow, companyId: string): Partial<WorkflowRuleRow> {
  return {
    company_id: companyId,
    ticket_type: wf.ticketType,
    name: wf.name,
    description: wf.description || null,
    trigger_event: wf.triggerEvent,
    trigger_source: wf.triggerSource,
    conditions: wf.conditions as any,
    actions: wf.actions as any,
    active: wf.enabled,
  }
}

/** Calcula runsCount/lastRun/successRate a partir do log real de execução. */
function computeStats(logs: WorkflowExecutionLogRow[]): { runsCount: number; lastRun: string; successRate: number } {
  const matched = logs.filter(l => l.matched)
  if (matched.length === 0) return { runsCount: 0, lastRun: 'Nunca', successRate: 0 }
  const successCount = matched.filter(l => l.status === 'success').length
  const last = matched[0] // já vem ordenado desc por created_at
  return {
    runsCount: matched.length,
    lastRun: fmtLogTimestamp(last.created_at),
    successRate: Math.round((successCount / matched.length) * 100),
  }
}

function fmtLogTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Hoje, ${time}`
  if (isYesterday) return `Ontem, ${time}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`
}

function logRowToExecutionLog(row: WorkflowExecutionLogRow): ExecutionLog {
  return {
    id: row.id,
    timestamp: fmtLogTimestamp(row.created_at),
    status: row.status,
    ticketNumber: row.incident_number ?? '—',
    duration: row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—',
    detail: row.actions_summary ?? '',
  }
}

const getTriggerMeta = (v: string) => TRIGGER_EVENTS.find(t => t.value === v) ?? { label: v, emoji: '⚡', hasSource: false }
const getActionMeta  = (v: string) => ACTION_TYPES.find(a => a.value === v) ?? { label: v, Icon: PlayCircle, color: 'text-slate-600 bg-slate-50 border-slate-100' }
const getFieldLabel  = (v: string) => CONDITION_FIELDS.find(f => f.value === v)?.label ?? v
const getOpLabel     = (v: string) => OPERATORS.find(o => o.value === v)?.label ?? v
const getSourceMeta  = (v: TicketSource) => TICKET_SOURCES.find(s => s.value === v) ?? TICKET_SOURCES[0]

const valuePlaceholder = (field: string) =>
  field === 'priority' ? 'P1 - Critical' : field === 'category' ? 'Hardware, Software…' :
  field === 'state' ? 'Em Atendimento…' : field === 'group' ? 'Suporte N1…' :
  field === 'department' ? 'TI, Financeiro…' : field === 'idle_hours' ? '72 (horas)' : '72'

// ─── FlowConnector ────────────────────────────────────────────

function FlowConnector({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center select-none">
      <div className="w-px h-6 bg-slate-200" />
      <button onClick={onAdd}
        className="group flex items-center gap-2 px-4 py-1.5 rounded-full border border-dashed border-slate-300 hover:border-primary hover:bg-primary-container transition-all text-xs font-semibold text-slate-500 hover:text-primary">
        <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" />
        {label}
      </button>
      <div className="w-px h-4 bg-slate-200" />
      <ArrowDown className="w-4 h-4 text-slate-300" />
    </div>
  )
}

// ─── TemplateGallery ─────────────────────────────────────────

function TemplateGallery({ onSelect, onClose }: { onSelect: (t: Template) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center">
              <Layers className="w-4 h-4 text-on-primary-container" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-800 text-base">Nova Automação</h2>
              <p className="text-[11px] text-slate-400">Escolha um template ou comece do zero</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onSelect({ id: 'blank', name: 'Nova Automação', description: 'Configure do zero', emoji: '⚡', triggerEvent: 'incident_created', triggerSource: 'any', conditions: [], actions: [] })}
            className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group">
            <span className="text-2xl">✨</span>
            <div className="flex-1">
              <div className="font-bold text-sm text-slate-700 group-hover:text-indigo-700">Do Zero</div>
              <div className="text-xs text-slate-400 mt-0.5">Automação em branco</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </button>
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => onSelect(t)}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 bg-slate-50 transition-all text-left group">
              <span className="text-2xl shrink-0">{t.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-700 group-hover:text-indigo-700">{t.name}</div>
                <div className="text-xs text-slate-400 mt-0.5 leading-snug truncate">{t.description}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TestModal ────────────────────────────────────────────────

function TestModal({ wf, onClose }: { wf: Workflow; onClose: () => void }) {
  const [steps, setSteps] = useState<TestStep[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [mockTicket, setMockTicket] = useState<{
    number: string; priority: string; category: string; state: string; source: ActualSource
  }>({ number: 'INC0001999', priority: 'P1 - Critical', category: 'Hardware', state: 'New', source: 'portal' })

  const trig = getTriggerMeta(wf.triggerEvent)
  const srcMeta = getSourceMeta(wf.triggerSource)

  const runSim = () => {
    const trigLabel = trig.hasSource && wf.triggerSource !== 'any'
      ? `Gatilho: ${trig.label} — ${srcMeta.label}`
      : `Gatilho: ${trig.label}`

    const sourceMatch = !trig.hasSource || wf.triggerSource === 'any' || wf.triggerSource === mockTicket.source

    const allSteps: TestStep[] = [
      {
        label: trigLabel,
        detail: sourceMatch
          ? `Origem "${mockTicket.source}" corresponde ao filtro "${srcMeta.label}"`
          : `Origem "${mockTicket.source}" NÃO corresponde ao filtro "${srcMeta.label}" — automação interrompida`,
        status: 'waiting',
      },
      ...(sourceMatch ? wf.conditions.map((c, i) => ({
        label: `Condição ${i + 1}: ${getFieldLabel(c.field)} ${getOpLabel(c.operator)} "${c.value}"`,
        detail: `Campo "${getFieldLabel(c.field)}" avaliado contra o chamado de teste`,
        status: 'waiting' as TestStatus,
      })) : []),
      ...(sourceMatch ? wf.actions.map((a, i) => ({
        label: `Ação ${i + 1}: ${getActionMeta(a.type).label}`,
        detail: `Executando "${getActionMeta(a.type).label}"`,
        status: 'waiting' as TestStatus,
      })) : []),
    ]

    setSteps(allSteps)
    setRunning(true)
    setDone(false)

    allSteps.forEach((_, i) => {
      setTimeout(() => {
        setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'running' } : s))
        setTimeout(() => {
          let ok = true
          if (i === 0 && !sourceMatch) ok = false
          setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: ok ? 'success' : 'fail' } : s))
          if (i === allSteps.length - 1) { setRunning(false); setDone(true) }
        }, 700)
      }, i * 1000)
    })
  }

  const reset = () => { setSteps([]); setRunning(false); setDone(false) }
  const allOk = done && steps.every(s => s.status === 'success')

  const stepIcon = (s: TestStatus) => {
    if (s === 'waiting') return <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
    if (s === 'running') return <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin shrink-0" />
    if (s === 'success') return <Check className="w-4 h-4 text-emerald-500 shrink-0" />
    return <X className="w-4 h-4 text-red-500 shrink-0" />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div>
            <h2 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-indigo-500" /> Simular Automação
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[280px]">{wf.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Dados do Chamado de Teste</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Número</label>
                <input value={mockTicket.number} onChange={e => setMockTicket(t => ({ ...t, number: e.target.value }))}
                  className="w-full text-sm font-mono border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Origem</label>
                <select value={mockTicket.source} onChange={e => setMockTicket(t => ({ ...t, source: e.target.value as ActualSource }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="portal">🖥️ Portal</option>
                  <option value="email">✉️ E-mail</option>
                  <option value="api">⚙️ API</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Prioridade</label>
                <select value={mockTicket.priority} onChange={e => setMockTicket(t => ({ ...t, priority: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300">
                  {['P1 - Critical','P2 - High','P3 - Moderate','P4 - Low'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Categoria</label>
                <select value={mockTicket.category} onChange={e => setMockTicket(t => ({ ...t, category: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300">
                  {['Hardware','Software','Network','Database','Security','Inquiry'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {steps.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Resultado da Simulação</div>
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                    step.status === 'running' ? 'border-indigo-200 bg-indigo-50' :
                    step.status === 'success' ? 'border-emerald-200 bg-emerald-50' :
                    step.status === 'fail'    ? 'border-red-200 bg-red-50' :
                    'border-slate-100 bg-slate-50'
                  }`}>
                    <div className="mt-0.5">{stepIcon(step.status)}</div>
                    <div>
                      <div className={`text-xs font-bold ${
                        step.status === 'running' ? 'text-indigo-700' :
                        step.status === 'success' ? 'text-emerald-700' :
                        step.status === 'fail'    ? 'text-red-700' : 'text-slate-500'
                      }`}>{step.label}</div>
                      {step.status !== 'waiting' && <div className="text-[11px] text-slate-500 mt-0.5">{step.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {done && (
                <div className={`mt-4 p-4 rounded-xl text-center font-bold text-sm border ${
                  allOk ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  {allOk ? '✅ Automação executaria com sucesso!' : '❌ Automação não completaria — revise as configurações'}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            {steps.length > 0
              ? <button onClick={reset} className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Reiniciar
                </button>
              : <div />
            }
            <button onClick={runSim} disabled={running || (done && steps.length > 0)}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all active:scale-95">
              <PlayCircle className="w-4 h-4" />
              {running ? 'Simulando…' : done ? 'Simulado!' : 'Executar Simulação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ExecutionHistory ─────────────────────────────────────────

function ExecutionHistory({ logs, loading }: { logs: ExecutionLog[]; loading?: boolean }) {
  const statusStyle = {
    success: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    error:   'text-red-700 bg-red-50 border-red-200',
    skipped: 'text-slate-500 bg-slate-100 border-slate-200',
    partial: 'text-amber-700 bg-amber-50 border-amber-200',
  }
  const statusLabel = {
    success: '✅ Sucesso', error: '❌ Erro', skipped: '⏭ Ignorado', partial: '⚡ Parcial',
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Loader2 className="w-8 h-8 text-indigo-300 animate-spin mb-3" />
      <p className="text-sm font-semibold text-slate-400">Carregando histórico…</p>
    </div>
  )

  if (logs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <History className="w-12 h-12 text-slate-200 mb-3" />
      <p className="text-sm font-semibold text-slate-500">Nenhuma execução registrada</p>
      <p className="text-xs text-slate-400 mt-1">O histórico aparecerá aqui após a primeira execução</p>
    </div>
  )

  return (
    <div className="max-w-[700px] mx-auto px-4 py-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', value: logs.length, cls: 'border-slate-200 text-slate-800' },
          { label: 'Sucesso', value: logs.filter(l => l.status === 'success').length, cls: 'border-emerald-200 text-emerald-700 bg-emerald-50' },
          { label: 'Erros', value: logs.filter(l => l.status === 'error').length, cls: 'border-red-200 text-red-700 bg-red-50' },
          { label: 'Ignorados', value: logs.filter(l => l.status === 'skipped' || l.status === 'partial').length, cls: 'border-slate-200 text-slate-500' },
        ].map(card => (
          <div key={card.label} className={`border rounded-xl p-4 text-center shadow-sm ${card.cls}`}>
            <div className="text-2xl font-extrabold">{card.value}</div>
            <div className="text-xs font-semibold mt-0.5 opacity-75">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Execuções Recentes</span>
        </div>
        <div className="divide-y divide-slate-50">
          {logs.map(log => (
            <div key={log.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border shrink-0 ${statusStyle[log.status]}`}>
                {statusLabel[log.status]}
              </span>
              <span className="font-mono text-xs font-bold text-indigo-600 shrink-0">{log.ticketNumber}</span>
              <span className="flex-1 text-xs text-slate-600 truncate">{log.detail}</span>
              <span className="text-[11px] text-slate-400 shrink-0">{log.duration}</span>
              <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">{log.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── VariablesPanel ───────────────────────────────────────────

function VariablesPanel() {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token).catch(() => {})
    setCopied(token)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="max-w-[700px] mx-auto px-4 py-8 space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
        <Code2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-indigo-700 mb-0.5">Como usar variáveis dinâmicas</p>
          <p className="text-xs text-indigo-600 leading-relaxed">
            Clique em um token para copiar. Cole em qualquer campo de texto nas ações —
            e-mail, notificação, webhook body, etc. Os valores são substituídos no momento da execução.
          </p>
        </div>
      </div>

      {VARIABLES_GROUPS.map(group => (
        <div key={group.label}>
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-700 mb-2">
            <span>{group.icon}</span>{group.label}
          </h3>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-50">
              {group.vars.map(v => (
                <div key={v.token} className="flex items-center gap-4 px-4 py-3">
                  <button onClick={() => copyToken(v.token)}
                    className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors shrink-0 flex items-center gap-1.5 min-w-[190px]">
                    {copied === v.token
                      ? <><Check className="w-3 h-3 text-emerald-500" /> Copiado!</>
                      : <><Copy className="w-3 h-3" /> {v.token}</>}
                  </button>
                  <div>
                    <div className="text-xs font-semibold text-slate-700">{v.desc}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Ex: {v.example}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── WorkflowBuilder ─────────────────────────────────────────

export default function WorkflowBuilder({ companyId }: { companyId: string }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [savedFeedback, setSavedFeedback] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openTrigger, setOpenTrigger] = useState(true)
  const [openConditions, setOpenConditions] = useState(true)
  const [openActions, setOpenActions] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [tempName, setTempName] = useState('')
  const [activeTab, setActiveTab] = useState<MainTab>('config')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // ── Carga inicial: regras reais + estatísticas do log de execução ──
  useEffect(() => {
    if (!companyId) return
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([
      workflowService.list(companyId),
      workflowService.listExecutionLog(companyId, undefined, 500),
    ])
      .then(([rules, allLogs]) => {
        if (!active) return
        const logsByRule = new Map<string, WorkflowExecutionLogRow[]>()
        for (const l of allLogs) {
          if (!l.rule_id) continue
          if (!logsByRule.has(l.rule_id)) logsByRule.set(l.rule_id, [])
          logsByRule.get(l.rule_id)!.push(l)
        }
        const mapped = rules.map(r => rowToWorkflow(r, computeStats(logsByRule.get(r.id) ?? [])))
        setWorkflows(mapped)
        setSelectedId(prev => (prev && mapped.some(w => w.id === prev)) ? prev : (mapped[0]?.id ?? null))
      })
      .catch(e => setError(e?.message || 'Erro ao carregar automações.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyId])

  const wf = workflows.find(w => w.id === selectedId)
  const filtered = workflows.filter(w =>
    [w.name, w.description].some(s => s.toLowerCase().includes(search.toLowerCase()))
  )

  // ── Histórico real de execução da regra selecionada ────────────
  useEffect(() => {
    if (!wf || activeTab !== 'history') return
    let active = true
    setLogsLoading(true)
    workflowService.listExecutionLog(companyId, wf.id, 50)
      .then(rows => { if (active) setLogs(rows.map(logRowToExecutionLog)) })
      .catch(console.error)
      .finally(() => { if (active) setLogsLoading(false) })
    return () => { active = false }
  }, [companyId, wf?.id, activeTab])

  const qualityReport = wf ? evaluateWorkflowQuality(wf) : null
  const validIssues = {
    conditions: qualityReport?.issues.some(issue => issue.section === 'conditions') ?? false,
    actions: qualityReport?.issues.some(issue => issue.section === 'actions') ?? false,
  }

  // ── Mutations (locais — persistidas ao clicar Salvar, exceto onde indicado) ──
  const patch = (changes: Partial<Workflow>) =>
    setWorkflows(prev => prev.map(w => w.id === selectedId ? { ...w, ...changes } : w))

  const addCondition = () => wf && patch({ conditions: [...wf.conditions, { id: genId(), field: 'priority', operator: 'equals', value: '', logicOp: 'AND' }] })
  const removeCondition = (id: string) => wf && patch({ conditions: wf.conditions.filter(c => c.id !== id) })
  const updateCondition = (id: string, diff: Partial<ConditionRow>) =>
    wf && patch({ conditions: wf.conditions.map(c => c.id === id ? { ...c, ...diff } : c) })

  const addAction = () => wf && patch({ actions: [...wf.actions, { id: genId(), type: 'assign_group', params: getDefaultWorkflowActionParams('assign_group') }] })
  const removeAction = (id: string) => wf && patch({ actions: wf.actions.filter(a => a.id !== id) })
  const updateAction = (id: string, diff: Partial<ActionRow>) =>
    wf && patch({ actions: wf.actions.map(a => a.id === id ? { ...a, ...diff } : a) })

  const createFromTemplate = async (t: Template) => {
    setShowTemplates(false)
    const draft: Workflow = {
      id: '', name: t.id === 'blank' ? 'Nova Automação' : t.name,
      description: t.description, enabled: false, ticketType: 'incident',
      triggerEvent: t.triggerEvent, triggerSource: t.triggerSource,
      conditions: t.conditions.map(c => ({ ...c, id: genId() })),
      actions: t.actions.map(a => ({ ...a, id: genId() })),
      runsCount: 0, lastRun: 'Nunca', successRate: 0,
    }
    try {
      const created = await workflowService.create(workflowToPayload(draft, companyId))
      const n = rowToWorkflow(created)
      setWorkflows(p => [n, ...p])
      setSelectedId(n.id)
      setActiveTab('config')
      setOpenTrigger(true); setOpenConditions(true); setOpenActions(true)
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar automação.')
    }
  }

  const duplicateWorkflow = async () => {
    if (!wf) return
    const draft: Workflow = { ...wf, name: wf.name + ' (cópia)', enabled: false, runsCount: 0, lastRun: 'Nunca' }
    try {
      const created = await workflowService.create(workflowToPayload(draft, companyId))
      const n = rowToWorkflow(created)
      setWorkflows(p => [n, ...p])
      setSelectedId(n.id)
    } catch (e: any) {
      setError(e?.message || 'Falha ao duplicar automação.')
    }
  }

  const deleteWorkflow = async () => {
    if (!wf) return
    if (!confirm(`Excluir a automação "${wf.name}"?`)) return
    try {
      await workflowService.remove(wf.id, companyId)
      const rest = workflows.filter(w => w.id !== wf.id)
      setWorkflows(rest)
      setSelectedId(rest[0]?.id ?? null)
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir automação.')
    }
  }

  /** Liga/desliga a regra imediatamente — não espera o botão Salvar. */
  const toggleEnabled = async () => {
    if (!wf) return
    const next = !wf.enabled
    if (next && !qualityReport?.ready) {
      setError('Revise os itens de prontidão antes de ativar esta automação.')
      setActiveTab('config')
      return
    }
    patch({ enabled: next })
    try {
      await workflowService.setActive(wf.id, companyId, next)
    } catch (e: any) {
      patch({ enabled: !next }) // reverte em caso de falha
      setError(e?.message || 'Falha ao atualizar status da automação.')
    }
  }

  const handleSave = async () => {
    if (!wf) return
    setSaving(true)
    try {
      const updated = await workflowService.update(wf.id, companyId, workflowToPayload(wf, companyId))
      setWorkflows(prev => prev.map(w => w.id === wf.id ? rowToWorkflow(updated, { runsCount: w.runsCount, lastRun: w.lastRun, successRate: w.successRate }) : w))
      setSavedFeedback(true)
      setTimeout(() => setSavedFeedback(false), 2000)
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar automação.')
    } finally {
      setSaving(false)
    }
  }

  // ── Derived display values ───────────────────────────────────
  const trig = getTriggerMeta(wf?.triggerEvent ?? 'incident_created')
  const srcMeta = getSourceMeta(wf?.triggerSource ?? 'any')
  const trigSummary = trig.hasSource && wf?.triggerSource !== 'any'
    ? `${trig.emoji} ${trig.label} — ${srcMeta.label}`
    : `${trig.emoji} ${trig.label}`

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm font-semibold text-slate-400">Carregando automações…</p>
        </div>
      </div>
    )
  }

  if (!wf) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <Layers className="w-12 h-12 text-slate-200" />
          <div>
            <p className="text-base font-bold text-slate-800">Automatize tarefas repetitivas com segurança</p>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">Comece com um modelo ou uma regra vazia. Você poderá revisar, simular e salvar como rascunho antes de ativar.</p>
          </div>
          <button onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 bg-primary hover:opacity-90 text-on-primary text-sm font-bold px-4 py-2.5 rounded-lg transition-all shadow-sm">
            <Plus className="w-4 h-4" /> Criar primeira automação
          </button>
        </div>
        {showTemplates && <TemplateGallery onSelect={createFromTemplate} onClose={() => setShowTemplates(false)} />}
        {error && <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-4 py-2 rounded-lg shadow-lg">{error}</div>}
      </div>
    )
  }

  return (
    <div className="servicefy-workflow-shell flex h-full bg-slate-50 overflow-hidden">

      {/* ─── SIDEBAR ──────────────────────────────────────── */}
      <aside className="servicefy-workflow-sidebar w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" /> Automações
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{workflows.length} regras configuradas</p>
            </div>
            <button onClick={() => setShowTemplates(true)}
              className="flex items-center gap-1.5 bg-primary hover:opacity-90 active:scale-95 text-on-primary text-xs font-bold px-3 py-1.5 rounded-lg transition-all">
              <Plus className="w-3.5 h-3.5" /> Nova
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar automação…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 placeholder:text-slate-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-8">Nenhuma automação encontrada</p>}
          {filtered.map(w => {
            const wTrig = getTriggerMeta(w.triggerEvent)
            const wSrc = TICKET_SOURCES.find(s => s.value === w.triggerSource)
            return (
              <button key={w.id} onClick={() => { setSelectedId(w.id); setActiveTab('config') }}
                className={`w-full text-left px-4 py-3.5 border-l-2 transition-all ${
                  w.id === selectedId ? 'border-l-primary bg-primary-container' : 'border-l-transparent hover:bg-slate-50'
                }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${w.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className={`text-sm font-bold truncate ${w.id === selectedId ? 'text-on-primary-container' : 'text-slate-700'}`}>{w.name}</span>
                </div>
                <div className="flex items-center gap-1.5 pl-4 mb-1">
                  <span className="text-[10px] text-slate-400">{wTrig.emoji} {wTrig.label}</span>
                  {wTrig.hasSource && w.triggerSource !== 'any' && wSrc && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-[10px] text-violet-500 font-semibold">{wSrc.label}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 pl-4">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {w.lastRun}</span>
                  {w.runsCount > 0 && (
                    <>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-[10px] text-emerald-600 font-semibold">{w.successRate}% ✓</span>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> {workflows.filter(w => w.enabled).length} ativas
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-300" /> {workflows.filter(w => !w.enabled).length} pausadas
          </span>
        </div>
      </aside>

      {/* ─── MAIN ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="servicefy-workflow-header bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input autoFocus value={tempName} onChange={e => setTempName(e.target.value)}
                onBlur={() => { patch({ name: tempName || wf.name }); setEditingName(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { patch({ name: tempName || wf.name }); setEditingName(false) } if (e.key === 'Escape') setEditingName(false) }}
                className="text-lg font-extrabold text-slate-800 border-b-2 border-primary outline-none bg-transparent w-full max-w-sm" />
            ) : (
              <button onClick={() => { setTempName(wf.name); setEditingName(true) }} className="group flex items-center gap-2">
                <h1 className="text-lg font-extrabold text-slate-800">{wf.name}</h1>
                <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
              </button>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[11px] text-slate-400">
                {trigSummary} &nbsp;·&nbsp; {wf.conditions.length} condições &nbsp;·&nbsp; {wf.actions.length} ações
              </p>
              <span className="text-slate-200">·</span>
              <div className="flex items-center rounded-full border border-slate-200 overflow-hidden shrink-0">
                <button onClick={() => patch({ ticketType: 'incident' })}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold transition-colors ${
                    wf.ticketType === 'incident'
                      ? 'bg-red-50 text-red-700'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}>
                  <AlertTriangle className="w-2.5 h-2.5" /> Incidente
                </button>
                <button onClick={() => patch({ ticketType: 'request' })}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold transition-colors border-l border-slate-200 ${
                    wf.ticketType === 'request' ? 'bg-primary-container text-on-primary-container' : 'text-slate-500 hover:bg-slate-50'
                  }`}>
                  <Ticket className="w-2.5 h-2.5" /> Requisição
                </button>
              </div>
            </div>
          </div>

          <div className="servicefy-workflow-actions flex items-center gap-2">
            <button onClick={toggleEnabled} aria-label={wf.enabled ? 'Pausar automação' : 'Ativar automação'}
              className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                wf.enabled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
              }`}>
              <span className={`w-2 h-2 rounded-full ${wf.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {wf.enabled ? 'Ativo' : 'Pausado'}
            </button>
            <button onClick={duplicateWorkflow} title="Duplicar" aria-label="Duplicar automação"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={deleteWorkflow} title="Excluir" aria-label="Excluir automação"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-red-600/70 hover:text-red-700 hover:bg-red-50 hover:border-red-200 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => setShowTest(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">
              <PlayCircle className="w-4 h-4" /> Testar
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm disabled:opacity-60 ${
                savedFeedback ? 'bg-emerald-600 text-white' : 'bg-primary hover:opacity-90 text-on-primary'
              }`}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
                : savedFeedback ? <><Check className="w-4 h-4" /> Salvo!</> : <><Save className="w-4 h-4" /> Salvar</>}
            </button>
          </div>
        </header>
        {error && (
          <div className="bg-red-50 border-b border-red-100 px-6 py-2 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {qualityReport && (
          <div className={`px-6 py-3 border-b flex items-start gap-3 shrink-0 ${
            qualityReport.ready ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
          }`}>
            {qualityReport.ready
              ? <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              : <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-bold ${qualityReport.ready ? 'text-emerald-800' : 'text-amber-900'}`}>
                {qualityReport.ready
                  ? 'Automação pronta para testar e ativar'
                  : `${qualityReport.completedSections} de ${qualityReport.totalSections} etapas prontas`}
              </div>
              <p className={`text-xs mt-0.5 ${qualityReport.ready ? 'text-emerald-700' : 'text-amber-800'}`}>
                {qualityReport.ready
                  ? 'Revise a simulação antes de publicar mudanças em produção.'
                  : qualityReport.issues.slice(0, 2).map(issue => issue.message).join(' ')}
              </p>
            </div>
            {!qualityReport.ready && activeTab !== 'config' && (
              <button onClick={() => setActiveTab('config')} className="text-xs font-bold text-amber-900 hover:underline shrink-0">
                Revisar configuração
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="servicefy-workflow-tabs bg-white border-b border-slate-200 px-6 flex items-center gap-1 shrink-0 overflow-x-auto">
          {([
            { key: 'config',    label: 'Configuração', Icon: Settings2 },
            { key: 'history',   label: `Histórico (${logs.length})`, Icon: History },
            { key: 'variables', label: 'Variáveis',     Icon: Code2 },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-all ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <tab.Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── HISTORY TAB ─────────────────────────────── */}
          {activeTab === 'history' && <ExecutionHistory logs={logs} loading={logsLoading} />}

          {/* ── VARIABLES TAB ───────────────────────────── */}
          {activeTab === 'variables' && <VariablesPanel />}

          {/* ── CONFIG TAB ──────────────────────────────── */}
          {activeTab === 'config' && (
            <div className="max-w-[720px] mx-auto px-4 py-8 sm:py-10">

              {/* ── TRIGGER CARD ──────────────────────── */}
              <div className={`rounded-2xl border-2 bg-white shadow-sm overflow-hidden ${validIssues.conditions ? 'border-amber-200' : 'border-amber-200'}`}>
                <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-amber-50/50 transition-colors text-left"
                  onClick={() => setOpenTrigger(v => !v)}>
                  <div className="w-11 h-11 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black text-amber-500 uppercase tracking-[0.15em] mb-0.5">Gatilho — Início</div>
                    <div className="text-base font-bold text-slate-800">
                      {trig.emoji} Quando{' '}
                      <span className="text-amber-700">{trig.label.toLowerCase()}</span>
                      {trig.hasSource && wf.triggerSource !== 'any' && (
                        <span className="text-amber-500"> — {srcMeta.label}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-amber-500 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full tracking-wider shrink-0">
                    GATILHO
                  </span>
                  {openTrigger ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openTrigger && (
                  <div className="border-t border-amber-100 px-5 py-4 space-y-4">
                    {/* Event grid */}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Evento</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {TRIGGER_EVENTS.map(t => (
                          <button key={t.value}
                            onClick={() => patch({ triggerEvent: t.value, triggerSource: t.hasSource ? wf.triggerSource : 'any' })}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                              wf.triggerEvent === t.value ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                            }`}>
                            <span className="text-xl leading-none">{t.emoji}</span>
                            <span className={`text-xs font-semibold leading-tight ${wf.triggerEvent === t.value ? 'text-amber-800' : 'text-slate-600'}`}>
                              {t.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Source selector — only for incident_created */}
                    {trig.hasSource && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Origem do Chamado</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {TICKET_SOURCES.map(src => {
                            const Icon = src.Icon
                            const sel = wf.triggerSource === src.value
                            return (
                              <button key={src.value} onClick={() => patch({ triggerSource: src.value })}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                                  sel ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                                }`}>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sel ? 'bg-amber-200' : 'bg-slate-100'}`}>
                                  <Icon className={`w-4 h-4 ${sel ? 'text-amber-700' : 'text-slate-500'}`} />
                                </div>
                                <div>
                                  <div className={`text-xs font-bold leading-tight ${sel ? 'text-amber-800' : 'text-slate-700'}`}>{src.label}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{src.desc}</div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Schedule config */}
                    {wf.triggerEvent === 'scheduled' && (
                      <div className="pt-2 border-t border-amber-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" /> Agendamento
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Frequência</label>
                            <select value={wf.scheduleConfig?.frequency ?? 'daily'}
                              onChange={e => patch({ scheduleConfig: { frequency: e.target.value, time: wf.scheduleConfig?.time ?? '08:00' } })}
                              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-amber-300">
                              <option value="daily">Diário</option>
                              <option value="weekly">Semanal</option>
                              <option value="monthly">Mensal</option>
                              <option value="hourly">A cada hora</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Horário</label>
                            <input type="time" value={wf.scheduleConfig?.time ?? '08:00'}
                              onChange={e => patch({ scheduleConfig: { frequency: wf.scheduleConfig?.frequency ?? 'daily', time: e.target.value } })}
                              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-amber-300" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Connector → Conditions */}
              <FlowConnector label="Adicionar condição" onAdd={() => { addCondition(); setOpenConditions(true) }} />

              {/* ── CONDITIONS CARD ────────────────────── */}
              <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${validIssues.conditions ? 'border-amber-300' : 'border-slate-200'}`}>
                <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors text-left"
                  onClick={() => setOpenConditions(v => !v)}>
                  <div className="w-11 h-11 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
                    <GitBranch className="w-5 h-5 text-on-primary-container" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-primary uppercase tracking-wider mb-0.5 flex items-center gap-2">
                      Condições — Filtros
                      {validIssues.conditions && <AlertCircle className="w-3 h-3 text-amber-500" />}
                    </div>
                    <div className="text-base font-bold text-slate-800">
                      {wf.conditions.length === 0
                        ? 'Sem filtros — executa sempre'
                        : <>Se <span className="text-on-surface">{wf.conditions.length} {wf.conditions.length === 1 ? 'condição for' : 'condições forem'} atendida{wf.conditions.length > 1 ? 's' : ''}</span></>}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-on-primary-container bg-primary-container px-2.5 py-1 rounded-md tracking-wide shrink-0">
                    {wf.conditions.length === 0 ? 'SEMPRE' : `${wf.conditions.length} REGRA${wf.conditions.length !== 1 ? 'S' : ''}`}
                  </span>
                  {openConditions ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openConditions && (
                  <div className="border-t border-slate-200 px-5 py-4">
                    {wf.conditions.length === 0 ? (
                      <div className="flex flex-col items-center py-6 border border-dashed border-slate-300 rounded-xl text-center">
                        <GitBranch className="w-8 h-8 text-slate-300 mb-2" />
                        <p className="text-sm font-semibold text-slate-500">Nenhuma condição definida</p>
                        <p className="text-xs text-slate-400 mt-0.5 max-w-[220px]">A automação executará para todos os eventos do gatilho</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {wf.conditions.map((cond, idx) => (
                          <div key={cond.id}>
                            {idx > 0 && (
                              <div className="flex items-center gap-2 my-2">
                                <button onClick={() => updateCondition(cond.id, { logicOp: cond.logicOp === 'AND' ? 'OR' : 'AND' })}
                                  className={`text-[10px] font-black tracking-widest px-2.5 py-1 rounded-md border transition-colors ${
                                    cond.logicOp === 'AND'
                                      ? 'border-primary/30 bg-primary-container text-on-primary-container hover:opacity-90'
                                      : 'border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100'
                                  }`}>{cond.logicOp}</button>
                                <div className="flex-1 h-px bg-slate-100" />
                              </div>
                            )}
                            <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100 group">
                              <GripVertical className="w-4 h-4 text-slate-200 shrink-0 cursor-grab" />
                              <select value={cond.field} onChange={e => updateCondition(cond.id, { field: e.target.value })}
                                className="min-w-0 flex-1 text-sm font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700 cursor-pointer">
                                {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                              </select>
                              <select value={cond.operator} onChange={e => updateCondition(cond.id, { operator: e.target.value })}
                                className="min-w-0 flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600 cursor-pointer">
                                {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              <input value={cond.value} onChange={e => updateCondition(cond.id, { value: e.target.value })}
                                placeholder={valuePlaceholder(cond.field)}
                                className={`min-w-0 flex-1 text-sm border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700 placeholder:text-slate-300 ${!cond.value.trim() ? 'border-amber-300' : 'border-slate-200'}`} />
                              <button onClick={() => removeCondition(cond.id)}
                                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-red-600/70 hover:text-red-700 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={addCondition}
                      className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary hover:bg-primary-container px-3 py-2 rounded-xl transition-colors w-full">
                      <Plus className="w-4 h-4" /> Adicionar condição
                    </button>
                  </div>
                )}
              </div>

              {/* Connector → Actions */}
              <FlowConnector label="Adicionar ação" onAdd={() => { addAction(); setOpenActions(true) }} />

              {/* ── ACTIONS CARD ───────────────────────── */}
              <div className={`rounded-2xl border-2 bg-white shadow-sm overflow-hidden ${validIssues.actions ? 'border-red-200' : 'border-emerald-200'}`}>
                <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-emerald-50/50 transition-colors text-left"
                  onClick={() => setOpenActions(v => !v)}>
                  <div className="w-11 h-11 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center shrink-0">
                    <PlayCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.15em] mb-0.5 flex items-center gap-2">
                      Ações — O que executar
                      {validIssues.actions && <AlertCircle className="w-3 h-3 text-red-500" />}
                    </div>
                    <div className="text-base font-bold text-slate-800">
                      {wf.actions.length === 0
                        ? <span className="text-red-500">Nenhuma ação — automação não fará nada</span>
                        : <>Então executar <span className="text-emerald-700">{wf.actions.length} {wf.actions.length === 1 ? 'ação' : 'ações'}</span></>}
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full tracking-wider shrink-0 border ${
                    validIssues.actions ? 'text-red-600 bg-red-50 border-red-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'
                  }`}>
                    {wf.actions.length === 0 ? 'VAZIO' : `${wf.actions.length} AÇÃO${wf.actions.length !== 1 ? 'ÕES' : ''}`}
                  </span>
                  {openActions ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openActions && (
                  <div className="border-t border-emerald-100 px-5 py-4">
                    {wf.actions.length === 0 ? (
                      <div className="flex flex-col items-center py-6 border-2 border-dashed border-red-100 rounded-xl text-center">
                        <PlayCircle className="w-8 h-8 text-red-200 mb-2" />
                        <p className="text-sm font-semibold text-slate-500">Nenhuma ação definida</p>
                        <p className="text-xs text-slate-400 mt-0.5 max-w-[220px]">Adicione pelo menos uma ação para que a automação faça algo</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {wf.actions.map((action, idx) => {
                          const meta = getActionMeta(action.type)
                          const Icon = meta.Icon
                          return (
                            <div key={action.id} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden group">
                              <div className="flex items-center gap-3 p-3">
                                <GripVertical className="w-4 h-4 text-slate-200 shrink-0 cursor-grab" />
                                <span className="text-xs font-bold text-slate-300 w-4 shrink-0 text-center">{idx + 1}</span>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${meta.color}`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <select value={action.type} onChange={e => updateAction(action.id, { type: e.target.value, params: getDefaultWorkflowActionParams(e.target.value) })}
                                  className="flex-1 text-sm font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300 text-slate-700 cursor-pointer">
                                  {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                </select>
                                <button onClick={() => removeAction(action.id)}
                                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-red-600/70 hover:text-red-700 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Action params */}
                              <div className="px-4 pb-3 pl-[3.5rem] space-y-2">
                                {action.type === 'assign_group' && (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Grupo destino</label>
                                    <input value={action.params.group ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, group: e.target.value } })}
                                      placeholder="Suporte N1, Redes, Plantão TI…"
                                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300" />
                                  </div>
                                )}
                                {action.type === 'set_field' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Campo</label>
                                      <select value={action.params.field ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, field: e.target.value } })}
                                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300">
                                        <option value="">Selecione…</option>
                                        <option value="category">Categoria</option>
                                        <option value="priority">Prioridade</option>
                                        <option value="state">Estado</option>
                                        <option value="group">Grupo</option>
                                        <option value="department">Departamento</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Valor</label>
                                      <input value={action.params.value ?? ''}
                                        onChange={e => updateAction(action.id, { params: { ...action.params, value: e.target.value } })}
                                        placeholder={action.params.field === 'priority' ? 'P3 - Moderate' : action.params.field === 'category' ? 'Triagem' : 'Valor…'}
                                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300" />
                                    </div>
                                  </div>
                                )}
                                {action.type === 'send_email' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Destinatários</label>
                                      <input value={action.params.recipients ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, recipients: e.target.value } })}
                                        placeholder="email@empresa.com ou {{usuario.email}}"
                                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Modelo de e-mail</label>
                                      <select value={action.params.template ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, template: e.target.value } })}
                                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300">
                                        <option value="">Selecione…</option>
                                        <option value="critical_alert">Alerta Crítico</option>
                                        <option value="sla_warning">Aviso de SLA</option>
                                        <option value="auto_closed">Auto-fechado</option>
                                        <option value="assignment">Atribuição</option>
                                        <option value="email_received_ack">Recebimento de E-mail</option>
                                        <option value="daily_report">Relatório Diário</option>
                                      </select>
                                    </div>
                                  </div>
                                )}
                                {action.type === 'change_state' && (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Novo estado</label>
                                    <select value={action.params.state ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, state: e.target.value } })}
                                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300">
                                      <option value="">Selecione…</option>
                                      {['In Progress','On Hold','Pending User','Resolved','Closed'].map(s => <option key={s} value={s}>{translateState(s)}</option>)}
                                    </select>
                                  </div>
                                )}
                                {action.type === 'change_priority' && (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nova prioridade</label>
                                    <select value={action.params.priority ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, priority: e.target.value } })}
                                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300">
                                      <option value="">Selecione…</option>
                                      {['P1 - Critical','P2 - High','P3 - Moderate','P4 - Low'].map(p => <option key={p}>{p}</option>)}
                                    </select>
                                  </div>
                                )}
                                {action.type === 'add_tag' && (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tag</label>
                                    <input value={action.params.tag ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, tag: e.target.value } })}
                                      placeholder="hardware, urgente, vip…"
                                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300" />
                                  </div>
                                )}
                                {action.type === 'send_notification' && (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Mensagem</label>
                                    <input value={action.params.message ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, message: e.target.value } })}
                                      placeholder="Texto da notificação — use {{chamado.numero}}, {{usuario.nome}}…"
                                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300" />
                                  </div>
                                )}
                                {action.type === 'escalate' && (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nível</label>
                                    <select value={action.params.level ?? '2'} onChange={e => updateAction(action.id, { params: { ...action.params, level: e.target.value } })}
                                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300">
                                      <option value="2">N2 — Analista Sênior</option>
                                      <option value="3">N3 — Especialista</option>
                                      <option value="manager">Gerência</option>
                                      <option value="director">Diretoria</option>
                                    </select>
                                  </div>
                                )}
                                {action.type === 'delay' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Aguardar</label>
                                      <input type="number" min="1" value={action.params.amount ?? '1'}
                                        onChange={e => updateAction(action.id, { params: { ...action.params, amount: e.target.value } })}
                                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Unidade</label>
                                      <select value={action.params.unit ?? 'hours'} onChange={e => updateAction(action.id, { params: { ...action.params, unit: e.target.value } })}
                                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300">
                                        <option value="minutes">Minutos</option>
                                        <option value="hours">Horas</option>
                                        <option value="days">Dias</option>
                                      </select>
                                    </div>
                                  </div>
                                )}
                                {action.type === 'webhook' && (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      <div className="sm:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">URL</label>
                                        <input value={action.params.url ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, url: e.target.value } })}
                                          placeholder="https://hooks.empresa.com/endpoint"
                                          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Método</label>
                                        <select value={action.params.method ?? 'POST'} onChange={e => updateAction(action.id, { params: { ...action.params, method: e.target.value } })}
                                          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300">
                                          {['POST','PUT','PATCH','GET'].map(m => <option key={m}>{m}</option>)}
                                        </select>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Body (JSON)</label>
                                      <textarea value={action.params.body ?? ''} onChange={e => updateAction(action.id, { params: { ...action.params, body: e.target.value } })}
                                        placeholder={'{\n  "ticket": "{{chamado.numero}}",\n  "origem": "{{chamado.origem}}"\n}'}
                                        rows={3}
                                        className="w-full text-sm font-mono border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <button onClick={addAction}
                      className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-xl transition-colors w-full">
                      <Plus className="w-4 h-4" /> Adicionar ação
                    </button>
                  </div>
                )}
              </div>

              {/* End badge */}
              <div className="flex flex-col items-center mt-0 pt-1">
                <div className="w-px h-6 bg-slate-200" />
                <div className="flex items-center gap-2 px-5 py-2 bg-white rounded-full border border-slate-200 shadow-sm">
                  <CheckCircle className="w-4 h-4 text-slate-300" />
                  <span className="text-xs font-black text-slate-300 tracking-widest uppercase">Fim da automação</span>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showTemplates && <TemplateGallery onSelect={createFromTemplate} onClose={() => setShowTemplates(false)} />}
      {showTest && <TestModal wf={wf} onClose={() => setShowTest(false)} />}
    </div>
  )
}
