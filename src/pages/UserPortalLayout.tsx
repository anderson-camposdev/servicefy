import { useState, useEffect, useRef, useMemo } from 'react'
import { useTenant } from '../tenant'
import { useAuth } from '../auth'
import { useBranding } from '../theme/ThemeProvider'
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
import { getPortalTicketGuidance } from '../lib/portal-ticket-guidance'
import DynamicFormFields from './DynamicFormFields'
import CatalogIcon from './CatalogIcon'
import VirtualAgentWidget from '../components/VirtualAgentWidget'
import TicketChat from './TicketChat'
import SlaEventTimeline from './SlaEventTimeline'
import IncidentActionHistory from './IncidentActionHistory'
import { PortalSearchHeader } from '../components/portal/PortalSearchHeader'
import { UserServiceCatalog } from '../components/portal/UserServiceCatalog'
import { UserTicketList } from '../components/portal/UserTicketList'
import { KnowledgeQuickView } from '../components/portal/KnowledgeQuickView'

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
  'High-Medium': { label: 'P2 — Alta',     color: '#ea580c', bg: '#ffedd5' },
  'Medium-High': { label: 'P2 — Alta',     color: '#ea580c', bg: '#ffedd5' },
  'High-Low':    { label: 'P3 — Moderada', color: '#d97706', bg: '#fef9c3' },
  'Low-High':    { label: 'P3 — Moderada', color: '#d97706', bg: '#fef9c3' },
  'Medium-Medium': { label: 'P3 — Moderada', color: '#d97706', bg: '#fef9c3' },
  'Medium-Low':  { label: 'P4 — Baixa',    color: '#2563eb', bg: '#dbeafe' },
  'Low-Medium':  { label: 'P4 — Baixa',    color: '#2563eb', bg: '#dbeafe' },
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

const themeClasses: Record<ThemeName, {
  headerBg: string
  headerBorder: string
  headerText: string
  accentBg: string
  accentText: string
}> = {
  CorporateBlue: { headerBg: 'bg-slate-900', headerBorder: 'border-slate-700/50', headerText: 'text-white', accentBg: 'bg-sky-50', accentText: 'text-sky-600' },
  Ocean: { headerBg: 'bg-blue-950', headerBorder: 'border-blue-800/30', headerText: 'text-white', accentBg: 'bg-blue-50', accentText: 'text-blue-600' },
  Midnight: { headerBg: 'bg-slate-950', headerBorder: 'border-slate-800/50', headerText: 'text-white', accentBg: 'bg-indigo-50', accentText: 'text-indigo-600' },
  Emerald: { headerBg: 'bg-emerald-950', headerBorder: 'border-emerald-800/40', headerText: 'text-white', accentBg: 'bg-emerald-50', accentText: 'text-emerald-600' },
  Ruby: { headerBg: 'bg-rose-950', headerBorder: 'border-rose-900/40', headerText: 'text-white', accentBg: 'bg-rose-50', accentText: 'text-rose-600' },
  Amethyst: { headerBg: 'bg-purple-950', headerBorder: 'border-purple-900/40', headerText: 'text-white', accentBg: 'bg-purple-50', accentText: 'text-purple-600' },
  Sunset: { headerBg: 'bg-amber-950', headerBorder: 'border-amber-900/40', headerText: 'text-white', accentBg: 'bg-orange-50', accentText: 'text-orange-600' },
  Graphite: { headerBg: 'bg-zinc-950', headerBorder: 'border-zinc-800/40', headerText: 'text-white', accentBg: 'bg-zinc-100', accentText: 'text-zinc-600' },
  Crimson: { headerBg: 'bg-red-950', headerBorder: 'border-red-900/40', headerText: 'text-white', accentBg: 'bg-red-50', accentText: 'text-red-700' },
  Forest: { headerBg: 'bg-teal-950', headerBorder: 'border-teal-900/40', headerText: 'text-white', accentBg: 'bg-teal-50', accentText: 'text-teal-700' },
  Pearl: {
    headerBg: 'bg-slate-50',
    headerBorder: 'border-slate-200',
    headerText: 'text-slate-900',
    accentBg: 'bg-indigo-50',
    accentText: 'text-indigo-600',
  },
  Breeze: { headerBg: 'bg-sky-50', headerBorder: 'border-sky-200', headerText: 'text-sky-900', accentBg: 'bg-sky-50', accentText: 'text-sky-600' },
  Meadow: { headerBg: 'bg-green-50', headerBorder: 'border-green-200', headerText: 'text-green-900', accentBg: 'bg-green-50', accentText: 'text-green-700' },
  Blush: { headerBg: 'bg-rose-50', headerBorder: 'border-rose-200', headerText: 'text-rose-900', accentBg: 'bg-rose-50', accentText: 'text-rose-600' },
  Stone: {
    headerBg: 'bg-stone-50',
    headerBorder: 'border-stone-200',
    headerText: 'text-stone-900',
    accentBg: 'bg-amber-50',
    accentText: 'text-amber-700',
  },
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
  dbCategories?: { id: string; name: string; icon: string | null; type: 'incident' | 'request'; departmentId: string | null; dbCat: CatalogCategoryRow | RequestCategoryRow }[]
  departments?: DepartmentRow[]
  onSelectDept?: (deptId: string) => void
  cardSettings?: import('../lib/branding.types').CardSettings
  portalButtons?: import('../lib/branding.types').PortalButtonsConfig
  themeName: string
}

