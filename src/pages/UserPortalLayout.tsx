import { useState, useEffect, useRef, useMemo } from 'react'
import { useTenant } from '../tenant'
import { useAuth } from '../auth'
import { incidentsService, serviceCatalogService, departmentsService, csatService } from '../lib/services'
import { priorityString } from '../lib/priority'
import { STATE_LABELS_PT } from '../lib/statusLabels'
import { getPortalSidebar, THEME_HEX_COLORS } from '../lib/theme-engine'
import type { ThemeName } from '../lib/theme-engine'
import type {
  IncidentRow, IncidentCategory,
  CatalogCategoryRow, CatalogServiceRow, CatalogServiceSymptomRow,
  RequestCategoryRow, RequestSubcategoryRow, RequestItemRow, DepartmentRow, CsatSurveyRow,
} from '../lib/database.types'
import { buildLabeledFormData, isEmptyFormValue, parseFormFields } from '../lib/catalogFormFields'
import type { FormAnswers, FormFieldValue } from '../lib/catalogFormFields'
import DynamicFormFields from './DynamicFormFields'
import CatalogIcon from './CatalogIcon'
import KnowledgePortal from './KnowledgePortal'
import VirtualAgentWidget from '../components/VirtualAgentWidget'
import TicketChat from './TicketChat'
import SlaEventTimeline from './SlaEventTimeline'
import IncidentActionHistory from './IncidentActionHistory'

// ── Types ─────────────────────────────────────────────────────────────────────
type Screen = 'home' | 'dept-cats' | 'inc-cats' | 'inc-services' | 'inc-symptoms' | 'inc-form' | 'req-cats' | 'req-subcats' | 'req-items' | 'req-form' | 'done' | 'tickets' | 'history' | 'ticket-detail' | 'knowledge'

// Card virtual "Outros" no nível de subcategoria: agrupa itens legados sem subcategoria.
const OTHERS_SUBCAT_ID = '__others__'
type CardLayout = 'grid' | 'list'

interface BrowseCat { emoji: string; name: string; desc: string; iconBg: string }
interface IncCat    { id: string; name: string; emoji: string; bg: string; symptoms: string[] }
interface ReqCat    { id: string; name: string; emoji: string; bg: string; items: string[] }

interface PortalConfig {
  cardLayout: CardLayout
  companyName: string
  portalTitle: string
  browseCats: BrowseCat[]
  incCats: IncCat[]
  reqCats: ReqCat[]
}

// ── Priority matrix (portal display) ─────────────────────────────────────────
const PRIORITY_MATRIX: Record<string, { label: string; color: string; bg: string }> = {
  'High-High':   { label: 'P1 — Crítica',  color: '#dc2626', bg: '#fee2e2' },
  'High-Media':  { label: 'P2 — Alta',     color: '#ea580c', bg: '#ffedd5' },
  'Media-High':  { label: 'P2 — Alta',     color: '#ea580c', bg: '#ffedd5' },
  'High-Low':    { label: 'P3 — Moderada', color: '#d97706', bg: '#fef9c3' },
  'Low-High':    { label: 'P3 — Moderada', color: '#d97706', bg: '#fef9c3' },
  'Media-Media': { label: 'P3 — Moderada', color: '#d97706', bg: '#fef9c3' },
  'Media-Low':   { label: 'P4 — Baixa',    color: '#2563eb', bg: '#dbeafe' },
  'Low-Media':   { label: 'P4 — Baixa',    color: '#2563eb', bg: '#dbeafe' },
  'Low-Low':     { label: 'P4 — Baixa',    color: '#2563eb', bg: '#dbeafe' },
}

// ── Ticket state & priority display tokens ────────────────────────────────────
const STATE_STYLE: Record<string, { bg: string; fg: string }> = {
  'New':          { bg:'#eff6ff', fg:'#1d4ed8' },
  'In Progress':  { bg:'#ecfdf5', fg:'#059669' },
  'On Hold':      { bg:'#fef9c3', fg:'#a16207' },
  'Pending User': { bg:'#fff7ed', fg:'#c2410c' },
  'Resolved':     { bg:'#f0fdf4', fg:'#15803d' },
  'Closed':       { bg:'#f1f5f9', fg:'#475569' },
}

const PRIO_STYLE: Record<string, { bg: string; fg: string }> = {
  'P1 - Critical': { bg:'#fee2e2', fg:'#dc2626' },
  'P2 - High':     { bg:'#ffedd5', fg:'#ea580c' },
  'P3 - Moderate': { bg:'#fef9c3', fg:'#d97706' },
  'P4 - Low':      { bg:'#dbeafe', fg:'#2563eb' },
  'P5 - Planning': { bg:'#f1f5f9', fg:'#6b7280' },
}

// Maps portal incident category IDs to DB IncidentCategory values
const INC_CAT_MAP: Record<string, IncidentCategory> = {
  net: 'Network',
  sys: 'Software',
  hw:  'Hardware',
  sec: 'Security',
}

const CLOSED_STATES = new Set<string>(['Resolved', 'Closed'])

// ── Default data ──────────────────────────────────────────────────────────────
const DEFAULT_INC_CATS: IncCat[] = [
  { id:'net', name:'Redes e Conectividade',  emoji:'🌐', bg:'#eff6ff', symptoms:['Link de internet fora do ar','VPN não conecta','Wi-Fi lento ou instável','Sem acesso à rede interna'] },
  { id:'sys', name:'Sistemas e Aplicações',  emoji:'💻', bg:'#ecfdf5', symptoms:['ERP com lentidão extrema','Erro ao acessar o sistema','Sistema totalmente indisponível','Falha ao gerar relatórios'] },
  { id:'hw',  name:'Hardware e Periféricos', emoji:'🖥️', bg:'#f5f3ff', symptoms:['Computador não liga','Monitor com defeito','Impressora sem resposta','Teclado ou mouse com falha'] },
  { id:'sec', name:'Segurança e Acessos',    emoji:'🔐', bg:'#fef9c3', symptoms:['Senha bloqueada','Código 2FA não chega','Sem permissão de acesso','Atividade suspeita na conta'] },
]

const DEFAULT_REQ_CATS: ReqCat[] = [
  { id:'soft',   name:'Software e Licenças',     emoji:'📦', bg:'#eff6ff', items:['Nova licença Office / M365','Instalar software específico','Atualizar aplicação','Antivírus / segurança'] },
  { id:'hw',     name:'Hardware e Equipamentos', emoji:'🖥️', bg:'#ecfdf5', items:['Notebook novo','Monitor adicional','Teclado e/ou mouse','Headset para reuniões'] },
  { id:'access', name:'Acessos e Contas',        emoji:'🔑', bg:'#f5f3ff', items:['Acesso a sistema interno','VPN corporativa','Conta de e-mail profissional','Criação de usuário'] },
]

const DEFAULT_BROWSE_CATS: BrowseCat[] = [
  { emoji:'🧑‍💼', name:'Recursos Humanos',    desc:'Férias, benefícios e folha de pagamento',        iconBg:'#eff6ff' },
  { emoji:'🛒',   name:'Compras',              desc:'Material, notebooks, softwares e periféricos',   iconBg:'#fef9c3' },
  { emoji:'📚',   name:'Base de Conhecimento', desc:'Tutoriais, FAQs e autoatendimento',               iconBg:'#f5f3ff' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia ☀️'
  if (h < 18) return 'Boa tarde 🌤'
  return 'Boa noite 🌙'
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex.startsWith('#') ? hex.slice(1) : hex).padEnd(6, '0')
  const r = parseInt(clean.slice(0,2), 16) || 16
  const g = parseInt(clean.slice(2,4), 16) || 185
  const b = parseInt(clean.slice(4,6), 16) || 129
  return `rgba(${r},${g},${b},${alpha})`
}

function getInitials(name: string): string {
  return name.split(' ').slice(0,2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
}

function getPriorityDot(priority: string | null | undefined): string {
  if (!priority) return '#6b7280'
  if (priority.startsWith('P1')) return '#dc2626'
  if (priority.startsWith('P2')) return '#ea580c'
  if (priority.startsWith('P3')) return '#d97706'
  if (priority.startsWith('P4')) return '#2563eb'
  return '#6b7280'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function fmtDuration(ms: number): string {
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

function translateImpact(val: string | null | undefined): string {
  if (!val) return '—'
  const m: Record<string, string> = {
    Low: 'Apenas eu (Low)',
    Medium: 'Minha equipe (Medium)',
    High: 'Todo o departamento (High)',
    Critical: 'Toda a empresa (Critical)'
  }
  return m[val] || val
}

function translateUrgency(val: string | null | undefined): string {
  if (!val) return '—'
  const m: Record<string, string> = {
    Low: 'Consigo trabalhar, mas incomoda (Low)',
    Medium: 'Trabalho parcialmente bloqueado (Medium)',
    High: 'Totalmente impedido de trabalhar (High)'
  }
  return m[val] || val
}

const DEFAULT_CONFIG: PortalConfig = {
  cardLayout:  'grid',
  companyName: 'Allied IT',
  portalTitle: 'Portal do Usuário',
  browseCats:  DEFAULT_BROWSE_CATS,
  incCats:     DEFAULT_INC_CATS,
  reqCats:     DEFAULT_REQ_CATS,
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface HomeContentProps {
  config: PortalConfig
  brand: string
  brandWash: string
  brandBorder: string
  lastClosedTicket: IncidentRow | null
  onIncident: () => void
  onRequest: () => void
  onReopenTicket: (t: IncidentRow) => void
  dbCategories?: { id: string; name: string; icon: string | null; type: 'incident' | 'request'; departmentId: string | null; dbCat: any }[]
  departments?: DepartmentRow[]
  onSelectDept?: (deptId: string) => void
  cardSettings?: any
}

// TI é o catálogo padrão, já acessível pelos botões "Reportar Problema" / "Solicitar Serviço" —
// categorias sem departamento (Global) ou explicitamente do departamento "TI" não entram na
// grade de departamentos abaixo, que é reservada para os demais catálogos (RH, Financeiro, etc).
const isNonItDepartment = (name: string) => {
  const n = name.trim().toLowerCase()
  return n !== 'ti' && n !== 't.i.' && n !== 'tecnologia da informação' && n !== 'infraestrutura de ti'
}

function HomeContent({ config, brand, brandWash, brandBorder, lastClosedTicket, onIncident, onRequest, onReopenTicket, dbCategories, departments, onSelectDept, cardSettings }: HomeContentProps) {
  const cardSettingsObj = cardSettings || {}

  // Um card por departamento (excluindo TI/Global, já coberto pelos botões padrão) —
  // as opções de catálogo dentro do departamento só aparecem depois que o usuário
  // clica no card, não diretamente na home.
  const nonItDepartments = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of dbCategories ?? []) {
      if (!c.departmentId) continue
      counts.set(c.departmentId, (counts.get(c.departmentId) ?? 0) + 1)
    }
    return (departments ?? [])
      .filter(d => counts.has(d.id) && isNonItDepartment(d.name))
      .map(d => ({ id: d.id, name: d.name, icon: d.icon, count: counts.get(d.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dbCategories, departments])
  const getIconSize = () => {
    switch (cardSettingsObj.icon_size) {
      case 'small': return 36
      case 'large': return 68
      case 'xlarge': return 80
      case 'medium':
      default: return 52
    }
  }
  const getTitleFontSize = () => {
    switch (cardSettingsObj.font_size) {
      case 'small': return '13px'
      case 'large': return '18px'
      case 'medium':
      default: return '15px'
    }
  }

  const catalogIconSize = getIconSize()
  const catalogFontSize = getTitleFontSize()
  const customIconBg = cardSettingsObj.icon_bg_color || undefined
  const customPillBg = cardSettingsObj.label_bg_color || undefined
  const customPillColor = cardSettingsObj.label_color || undefined

  return (
    <>
      <h2 style={{ font:'700 17px sans-serif', color:'#0f172a', marginBottom:13 }}>O que você precisa?</h2>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
        <button onClick={onIncident} style={{ display:'flex', flexDirection:'column', gap:11, padding:20, background:'#fff', border:'2px solid #fecaca', borderRadius:14, textAlign:'left', boxShadow:'0 1px 3px rgba(220,38,38,.07)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>⚠️</div>
            <div style={{ font:'700 16px sans-serif', color:'#dc2626' }}>Reportar Problema</div>
          </div>
          <div style={{ font:'400 13.5px/1.5 sans-serif', color:'#64748b' }}>Algo está com erro, lento ou fora do ar. Diagnosticamos em 3 passos.</div>
          <div style={{ font:'700 13px sans-serif', color:'#dc2626' }}>Abrir incidente →</div>
        </button>

        <button onClick={onRequest} style={{ display:'flex', flexDirection:'column', gap:11, padding:20, background:'#fff', border:`2px solid ${brandBorder}`, borderRadius:14, textAlign:'left', boxShadow:'0 1px 3px rgba(15,23,42,.05)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:brandWash, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>✅</div>
            <div style={{ font:'700 16px sans-serif', color:brand }}>Solicitar Serviço</div>
          </div>
          <div style={{ font:'400 13.5px/1.5 sans-serif', color:'#64748b' }}>Peça equipamentos, acessos, softwares ou outros serviços do catálogo.</div>
          <div style={{ font:'700 13px sans-serif', color:brand }}>Ver catálogo →</div>
        </button>
      </div>

      {nonItDepartments.length > 0 && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:13 }}>
            <span style={{ font:'600 11px sans-serif', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>Outros departamentos</span>
            <div style={{ flex:1, height:1, background:'#e2e8f0' }} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns: config.cardLayout === 'list' ? '1fr' : 'repeat(auto-fill, minmax(160px, 1fr))', gap:10, marginBottom:20 }}>
            {config.cardLayout === 'list' ? (
              nonItDepartments.map(d => (
                <button key={d.id} onClick={() => onSelectDept?.(d.id)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 15px', background: customPillBg || '#fff', border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0', borderRadius:12, textAlign:'left', width:'100%', boxShadow:'0 1px 2px rgba(15,23,42,.03)', cursor:'pointer', boxSizing:'border-box', transition:'box-shadow .15s' }}>
                  <CatalogIcon icon={d.icon} name={d.name} size={catalogIconSize - 8 > 28 ? catalogIconSize - 8 : 36} bg={customIconBg} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a', marginBottom:2 }}>{d.name}</div>
                    <div style={{ font:'400 11.5px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.65) : '#64748b' }}>
                      {d.count} {d.count === 1 ? 'opção disponível' : 'opções disponíveis'}
                    </div>
                  </div>
                  <span style={{ fontSize:15, color: customPillColor || brand, flexShrink:0 }}>→</span>
                </button>
              ))
            ) : (
              nonItDepartments.map(d => (
                <button key={d.id} onClick={() => onSelectDept?.(d.id)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:8, padding:14, background: customPillBg || '#fff', border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0', borderRadius:12, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.03)', cursor:'pointer', width:'100%', boxSizing:'border-box', transition:'box-shadow .15s' }}>
                  <CatalogIcon icon={d.icon} name={d.name} size={catalogIconSize} bg={customIconBg} />
                  <div>
                    <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a', marginBottom:2, marginTop:6 }}>{d.name}</div>
                    <div style={{ font:'400 11px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.65) : '#94a3b8' }}>
                      {d.count} {d.count === 1 ? 'opção disponível' : 'opções disponíveis'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {lastClosedTicket && (
        <div style={{ padding:'12px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:11, display:'flex', gap:9, alignItems:'flex-start' }}>
          <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>⚠️</span>
          <p style={{ font:'400 13px/1.5 sans-serif', color:'#92400e', margin:0 }}>
            Problema recorrente?{' '}
            <a href="#" onClick={e => { e.preventDefault(); onReopenTicket(lastClosedTicket) }}
              style={{ fontWeight:700, color:'#b45309', textDecoration:'underline' }}>
              Veja seu último chamado ({lastClosedTicket.number})
            </a>{' '}
            antes de abrir um novo.
          </p>
        </div>
      )}
    </>
  )
}


// ── Main Component ────────────────────────────────────────────────────────────
// `companyId` é a empresa atualmente selecionada/ativa (ex: no seletor de tenant
// de um admin MSP). Sem ele, cai para a empresa do próprio perfil logado — o
// comportamento padrão para um usuário final normal.
const UserPortalLayout = ({ companyId }: { companyId?: string } = {}) => {
  const { branding, tenant } = useTenant()
  const { profile } = useAuth()
  const catalogCompanyId = companyId || profile?.company_id || tenant?.id

  const LOGO_KEY   = `servicefy-portal-logo-${tenant?.id || 'default'}`
  const CONFIG_KEY = `servicefy-portal-config-${tenant?.id || 'default'}`

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [config] = useState<PortalConfig>(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PortalConfig>
        return { ...DEFAULT_CONFIG, ...parsed }
      }
    } catch {
      // Ignore invalid persisted configuration and use the defaults.
    }
    return {
      ...DEFAULT_CONFIG,
      companyName: tenant?.name || branding.name || DEFAULT_CONFIG.companyName,
    }
  })

  // ── Real ticket data ──────────────────────────────────────────────────────
  const [userTickets, setUserTickets]       = useState<IncidentRow[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [submitError, setSubmitError]       = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<IncidentRow | null>(null)
  const [detailTab, setDetailTab] = useState<'messages' | 'form' | 'history' | 'sla'>('messages')
  const [csatSurvey, setCsatSurvey] = useState<CsatSurveyRow | null>(null)
  const [csatRating, setCsatRating] = useState<number | null>(null)
  const [csatComment, setCsatComment] = useState('')
  const [csatSubmitting, setCsatSubmitting] = useState(false)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setDetailTab('messages')
  }, [selectedTicket])

  useEffect(() => {
    if (!selectedTicket || !CLOSED_STATES.has(selectedTicket.state)) {
      setCsatSurvey(null)
      return
    }
    let cancelled = false
    csatService.getForIncident(selectedTicket.id)
      .then(row => { if (!cancelled) setCsatSurvey(row) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [selectedTicket])

  const submitCsat = async () => {
    if (!csatSurvey || !csatRating || csatSubmitting) return
    setCsatSubmitting(true)
    try {
      const submitted = await csatService.submit(csatSurvey.id, csatRating, csatComment)
      setCsatSurvey(submitted)
    } catch (error) {
      console.error('Erro ao enviar CSAT:', error)
    } finally {
      setCsatSubmitting(false)
    }
  }

  useEffect(() => {
    if (!profile?.id || !profile?.company_id) return
    setTicketsLoading(true)
    incidentsService
      .list({ companyId: profile.company_id, callerId: profile.id, limit: 50 })
      .then(setUserTickets)
      .catch(console.error)
      .finally(() => setTicketsLoading(false))
  }, [profile?.id, profile?.company_id])

  const reloadTickets = () => {
    if (!profile?.id || !profile?.company_id) return
    incidentsService
      .list({ companyId: profile.company_id, callerId: profile.id, limit: 50 })
      .then(setUserTickets)
      .catch(console.error)
  }

  // ── Derived ticket values ─────────────────────────────────────────────────
  const activeTickets  = userTickets.filter(t => !CLOSED_STATES.has(t.state))
  const closedTickets  = userTickets.filter(t => CLOSED_STATES.has(t.state))
  const sidebarTickets = activeTickets.slice(0, 3)
  const activeCount    = activeTickets.length
  const p1Count        = activeTickets.filter(t => t.priority === 'P1 - Critical').length
  const slaBreached    = activeTickets.filter(t => t.sla_breached).length
  const slaOkPct       = activeTickets.length > 0
    ? Math.round(((activeTickets.length - slaBreached) / activeTickets.length) * 100)
    : 100
  const lastClosedTicket = closedTickets[0] ?? null

  // ── Portal UI state ───────────────────────────────────────────────────────
  const [screen, setScreen]             = useState<Screen>('home')
  const [selDeptId, setSelDeptId]       = useState<string | null>(null)
  const [selIncCat, setSelIncCat]       = useState<IncCat | null>(null)
  const [selSymptom, setSelSymptom]     = useState<string | null>(null)
  const [selReqCat, setSelReqCat]       = useState<ReqCat | null>(null)
  const [selItem, setSelItem]           = useState<string | null>(null)
  const [impact, setImpact]             = useState<'Low'|'Media'|'High'>('Media')
  const [urgency, setUrgency]           = useState<'Low'|'Media'|'High'>('Media')
  const [desc, setDesc]                 = useState('')
  const [ticketNum, setTicketNum]       = useState<string | null>(null)
  const [ticketApprovalStatus, setTicketApprovalStatus] = useState<IncidentRow['approval_status']>('not_required')
  const [searchQ, setSearchQ]           = useState('')
  const [searchOpen, setSearchOpen]     = useState(false)

  // ── Database Dynamic Catalog Data ──────────────────────────────────────────
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [categories, setCategories] = useState<CatalogCategoryRow[]>([])
  const [services, setServices] = useState<CatalogServiceRow[]>([])
  const [serviceSymptoms, setServiceSymptoms] = useState<CatalogServiceSymptomRow[]>([])
  const [reqCategories, setReqCategories] = useState<RequestCategoryRow[]>([])
  const [reqSubcategories, setReqSubcategories] = useState<RequestSubcategoryRow[]>([])
  const [reqItems, setReqItems] = useState<RequestItemRow[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)

  // Seleções dinâmicas do banco de dados
  const [dbSelIncCat, setDbSelIncCat] = useState<CatalogCategoryRow | null>(null)
  const [dbSelIncService, setDbSelIncService] = useState<CatalogServiceRow | null>(null)
  const [dbSelSymptom, setDbSelSymptom] = useState<CatalogServiceSymptomRow | null>(null)
  const [dbSelReqCat, setDbSelReqCat] = useState<RequestCategoryRow | null>(null)
  const [dbSelReqSubcat, setDbSelReqSubcat] = useState<RequestSubcategoryRow | null>(null)
  const [dbSelItem, setDbSelItem] = useState<RequestItemRow | null>(null)

  // Formulário dinâmico do catálogo
  const [formAnswers, setFormAnswers] = useState<FormAnswers>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const handleFormChange = (fieldId: string, value: FormFieldValue) => {
    setFormAnswers(prev => ({ ...prev, [fieldId]: value }))
    if (formErrors[fieldId]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }

  useEffect(() => {
    if (!catalogCompanyId) return
    setCatalogLoading(true)
    Promise.all([
      departmentsService.list(catalogCompanyId, { activeOnly: true }),
      serviceCatalogService.listCategories(catalogCompanyId, { activeOnly: true }),
      serviceCatalogService.listServices(catalogCompanyId, { activeOnly: true }),
      serviceCatalogService.listAllServiceSymptoms(catalogCompanyId, { activeOnly: true }),
      serviceCatalogService.listRequestCategories(catalogCompanyId, { activeOnly: true }),
      serviceCatalogService.listRequestSubcategories(catalogCompanyId, { activeOnly: true }),
      serviceCatalogService.listRequestItems(catalogCompanyId, { activeOnly: true }),
    ])
      .then(([depts, cats, svcs, syms, rcats, rsubcats, ritems]) => {
        setDepartments(depts)
        setCategories(cats)
        setServices(svcs)
        setServiceSymptoms(syms)
        setReqCategories(rcats)
        setReqSubcategories(rsubcats)
        setReqItems(ritems)
      })
      .catch(console.error)
      .finally(() => setCatalogLoading(false))
  }, [catalogCompanyId])

  useEffect(() => {
    const saved = localStorage.getItem(LOGO_KEY)
    if (saved) setLogoDataUrl(saved)
  }, [LOGO_KEY])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const d = ev.target?.result as string
      localStorage.setItem(LOGO_KEY, d)
      setLogoDataUrl(d)
    }
    reader.readAsDataURL(file)
  }

  const clearLogo = (e: React.MouseEvent) => {
    e.stopPropagation()
    localStorage.removeItem(LOGO_KEY)
    setLogoDataUrl(null)
  }

  // ── Derived colors — sourced from tenant theme engine, no free hex ────────
  const sb          = getPortalSidebar(branding.themeName)
  const brand       = THEME_HEX_COLORS[branding.themeName as ThemeName] || '#10b981'
  const brandWash   = hexToRgba(brand, 0.12)
  const brandBorder = hexToRgba(brand, 0.30)
  const navActiveBg = sb.navActiveBg

  // ── Card settings (Global Catalog Styles) ──────────────────────────────────
  const cardSettings = (tenant?.catalog_ui_config as any)?.card_settings || {}

  const getIconSize = () => {
    switch (cardSettings.icon_size) {
      case 'small': return 36
      case 'large': return 68
      case 'xlarge': return 80
      case 'medium':
      default: return 52
    }
  }

  const getTitleFontSize = () => {
    switch (cardSettings.font_size) {
      case 'small': return '13px'
      case 'large': return '18px'
      case 'medium':
      default: return '15px'
    }
  }

  const catalogIconSize = getIconSize()
  const catalogFontSize = getTitleFontSize()
  const customIconBg = cardSettings.icon_bg_color || undefined
  const customPillBg = cardSettings.label_bg_color || undefined
  const customPillColor = cardSettings.label_color || undefined

  const allDbCats = useMemo(() => {
    const list: { id: string; name: string; icon: string | null; type: 'incident' | 'request'; departmentId: string | null; dbCat: any }[] = []
    categories.forEach(c => {
      list.push({ id: `inc-${c.id}`, name: c.name, icon: c.icon, type: 'incident', departmentId: c.department_id ?? null, dbCat: c })
    })
    reqCategories.forEach(c => {
      if (!list.some(x => x.name.toLowerCase() === c.name.toLowerCase())) {
        list.push({ id: `req-${c.id}`, name: c.name, icon: c.icon, type: 'request', departmentId: c.department_id ?? null, dbCat: c })
      }
    })
    return list
  }, [categories, reqCategories])

  const handleSelectDept = (deptId: string) => {
    setSelDeptId(deptId)
    setScreen('dept-cats')
  }
  const selDept = departments.find(d => d.id === selDeptId) || null

  // Uma categoria pertence ao fluxo padrão de TI quando não tem departamento (Global)
  // ou quando o departamento vinculado é literalmente "TI". Departamentos como RH,
  // Financeiro etc. só aparecem no fluxo próprio daquele departamento (dept-cats).
  const categoryBelongsToTI = (departmentId: string | null) => {
    if (!departmentId) return true
    const name = departments.find(d => d.id === departmentId)?.name
    return !name || !isNonItDepartment(name)
  }

  const visibleIncCategories = useMemo(() => {
    if (selDeptId) return categories.filter(c => c.department_id === selDeptId)
    return categories.filter(c => categoryBelongsToTI(c.department_id ?? null))
  }, [categories, departments, selDeptId])

  const visibleReqCategories = useMemo(() => {
    if (selDeptId) return reqCategories.filter(c => c.department_id === selDeptId)
    return reqCategories.filter(c => categoryBelongsToTI(c.department_id ?? null))
  }, [reqCategories, departments, selDeptId])

  // ── Search index ──────────────────────────────────────────────────────────
  const searchIdx = useMemo(() => {
    const incs = serviceSymptoms.map(ss => {
      const svc = services.find(s => s.id === ss.service_id)
      const cat = svc ? categories.find(c => c.id === svc.category_id) : undefined
      const label = ss.symptom?.name ? `${svc?.name || ''} — ${ss.symptom.name}` : (svc?.name || '')
      return {
        type: 'incident' as const,
        label,
        sub: `Incidente › ${cat?.name || ''}`,
        tag: 'Incidente',
        tagBg: '#fee2e2',
        tagFg: '#b91c1c',
        dbCat: cat || null,
        dbSymptom: ss,
      }
    })

    const reqs = reqItems.map(it => {
      const subcat = reqSubcategories.find(s => s.id === it.request_subcategory_id)
      const cat = subcat ? reqCategories.find(c => c.id === subcat.category_id) : undefined
      return {
        type: 'request' as const,
        label: it.name,
        sub: `Requisição › ${cat?.name || ''}`,
        tag: 'Requisição',
        tagBg: brandWash,
        tagFg: brand,
        dbCat: cat || null,
        dbItem: it,
      }
    })

    return [...incs, ...reqs]
  }, [serviceSymptoms, services, categories, reqItems, reqSubcategories, reqCategories, brandWash, brand])

  const q = searchQ.toLowerCase().trim()
  const searchResults = q.length >= 2 ? searchIdx.filter(r => `${r.label} ${r.sub}`.toLowerCase().includes(q)).slice(0, 8) : []

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goBack = () => {
    if (['dept-cats','tickets','history'].includes(screen)) {
      setScreen('home')
      setSelDeptId(null)
      setSelIncCat(null); setSelReqCat(null)
      setDbSelIncCat(null); setDbSelIncService(null); setDbSelSymptom(null); setDbSelReqCat(null)
    } else if (screen === 'inc-cats' || screen === 'req-cats') {
      setScreen(selDeptId ? 'dept-cats' : 'home')
      setSelIncCat(null); setSelReqCat(null)
      setDbSelIncCat(null); setDbSelIncService(null); setDbSelSymptom(null); setDbSelReqCat(null); setDbSelReqSubcat(null)
    } else if (screen === 'ticket-detail') {
      setScreen(selectedTicket && CLOSED_STATES.has(selectedTicket.state) ? 'history' : 'tickets')
    } else if (screen === 'inc-services') {
      setScreen('inc-cats')
      setDbSelIncService(null)
      setDbSelSymptom(null)
    } else if (screen === 'inc-symptoms') {
      setScreen(dbSelIncCat ? 'inc-services' : 'inc-cats')
      setSelSymptom(null)
      setDbSelIncService(null)
      setDbSelSymptom(null)
    } else if (screen === 'inc-form') {
      setScreen('inc-symptoms')
      setSelSymptom(null)
      setDbSelSymptom(null)
      setFormAnswers({})
      setFormErrors({})
    } else if (screen === 'req-subcats') {
      setScreen('req-cats')
      setDbSelReqSubcat(null)
    } else if (screen === 'req-items') {
      // Se veio pelo nível de subcategoria, volta para ele; senão, direto às categorias
      setScreen(dbSelReqSubcat ? 'req-subcats' : 'req-cats')
      setDbSelReqSubcat(null)
      setSelItem(null)
      setDbSelItem(null)
    } else if (screen === 'req-form') {
      setScreen('req-items')
      setSelItem(null)
      setDbSelItem(null)
      setFormAnswers({})
      setFormErrors({})
    }
  }

  const submit = async () => {
    if (!profile?.id || !profile?.company_id || submitting) return
    setSubmitting(true)
    setSubmitError(null)

    // Validação de formulário dinâmico
    const fields = screen === 'inc-form'
      ? (dbSelSymptom ? parseFormFields(dbSelSymptom.form_fields) : [])
      : (dbSelItem ? parseFormFields(dbSelItem.form_fields) : [])
      
    const missingFields = fields.filter(field => field.required && isEmptyFormValue(formAnswers[field.id]))
    if (missingFields.length > 0) {
      setFormErrors(Object.fromEntries(missingFields.map(field => [field.id, 'Este campo é obrigatório.'])))
      setSubmitError('Preencha os campos obrigatórios destacados.')
      setSubmitting(false)
      return
    }

    const formData = buildLabeledFormData(fields, formAnswers)

    try {
      let ticket: IncidentRow
      if (screen === 'inc-form' && dbSelSymptom) {
        const svc = services.find(s => s.id === dbSelSymptom.service_id)
        ticket = await serviceCatalogService.openRequest({
          companyId: profile.company_id,
          serviceId: dbSelSymptom.service_id,
          serviceName: svc?.name || 'Serviço',
          symptomId: dbSelSymptom.symptom_id,
          symptomName: dbSelSymptom.symptom?.name || 'Sintoma',
          slaHours: dbSelSymptom.sla_hours,
          assignmentGroupId: dbSelSymptom.assignment_group_id,
          assignmentGroupName: dbSelSymptom.group?.name || null,
          description: desc.trim() || undefined,
          callerId: profile.id,
          callerName: profile.name,
          impact,
          urgency,
          formData,
        })
      } else if (screen === 'req-form' && dbSelItem) {
        ticket = await serviceCatalogService.openServiceRequest({
          companyId: profile.company_id,
          item: {
            id: dbSelItem.id,
            name: dbSelItem.name,
            assignment_group_id: dbSelItem.assignment_group_id,
            request_subcategory_id: dbSelItem.request_subcategory_id,
            groupName: dbSelItem.group?.name || null,
          },
          formData,
          description: desc.trim() || undefined,
          callerId: profile.id,
          callerName: profile.name,
        })
      } else {
        // Fallback legado caso use mocks locais
        const category: IncidentCategory = INC_CAT_MAP[selIncCat?.id || ''] || 'Other'
        if (screen === 'inc-form') {
          ticket = await incidentsService.create({
            companyId:        profile.company_id,
            shortDescription: selSymptom || '',
            description:      desc || undefined,
            priority:         priorityString(impact, urgency),
            category,
            callerName:       profile.name,
            callerId:         profile.id,
          })
        } else {
          ticket = await incidentsService.openManual({
            companyId:        profile.company_id,
            ticketType:       'request',
            shortDescription: selItem || '',
            description:      desc || null,
            callerName:       profile.name,
            callerId:         profile.id,
            impact:           'Low',
            urgency:          'Low',
            priority:         'P4 - Low',
            startNow:         false,
            analystId:        profile.id,
            analystName:      profile.name,
          })
        }
      }

      setTicketNum(ticket.number)
      setTicketApprovalStatus(ticket.approval_status ?? 'not_required')
      setScreen('done')
      reloadTickets()
    } catch (err) {
      console.error('Erro ao abrir chamado:', err)
      setSubmitError('Erro ao abrir chamado. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const goHome = () => {
    setScreen('home')
    setSelDeptId(null)
    setSelIncCat(null); setSelSymptom(null); setSelReqCat(null); setSelItem(null)
    setDbSelIncCat(null); setDbSelIncService(null); setDbSelSymptom(null); setDbSelReqCat(null); setDbSelReqSubcat(null); setDbSelItem(null)
    setImpact('Media'); setUrgency('Media'); setDesc(''); setTicketNum(null)
    setFormAnswers({}); setFormErrors({}); setSubmitError(null)
  }

  const goTickets = () => {
    setSelIncCat(null); setSelSymptom(null); setSelReqCat(null); setSelItem(null)
    setDbSelIncCat(null); setDbSelIncService(null); setDbSelSymptom(null); setDbSelReqCat(null); setDbSelReqSubcat(null); setDbSelItem(null)
    setImpact('Media'); setUrgency('Media'); setDesc(''); setTicketNum(null)
    setFormAnswers({}); setFormErrors({}); setSubmitError(null)
    setScreen('tickets')
  }

  const openTicketDetail = async (t: IncidentRow) => {
    setSelectedTicket(t)
    setScreen('ticket-detail')
    try {
      const detail = await incidentsService.getPortalDetail(t.id, catalogCompanyId || '')
      setSelectedTicket(detail)
    } catch (err) {
      console.error('Erro ao buscar detalhes do chamado:', err)
    }
  }

  const selectedIncidentService = dbSelIncService
    ?? services.find(service => service.id === dbSelSymptom?.service_id)
    ?? null

  const isHome        = screen === 'home'
  const isFlow        = ['dept-cats','inc-cats','inc-services','inc-symptoms','inc-form','req-cats','req-subcats','req-items','req-form'].includes(screen)
  const isDone        = screen === 'done'
  const isTickets     = screen === 'tickets'
  const isHistory     = screen === 'history'
  const isTicketDetail = screen === 'ticket-detail'
  const isKnowledge   = screen === 'knowledge'
  const stepNum = ({ 'dept-cats':0,'inc-cats':1,'inc-services':2,'inc-symptoms':3,'inc-form':4,'req-cats':1,'req-subcats':2,'req-items':2,'req-form':3 } as Record<string,number>)[screen] || 0
  const flowStepCount = screen.startsWith('inc-') ? 4 : 3

  // Quando a origem é um card de departamento (RH, Financeiro…), o breadcrumb usa
  // o nome do departamento em vez do rótulo genérico "Reportar Problema"/"Solicitar Serviço".
  const incPrefix = selDeptId ? (selDept?.name || 'Departamento') : 'Reportar Problema'
  const reqPrefix = selDeptId ? (selDept?.name || 'Departamento') : 'Solicitar Serviço'

  const BREADCRUMB: Record<string, string> = {
    'dept-cats':    selDept?.name || 'Departamento',
    'inc-cats':     incPrefix,
    'inc-symptoms': `${incPrefix}  ›  ${dbSelIncCat?.name || selIncCat?.name || ''}`,
    'inc-form':     `${incPrefix}  ›  ${dbSelIncCat?.name || selIncCat?.name || ''}  ›  ${dbSelSymptom?.symptom?.name || selSymptom || ''}`,
    'req-cats':     reqPrefix,
    'req-subcats':  `${reqPrefix}  ›  ${dbSelReqCat?.name || ''}`,
    'req-items':    `${reqPrefix}  ›  ${dbSelReqCat?.name || selReqCat?.name || ''}${dbSelReqSubcat ? `  ›  ${dbSelReqSubcat.name}` : ''}`,
    'req-form':     `${reqPrefix}  ›  ${dbSelReqCat?.name || selReqCat?.name || ''}  ›  ${dbSelItem?.name || selItem || ''}`,
  }

  if (dbSelIncCat) {
    const separator = '  \u203A  '
    const categoryPath = `${incPrefix}${separator}${dbSelIncCat.name}`
    const servicePath = selectedIncidentService ? `${categoryPath}${separator}${selectedIncidentService.name}` : categoryPath
    BREADCRUMB['inc-services'] = categoryPath
    BREADCRUMB['inc-symptoms'] = servicePath
    BREADCRUMB['inc-form'] = `${servicePath}${separator}${dbSelSymptom?.symptom?.name || ''}`
  }

  const TOP_TITLES: Record<Screen, string> = {
    'home':          `Como posso te ajudar, ${profile?.name?.split(' ')[0] || 'você'}?`,
    'dept-cats':     selDept?.name || 'Departamento',
    'inc-cats':      incPrefix,
    'inc-services':  incPrefix,
    'inc-symptoms':  incPrefix,
    'inc-form':      incPrefix,
    'req-cats':      reqPrefix,
    'req-subcats':   reqPrefix,
    'req-items':     reqPrefix,
    'req-form':      reqPrefix,
    'done':          'Chamado registrado',
    'tickets':       'Meus Chamados',
    'history':       'Histórico',
    'ticket-detail': selectedTicket?.number ?? 'Detalhes do chamado',
    'knowledge':     'Base de Conhecimento',
  }

  const prio = PRIORITY_MATRIX[`${impact}-${urgency}`] || PRIORITY_MATRIX['Media-Media']!
  const userName = profile?.name || 'Usuário'

  // ── Nav items ─────────────────────────────────────────────────────────────
  const navItems = [
    { key:'home',    emoji:'🏠', label:'Início',            badge: null as number | null,
      active: isHome, onClick: goHome },
    { key:'tickets', emoji:'🎫', label:'Meus Chamados',     badge: activeCount > 0 ? activeCount : null,
      active: isTickets, onClick: goTickets },
    { key:'kb',      emoji:'📚', label:'Base de Conhecimento', badge: null,
      active: isKnowledge, onClick: () => setScreen('knowledge') },
    { key:'history', emoji:'📊', label:'Histórico',         badge: null,
      active: isHistory, onClick: () => setScreen('history') },
  ]

  return (
    <>
    <div style={{ width:'100%', height:'100vh', display:'flex', overflow:'hidden', fontFamily:'system-ui,sans-serif' }}>

      {/* ═══ SIDEBAR ═══ */}
      <div style={{ width:268, flexShrink:0, background:sb.bg, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Logo + company */}
        <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${sb.border}`, textAlign:'center' }}>
          <div style={{ display:'flex', justifyContent:'center', width:'100%', marginBottom:12 }}>
            {branding.logoUrl ? (
              <div style={{ width:'100%', height:56, borderRadius:8, overflow:'hidden' }}>
                <img src={branding.logoUrl} alt="Logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              </div>
            ) : logoDataUrl ? (
              <div style={{ width:'100%', height:56, borderRadius:8, overflow:'hidden', position:'relative', cursor:'pointer' }}
                title="Clique para trocar o logo" onClick={() => logoInputRef.current?.click()}>
                <img src={logoDataUrl} alt="Logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                <button onClick={clearLogo} title="Remover logo"
                  style={{ position:'absolute', top:4, right:4, width:18, height:18, borderRadius:'50%', background:'rgba(0,0,0,.45)', border:'none', color:'#fff', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', lineHeight:1 }}>
                  ×
                </button>
                <input ref={logoInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoUpload} />
              </div>
            ) : (
              <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', width:'100%', height:56, borderRadius:8, border:`1.5px dashed ${sb.muted}`, cursor:'pointer', gap:4 }} title="Clique para enviar logo">
                <span style={{ fontSize:18 }}>🖼️</span>
                <span style={{ font:'500 11px sans-serif', color:sb.muted }}>Enviar logo</span>
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoUpload} />
              </label>
            )}
          </div>
          <div style={{ font:'800 17px sans-serif', color:sb.text, letterSpacing:'-.02em', lineHeight:1.2 }}>{config.companyName}</div>
          <div style={{ font:'500 11px monospace', color:sb.muted, letterSpacing:'.04em', marginTop:2 }}>{config.portalTitle}</div>
        </div>

        {/* Nav */}
        <nav style={{ padding:'12px 12px 0', flexShrink:0 }}>
          {navItems.map(item => (
            <a key={item.key} href="#"
              onClick={e => { e.preventDefault(); item.onClick() }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background:item.active ? navActiveBg : 'transparent', color:item.active ? brand : sb.muted, font:'600 14px sans-serif', textDecoration:'none', marginBottom:3, transition:'background .12s,color .12s' }}>
              <span style={{ fontSize:16 }}>{item.emoji}</span>
              {item.label}
              {item.badge !== null && (
                <span style={{ marginLeft:'auto', font:'700 11px monospace', background:'#dc2626', color:'#fff', padding:'1px 7px', borderRadius:999, flexShrink:0 }}>
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        {/* Chamados Ativos */}
        <div style={{ margin:'12px 16px 0', borderTop:`1px solid ${sb.border}`, paddingTop:12, flexShrink:0 }}>
          <div style={{ font:'700 9px monospace', color:sb.muted, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10, padding:'0 4px' }}>
            Chamados Ativos
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {ticketsLoading ? (
              <div style={{ padding:'8px 11px', font:'500 12px sans-serif', color:sb.muted }}>Carregando...</div>
            ) : sidebarTickets.length === 0 ? (
              <div style={{ padding:'8px 11px', font:'500 12px sans-serif', color:sb.muted }}>Nenhum chamado aberto.</div>
            ) : sidebarTickets.map(t => (
              <a key={t.id} href="#" onClick={e => { e.preventDefault(); openTicketDetail(t) }}
                style={{ display:'block', padding:'10px 11px', background:sb.itemBg, border:`1px solid ${sb.border}`, borderRadius:9, textDecoration:'none', transition:'background .12s' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ font:'600 11px monospace', color:brand }}>{t.number}</span>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:getPriorityDot(t.priority), flexShrink:0, display:'inline-block' }} />
                </div>
                <div style={{ font:'600 13px sans-serif', color:sb.itemText, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.short_description}</div>
              </a>
            ))}
          </div>
        </div>

        {/* Mini stats */}
        <div style={{ margin:'12px 16px 0', flexShrink:0 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div style={{ padding:10, background:'rgba(220,38,38,.1)', border:'1px solid rgba(220,38,38,.18)', borderRadius:9, textAlign:'center' }}>
              <div style={{ font:'800 22px/1 sans-serif', color:'#ef4444' }}>{p1Count}</div>
              <div style={{ font:'700 9px sans-serif', color:'#ef4444', textTransform:'uppercase', letterSpacing:'.05em', marginTop:4 }}>Crítico P1</div>
            </div>
            <div style={{ padding:10, background:'rgba(5,150,105,.1)', border:'1px solid rgba(5,150,105,.18)', borderRadius:9, textAlign:'center' }}>
              <div style={{ font:'800 22px/1 sans-serif', color:'#10b981' }}>{slaOkPct}%</div>
              <div style={{ font:'700 9px sans-serif', color:'#10b981', textTransform:'uppercase', letterSpacing:'.05em', marginTop:4 }}>SLA OK</div>
            </div>
          </div>
        </div>

        {/* User footer */}
        <div style={{ marginTop:'auto', padding:'14px 16px', borderTop:`1px solid ${sb.border}`, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:brand, display:'flex', alignItems:'center', justifyContent:'center', font:'700 13px sans-serif', color:'#fff', flexShrink:0 }}>
            {getInitials(userName)}
          </div>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ font:'600 13px sans-serif', color:sb.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userName}</div>
            <div style={{ font:'400 11px sans-serif', color:sb.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.email || ''}</div>
          </div>
        </div>
      </div>

      {/* ═══ MAIN ═══ */}
      <div style={{
        flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden',
        background: branding.backgroundUrl
          ? `linear-gradient(rgba(248,250,252,0.92),rgba(248,250,252,0.92)),url("${branding.backgroundUrl}") center/cover`
          : '#f8fafc',
      }}>

        {/* Top bar */}
        <div style={{ flexShrink:0, background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'16px 28px' }}>
          <div style={{ font:'400 13px sans-serif', color:'#94a3b8', marginBottom:2 }}>{getGreeting()}</div>
          <div style={{ font:'800 25px/1.1 sans-serif', letterSpacing:'-.025em', color:'#0f172a' }}>{TOP_TITLES[screen]}</div>
        </div>

        {/* Search — home only */}
        {isHome && (
          <div style={{ flexShrink:0, padding:'14px 28px', background:'#fff', borderBottom:'1px solid #e2e8f0', position:'relative', zIndex:40 }}>
            <div style={{ position:'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
                style={{ position:'absolute', left:15, top:'50%', transform:'translateY(-50%)', width:17, height:17, pointerEvents:'none' }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input type="text" value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder="Busque um problema ou serviço… (ex: VPN, senha, notebook)"
                style={{ width:'100%', height:48, padding:'0 18px 0 46px', border:'2px solid #e2e8f0', borderRadius:13, background:'#f8fafc', font:'400 15px sans-serif', outline:'none', boxSizing:'border-box' }} />
              {searchOpen && searchResults.length > 0 && (
                <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, boxShadow:'0 8px 32px rgba(15,23,42,.12)', overflow:'hidden', zIndex:50 }}>
                  {searchResults.map((r, i) => (
                    <button key={i} onMouseDown={() => {
                      if (r.type === 'incident') {
                        setDbSelIncCat(r.dbCat);
                        setDbSelIncService(services.find(service => service.id === r.dbSymptom?.service_id) || null);
                        setDbSelSymptom(r.dbSymptom || null);
                        setScreen('inc-form');
                      } else {
                        setDbSelReqCat(r.dbCat);
                        setDbSelItem(r.dbItem || null);
                        setScreen('req-form');
                      }
                      setSearchQ(''); setSearchOpen(false)
                    }}
                      style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'11px 16px', background:'none', textAlign:'left', borderBottom:'1px solid #f1f5f9', cursor:'pointer' }}>
                      <span style={{ fontSize:17, flexShrink:0 }}>{r.type==='incident'?'⚠️':'✅'}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ font:'600 14px sans-serif', color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</div>
                        <div style={{ font:'400 12px sans-serif', color:'#94a3b8' }}>{r.sub}</div>
                      </div>
                      <span style={{ font:'600 11px monospace', padding:'2px 8px', borderRadius:5, flexShrink:0, background:r.tagBg, color:r.tagFg }}>{r.tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HOME */}
        {isHome && (
          <div style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
            <HomeContent
              config={config}
              brand={brand}
              brandWash={brandWash}
              brandBorder={brandBorder}
              lastClosedTicket={lastClosedTicket}
              onIncident={() => { setSelDeptId(null); setScreen('inc-cats') }}
              onRequest={() => { setSelDeptId(null); setScreen('req-cats') }}
              onReopenTicket={openTicketDetail}
              dbCategories={allDbCats}
              departments={departments}
              onSelectDept={handleSelectDept}
              cardSettings={cardSettings}
            />
          </div>
        )}

        {/* MEUS CHAMADOS */}
        {isTickets && (
          <div style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
            {ticketsLoading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, font:'500 14px sans-serif', color:'#94a3b8' }}>
                Carregando chamados...
              </div>
            ) : activeTickets.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, textAlign:'center' }}>
                <span style={{ fontSize:40 }}>🎫</span>
                <div style={{ font:'600 16px sans-serif', color:'#0f172a' }}>Nenhum chamado aberto</div>
                <div style={{ font:'400 13px sans-serif', color:'#94a3b8' }}>Você não possui chamados ativos no momento.</div>
                <button onClick={() => setScreen('inc-cats')}
                  style={{ marginTop:8, padding:'10px 20px', background:brand, borderRadius:10, font:'600 14px sans-serif', color:'#fff', border:'none', cursor:'pointer' }}>
                  Reportar problema
                </button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ font:'700 11px sans-serif', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                  {activeTickets.length} chamado{activeTickets.length !== 1 ? 's' : ''} ativo{activeTickets.length !== 1 ? 's' : ''}
                </div>
                {activeTickets.map(t => {
                  const ss = STATE_STYLE[t.state] || { bg:'#f1f5f9', fg:'#475569' }
                  const ps = PRIO_STYLE[t.priority || ''] || { bg:'#f1f5f9', fg:'#6b7280' }
                  return (
                    <button key={t.id} onClick={() => openTicketDetail(t)}
                      style={{ display:'flex', flexDirection:'column', gap:10, padding:'16px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'box-shadow .15s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <span style={{ font:'700 12px monospace', color:brand }}>{t.number}</span>
                        <span style={{ font:'600 11px sans-serif', padding:'2px 9px', borderRadius:99, background:ss.bg, color:ss.fg }}>
                          {STATE_LABELS_PT[t.state] || t.state}
                        </span>
                        <span style={{ font:'600 11px sans-serif', padding:'2px 9px', borderRadius:99, background:ps.bg, color:ps.fg, marginLeft:'auto' }}>
                          {t.priority}
                        </span>
                      </div>
                      <div style={{ font:'600 15px sans-serif', color:'#0f172a' }}>{t.short_description}</div>
                      <div style={{ font:'400 12px sans-serif', color:'#94a3b8' }}>
                        {t.ticket_type === 'incident' ? 'Incidente' : 'Requisição'} · Aberto em {fmtDate(t.created_at)}
                        {t.sla_breached && <span style={{ marginLeft:10, color:'#dc2626', fontWeight:700 }}>⚠ SLA vencido</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTÓRICO */}
        {isHistory && (
          <div style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
            {ticketsLoading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, font:'500 14px sans-serif', color:'#94a3b8' }}>
                Carregando histórico...
              </div>
            ) : closedTickets.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, textAlign:'center' }}>
                <span style={{ fontSize:40 }}>📊</span>
                <div style={{ font:'600 16px sans-serif', color:'#0f172a' }}>Nenhum chamado no histórico</div>
                <div style={{ font:'400 13px sans-serif', color:'#94a3b8' }}>Chamados resolvidos e fechados aparecerão aqui.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ font:'700 11px sans-serif', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                  {closedTickets.length} chamado{closedTickets.length !== 1 ? 's' : ''} no histórico
                </div>
                {closedTickets.map(t => {
                  const ss = STATE_STYLE[t.state] || { bg:'#f1f5f9', fg:'#475569' }
                  const ps = PRIO_STYLE[t.priority || ''] || { bg:'#f1f5f9', fg:'#6b7280' }
                  return (
                    <button key={t.id} onClick={() => openTicketDetail(t)}
                      style={{ display:'flex', flexDirection:'column', gap:10, padding:'16px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', opacity:.85, boxShadow:'0 1px 2px rgba(15,23,42,.03)', cursor:'pointer' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <span style={{ font:'700 12px monospace', color:'#64748b' }}>{t.number}</span>
                        <span style={{ font:'600 11px sans-serif', padding:'2px 9px', borderRadius:99, background:ss.bg, color:ss.fg }}>
                          {STATE_LABELS_PT[t.state] || t.state}
                        </span>
                        <span style={{ font:'600 11px sans-serif', padding:'2px 9px', borderRadius:99, background:ps.bg, color:ps.fg, marginLeft:'auto' }}>
                          {t.priority}
                        </span>
                      </div>
                      <div style={{ font:'600 15px sans-serif', color:'#334155' }}>{t.short_description}</div>
                      <div style={{ font:'400 12px sans-serif', color:'#94a3b8' }}>
                        {t.ticket_type === 'incident' ? 'Incidente' : 'Requisição'} · Atualizado em {fmtDate(t.updated_at)}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TICKET DETAIL */}
        {isTicketDetail && selectedTicket && (
          <div style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
            {/* Botão Voltar */}
            <button onClick={goBack}
              style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 13px', border:'1.5px solid #e2e8f0', borderRadius:9, font:'600 13px sans-serif', color:'#475569', background:'#fff', cursor:'pointer', marginBottom:20 }}>
              ← Voltar
            </button>

            {/* Cabeçalho */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:8 }}>
                <span style={{ font:'800 20px monospace', color:brand }}>{selectedTicket.number}</span>
                <span style={{ font:'600 12px sans-serif', padding:'3px 10px', borderRadius:99,
                  background: STATE_STYLE[selectedTicket.state]?.bg || '#f1f5f9',
                  color: STATE_STYLE[selectedTicket.state]?.fg || '#475569' }}>
                  {STATE_LABELS_PT[selectedTicket.state] || selectedTicket.state}
                </span>
                <span style={{ font:'600 12px sans-serif', padding:'3px 10px', borderRadius:99,
                  background: PRIO_STYLE[selectedTicket.priority || '']?.bg || '#f1f5f9',
                  color: PRIO_STYLE[selectedTicket.priority || '']?.fg || '#6b7280' }}>
                  {selectedTicket.priority || '—'}
                </span>
                <span style={{ marginLeft:'auto', font:'500 12px sans-serif', color:'#94a3b8' }}>
                  {selectedTicket.ticket_type === 'incident' ? '⚠️ Incidente' : '✅ Requisição'}
                </span>
              </div>
              
              {/* Caminho do Catálogo */}
              {((selectedTicket as any).catalog_category_name || (selectedTicket as any).catalog_selection_name) && (
                <div style={{ font: '500 12px sans-serif', color: '#64748b', marginBottom: 6 }}>
                  {(selectedTicket as any).catalog_category_name || 'Geral'} — {(selectedTicket as any).catalog_selection_name || 'Chamado'}
                </div>
              )}

              <h2 style={{ font:'700 24px/1.2 sans-serif', color:'#0f172a', margin: '4px 0 0' }}>
                {selectedTicket.short_description}
              </h2>
            </div>

            {/* Painel de SLA (idêntico ao Cockpit do Analista) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {(() => {
                const renderPortalSlaTimer = (
                  label: string,
                  deadline: string | null | undefined,
                  achievedAt: string | null | undefined,
                  isBreached: boolean | undefined,
                  nowTime: number,
                  createdAt: string | null | undefined,
                  pausedAt?: string | null
                ) => {
                  if (!deadline) {
                    return (
                      <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#f8fafc', borderRadius: '12px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b' }}>{label}</span>
                        <span style={{ fontSize: '13px', fontWeight: '600', fontStyle: 'italic', marginTop: '4px', color: '#94a3b8' }}>Sem prazo definido</span>
                      </div>
                    )
                  }

                  const targetTime = new Date(deadline).getTime()
                  const startTime = createdAt ? new Date(createdAt).getTime() : targetTime - (4 * 3600 * 1000)
                  const totalDuration = targetTime - startTime

                  let status: 'fulfilled' | 'breached' | 'warning' | 'normal' | 'paused' = 'normal'
                  let text = ''

                  if (achievedAt) {
                    status = 'fulfilled'
                    text = `Cumprido em ${new Date(achievedAt).toLocaleString('pt-BR')}`
                  } else if (pausedAt) {
                    // Congelado no instante da pausa — o prazo só é estendido de
                    // fato quando o chamado sai da pendência (tg_handle_sla_pause).
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

                  const styles = {
                    fulfilled: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
                    breached: { bg: '#fff1f2', border: '#fecdd3', text: '#9f1239' },
                    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
                    normal: { bg: '#f8fafc', border: '#e2e8f0', text: '#334155' },
                    paused: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }
                  }[status]

                  return (
                    <div style={{ border: `1px solid ${styles.border}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: styles.bg, color: styles.text }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.05em', opacity: 0.85 }}>{label}</span>
                      <span style={{ fontSize: '15px', fontWeight: '800', marginTop: '4px' }}>{text}</span>
                      {!achievedAt && status !== 'breached' && status !== 'paused' && (
                        <span style={{ fontSize: '9px', opacity: 0.75, marginTop: '2px' }}>Prazo: {new Date(deadline).toLocaleString('pt-BR')}</span>
                      )}
                    </div>
                  )
                }

                return (
                  <>
                    {renderPortalSlaTimer('Prazo Limite de Resposta', selectedTicket.sla_response_deadline, selectedTicket.responded_at, selectedTicket.is_response_breached, now, selectedTicket.created_at, selectedTicket.paused_at)}
                    {renderPortalSlaTimer('Prazo Limite de Solução', selectedTicket.sla_resolution_deadline, selectedTicket.resolved_at, selectedTicket.is_resolution_breached, now, selectedTicket.created_at, selectedTicket.paused_at)}
                  </>
                )
              })()}
            </div>

            {/* Layout em Duas Colunas */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              
              {/* Coluna Esquerda: Descrição, Chat e Histórico */}
              <div style={{ flex: '1 1 500px', minWidth: '320px' }}>
                
                {/* Seleção de Abas */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
                  <button
                    onClick={() => setDetailTab('messages')}
                    style={{
                      padding: '10px 16px',
                      border: 'none',
                      background: 'none',
                      borderBottom: detailTab === 'messages' ? `3px solid ${brand}` : '3px solid transparent',
                      color: detailTab === 'messages' ? brand : '#64748b',
                      fontWeight: detailTab === 'messages' ? '700' : '500',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    💬 Descrição & Conversa
                  </button>
                  <button
                    onClick={() => setDetailTab('history')}
                    style={{
                      padding: '10px 16px',
                      border: 'none',
                      background: 'none',
                      borderBottom: detailTab === 'history' ? `3px solid ${brand}` : '3px solid transparent',
                      color: detailTab === 'history' ? brand : '#64748b',
                      fontWeight: detailTab === 'history' ? '700' : '500',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    📋 Histórico de Ação Técnica
                  </button>
                  <button
                    onClick={() => setDetailTab('sla')}
                    style={{
                      padding: '10px 16px',
                      border: 'none',
                      background: 'none',
                      borderBottom: detailTab === 'sla' ? `3px solid ${brand}` : '3px solid transparent',
                      color: detailTab === 'sla' ? brand : '#64748b',
                      fontWeight: detailTab === 'sla' ? '700' : '500',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    ⏳ Controle de SLA
                  </button>
                </div>

                {detailTab === 'messages' ? (
                  <div>
                    {/* Descrição Original do Usuário */}
                    {selectedTicket.description && (
                      <div style={{ font:'400 14px/1.65 sans-serif', color:'#475569', marginBottom:20, padding:'14px 16px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
                        <div style={{ font: '700 11px sans-serif', textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', marginBottom: 4 }}>Descrição do Usuário</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{selectedTicket.description}</div>
                      </div>
                    )}

                    {/* Campos do Formulário Customizado */}
                    {(() => {
                      const formData = selectedTicket.form_data
                      if (formData && typeof formData === 'object' && !Array.isArray(formData) && Object.keys(formData).length > 0) {
                        return (
                          <div style={{ font:'400 14px/1.65 sans-serif', color:'#475569', marginBottom:20, padding:'14px 16px', background:'#f0f9ff', borderRadius:10, border:'1px solid #bae6fd' }}>
                            <div style={{ font: '700 11px sans-serif', textTransform: 'uppercase', letterSpacing: '.05em', color: '#0369a1', marginBottom: 8 }}>Dados do Formulário Customizado</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {Object.entries(formData).map(([label, val]) => (
                                <div key={label}>
                                  <div style={{ font: '700 12px sans-serif', color: '#0284c7' }}>{label}</div>
                                  <div style={{ font: '500 14px sans-serif', color: '#0f172a', whiteSpace: 'pre-wrap' }}>
                                    {typeof val === 'boolean' ? (val ? 'Sim' : 'Não') : String(val || '—')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Componente de Chat */}
                    <div style={{ marginBottom: 20 }}>
                      <TicketChat
                        incidentId={selectedTicket.id}
                        companyId={catalogCompanyId || ''}
                        senderId={profile?.id}
                        senderName={profile?.name || 'Usuário'}
                        actorType="user"
                        locked={CLOSED_STATES.has(selectedTicket.state)}
                      />
                    </div>

                    {selectedTicket.sla_breached && (
                      <div style={{ padding:'12px 14px', background:'#fee2e2', border:'1px solid #fecaca', borderRadius:10, marginBottom:20, font:'600 13px sans-serif', color:'#dc2626' }}>
                        ⚠️ SLA deste chamado está vencido. Nossa equipe está ciente e priorizando.
                      </div>
                    )}

                    {csatSurvey?.status === 'pending' && (
                      <div style={{ padding:'18px', background:'#fff', border:'1px solid #dbeafe', borderRadius:12, marginBottom:20 }}>
                        <div style={{ font:'700 14px sans-serif', color:'#0f172a', marginBottom:5 }}>Como foi o atendimento?</div>
                        <p style={{ font:'400 12px/1.5 sans-serif', color:'#64748b', margin:'0 0 12px' }}>Sua avaliação ajuda a melhorar o serviço.</p>
                        <div style={{ display:'flex', gap:7, marginBottom:12 }}>
                          {[1, 2, 3, 4, 5].map(rating => (
                            <button key={rating} onClick={() => setCsatRating(rating)}
                              aria-label={`Avaliar com ${rating} estrela${rating > 1 ? 's' : ''}`}
                              style={{ width:40, height:40, borderRadius:9, border:`1.5px solid ${csatRating === rating ? brand : '#e2e8f0'}`, background:csatRating === rating ? brandWash : '#fff', cursor:'pointer', fontSize:20 }}>
                              ⭐
                            </button>
                          ))}
                        </div>
                        <textarea value={csatComment} onChange={e => setCsatComment(e.target.value)} rows={2}
                          placeholder="Comentário opcional"
                          style={{ width:'100%', boxSizing:'border-box', resize:'vertical', border:'1px solid #e2e8f0', borderRadius:9, padding:'10px 12px', font:'400 13px sans-serif', marginBottom:10 }} />
                        <button onClick={() => void submitCsat()} disabled={!csatRating || csatSubmitting}
                          style={{ width:'100%', padding:10, border:0, borderRadius:9, background:brand, color:'#fff', font:'700 13px sans-serif', cursor:csatRating ? 'pointer' : 'not-allowed', opacity:csatRating ? 1 : .5 }}>
                          {csatSubmitting ? 'Enviando…' : 'Enviar avaliação'}
                        </button>
                      </div>
                    )}

                    {csatSurvey?.status === 'submitted' && (
                      <div style={{ padding:'12px 14px', background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:10, marginBottom:20, font:'600 13px sans-serif', color:'#047857' }}>
                        Obrigado pela avaliação de {csatSurvey.rating}/5.
                      </div>
                    )}

                    {CLOSED_STATES.has(selectedTicket.state) && (
                      <div style={{ padding:'14px 16px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:11, display:'flex', gap:10, alignItems:'flex-start' }}>
                        <span style={{ fontSize:16, flexShrink:0 }}>ℹ️</span>
                        <div style={{ flex:1 }}>
                          <div style={{ font:'600 13px sans-serif', color:'#92400e', marginBottom:4 }}>
                            Problema voltou a ocorrer?
                          </div>
                          <p style={{ font:'400 13px/1.5 sans-serif', color:'#92400e', margin:0 }}>
                            Abra um novo incidente descrevendo o problema atual. Nossa equipe irá vinculá-lo ao histórico.
                          </p>
                          <button onClick={() => { goHome(); setScreen('inc-cats') }}
                            style={{ marginTop:10, padding:'8px 14px', background:'#b45309', borderRadius:8, font:'600 13px sans-serif', color:'#fff', border:'none', cursor:'pointer' }}>
                            Abrir novo incidente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : detailTab === 'history' ? (
                  <div>
                    {/* Histórico de ações (abertura, mudanças de estado, comentários) */}
                    <IncidentActionHistory incidentId={selectedTicket.id} companyId={catalogCompanyId || ''} />
                  </div>
                ) : (
                  <div>
                    {/* Linha do tempo do controle de SLA, isolada para maior clareza */}
                    <SlaEventTimeline incidentId={selectedTicket.id} />
                  </div>
                )}
              </div>

              {/* Coluna Direita: Metadados do Chamado (Visão do Solicitante) */}
              <div style={{ flex: '0 0 300px', minWidth: '300px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ font: '700 14px sans-serif', color: '#0f172a', margin: '0 0 16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📋 Metadados do Chamado
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { label: 'Solicitante', value: selectedTicket.caller_name || 'Root Allied IT' },
                    { label: 'Empresa', value: tenant?.name || 'Alpha Tech' },
                    { label: 'Abertura', value: fmtDateTime(selectedTicket.created_at) },
                    { label: 'Tipo', value: selectedTicket.ticket_type === 'incident' ? 'Incidente' : 'Requisição' },
                    { label: 'Prioridade', value: selectedTicket.priority || '—' },
                    { label: 'Impacto', value: translateImpact(selectedTicket.impact) },
                    { label: 'Urgência', value: translateUrgency(selectedTicket.urgency) },
                    { label: 'Estado', value: STATE_LABELS_PT[selectedTicket.state] || selectedTicket.state },
                    { label: 'Responsável', value: selectedTicket.assigned_to_name || 'Não atribuído' },
                    { label: 'Grupo Técnico', value: selectedTicket.assigned_group_name || selectedTicket.assigned_group_id || 'Não atribuído' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ font: '700 10px sans-serif', textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', marginBottom: '3px' }}>
                        {label}
                      </div>
                      <div style={{ font: '600 13px sans-serif', color: '#334155' }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* KNOWLEDGE BASE */}
        {isKnowledge && (
          <div style={{ flex:1, overflowY:'auto', padding:'26px 28px' }}>
            <KnowledgePortal companyId={catalogCompanyId ?? ''} profileId={profile?.id ?? null} accent={brand} />
          </div>
        )}

        {/* FLOW screens */}
        {isFlow && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Back bar + progress dots */}
            <div style={{ flexShrink:0, padding:'12px 28px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <button onClick={goBack}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', border:'1.5px solid #e2e8f0', borderRadius:9, font:'600 13px sans-serif', color:'#475569', background:'#fff', cursor:'pointer' }}>
                  ← Voltar
                </button>
                <span style={{ font:'500 13px sans-serif', color:'#94a3b8' }}>{BREADCRUMB[screen]||''}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }} aria-label={`Etapa ${stepNum} de ${flowStepCount}`}>
                {Array.from({ length: flowStepCount }, (_, index) => (
                  <div key={index} style={{ display:'contents' }}>
                    {index > 0 && <div style={{ width:20, height:1, background:'#e2e8f0' }} />}
                    <div style={{ width:8, height:8, borderRadius:'50%', background:stepNum >= index + 1 ? brand : '#e2e8f0' }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'26px 28px' }}>

              {/* DEPT: Hub do departamento (RH, Financeiro…) — mesma escolha da home, mas escopada */}
              {screen === 'dept-cats' && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>{selDept?.name || 'Departamento'}</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>O que você precisa em {selDept?.name || 'departamento'}?</p>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <button onClick={() => setScreen('inc-cats')}
                      style={{ display:'flex', flexDirection:'column', gap:11, padding:20, background:'#fff', border:'2px solid #fecaca', borderRadius:14, textAlign:'left', boxShadow:'0 1px 3px rgba(220,38,38,.07)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                        <div style={{ width:44, height:44, borderRadius:12, background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>⚠️</div>
                        <div style={{ font:'700 16px sans-serif', color:'#dc2626' }}>Reportar Problema</div>
                      </div>
                      <div style={{ font:'400 13.5px/1.5 sans-serif', color:'#64748b' }}>Algo está com erro, lento ou fora do ar em {selDept?.name}.</div>
                      <div style={{ font:'700 13px sans-serif', color:'#dc2626' }}>Abrir incidente →</div>
                    </button>

                    <button onClick={() => setScreen('req-cats')}
                      style={{ display:'flex', flexDirection:'column', gap:11, padding:20, background:'#fff', border:`2px solid ${brand}`, borderRadius:14, textAlign:'left', boxShadow:'0 1px 3px rgba(15,23,42,.05)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                        <div style={{ width:44, height:44, borderRadius:12, background:brandWash, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>✅</div>
                        <div style={{ font:'700 16px sans-serif', color:brand }}>Solicitar Serviço</div>
                      </div>
                      <div style={{ font:'400 13.5px/1.5 sans-serif', color:'#64748b' }}>Peça acessos, documentos ou outros serviços de {selDept?.name}.</div>
                      <div style={{ font:'700 13px sans-serif', color:brand }}>Ver catálogo →</div>
                    </button>
                  </div>
                </div>
              )}

              {/* INC: Categorias */}
              {screen === 'inc-cats' && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>Qual área está com problema?</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione a categoria mais próxima do que está acontecendo.</p>

                  {catalogLoading ? (
                    <div style={{ padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>Carregando categorias...</div>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {visibleIncCategories.length > 0 ? (
                        visibleIncCategories.map(c => {
                          const catServices = services.filter(service => service.category_id === c.id)
                          return (
                            <button key={c.id} onClick={() => { setDbSelIncCat(c); setDbSelIncService(null); setDbSelSymptom(null); setScreen('inc-services') }}
                              style={{
                                display:'flex',
                                alignItems:'center',
                                gap:14,
                                padding:18,
                                background: customPillBg || '#fff',
                                border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0',
                                borderRadius:14,
                                textAlign:'left',
                                boxShadow:'0 1px 2px rgba(15,23,42,.04)',
                                cursor:'pointer',
                                transition:'transform .15s,box-shadow .15s'
                              }}>
                              <CatalogIcon icon={c.icon} name={c.name} size={catalogIconSize} bg={customIconBg} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>{c.name}</div>
                                <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>{catServices.length} servi&ccedil;o{catServices.length === 1 ? '' : 's'}</div>
                              </div>
                            </button>
                          )
                        })
                      ) : !selDeptId && categories.length === 0 ? (
                        // Fallback legado caso use mocks (só no fluxo padrão de TI, sem dados no banco)
                        config.incCats.map(c => (
                          <button key={c.id} onClick={() => { setSelIncCat(c); setScreen('inc-symptoms') }}
                            style={{ display:'flex', alignItems:'center', gap:14, padding:18, background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                            <div style={{ width:52, height:52, borderRadius:14, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>{c.emoji}</div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ font:'700 15px sans-serif', color:'#0f172a' }}>{c.name}</div>
                              <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:2 }}>{c.symptoms.length} sintomas</div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div style={{ gridColumn:'1 / -1', padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>
                          Nenhuma categoria de incidente cadastrada{selDept ? ` em ${selDept.name}` : ''}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}


              {/* INC: Servicos */}
              {screen === 'inc-services' && dbSelIncCat && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>Qual servi&ccedil;o foi afetado?</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione o servi&ccedil;o para visualizar os sintomas dispon&iacute;veis.</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {(() => {
                      const catServices = services.filter(service => service.category_id === dbSelIncCat.id)
                      if (catServices.length === 0) {
                        return <div style={{ gridColumn:'1 / -1', padding:20, color:'#94a3b8', font:'400 14px sans-serif', textAlign:'center' }}>Nenhum servi&ccedil;o cadastrado nesta categoria.</div>
                      }
                      return catServices.map(service => {
                        const symptomCount = serviceSymptoms.filter(item => item.service_id === service.id).length
                        return (
                          <button key={service.id} onClick={() => { setDbSelIncService(service); setDbSelSymptom(null); setScreen('inc-symptoms') }}
                            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'16px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
                              <CatalogIcon icon={service.icon} name={service.name} size={36} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ font:'700 14.5px sans-serif', color:'#0f172a' }}>{service.name}</div>
                                <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:2 }}>{symptomCount} sintoma{symptomCount === 1 ? '' : 's'}</div>
                              </div>
                            </div>
                            <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>&rarr;</span>
                          </button>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}

              {/* INC: Sintomas */}
              {screen === 'inc-symptoms' && (dbSelIncService || selIncCat) && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>O que está acontecendo?</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione o sintoma que melhor descreve o problema.</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                    {dbSelIncService ? (
                      (() => {
                        const catSymptoms = serviceSymptoms.filter(ss => ss.service_id === dbSelIncService.id)
                        
                        if (catSymptoms.length === 0) {
                          return <div style={{ padding:20, color:'#94a3b8', font:'400 14px sans-serif', textAlign:'center' }}>Nenhum sintoma cadastrado neste servi&ccedil;o.</div>
                        }
                        
                        return catSymptoms.map(ss => {
                          const svc = services.find(s => s.id === ss.service_id)
                          const label = ss.symptom?.name ? `${svc?.name || ''} — ${ss.symptom.name}` : (svc?.name || '')
                          const symptomLabel = ss.symptom?.name || label
                          return (
                            <button key={ss.id} onClick={() => { setDbSelSymptom(ss); setScreen('inc-form') }}
                              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                                <CatalogIcon icon={ss.symptom?.icon} name={symptomLabel} size={28} />
                                <span style={{ font:'600 14.5px sans-serif', color:'#0f172a', marginLeft:8 }}>{symptomLabel}</span>
                              </div>
                              <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                            </button>
                          )
                        })
                      })()
                    ) : (
                      selIncCat?.symptoms.map(s => (
                        <button key={s} onClick={() => { setSelSymptom(s); setScreen('inc-form') }}
                          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                            <div style={{ width:8, height:8, borderRadius:'50%', background:'#e2e8f0', flexShrink:0 }} />
                            <span style={{ font:'600 14.5px sans-serif', color:'#0f172a' }}>{s}</span>
                          </div>
                          <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* INC: Form */}
              {screen === 'inc-form' && (
                <div style={{ maxWidth:560 }}>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>Detalhes do incidente</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Informe o impacto para calcularmos a prioridade automaticamente.</p>

                  <div style={{ padding:'13px 16px', background:'#f8fafc', border:'1.5px solid #e2e8f0', borderRadius:11, display:'flex', alignItems:'center', gap:10, marginBottom:22 }}>
                    <span style={{ fontSize:16 }}>⚠️</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ font:'600 13.5px sans-serif', color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {dbSelSymptom ? (services.find(s => s.id === dbSelSymptom.service_id)?.name + ' — ' + (dbSelSymptom.symptom?.name || '')) : selSymptom}
                      </div>
                      <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:1 }}>
                        {dbSelIncCat ? dbSelIncCat.name : selIncCat?.name}
                      </div>
                    </div>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
                    <div>
                      <label style={{ display:'block', font:'700 11px sans-serif', textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:7 }}>Impacto</label>
                      <select value={impact} onChange={e => setImpact(e.target.value as typeof impact)}
                        style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, font:'500 14px sans-serif', color:'#0f172a', background:'#fff', outline:'none' }}>
                        <option value="Low">Apenas eu</option>
                        <option value="Media">Meu departamento</option>
                        <option value="High">Toda a empresa</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display:'block', font:'700 11px sans-serif', textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:7 }}>Urgência</label>
                      <select value={urgency} onChange={e => setUrgency(e.target.value as typeof urgency)}
                        style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, font:'500 14px sans-serif', color:'#0f172a', background:'#fff', outline:'none' }}>
                        <option value="Low">Consigo trabalhar</option>
                        <option value="Media">Tarefa importante parada</option>
                        <option value="High">Completamente travado</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius:999, background:prio.bg, marginBottom:20 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:prio.color }} />
                    <span style={{ font:'700 13px sans-serif', color:prio.color }}>Prioridade calculada: {prio.label}</span>
                  </div>

                  <div style={{ marginBottom:22 }}>
                    <label style={{ display:'block', font:'700 11px sans-serif', textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:7 }}>
                      Descrição adicional <span style={{ color:'#cbd5e1', fontWeight:400 }}>(opcional)</span>
                    </label>
                    <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
                      placeholder="Descreva o que está acontecendo, desde quando, se há mensagem de erro…"
                      style={{ width:'100%', padding:'12px 14px', border:'1.5px solid #e2e8f0', borderRadius:11, font:'400 14px sans-serif', color:'#0f172a', background:'#fff', outline:'none', resize:'none', lineHeight:1.5, boxSizing:'border-box' }} />
                  </div>

                  {dbSelSymptom && (
                    <div style={{ marginBottom:22 }}>
                      <DynamicFormFields
                        title="Formulário do Chamado"
                        fields={parseFormFields(dbSelSymptom.form_fields)}
                        answers={formAnswers}
                        errors={formErrors}
                        onChange={handleFormChange}
                      />
                    </div>
                  )}

                  {submitError && (
                    <div style={{ padding:'10px 14px', background:'#fee2e2', border:'1px solid #fecaca', borderRadius:9, font:'500 13px sans-serif', color:'#dc2626', marginBottom:14 }}>
                      {submitError}
                    </div>
                  )}

                  <button onClick={submit} disabled={submitting}
                    style={{ width:'100%', padding:14, background: submitting ? '#94a3b8' : '#dc2626', borderRadius:12, font:'700 15px sans-serif', color:'#fff', border:'none', cursor: submitting ? 'not-allowed' : 'pointer', transition:'opacity .15s' }}>
                    {submitting ? 'Abrindo…' : 'Abrir Incidente →'}
                  </button>
                </div>
              )}

              {/* REQ: Categorias */}
              {screen === 'req-cats' && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>O que você quer solicitar?</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione a categoria da solicitação.</p>

                  {catalogLoading ? (
                    <div style={{ padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>Carregando categorias...</div>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {visibleReqCategories.length > 0 ? (
                        visibleReqCategories.map(c => {
                          const catItems = reqItems.filter(it => {
                            if (it.request_category_id) return it.request_category_id === c.id
                            const sub = reqSubcategories.find(s => s.id === it.request_subcategory_id)
                            return sub ? sub.category_id === c.id : false
                          })
                          return (
                            <button key={c.id} onClick={() => {
                              setDbSelReqCat(c); setDbSelReqSubcat(null)
                              const hasSubcats = reqSubcategories.some(s => s.category_id === c.id && s.active)
                              setScreen(hasSubcats ? 'req-subcats' : 'req-items')
                            }}
                              style={{
                                display:'flex',
                                alignItems:'center',
                                gap:14,
                                padding:18,
                                background: customPillBg || '#fff',
                                border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0',
                                borderRadius:14,
                                textAlign:'left',
                                boxShadow:'0 1px 2px rgba(15,23,42,.04)',
                                cursor:'pointer',
                                transition:'transform .15s,box-shadow .15s'
                              }}>
                              <CatalogIcon icon={c.icon} name={c.name} size={catalogIconSize} bg={customIconBg} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>{c.name}</div>
                                <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>{catItems.length} itens</div>
                              </div>
                            </button>
                          )
                        })
                      ) : !selDeptId && reqCategories.length === 0 ? (
                        // Fallback legado caso use mocks (só no fluxo padrão de TI, sem dados no banco)
                        config.reqCats.map(c => (
                          <button key={c.id} onClick={() => { setSelReqCat(c); setScreen('req-items') }}
                            style={{ display:'flex', alignItems:'center', gap:14, padding:18, background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                            <div style={{ width:52, height:52, borderRadius:14, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>{c.emoji}</div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ font:'700 15px sans-serif', color:'#0f172a' }}>{c.name}</div>
                              <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:2 }}>{c.items.length} itens</div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div style={{ gridColumn:'1 / -1', padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>
                          Nenhuma categoria de requisição cadastrada{selDept ? ` em ${selDept.name}` : ''}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* REQ: Subcategorias (Nível 2 — migration 047) */}
              {screen === 'req-subcats' && dbSelReqCat && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>{dbSelReqCat.name}</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione a subcategoria.</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {reqSubcategories.filter(s => s.category_id === dbSelReqCat.id && s.active).map(s => {
                      const count = reqItems.filter(it => it.request_subcategory_id === s.id).length
                      return (
                        <button key={s.id} onClick={() => { setDbSelReqSubcat(s); setScreen('req-items') }}
                          style={{ display:'flex', alignItems:'center', gap:14, padding:18, background: customPillBg || '#fff', border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                          <CatalogIcon icon={s.icon} name={s.name} size={catalogIconSize} bg={customIconBg} />
                          <div style={{ minWidth:0 }}>
                            <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>{s.name}</div>
                            <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>{count} iten{count === 1 ? '' : 's'}</div>
                          </div>
                        </button>
                      )
                    })}
                    {/* Itens legados sem subcategoria: card "Outros" */}
                    {reqItems.some(it => !it.request_subcategory_id && it.request_category_id === dbSelReqCat.id) && (
                      <button onClick={() => { setDbSelReqSubcat({ id: OTHERS_SUBCAT_ID, company_id: dbSelReqCat.company_id, category_id: dbSelReqCat.id, name: 'Outros', description: null, icon: '📂', active: true, sort_order: 999, created_at: '', updated_at: '' }); setScreen('req-items') }}
                        style={{ display:'flex', alignItems:'center', gap:14, padding:18, background: customPillBg || '#fff', border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                        <CatalogIcon icon="📂" name="Outros" size={catalogIconSize} bg={customIconBg} />
                        <div style={{ minWidth:0 }}>
                          <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>Outros</div>
                          <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>Demais solicitações</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* REQ: Itens */}
              {screen === 'req-items' && (dbSelReqCat || selReqCat) && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>{dbSelReqSubcat && dbSelReqSubcat.id !== OTHERS_SUBCAT_ID ? dbSelReqSubcat.name : dbSelReqCat ? dbSelReqCat.name : selReqCat?.name}</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione o item desejado.</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                    {dbSelReqCat ? (
                      (() => {
                        // Com subcategoria selecionada: itens dela; "Outros"/sem subcategorias: itens legados da categoria
                        const catItems = dbSelReqSubcat && dbSelReqSubcat.id !== OTHERS_SUBCAT_ID
                          ? reqItems.filter(it => it.request_subcategory_id === dbSelReqSubcat.id)
                          : dbSelReqSubcat?.id === OTHERS_SUBCAT_ID
                            ? reqItems.filter(it => !it.request_subcategory_id && it.request_category_id === dbSelReqCat.id)
                            : reqItems.filter(it => {
                                if (it.request_category_id) return it.request_category_id === dbSelReqCat.id
                                const sub = reqSubcategories.find(s => s.id === it.request_subcategory_id)
                                return sub ? sub.category_id === dbSelReqCat.id : false
                              })

                        if (catItems.length === 0) {
                          return <div style={{ padding:20, color:'#94a3b8', font:'400 14px sans-serif', textAlign:'center' }}>Nenhum item disponível nesta categoria.</div>
                        }

                        return catItems.map(item => (
                          <button key={item.id} onClick={() => { setDbSelItem(item); setScreen('req-form') }}
                            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                              <CatalogIcon icon={item.icon} name={item.name} size={28} />
                              <span style={{ font:'600 14.5px sans-serif', color:'#0f172a', marginLeft:8 }}>{item.name}</span>
                            </div>
                            <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                          </button>
                        ))
                      })()
                    ) : (
                      selReqCat?.items.map(item => (
                        <button key={item} onClick={() => { setSelItem(item); setScreen('req-form') }}
                          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                          <span style={{ font:'600 14.5px sans-serif', color:'#0f172a' }}>{item}</span>
                          <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* REQ: Form */}
              {screen === 'req-form' && (
                <div style={{ maxWidth:560 }}>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>Detalhes da requisição</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Confirme o item e adicione detalhes.</p>

                  <div style={{ padding:'13px 16px', background:'#f8fafc', border:'1.5px solid #e2e8f0', borderRadius:11, display:'flex', alignItems:'center', gap:10, marginBottom:22 }}>
                    <span style={{ fontSize:16 }}>✅</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ font:'600 13.5px sans-serif', color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {dbSelItem ? dbSelItem.name : selItem}
                      </div>
                      <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:1 }}>
                        {dbSelReqCat ? dbSelReqCat.name : selReqCat?.name}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom:22 }}>
                    <label style={{ display:'block', font:'700 11px sans-serif', textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:7 }}>
                      Justificativa <span style={{ color:'#cbd5e1', fontWeight:400 }}>(opcional)</span>
                    </label>
                    <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
                      placeholder="Explique por que você precisa deste item, configurações específicas, prazo…"
                      style={{ width:'100%', padding:'12px 14px', border:'1.5px solid #e2e8f0', borderRadius:11, font:'400 14px sans-serif', color:'#0f172a', background:'#fff', outline:'none', resize:'none', lineHeight:1.5, boxSizing:'border-box' }} />
                  </div>

                  {dbSelItem && (
                    <div style={{ marginBottom:22 }}>
                      <DynamicFormFields
                        title="Formulário do Serviço"
                        fields={parseFormFields(dbSelItem.form_fields)}
                        answers={formAnswers}
                        errors={formErrors}
                        onChange={handleFormChange}
                      />
                    </div>
                  )}

                  {submitError && (
                    <div style={{ padding:'10px 14px', background:'#fee2e2', border:'1px solid #fecaca', borderRadius:9, font:'500 13px sans-serif', color:'#dc2626', marginBottom:14 }}>
                      {submitError}
                    </div>
                  )}

                  <button onClick={submit} disabled={submitting}
                    style={{ width:'100%', padding:14, background: submitting ? '#94a3b8' : brand, borderRadius:12, font:'700 15px sans-serif', color:'#fff', border:'none', cursor: submitting ? 'not-allowed' : 'pointer', transition:'opacity .15s' }}>
                    {submitting ? 'Enviando…' : 'Enviar Requisição →'}
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

        {/* DONE */}
        {isDone && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40, background:'#f8fafc' }}>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20, boxShadow:'0 2px 8px rgba(15,23,42,.05),0 24px 64px rgba(15,23,42,.08)', width:'100%', maxWidth:480, overflow:'hidden' }}>
              <div style={{ height:4, background:brand }} />
              <div style={{ padding:'40px 36px', textAlign:'center' }}>
                <div style={{ width:72, height:72, borderRadius:'50%', background:brandWash, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 22px', fontSize:32 }}>✅</div>
                <h2 style={{ font:'800 24px/1.2 sans-serif', letterSpacing:'-.02em', color:'#0f172a', marginBottom:10 }}>Chamado aberto com sucesso!</h2>
                <p style={{ font:'400 14px/1.55 sans-serif', color:'#64748b', marginBottom:24 }}>
                  {ticketApprovalStatus === 'pending'
                    ? 'Sua requisição foi enviada para aprovação. O atendimento começa após a decisão do grupo responsável.'
                    : 'Nossa equipe já recebeu e está analisando. Você será notificado por e-mail.'}
                </p>
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'10px 20px', background:'#f8fafc', border:'1.5px solid #e2e8f0', borderRadius:10, marginBottom:28 }}>
                  <span style={{ font:'700 14px monospace', color:brand }}>{ticketNum}</span>
                  <span style={{ font:'400 13px sans-serif', color:'#94a3b8' }}>· Anote este número</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <button onClick={goHome}
                    style={{ width:'100%', padding:13, background:brand, borderRadius:11, font:'700 14px sans-serif', color:'#fff', border:'none', cursor:'pointer', transition:'opacity .15s' }}>
                    Abrir novo chamado
                  </button>
                  <button onClick={goTickets}
                    style={{ width:'100%', padding:13, background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:11, font:'600 14px sans-serif', color:'#475569', cursor:'pointer', transition:'background .12s' }}>
                    Ir para Meus Chamados
                  </button>
                </div>
              </div>
              <div style={{ padding:'12px 28px', borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ font:'500 11px sans-serif', color:'#94a3b8', display:'flex', alignItems:'center', gap:5 }}>🔒 Servicefy Security Protocol</span>
                <span style={{ font:'500 11px monospace', color:'#94a3b8' }}>{ticketNum}-sfy</span>
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
    <VirtualAgentWidget companyId={catalogCompanyId} />
    </>
  )
}

export default UserPortalLayout