// TI é o catálogo padrão, já acessível pelos botões "Reportar Problema" / "Solicitar Serviço" —
// categorias sem departamento (Global) ou explicitamente do departamento "TI" não entram na
// grade de departamentos abaixo, que é reservada para os demais catálogos (RH, Financeiro, etc).
const isNonItDepartment = (name: string) => {
  const n = name.trim().toLowerCase()
  return n !== 'ti' && n !== 't.i.' && n !== 'tecnologia da informação' && n !== 'infraestrutura de ti'
}

function HomeContent({ config, brand, brandWash: _brandWash, brandBorder: _brandBorder, lastClosedTicket, onIncident, onRequest, onReopenTicket, dbCategories, departments, onSelectDept, cardSettings, portalButtons, themeName }: HomeContentProps) {
  const cardSettingsObj = cardSettings || { layout: 'grid' }
  const portalButtonsObj = portalButtons || {}
  const currentTheme = themeClasses[themeName as ThemeName] || themeClasses.CorporateBlue

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
        <button onClick={onIncident} className="flex flex-col gap-3 p-5 bg-white border-2 border-red-100 hover:border-red-250 rounded-2xl text-left shadow-sm hover:shadow transition-all duration-150 cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center text-2xl shrink-0">
              {portalButtonsObj.incident_emoji || '⚠️'}
            </div>
            <div className="font-bold text-base text-red-600">
              {portalButtonsObj.incident_label || 'Reportar Problema'}
            </div>
          </div>
          <div className="text-sm text-slate-500 leading-relaxed">
            {portalButtonsObj.incident_desc || 'Algo está com erro, lento ou fora do ar. Diagnosticamos em 3 passos.'}
          </div>
          <div className="font-bold text-xs text-red-600">
            Abrir incidente →
          </div>
        </button>

        <button onClick={onRequest} className="flex flex-col gap-3 p-5 bg-white border-2 border-slate-100 hover:border-slate-200 rounded-2xl text-left shadow-sm hover:shadow transition-all duration-150 cursor-pointer">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl ${currentTheme.accentBg} flex items-center justify-center text-2xl shrink-0`}>
              {portalButtonsObj.request_emoji || '✅'}
            </div>
            <div className={`font-bold text-base ${currentTheme.accentText}`}>
              {portalButtonsObj.request_label || 'Solicitar Serviço'}
            </div>
          </div>
          <div className="text-sm text-slate-500 leading-relaxed">
            {portalButtonsObj.request_desc || 'Peça equipamentos, acessos, softwares ou outros serviços do catálogo.'}
          </div>
          <div className={`font-bold text-xs ${currentTheme.accentText}`}>
            Ver catálogo →
          </div>
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
  const { tenant } = useTenant()
  const { branding, company: brandedCompany } = useBranding()
  const { profile } = useAuth()
  const effectiveCompany = brandedCompany ?? tenant
  const catalogCompanyId = companyId || profile?.company_id || effectiveCompany?.id

  const LOGO_KEY   = `servicefy-portal-logo-${effectiveCompany?.id || 'default'}`
  const CONFIG_KEY = `servicefy-portal-config-${effectiveCompany?.id || 'default'}`

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
      companyName: branding.name || DEFAULT_CONFIG.companyName,
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

  useEffect(() => {
    const handleTicketCreated = () => {
      reloadTickets()
    }
    window.addEventListener('ticket-created', handleTicketCreated)
    return () => {
      window.removeEventListener('ticket-created', handleTicketCreated)
    }
  }, [profile?.id, profile?.company_id])

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
  const [impact, setImpact]             = useState<'Low'|'Medium'|'High'>('Medium')
  const [urgency, setUrgency]           = useState<'Low'|'Medium'|'High'>('Medium')
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
  const cardSettings = (effectiveCompany?.catalog_ui_config as any)?.card_settings || {}

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
    setImpact('Medium'); setUrgency('Medium'); setDesc(''); setTicketNum(null)
    setFormAnswers({}); setFormErrors({}); setSubmitError(null)
  }

  const goTickets = () => {
    setSelIncCat(null); setSelSymptom(null); setSelReqCat(null); setSelItem(null)
    setDbSelIncCat(null); setDbSelIncService(null); setDbSelSymptom(null); setDbSelReqCat(null); setDbSelReqSubcat(null); setDbSelItem(null)
    setImpact('Medium'); setUrgency('Medium'); setDesc(''); setTicketNum(null)
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
  const selectedTicketGuidance = selectedTicket ? getPortalTicketGuidance(selectedTicket) : null
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

  const handleSelectSearchResult = (r: any) => {
    if (r.type === 'incident') {
      setDbSelIncCat(r.dbCat)
      setDbSelIncService(services.find(service => service.id === r.dbSymptom?.service_id) || null)
      setDbSelSymptom(r.dbSymptom || null)
      setScreen('inc-form')
    } else {
      setDbSelReqCat(r.dbCat)
      setDbSelItem(r.dbItem || null)
      setScreen('req-form')
    }
    setSearchQ('')
    setSearchOpen(false)
  }

  const prio = PRIORITY_MATRIX[`${impact}-${urgency}`] || PRIORITY_MATRIX['Medium-Medium']!
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
    <div className="servicefy-portal-shell" style={{ width:'100%', height:'100vh', display:'flex', overflow:'hidden' }}>

      {/* ═══ SIDEBAR ═══ */}
      <div className="servicefy-portal-sidebar" style={{ width:268, flexShrink:0, background:sb.bg, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Logo + company */}
        <div className="servicefy-portal-brand" style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${sb.border}`, textAlign:'center' }}>
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
        <nav className="servicefy-portal-nav" aria-label="Navegação do portal" style={{ padding:'12px 12px 0', flexShrink:0 }}>
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
        <div className="servicefy-portal-active-tickets" style={{ margin:'12px 16px 0', borderTop:`1px solid ${sb.border}`, paddingTop:12, flexShrink:0 }}>
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
        <div className="servicefy-portal-stats" style={{ margin:'12px 16px 0', flexShrink:0 }}>
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
        <div className="servicefy-portal-user" style={{ marginTop:'auto', padding:'14px 16px', borderTop:`1px solid ${sb.border}`, display:'flex', alignItems:'center', gap:10 }}>
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
      <div className="servicefy-portal-main" style={{
        flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden',
        background: branding.backgroundUrl
          ? `linear-gradient(rgba(248,250,252,0.92),rgba(248,250,252,0.92)),url("${branding.backgroundUrl}") center/cover`
          : '#f8fafc',
      }}>

        {/* Top bar */}
        {(() => {
          const currentTheme = themeClasses[branding.themeName as ThemeName] || themeClasses.CorporateBlue
          return (
            <div className={`servicefy-portal-header flex-shrink-0 border-b px-7 py-4 ${currentTheme.headerBg} ${currentTheme.headerBorder}`}>
              <div className={`text-xs font-semibold ${currentTheme.headerText === 'text-white' ? 'text-slate-300' : 'text-slate-500'} mb-0.5`} style={{ color: branding.greetingColor || undefined }}>
                {branding.greetingPrefix ? `${branding.greetingPrefix}, ${profile?.name?.split(' ')[0] || 'você'}` : getGreeting()}
              </div>
              <div className={`text-2xl font-black tracking-tight ${currentTheme.headerText}`}>
                {screen === 'home' && branding.welcomeTitle ? branding.welcomeTitle : TOP_TITLES[screen]}
              </div>
              {screen === 'home' && branding.welcomeSubtitle && (
                <div className={`text-sm ${currentTheme.headerText === 'text-white' ? 'text-slate-300' : 'text-slate-500'} mt-1`}>
                  {branding.welcomeSubtitle}
                </div>
              )}
            </div>
          )
        })()}

        {/* Search — home only */}
        {isHome && (
          <PortalSearchHeader
            searchQ={searchQ}
            setSearchQ={setSearchQ}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchResults={searchResults}
            onSelectResult={handleSelectSearchResult}
          />
        )}

        {/* HOME */}
        {isHome && (
          <div className="servicefy-portal-content" style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
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
              portalButtons={(effectiveCompany?.catalog_ui_config as any)?.portal_buttons}
              themeName={branding.themeName}
            />
          </div>
        )}

        {/* MEUS CHAMADOS */}
        {isTickets && (
          <div className="servicefy-portal-content" style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
            <UserTicketList
              ticketsLoading={ticketsLoading}
              tickets={activeTickets}
              brand={brand}
              isHistory={false}
              onSelectTicket={openTicketDetail}
              onReportProblem={() => setScreen('inc-cats')}
            />
          </div>
        )}

        {/* HISTÓRICO */}
        {isHistory && (
          <div className="servicefy-portal-content" style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
            <UserTicketList
              ticketsLoading={ticketsLoading}
              tickets={closedTickets}
              brand={brand}
              isHistory={true}
              onSelectTicket={openTicketDetail}
              onReportProblem={() => setScreen('inc-cats')}
            />
          </div>
        )}

        {/* TICKET DETAIL */}
        {isTicketDetail && selectedTicket && (
          <div className="servicefy-portal-content" style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
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
            {selectedTicketGuidance && (() => {
              const tones = {
                info: { bg:'#eff6ff', border:'#bfdbfe', accent:'#2563eb' },
                progress: { bg:'#ecfdf5', border:'#a7f3d0', accent:'#047857' },
                attention: { bg:'#fff7ed', border:'#fed7aa', accent:'#c2410c' },
                success: { bg:'#f0fdf4', border:'#bbf7d0', accent:'#15803d' },
                danger: { bg:'#fff1f2', border:'#fecdd3', accent:'#be123c' },
              }[selectedTicketGuidance.tone]
              return (
                <div style={{ display:'flex', gap:14, alignItems:'flex-start', padding:'16px 18px', marginBottom:18, border:`1px solid ${tones.border}`, borderRadius:12, background:tones.bg }}>
                  <span aria-hidden="true" style={{ color:tones.accent, font:'800 18px/1 sans-serif', paddingTop:2 }}>
                    {selectedTicketGuidance.requiresUserAction ? '!' : '→'}
                  </span>
                  <div>
                    <div style={{ font:'700 11px sans-serif', color:tones.accent, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                      {selectedTicketGuidance.eyebrow}
                    </div>
                    <div style={{ font:'700 15px sans-serif', color:'#0f172a', marginBottom:4 }}>
                      {selectedTicketGuidance.title}
                    </div>
                    <div style={{ font:'400 13px/1.55 sans-serif', color:'#475569' }}>
                      {selectedTicketGuidance.description}
                    </div>
                    {selectedTicketGuidance.requiresUserAction && (
                      <button onClick={() => setDetailTab('messages')} style={{ marginTop:10, padding:0, border:0, background:'transparent', color:tones.accent, font:'700 13px sans-serif', cursor:'pointer' }}>
                        Ir para a conversa →
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

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
                    { label: 'Empresa', value: branding.name },
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
          <KnowledgeQuickView
            catalogCompanyId={catalogCompanyId ?? ''}
            profileId={profile?.id ?? null}
            brand={brand}
          />
        )}

        {/* FLOW screens */}
        {isFlow && (
          <div className="servicefy-portal-flow" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Back bar + progress dots */}
            <div className="servicefy-portal-flowbar" style={{ flexShrink:0, padding:'12px 28px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
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

            <div className="servicefy-portal-flow-content" style={{ flex:1, overflowY:'auto', padding:'26px 28px' }}>

              {/* DEPT: Hub do departamento (RH, Financeiro…) — mesma escolha da home, mas escopada */}
              {screen === 'dept-cats' && (
                <div>
                  <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>{selDept?.name || 'Departamento'}</h2>
                  <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>O que você precisa em {selDept?.name || 'departamento'}?</p>

                  <div className="servicefy-portal-choice-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
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

              {/* INC: Categorias, Serviços, Sintomas, REQ: Categorias, Subcategorias, Itens */}
              {['inc-cats', 'inc-services', 'inc-symptoms', 'req-cats', 'req-subcats', 'req-items'].includes(screen) ? (
                <UserServiceCatalog
                  screen={screen}
                  catalogLoading={catalogLoading}
                  visibleIncCategories={visibleIncCategories}
                  visibleReqCategories={visibleReqCategories}
                  services={services}
                  serviceSymptoms={serviceSymptoms}
                  reqSubcategories={reqSubcategories}
                  reqItems={reqItems}
                  selIncCat={selIncCat}
                  selReqCat={selReqCat}
                  dbSelIncCat={dbSelIncCat}
                  dbSelIncService={dbSelIncService}
                  dbSelReqCat={dbSelReqCat}
                  dbSelReqSubcat={dbSelReqSubcat}
                  catalogIconSize={catalogIconSize}
                  catalogFontSize={catalogFontSize}
                  customIconBg={customIconBg}
                  customPillBg={customPillBg}
                  customPillColor={customPillColor}
                  selDept={selDept}
                  config={config}
                  categories={categories}
                  reqCategories={reqCategories}
                  onSelectIncCat={(c) => { setDbSelIncCat(c); setDbSelIncService(null); setDbSelSymptom(null); setScreen('inc-services') }}
                  onSelectLegacyIncCat={(c) => { setSelIncCat(c); setScreen('inc-symptoms') }}
                  onSelectIncService={(s) => { setDbSelIncService(s); setDbSelSymptom(null); setScreen('inc-symptoms') }}
                  onSelectIncSymptom={(ss) => { setDbSelSymptom(ss); setScreen('inc-form') }}
                  onSelectLegacyIncSymptom={(s) => { setSelSymptom(s); setScreen('inc-form') }}
                  onSelectReqCat={(c) => {
                    setDbSelReqCat(c); setDbSelReqSubcat(null)
                    const hasSubcats = reqSubcategories.some(s => s.category_id === c.id && s.active)
                    setScreen(hasSubcats ? 'req-subcats' : 'req-items')
                  }}
                  onSelectLegacyReqCat={(c) => { setSelReqCat(c); setScreen('req-items') }}
                  onSelectReqSubcat={(s) => { setDbSelReqSubcat(s); setScreen('req-items') }}
                  onSelectLegacyReqSubcatOthers={() => { setDbSelReqSubcat({ id: OTHERS_SUBCAT_ID, company_id: dbSelReqCat!.company_id, category_id: dbSelReqCat!.id, name: 'Outros', description: null, icon: '📂', active: true, sort_order: 999, created_at: '', updated_at: '' }); setScreen('req-items') }}
                  onSelectReqItem={(item) => { setDbSelItem(item); setScreen('req-form') }}
                  onSelectLegacyReqItem={(item) => { setSelItem(item); setScreen('req-form') }}
                />
              ) : null}






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

                  <div className="servicefy-portal-form-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
                    <div>
                      <label style={{ display:'block', font:'700 11px sans-serif', textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:7 }}>Impacto</label>
                      <select value={impact} onChange={e => setImpact(e.target.value as typeof impact)}
                        style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, font:'500 14px sans-serif', color:'#0f172a', background:'#fff', outline:'none' }}>
                        <option value="Low">Apenas eu</option>
                        <option value="Medium">Meu departamento</option>
                        <option value="High">Toda a empresa</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display:'block', font:'700 11px sans-serif', textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:7 }}>Urgência</label>
                      <select value={urgency} onChange={e => setUrgency(e.target.value as typeof urgency)}
                        style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, font:'500 14px sans-serif', color:'#0f172a', background:'#fff', outline:'none' }}>
                        <option value="Low">Consigo trabalhar</option>
                        <option value="Medium">Tarefa importante parada</option>
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
