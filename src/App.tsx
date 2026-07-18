import { lazy, Suspense, useState, useMemo, useEffect } from 'react'
import { Plus, Settings, ShieldAlert, ClipboardList, AlertOctagon, RefreshCw, Home, BarChart3, CircleCheckBig, TrendingUp, Code2, BookOpen } from 'lucide-react'
import { useBranding, useToast } from './context'
import type { AppView, User, Company, Role } from './types'
import { mockApiEndpoints } from './services/appMocks'
import { useIncidents } from './hooks/useIncidents'
import { useAppData, useProblems, useChanges } from './hooks/useDbData'
import { useRealtimeNotifications } from './hooks/useRealtimeNotifications'
import GlobalSearchSpotlight from './components/portal/GlobalSearchSpotlight'
import AppNavigation, { type AppNavigationItem } from './components/AppNavigation'
import Login from './pages/auth/Login'
import { usePersistentState } from './hooks/usePersistentState'
import type { ProblemRow, CompanyRow, ProfileRow, TicketPriority, IncidentCategory } from './lib/database.types'
import { incidentsService, cioService, problemsService } from './lib/services'
import { translateState } from './lib/statusLabels'
import { useTenant } from './tenant'
import { setTenantOverride } from './tenant/resolveTenant'
import { useAuth } from './auth'
import { isKbCapableRole } from './lib/kb-access'
const UserPortalLayout = lazy(() => import('./pages/UserPortalLayout'))
const AnalystCockpit = lazy(() => import('./pages/AnalystCockpit'))
const TicketManagementDashboard = lazy(() => import('./pages/TicketManagementDashboard'))
const WorkspaceLayout = lazy(() => import('./pages/WorkspaceLayout'))
const SettingsCenter = lazy(() => import('./pages/SettingsCenter'))
const WorkflowBuilder = lazy(() => import('./pages/WorkflowBuilder'))
const ChangeManagementDashboard = lazy(() => import('./pages/ChangeManagementDashboard'))
const ApprovalCenter = lazy(() => import('./pages/ApprovalCenter'))
const KnowledgeCenter = lazy(() => import('./pages/KnowledgeCenter'))
const AnalyticsDashboard = lazy(() => import('./pages/admin/AnalyticsDashboard'))
const DeveloperSettings = lazy(() => import('./pages/admin/DeveloperSettings'))
const BiApp = lazy(() => import('./features/bi/BiApp'))
import TicketDataTable from './components/TicketDataTable'
import { LoadingSkeleton } from './components/portal/LoadingSkeleton'
import { PROBLEM_FIELDS } from './lib/ticketTableFields'

const ACTIVE_VIEW_STORAGE_KEY = 'flowfy_active_view'

function LazyBoundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
}

const PERSISTED_APP_VIEWS: readonly AppView[] = [
  'dashboard_incidents',
  'dashboard_requests',
  'dashboard_problems',
  'dashboard_changes',
  'approval_inbox',
  'knowledge_center',
  'user_portal',
  'api_docs',
  'settings_governance',
  'flowfy_bi',
  'workflow_builder',
]

const isPersistedAppView = (value: unknown): value is AppView =>
  typeof value === 'string' && PERSISTED_APP_VIEWS.includes(value as AppView)

const mapCompany = (row: CompanyRow): Company => {
  let providers: any[] = []
  try {
    providers = (typeof row.sso_providers === 'string'
      ? JSON.parse(row.sso_providers)
      : row.sso_providers) as any[]
  } catch (e) {
    console.error(e)
  }
  if (!Array.isArray(providers)) {
    providers = []
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? undefined,
    domain: row.domain,
    active: row.active,
    createdAt: row.created_at,
    concurrentLicenses: row.concurrent_licenses ?? 10,
    licensePlan: (row.license_plan ?? 'starter') as 'starter' | 'professional' | 'enterprise',
    licenseExpiresAt: row.license_expires_at ?? undefined,
    maxAnalystsLicenses: row.max_analysts_licenses ?? 3,
    branding: {
      logoUrl: row.logo_url ?? undefined,
      backgroundUrl: row.background_url ?? undefined,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color ?? row.accent_color,
      brandName: row.brand_name ?? row.name,
      accentColor: row.accent_color,
      backgroundColor: row.bg_color,
      welcomeTitle: row.welcome_title,
      welcomeSubtitle: row.welcome_subtitle,
      titleColor: row.title_color ?? undefined,
      titleFont: row.title_font ?? undefined,
      titleSize: row.title_size ?? undefined,
      subtitleColor: row.subtitle_color ?? undefined,
      subtitleFont: row.subtitle_font ?? undefined,
      subtitleSize: row.subtitle_size ?? undefined,
      catalogHeadline: row.catalog_headline ?? undefined,
      catalogHeadlineColor: row.catalog_headline_color ?? undefined,
      catalogHeadlineSize: row.catalog_headline_size ?? undefined,
      greetingPrefix: row.greeting_prefix ?? undefined,
      greetingColor: row.greeting_color ?? undefined,
    },
    authConfig: {
      companyId: row.id,
      allowLocalLogin: row.allow_local_login,
      providers: providers.map((p: any) => ({
        id: p.id,
        type: p.type,
        label: p.label,
        tenantId: p.tenantId,
        clientId: p.clientId,
        domain: p.domain,
        ldapUrl: p.ldapUrl,
        enabled: p.enabled ?? true,
      })),
    },
  }
}

const mapUser = (p: ProfileRow): User => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role as any,
  companyId: p.company_id,
  groupIds: [],
  avatarUrl: p.avatar_url ?? undefined,
  department: p.department ?? undefined,
  phone: p.phone ?? undefined,
  active: p.active,
})


// ─── Helpers ──────────────────────────────────────────────────

const priorityBadge: Record<string, string> = {
  'P1 - Critical': 'bg-red-50 text-red-600 border border-red-200 font-bold',
  'P2 - High':     'bg-orange-50 text-orange-600 border border-orange-200 font-bold',
  'P3 - Moderate': 'bg-amber-50 text-amber-600 border border-amber-200 font-bold',
  'P4 - Low':      'bg-sky-50 text-sky-600 border border-sky-200 font-semibold',
  'P5 - Planning': 'bg-slate-100 text-slate-500 border border-slate-200 font-semibold',
}

const stateDot: Record<string, string> = {
  'New': 'bg-blue-500',
  'Draft': 'bg-slate-400',
  'In Progress': 'bg-violet-500', 'In Fulfillment': 'bg-violet-500', 'Under Investigation': 'bg-violet-500',
  'On Hold': 'bg-amber-500', 'Pending User': 'bg-amber-500', 'Awaiting Approval': 'bg-amber-500', 'Awaiting CAB Approval': 'bg-amber-500',
  'Resolved': 'bg-emerald-500', 'Fulfilled': 'bg-emerald-500', 'Root Cause Identified': 'bg-teal-500', 'Known Error': 'bg-teal-500',
  'CAB Approved': 'bg-emerald-500', 'Approved': 'bg-emerald-500', 'Scheduled': 'bg-sky-500',
  'Closed': 'bg-slate-400', 'Cancelled': 'bg-slate-400', 'Rejected': 'bg-red-500',
  'CAB Rejected': 'bg-red-500', 'Failed': 'bg-red-500', 'Completed': 'bg-emerald-500',
}

const stateText: Record<string, string> = {
  'New': 'text-blue-700 bg-blue-50 border-blue-200',
  'Draft': 'text-slate-500 bg-slate-50 border-slate-200',
  'In Progress': 'text-violet-700 bg-violet-50 border-violet-200',
  'In Fulfillment': 'text-violet-700 bg-violet-50 border-violet-200',
  'Under Investigation': 'text-violet-700 bg-violet-50 border-violet-200',
  'On Hold': 'text-amber-700 bg-amber-50 border-amber-200',
  'Pending User': 'text-amber-700 bg-amber-50 border-amber-200',
  'Awaiting Approval': 'text-amber-700 bg-amber-50 border-amber-200',
  'Awaiting CAB Approval': 'text-amber-700 bg-amber-50 border-amber-200',
  'Resolved': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Fulfilled': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Root Cause Identified': 'text-teal-700 bg-teal-50 border-teal-200',
  'Known Error': 'text-teal-700 bg-teal-50 border-teal-200',
  'CAB Approved': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Approved': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Scheduled': 'text-sky-700 bg-sky-50 border-sky-200',
  'Closed': 'text-slate-500 bg-slate-100 border-slate-200',
  'Cancelled': 'text-slate-500 bg-slate-100 border-slate-200',
  'Rejected': 'text-red-700 bg-red-50 border-red-200',
  'CAB Rejected': 'text-red-700 bg-red-50 border-red-200',
  'Failed': 'text-red-700 bg-red-50 border-red-200',
  'Completed': 'text-emerald-700 bg-emerald-50 border-emerald-200',
}

const methodBadge: Record<string, string> = {
  GET:    'bg-sky-50 text-sky-700 border-sky-200',
  POST:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  PATCH:  'bg-amber-50 text-amber-700 border-amber-200',
  PUT:    'bg-blue-50 text-blue-700 border-blue-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
}

// ─── Shared Components ────────────────────────────────────────

export function StatCard({ label, value, accent, icon }: { label: string; value: number | string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest leading-tight">{label}</span>
        <span className={`p-2 rounded-xl ${accent}`}>{icon}</span>
      </div>
      <span className="text-3xl font-bold text-slate-800 tracking-tight">{value}</span>
    </div>
  )
}

function StateBadge({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${stateText[state] ?? 'text-slate-500 bg-slate-100 border-slate-200'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${stateDot[state] ?? 'bg-slate-400'}`} />
      {translateState(state)}
    </span>
  )
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 whitespace-pre-wrap leading-relaxed' : 'text-slate-700 font-medium'}`}>{value}</div>
    </div>
  )
}

// Campos de formulário reutilizáveis (modais de abertura de Problema/Mudança).
function FieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300" />
    </div>
  )
}
function FieldArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
    </div>
  )
}
function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-700 font-medium outline-none focus:ring-2 focus:ring-indigo-300">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className={`bg-white border border-slate-200 rounded-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} shadow-2xl overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
          <div>
            <h2 className="font-bold text-slate-800 text-base">{title}</h2>
            <p className="text-slate-400 text-[11px] uppercase tracking-widest font-semibold mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  )
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────

function LoginScreen() {
  const { branding } = useBranding()
  const { status: tenantStatus } = useTenant()
  const { signIn, status: authStatus, error: authError } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const brandColor = 'var(--brand-primary)'
  const brandLogo =
    branding.logoUrl ||
    'https://ui-avatars.com/api/?name=ServiceFY&background=10b981&color=fff&size=64&bold=true'
  const brandName = branding.name
  const welcomeTitle = branding.welcomeTitle
  const welcomeSubtitle = branding.welcomeSubtitle

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')
    if (!email.trim() || !password) {
      setLocalError('Informe e-mail e senha.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      // onAuthStateChange assume a navegação a partir daqui.
    } catch {
      // authError é populado pelo AuthContext.
    } finally {
      setSubmitting(false)
    }
  }

  const errorMessage = localError || authError

  return <Login />

  // Mantido abaixo apenas até o histórico desta tela ser removido em uma limpeza mecânica.
  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6 relative" 
      style={{ 
        background: branding.backgroundColor || '#f8fafc',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      {(!branding.backgroundColor || (!branding.backgroundColor.includes('url(') && !branding.backgroundColor.includes('gradient'))) && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] opacity-60 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 via-transparent to-slate-100/50 pointer-events-none" />
        </>
      )}

      <div className="relative w-full max-w-md">
        {/* Logo and Brand (white-label via tenant) */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transition-all" style={{ backgroundColor: brandColor }}>
              {branding.logoUrl ? (
                <img src={brandLogo} alt="Logo" className="w-8 h-8 rounded-xl object-contain" />
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-800">{brandName}</span>
          </div>
          <h1 
            className="text-slate-800 font-extrabold text-lg transition-all"
            style={{ 
              color: branding.titleColor || undefined,
              fontFamily: branding.titleFont || undefined,
              fontSize: branding.titleSize || undefined
            }}
          >
            {welcomeTitle}
          </h1>
          <p 
            className="text-slate-500 text-xs mt-1 transition-all"
            style={{
              color: branding.subtitleColor || undefined,
              fontFamily: branding.subtitleFont || undefined,
              fontSize: branding.subtitleSize || undefined
            }}
          >
            {welcomeSubtitle}
          </p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleLogin} className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xl shadow-slate-200/80 space-y-5">
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Login Corporativo</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="Digite seu e-mail corporativo"
              value={email}
              onChange={e => { setEmail(e.target.value); setLocalError('') }}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all shadow-sm"
              style={{ borderColor: brandColor }}
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
              value={password}
              onChange={e => { setPassword(e.target.value); setLocalError('') }}
              className="w-full bg-white border border-slate-200 focus:ring-2 focus:ring-slate-400/20 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none transition-all shadow-sm"
            />
          </div>

          {errorMessage && (
            <div className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-xl p-3">
              {errorMessage}
            </div>
          )}

          {tenantStatus === 'not-found' && (
            <div className="text-[11px] text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-xl p-3">
              Subdomínio não corresponde a nenhum cliente ativo. Verifique o endereço de acesso.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || authStatus === 'loading'}
            className="w-full py-2.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.99] cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: brandColor }}
          >
            {submitting || authStatus === 'loading' ? 'Autenticando…' : 'Entrar'}
          </button>

          <p className="text-center text-[10px] text-slate-400 pt-1">
            Autenticação segura via Supabase Auth · ITIL v4 · Multi-Tenant
          </p>
        </form>
      </div>
    </div>
  )
}

// ─── PAGE HEADER ──────────────────────────────────────────────

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>
      <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
    </div>
  )
}

// ─── PROBLEM DASHBOARD ────────────────────────────────────────

function ProblemDashboard({ companyId }: { companyId: string }) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<ProblemRow | null>(null)
  const { problems: base, kpis: stats, loading, error, refetch } = useProblems(companyId)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ short: '', description: '', priority: 'P3 - Moderate', category: 'Software' })

  const submitNew = async () => {
    if (!form.short.trim()) { toast.error('Informe a descrição curta do problema.'); return }
    setSaving(true)
    try {
      await problemsService.create({
        companyId,
        shortDescription: form.short.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority as TicketPriority,
        category: form.category as IncidentCategory,
      })
      toast.success('Problema registrado com sucesso.')
      setShowNew(false)
      setForm({ short: '', description: '', priority: 'P3 - Moderate', category: 'Software' })
      refetch()
    } catch (e) {
      toast.error(`Falha ao registrar problema: ${e instanceof Error ? e.message : 'erro'}`)
    } finally {
      setSaving(false)
    }
  }

  if (error) return <div className="text-red-500 text-sm p-4">{error}</div>

  const problemStats: { label: string; value: number | string; accent: string; icon: React.ReactNode }[] = [
    { label: 'Total', value: loading ? '…' : stats.total, accent: 'bg-slate-100 text-slate-500', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { label: 'Problemas Ativos', value: loading ? '…' : stats.active, accent: 'bg-orange-50 text-orange-500', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { label: 'Causa Raiz Identificada', value: loading ? '…' : stats.rootCause, accent: 'bg-teal-50 text-teal-500', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg> },
    { label: 'Erros Conhecidos (KEDB)', value: loading ? '…' : stats.knownError, accent: 'bg-amber-50 text-amber-500', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col items-start justify-between gap-3 shrink-0 sm:flex-row">
        <PageHeader title="Gerenciamento de Problemas" subtitle="Análise de Causa Raiz e KEDB — ITIL v4" />
        <button onClick={() => setShowNew(true)} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-on-primary shadow-sm transition-all hover:brightness-95 sm:mt-1 sm:w-auto sm:shrink-0">
          <Plus className="w-4 h-4" /> Novo Problema
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 my-3 shrink-0">
        {problemStats.map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex items-center justify-between gap-2 shadow-sm">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 truncate">{s.label}</p>
              <p className="text-lg font-black text-slate-800 leading-none mt-0.5">{s.value}</p>
            </div>
            <span className={`p-1.5 rounded-lg shrink-0 ${s.accent}`}>{s.icon}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <TicketDataTable
          rows={base}
          fields={PROBLEM_FIELDS}
          storageKey="problems"
          getRowId={p => p.id}
          onRowClick={setDetail}
          leadingCheckbox={false}
          loading={loading}
          emptyLabel="Nenhum problema encontrado."
        />
      </div>

      {detail && (
        <Modal title={detail.number} subtitle="Detalhes do Problema" onClose={() => setDetail(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-md text-xs uppercase ${priorityBadge[detail.priority]}`}>{detail.priority}</span>
              <StateBadge state={detail.state} />
              {detail.known_error && <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">Known Error (KEDB)</span>}
            </div>
            <InfoBlock label="Descrição Curta" value={detail.short_description} />
            {detail.description && <InfoBlock label="Descrição" value={detail.description} mono />}
            {detail.root_cause && <InfoBlock label="Causa Raiz (RCA)" value={detail.root_cause} mono />}
            {detail.workaround && <InfoBlock label="Contorno Temporário (Workaround)" value={detail.workaround} mono />}
            <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <InfoBlock label="Atribuído a" value={detail.assigned_to_name ?? '—'} />
              <InfoBlock label="Grupo" value={detail.assigned_group_name ?? '—'} />
            </div>
          </div>
        </Modal>
      )}

      {showNew && (
        <Modal title="Novo Problema" subtitle="Registro de Problema — ITIL v4" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <FieldText label="Descrição Curta *" value={form.short} onChange={v => setForm(f => ({ ...f, short: v }))} placeholder="Resumo do problema recorrente…" />
            <FieldArea label="Descrição / Detalhes" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Contexto, incidentes relacionados, sintomas…" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldSelect label="Prioridade" value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={['P1 - Critical', 'P2 - High', 'P3 - Moderate', 'P4 - Low', 'P5 - Planning']} />
              <FieldSelect label="Categoria" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={['Hardware', 'Software', 'Network', 'Database', 'Security', 'Inquiry', 'Other']} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">Cancelar</button>
              <button onClick={submitNew} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">{saving ? 'Salvando…' : 'Registrar Problema'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ─── API DOCS ─────────────────────────────────────────────────

function ApiDocs() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(mockApiEndpoints[0].id)
  const [activeModule, setActiveModule] = useState('all')
  const endpoint = mockApiEndpoints.find(e => e.id === selectedEndpoint)!
  const modules = ['all', ...Array.from(new Set(mockApiEndpoints.map(e => e.module)))]
  const filtered = activeModule === 'all' ? mockApiEndpoints : mockApiEndpoints.filter(e => e.module === activeModule)

  return (
    <div>
      <PageHeader title="API de Integração" subtitle="Referência REST para integrações externas com o ServiceFY ITSM" />

      {/* Info Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <span className="text-slate-400">Base URL:</span>
          <span className="text-emerald-600 font-semibold">https://api.servicefy.com</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <span className="text-slate-400">Auth:</span>
          <span className="text-amber-600 font-semibold">Bearer &lt;API_KEY&gt;</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <span className="text-slate-400">Versão:</span>
          <span className="text-sky-600 font-semibold">v1</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Endpoint List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex flex-wrap gap-1.5">
              {modules.map(m => (
                <button key={m} onClick={() => setActiveModule(m)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${activeModule === m ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>{m}</button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(ep => (
              <button key={ep.id} onClick={() => setSelectedEndpoint(ep.id)} className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all cursor-pointer ${selectedEndpoint === ep.id ? 'bg-slate-50 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50/70 border-l-2 border-l-transparent'}`}>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border w-11 text-center shrink-0 ${methodBadge[ep.method]}`}>{ep.method}</span>
                <div className="min-w-0">
                  <div className="font-mono text-xs text-slate-700 truncate font-semibold">{ep.path}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{ep.summary}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint Detail */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${methodBadge[endpoint.method]}`}>{endpoint.method}</span>
            <span className="font-mono text-sm text-slate-700 font-semibold">{endpoint.path}</span>
            {endpoint.requiresAuth && <span className="ml-auto text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg font-bold">🔒 Autenticado</span>}
          </div>
          <div>
            <h3 className="text-slate-800 font-bold text-base">{endpoint.summary}</h3>
            <p className="text-slate-500 text-sm mt-1">{endpoint.description}</p>
          </div>
          {endpoint.authScopes.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Escopos Necessários</div>
              <div className="flex flex-wrap gap-1.5">
                {endpoint.authScopes.map(s => <span key={s} className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">{s}</span>)}
              </div>
            </div>
          )}
          {endpoint.requestBody && (
            <div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Request Body</div>
              <pre className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-4 overflow-x-auto leading-relaxed">
                {JSON.stringify(endpoint.requestBody, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Response Example (200 OK)</div>
            <pre className="text-xs font-mono text-sky-700 bg-sky-50 border border-sky-100 rounded-xl p-4 overflow-x-auto leading-relaxed">
              {JSON.stringify(endpoint.responseExample, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── CIO DASHBOARD ───────────────────────────────────────────

function CIODashboard({ companyId, ticketType: _ticketType }: { companyId: string; ticketType?: 'incident' | 'request' }) {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    cioService.getMetrics(companyId).then(res => {
      setMetrics(res)
    }).catch(console.error).finally(() => setLoading(false))
  }, [companyId])

  if (loading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando métricas executivas CIO...</div>

  return (
    <div>
      <PageHeader title="CIO Executive Strategic Dashboard" subtitle="Disponibilidade consolidada de sistemas, MTTR e riscos de governança CAB" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Disponibilidade TI" value={`${metrics?.availability || 99.85}%`} accent="bg-emerald-50 text-emerald-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="MTTR Médio" value={`${metrics?.mttr || 2.4}h`} accent="bg-blue-50 text-blue-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Problemas Ativos" value={metrics?.activeProblems || 0} accent="bg-red-50 text-red-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard label="CAB Risco Crítico" value={metrics?.cabRiskCount || 0} accent="bg-amber-50 text-amber-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Eficiência & Qualidade (MTTR)</h3>
          <p className="text-slate-500 text-xs leading-relaxed">
            Indicador com base no tempo de resolução real de incidentes. Meta da operação: <strong>menor que 3.0 horas</strong>. O índice atual de <strong>{metrics?.mttr}h</strong> indica eficiência de atendimento.
          </p>
          <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs space-y-2 text-slate-600 font-semibold">
            <div className="flex justify-between"><span>Incidentes Totais:</span> <span className="text-slate-800">{metrics?.totalIncidents}</span></div>
            <div className="flex justify-between"><span>Incidente de Maior Impacto:</span> <span className="text-red-500">Banco de Dados (Resolvido)</span></div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Disponibilidade Agregada</h3>
          <p className="text-slate-500 text-xs leading-relaxed">
            Sistemas críticos operando acima do SLA acordado de <strong>99.50%</strong>. A disponibilidade agregada do tenant é de <strong>{metrics?.availability}%</strong>.
          </p>
          <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs space-y-2 text-slate-600 font-semibold">
            <div className="flex justify-between"><span>Disponibilidade Rede:</span> <span className="text-emerald-600">99.92%</span></div>
            <div className="flex justify-between"><span>Disponibilidade Banco:</span> <span className="text-emerald-600">99.87%</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CLIENT MANAGER DASHBOARD ────────────────────────────────

function ClientManagerDashboard({ companyId, ticketType }: { companyId: string; ticketType?: 'incident' | 'request' }) {
  const { incidents, kpis: incKPIs, loading: incLoading } = useIncidents(companyId, undefined, ticketType)

  if (incLoading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando painel do cliente...</div>

  const isReq = ticketType === 'request'

  return (
    <div>
      <PageHeader 
        title={isReq ? "Painel de Performance de Requisições" : "Painel de Performance de Incidentes"} 
        subtitle={isReq ? "Acompanhamento operacional de SLAs e requisições do catálogo da sua empresa" : "Acompanhamento operacional de incidentes e SLAs da sua empresa"} 
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Chamados" value={incidents.length} accent="bg-slate-100 text-slate-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="Em Andamento" value={incKPIs.inProgress} accent="bg-indigo-50 text-indigo-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="SLA Violado" value={incKPIs.slaBreached} accent="bg-red-50 text-red-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Críticos P1" value={incKPIs.critical} accent="bg-amber-50 text-amber-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 overflow-hidden">
        <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">
          {isReq ? "Requisições Ativas da sua Empresa" : "Incidentes Ativos da sua Empresa"}
        </h3>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400 font-bold uppercase border-b border-slate-100">
              <th className="py-2">Número</th>
              <th className="py-2">Descrição</th>
              <th className="py-2">Prioridade</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {incidents.slice(0, 5).map(i => (
              <tr key={i.id} className="py-2">
                <td className="py-2.5 font-mono text-emerald-600 font-bold">{i.number}</td>
                <td className="py-2.5 text-slate-700">{i.short_description}</td>
                <td className="py-2.5">{i.priority}</td>
                <td className="py-2.5"><StateBadge state={i.state} /></td>
              </tr>
            ))}
            {incidents.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-slate-400">Nenhum chamado ativo encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── IT MANAGER DASHBOARD ────────────────────────────────────

function ITManagerDashboard({ companyId, ticketType }: { companyId: string; ticketType?: 'incident' | 'request' }) {
  const { kpis: incKPIs, loading: incLoading } = useIncidents(companyId, undefined, ticketType)
  const { changes, kpis: chgKPIs, loading: chgLoading } = useChanges(companyId)

  if (incLoading || chgLoading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando painel do gerente de TI...</div>

  const isReq = ticketType === 'request'

  return (
    <div>
      <PageHeader 
        title={isReq ? "IT Operations Manager Panel - Requisições" : "IT Operations Manager Panel - Incidentes"} 
        subtitle={isReq ? "Acompanhamento geral de SLAs operacionais e requisições" : "Acompanhamento geral de SLAs operacionais e incidentes"} 
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Aprovação CAB" value={chgKPIs.awaitingCAB} accent="bg-amber-50 text-amber-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>} />
        <StatCard label="Mudanças Agendadas" value={chgKPIs.scheduled} accent="bg-sky-50 text-sky-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
        <StatCard label={isReq ? "SLA Violado (Requisições)" : "SLA Violado (Incidentes)"} value={incKPIs.slaBreached} accent="bg-red-50 text-red-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard label="Em Atendimento" value={incKPIs.inProgress} accent="bg-emerald-50 text-emerald-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Aprovações CAB Pendentes</h3>
          <div className="space-y-3">
            {changes.filter(c => c.state === 'Awaiting CAB Approval').map(c => (
              <div key={c.id} className="flex justify-between items-center text-xs p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <span className="font-mono text-violet-600 font-bold">{c.number}</span>
                  <div className="text-slate-700 font-medium">{c.short_description}</div>
                </div>
                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded uppercase font-semibold">Aguardando CAB</span>
              </div>
            ))}
            {changes.filter(c => c.state === 'Awaiting CAB Approval').length === 0 && (
              <div className="text-slate-400 text-xs italic text-center py-4">Nenhuma mudança pendente de aprovação.</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">SLAs Operacionais Gerais</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
              <span>{isReq ? "Requisições P1 Críticas Ativas:" : "Incidentes P1 Críticos Ativos:"}</span>
              <span className="font-bold text-red-600">{incKPIs.critical}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
              <span>{isReq ? "Total Requisições em Andamento:" : "Total Incidentes em Andamento:"}</span>
              <span className="font-bold text-emerald-600">{incKPIs.inProgress}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AREA MANAGER DASHBOARD ──────────────────────────────────

function AreaManagerDashboard({ companyId, ticketType }: { companyId: string; ticketType?: 'incident' | 'request' }) {
  const { incidents, loading: incLoading } = useIncidents(companyId, undefined, ticketType)
  const [selectedTower, setSelectedTower] = useState<'Infrastructure' | 'Database'>('Infrastructure')

  const filteredIncidents = useMemo(() => {
    return incidents.filter(i => {
      if (selectedTower === 'Infrastructure') {
        return i.assigned_group_name === 'Redes e Infraestrutura' || i.assigned_group_name === 'Service Desk'
      } else {
        return i.assigned_group_name === 'Banco de Dados' || i.assigned_group_name === 'Help Desk'
      }
    })
  }, [incidents, selectedTower])

  if (incLoading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando painel da torre técnica...</div>

  return (
    <div>
      <PageHeader 
        title={ticketType === 'request' ? "Area / Technical Tower Manager Panel - Requisições" : "Area / Technical Tower Manager Panel - Incidentes"} 
        subtitle={ticketType === 'request' ? "Fila de requisições e SLAs específicos por torre operacional (Infra vs Sistemas)" : "Fila de incidentes e SLAs específicos por torre operacional (Infra vs Sistemas)"} 
      />
      
      {/* Tower Toggle Buttons */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setSelectedTower('Infrastructure')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${selectedTower === 'Infrastructure' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          Torre de Infraestrutura & Redes
        </button>
        <button onClick={() => setSelectedTower('Database')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${selectedTower === 'Database' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          Torre de Sistemas & Banco de Dados
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Chamados Ativos Torre" value={filteredIncidents.length} accent="bg-slate-100 text-slate-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="SLA Violado Torre" value={filteredIncidents.filter(i => i.sla_breached).length} accent="bg-red-50 text-red-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Chamados Sem Analista" value={filteredIncidents.filter(i => !i.assigned_to_id).length} accent="bg-amber-50 text-amber-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 overflow-hidden">
        <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">
          {ticketType === 'request' ? "Requisições Ativas na Torre" : "Incidentes Ativos na Torre"}
        </h3>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400 font-bold uppercase border-b border-slate-100">
              <th className="py-2">Número</th>
              <th className="py-2">Descrição</th>
              <th className="py-2">Prioridade</th>
              <th className="py-2">Analista</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredIncidents.map(i => (
              <tr key={i.id} className="py-2">
                <td className="py-2.5 font-mono text-emerald-600 font-bold">{i.number}</td>
                <td className="py-2.5 text-slate-700 font-semibold">{i.short_description}</td>
                <td className="py-2.5">{i.priority}</td>
                <td className="py-2.5 text-slate-500">{i.assigned_to_name || 'Não atribuído'}</td>
                <td className="py-2.5"><StateBadge state={i.state} /></td>
              </tr>
            ))}
            {filteredIncidents.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">Nenhum chamado ativo nesta torre.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── TECHNICIAN DASHBOARD ────────────────────────────────────

function TechnicianDashboard({ companyId, currentUser, ticketType }: { companyId: string; currentUser: User; ticketType?: 'incident' | 'request' }) {
  const { incidents, loading, refetch } = useIncidents(companyId, undefined, ticketType)
  
  const handleAssignToMe = async (incId: string) => {
    try {
      await incidentsService.update(incId, companyId, { assigned_to_id: currentUser.id, assigned_to_name: currentUser.name }, currentUser.name, 'Analista auto-atribuído ao chamado.')
      alert('Chamado atribuído com sucesso!')
      refetch()
    } catch (err: any) {
      alert('Erro ao atribuir chamado: ' + err.message)
    }
  }

  const handleResolve = async (incId: string) => {
    try {
      await incidentsService.update(incId, companyId, { state: 'Resolved' }, currentUser.name, 'Chamado resolvido pelo analista.')
      alert('Chamado marcado como Resolvido!')
      refetch()
    } catch (err: any) {
      alert('Erro ao resolver chamado: ' + err.message)
    }
  }

  if (loading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando fila operacional analista...</div>

  return (
    <div>
      <PageHeader 
        title={ticketType === 'request' ? "Fila Operacional Analista - Requisições" : "Fila Operacional Analista - Incidentes"} 
        subtitle={ticketType === 'request' ? "Atendimento diário, triagem e execução de requisições do catálogo" : "Atendimento diário, triagem e execução de incidentes técnicos"} 
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label={ticketType === 'request' ? "Total Requisições" : "Total Incidentes"} value={incidents.length} accent="bg-slate-100 text-slate-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="Meus Chamados Atribuídos" value={incidents.filter(i => i.assigned_to_id === currentUser.id).length} accent="bg-blue-50 text-blue-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
        <StatCard label="Aguardando Triagem" value={incidents.filter(i => !i.assigned_to_id).length} accent="bg-amber-50 text-amber-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 overflow-hidden">
        <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Fila de Atendimento</h3>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400 font-bold uppercase border-b border-slate-100">
              <th className="py-2">Número</th>
              <th className="py-2">Descrição</th>
              <th className="py-2">Prioridade</th>
              <th className="py-2">Solicitante</th>
              <th className="py-2">Analista Atribuído</th>
              <th className="py-2">Estado</th>
              <th className="py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {incidents.map(i => (
              <tr key={i.id} className="py-2">
                <td className="py-2.5 font-mono text-emerald-600 font-bold">{i.number}</td>
                <td className="py-2.5 text-slate-700 font-semibold">{i.short_description}</td>
                <td className="py-2.5">{i.priority}</td>
                <td className="py-2.5 text-slate-500">{i.caller_name}</td>
                <td className="py-2.5 text-slate-500">{i.assigned_to_name || <span className="italic text-slate-300">Não atribuído</span>}</td>
                <td className="py-2.5"><StateBadge state={i.state} /></td>
                <td className="py-2.5 text-right space-x-2">
                  {!i.assigned_to_id && (
                    <button onClick={() => handleAssignToMe(i.id)} className="px-2 py-1 rounded bg-slate-800 text-white font-bold text-[10px] cursor-pointer">
                      Pegar Chamado
                    </button>
                  )}
                  {i.assigned_to_id === currentUser.id && i.state !== 'Resolved' && i.state !== 'Closed' && (
                    <button onClick={() => handleResolve(i.id)} className="px-2 py-1 rounded bg-emerald-500 text-white font-bold text-[10px] cursor-pointer">
                      Marcar Resolvido
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────

export default function App() {
  const { tenant: resolvedTenant } = useTenant()
  const { companies: dbCompanies, loading: dbLoading, error: dbError } = useAppData()
  const { status: authStatus, profile, company: authCompany, isProvider, signOut } = useAuth()
  const { toast } = useToast()

  // Lista de empresas (leitura pública) — usada pelo Portal do Provedor MSP.
  const companies = useMemo(() => dbCompanies.map(mapCompany), [dbCompanies])

  // Identidade derivada da sessão real do Supabase Auth (não mais de listas públicas).
  const currentUser = useMemo(() => (profile ? mapUser(profile) : null), [profile])
  
  // Se o usuário for Provedor MSP e existir um tenant forçado na URL/LocalStorage (resolvedTenant),
  // assume o tenant simulado. Caso contrário, usa a empresa original dele (authCompany).
  const currentCompany = useMemo(() => {
    if (isProvider && resolvedTenant) {
      return mapCompany(resolvedTenant)
    }
    return authCompany ? mapCompany(authCompany) : null
  }, [authCompany, isProvider, resolvedTenant])

  // View ativa e papel simulado PERSISTIDOS (imunes a reload/Tab Discarding).
  const [activeView, setActiveView] = usePersistentState<AppView>(
    ACTIVE_VIEW_STORAGE_KEY,
    'dashboard_incidents',
    isPersistedAppView,
  )
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [simulatedRole, setSimulatedRole] = usePersistentState<Role | null>('flowfy_sim_role', null)

  const activeRole = simulatedRole || (currentUser ? currentUser.role : 'end_user')

  const handleViewChange = (view: AppView) => {
    try {
      localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, JSON.stringify(view))
    } catch {
      // The state change still keeps navigation working when storage is unavailable.
    }
    setActiveView(view)
  }

  // Usuário final SEMPRE no portal. Para staff, NÃO sobrescreve a view
  // persistida (mantém o admin na mesma tela após um reload forçado).
  useEffect(() => {
    if (profile?.role === 'end_user') {
      setActiveView('user_portal')
    }
  }, [profile, setActiveView])

  const handleLogout = async () => {
    setSimulatedRole(null)
    setActiveView('dashboard_incidents')
    setIsUserMenuOpen(false)
    await signOut()
  }

  const { unreadCount: unreadNotifs } = useRealtimeNotifications(profile?.id ?? null, currentCompany?.id ?? null)

  // Atalho de preview: /?preview=portal | admin — SOMENTE em desenvolvimento.
  // Em produção (import.meta.env.DEV === false) este bloco é eliminado pelo
  // tree-shaking do Vite, impedindo acesso sem autenticação a componentes admin.
  if (import.meta.env.DEV) {
    const previewMode = new URLSearchParams(window.location.search).get('preview')
    if (previewMode === 'portal')    return <LazyBoundary><UserPortalLayout companyId={currentCompany?.id} /></LazyBoundary>
    if (previewMode === 'cockpit')   return <LazyBoundary><AnalystCockpit /></LazyBoundary>
    if (previewMode === 'tickets')   return <LazyBoundary><TicketManagementDashboard /></LazyBoundary>
    if (previewMode === 'workspace') return <LazyBoundary><div className="h-screen"><WorkspaceLayout /></div></LazyBoundary>
  }

  if (dbLoading || authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-500">
        <div className="flex items-center gap-3">
          <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
          Conectando ao banco de dados do Supabase...
        </div>
      </div>
    )
  }

  if (dbError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-red-500 text-sm">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-md shadow-sm">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="font-semibold text-slate-800">Erro ao carregar dados do banco</div>
          {import.meta.env.DEV
            ? <div className="text-red-400 mt-1 text-xs font-mono">{dbError}</div>
            : <div className="text-slate-500 mt-1 text-xs">Ocorreu um erro interno. Tente recarregar a página ou contate o suporte.</div>
          }
        </div>
      </div>
    )
  }

  // Sessão válida porém sem profile vinculado (aguardando provisionamento/linkagem).
  if (authStatus === 'unlinked') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-md shadow-sm">
          <div className="text-2xl mb-2">🔒</div>
          <div className="font-semibold text-slate-800">Conta sem perfil vinculado</div>
          <p className="text-slate-500 mt-1 text-xs">
            Sua autenticação foi bem-sucedida, mas ainda não há um perfil associado a este usuário.
            Contate o administrador do seu tenant ou o provedor MSP.
          </p>
          <button onClick={handleLogout} className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer">
            Encerrar Sessão
          </button>
        </div>
      </div>
    )
  }

  if (!currentUser || !currentCompany) return <LoginScreen />

  // User Portal — full page, no sidebar
  if (activeView === 'user_portal' || activeRole === 'end_user') {
    return (
      <div>
        <div className="servicefy-portal-agent-actions fixed right-4 top-4 z-50 flex gap-2">
          {currentUser.role !== 'end_user' && (
            <>
              {import.meta.env.DEV && (
                <div className="flex items-center gap-1 border border-slate-200 bg-white rounded-xl px-2 py-1 shadow-sm shrink-0">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Simular Papel:</span>
                  <select
                    value={activeRole}
                    onChange={e => {
                      const r = e.target.value as Role
                      setSimulatedRole(r)
                      if (r === 'end_user') {
                        setActiveView('user_portal')
                      } else if (r === 'sysadmin' || r === 'company_admin') {
                        setActiveView('settings_governance')
                      } else {
                        setActiveView('dashboard_incidents')
                      }
                    }}
                    className="text-xs font-semibold text-slate-700 bg-white border-none outline-none cursor-pointer focus:ring-0"
                  >
                    <option value="sysadmin">SysAdmin (Admin Global)</option>
                    <option value="company_admin">CompanyAdmin (Admin Tenant)</option>
                    <option value="agent">Agent (Analista)</option>
                    <option value="ops_manager">OpsManager (Gestor de Operação)</option>
                    <option value="governance_manager">GovernanceManager (Gestor de Governança)</option>
                    <option value="technician">Technician (Analista)</option>
                    <option value="area_manager">AreaManager (Gerente Torre)</option>
                    <option value="it_manager">ITManager (Gerente Geral TI)</option>
                    <option value="client_manager">ClientManager (Gestor Cliente)</option>
                    <option value="cio">CIO (Executivo TI)</option>
                    <option value="end_user">EndUser (Usuário Final)</option>
                  </select>
                </div>
              )}
              <button 
                onClick={() => setActiveView(currentUser.role === 'sysadmin' || currentUser.role === 'company_admin' ? 'settings_governance' : 'dashboard_incidents')} 
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-sm"
              >
                ← Painel do Agente
              </button>
            </>
          )}
          <button onClick={handleLogout} className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-sm">Sair</button>
        </div>
        <LazyBoundary><UserPortalLayout companyId={currentCompany.id} /></LazyBoundary>
      </div>
    )
  }

  const navItems: AppNavigationItem[] = [
    { view: 'dashboard_incidents', label: 'Incidentes', icon: <ShieldAlert className="w-5 h-5" />, group: 'operation' },
    { view: 'dashboard_requests', label: 'Requisições', icon: <ClipboardList className="w-5 h-5" />, group: 'operation' },
    { view: 'dashboard_problems', label: 'Problemas', icon: <AlertOctagon className="w-5 h-5" />, group: 'operation' },
    { view: 'dashboard_changes', label: 'Mudanças', icon: <RefreshCw className="w-5 h-5" />, group: 'operation' },
    { view: 'approval_inbox', label: 'Minhas Aprovações', icon: <CircleCheckBig className="w-5 h-5" />, group: 'access' },
    { view: 'user_portal', label: 'Portal do Usuário', icon: <Home className="w-5 h-5" />, group: 'access' },
  ]

  // Central de Conhecimento: analista/gestor de operação/gestor de governança
  // + admins (a RLS/RPC de KB, migrations 131-133, já governa quem pode fazer
  // o quê dentro da tela; este filtro é só conveniência de navegação).
  if (isKbCapableRole(activeRole)) {
    navItems.push({ view: 'knowledge_center', label: 'Base de Conhecimento', icon: <BookOpen className="w-5 h-5" />, group: 'access' })
  }

  // O ServiceFY BI fica disponível para todos os perfis gerenciais/técnicos que alcançam esta tela
  navItems.push({ view: 'flowfy_bi', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" />, group: 'access' })

  // Fase 23 — Analytics Executivo: camada gerencial (a RPC get_executive_metrics
  // já bloqueia end_user no banco; este filtro é só conveniência de navegação).
  const managerialRoles: Role[] = ['sysadmin', 'company_admin', 'cio', 'client_manager', 'it_manager', 'area_manager']
  if (managerialRoles.includes(activeRole)) {
    navItems.push({ view: 'analytics_executive', label: 'Visão Executiva', icon: <TrendingUp className="w-5 h-5" />, group: 'access' })
  }

  // Configurações, integrações e automações são exclusivas dos administradores.
  const isConfigEligible = activeRole === 'sysadmin' || activeRole === 'company_admin'
  if (isConfigEligible) {
    navItems.push({
      view: 'settings_governance',
      label: 'Configurações',
      icon: <Settings className="w-5 h-5" />,
      group: 'access',
    })
  }

  // Fase 25 — Webhooks Outbound: acessível apenas a company_admin (a RPC
  // save_outbound_webhook já valida is_settings_admin no banco; este filtro
  // de navegação é só conveniência de UI).
  if (activeRole === 'company_admin') {
    navItems.push({ view: 'developer_settings', label: 'Desenvolvedor', icon: <Code2 className="w-5 h-5" />, group: 'access' })
  }

  const customDashRoles: Role[] = ['cio', 'client_manager', 'it_manager', 'area_manager', 'technician']
  const showWorkspace = (activeView === 'dashboard_incidents' || activeView === 'dashboard_requests') && (isProvider || !customDashRoles.includes(activeRole))

  const renderActiveDashboard = () => {
    if (activeView === 'settings_governance') {
      return <SettingsCenter companyId={currentCompany.id} activeRole={activeRole} onNavigate={view => setActiveView(view)} />
    }
    
    // Customize layout if viewing the default dashboard view based on active role
    if (activeView === 'dashboard_incidents' || activeView === 'dashboard_requests') {
      const ticketType = activeView === 'dashboard_incidents' ? 'incident' : 'request'
      if (isProvider) {
        return <WorkspaceLayout companyId={currentCompany.id} isProvider companies={companies} ticketType={ticketType} />
      }
      switch (activeRole) {
        case 'cio':
          return <CIODashboard companyId={currentCompany.id} ticketType={ticketType} />
        case 'client_manager':
          return <ClientManagerDashboard companyId={currentCompany.id} ticketType={ticketType} />
        case 'it_manager':
          return <ITManagerDashboard companyId={currentCompany.id} ticketType={ticketType} />
        case 'area_manager':
          return <AreaManagerDashboard companyId={currentCompany.id} ticketType={ticketType} />
        case 'technician':
          return <TechnicianDashboard companyId={currentCompany.id} currentUser={currentUser} ticketType={ticketType} />
        default:
          return <WorkspaceLayout companyId={currentCompany.id} isProvider={isProvider} companies={companies} ticketType={ticketType} />
      }
    }

    if (activeView === 'dashboard_problems') return <ProblemDashboard companyId={currentCompany.id} />
    if (activeView === 'dashboard_changes') return <ChangeManagementDashboard companyId={currentCompany.id} />
    if (activeView === 'approval_inbox') return <ApprovalCenter />
    if (activeView === 'knowledge_center') return <KnowledgeCenter onNavigateHome={() => setActiveView('dashboard_incidents')} />
    if (activeView === 'analytics_executive') return <AnalyticsDashboard />
    if (activeView === 'developer_settings') return <DeveloperSettings companyId={currentCompany.id} />
    if (activeView === 'api_docs') return isConfigEligible ? <ApiDocs /> : <WorkspaceLayout companyId={currentCompany.id} isProvider={isProvider} companies={companies} />
    if (activeView === 'flowfy_bi') return <BiApp companyId={currentCompany.id} themeName={currentCompany.branding.primaryColor ?? undefined} />
    if (activeView === 'workflow_builder') return isConfigEligible ? <WorkflowBuilder companyId={currentCompany.id} /> : <WorkspaceLayout companyId={currentCompany.id} isProvider={isProvider} companies={companies} />

    return <WorkspaceLayout companyId={currentCompany.id} isProvider={isProvider} companies={companies} />
  }

  return (
    <div className="h-screen max-h-screen w-full max-w-full overflow-hidden text-on-surface flex flex-col" style={{ background: currentCompany.branding.backgroundColor || 'var(--color-bg-primary)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'fixed' }}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 flex min-h-16 min-w-0 shrink-0 items-center gap-2 border-b border-outline-variant bg-surface px-3 py-3 sm:px-4 lg:gap-3 lg:px-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-md overflow-hidden" style={{ background: 'var(--brand-primary)' }}>
            {currentCompany.branding.logoUrl ? (
              <img src={currentCompany.branding.logoUrl} alt="" className="w-full h-full object-contain bg-white" />
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            )}
          </div>
          <span className="text-lg font-black tracking-tight text-on-surface hidden sm:block">{currentCompany.branding.brandName || currentCompany.name}</span>
          <span className="hidden text-xs font-semibold text-on-surface-variant sm:block">ITSM</span>
        </div>

        <div className="w-px h-6 bg-outline-variant mx-1 hidden sm:block" />

        {/* Tenant Indicator (+ selo de Provedor MSP) */}
        <div className="hidden min-w-0 max-w-[13rem] shrink items-center gap-2 rounded-lg bg-surface-container px-2.5 py-2 text-xs font-semibold text-on-surface sm:flex xl:max-w-[18rem]">
          {currentCompany.branding.logoUrl && (
            <img src={currentCompany.branding.logoUrl} alt={currentCompany.name} className="w-5 h-5 rounded-md" />
          )}
          <select 
            value={currentCompany.slug || currentCompany.domain || ''}
            onChange={e => {
              const slug = e.target.value;
              if (slug) {
                setTenantOverride(slug);
                window.location.href = `/?tenant=${slug}`;
              }
            }}
            className="hidden sm:block min-w-0 max-w-[9rem] xl:max-w-[13rem] bg-transparent text-xs font-bold text-slate-800 border-none outline-none cursor-pointer hover:text-indigo-600 focus:ring-0 p-0 m-0 appearance-none pr-4 relative"
            style={{ 
              width: `${Math.max(currentCompany.name.length + 3, 10)}ch`,
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right center',
              backgroundSize: '1em'
            }}
          >
            {companies.map(c => (
              <option key={c.id} value={c.slug || c.domain || c.name}>{c.name}</option>
            ))}
          </select>
          {isProvider && (
            <span className="hidden xl:inline-flex ml-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[9px] uppercase tracking-wider font-bold">
              Provedor MSP
            </span>
          )}
        </div>

        {/* Role Simulator Dropdown — apenas em desenvolvimento */}
        {import.meta.env.DEV && (
          <div className="hidden md:flex min-w-0 max-w-[18rem] items-center gap-1.5 border border-outline-variant bg-surface rounded-xl px-2 py-1 shadow-sm shrink">
            <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider hidden md:inline">Simular Papel:</span>
            <select
              value={activeRole}
              onChange={e => {
                const r = e.target.value as Role
                setSimulatedRole(r)
                if (r === 'end_user') {
                  setActiveView('user_portal')
                } else if (r === 'sysadmin' || r === 'company_admin') {
                  setActiveView('settings_governance')
                } else {
                  setActiveView('dashboard_incidents')
                }
              }}
              className="min-w-0 max-w-[13rem] text-xs font-semibold text-on-surface bg-surface border-none outline-none cursor-pointer focus:ring-0"
            >
              <option value="sysadmin">SysAdmin (Admin Global)</option>
              <option value="company_admin">CompanyAdmin (Admin Tenant)</option>
              <option value="technician">Technician (Analista)</option>
              <option value="area_manager">AreaManager (Gerente Torre)</option>
              <option value="it_manager">ITManager (Gerente Geral TI)</option>
              <option value="client_manager">ClientManager (Gestor Cliente)</option>
              <option value="cio">CIO (Executivo TI)</option>
              <option value="end_user">EndUser (Usuário Final)</option>
            </select>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Menu (perfil real autenticado) */}
        <div className="relative">
          <button onClick={() => setIsUserMenuOpen(v => !v)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-outline-variant bg-surface hover:bg-surface-container hover:border-outline transition-all cursor-pointer shadow-sm">
            <img src={currentUser.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&size=48`} alt={currentUser.name} className="w-6 h-6 rounded-full" />
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-on-surface">{currentUser.name.split(' ')[0]}</div>
              <div className="text-[11px] text-on-surface-variant">{currentUser.role.replace('_', ' ')}</div>
            </div>
            <svg className={`w-3.5 h-3.5 text-on-surface-variant transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {isUserMenuOpen && (
            <div className="absolute top-full mt-1.5 right-0 bg-surface border border-outline-variant rounded-2xl shadow-xl w-64 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-outline-variant">
                <div className="text-sm font-bold text-on-surface truncate">{currentUser.name}</div>
                <div className="text-[11px] text-on-surface-variant truncate">{currentUser.email}</div>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className="rounded bg-surface-container-high px-2 py-1 text-xs font-semibold text-on-surface-variant">{currentUser.role.replace('_', ' ')}</span>
                  <span className="rounded bg-surface-container-high px-2 py-1 text-xs font-semibold text-on-surface-variant">{currentCompany.name}</span>
                  {isProvider && <span className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Provedor MSP</span>}
                </div>
              </div>
              <div className="p-2">
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50/10 rounded-xl transition-all cursor-pointer font-semibold">Encerrar Sessão</button>
              </div>
            </div>
          )}
        </div>

        {/* Busca Global (Fase 22) */}
        <GlobalSearchSpotlight
          onSelectArticle={result => toast.info(`Artigo: ${result.title}`)}
          onSelectCatalogSymptom={result => toast.info(`Catálogo: ${result.title}`)}
        />

        {/* Notification Bell */}
        <button aria-label="Abrir notificações" className="relative flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          {unreadNotifs > 0 && <span className="absolute top-1.5 right-1.5 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>}
        </button>
      </header>

      {/* Layout */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <AppNavigation
          items={navItems}
          activeView={activeView}
          company={{
            name: currentCompany.name,
            domain: currentCompany.domain,
            logoUrl: currentCompany.branding.logoUrl,
          }}
          onNavigate={view => handleViewChange(view as AppView)}
        />

        {/* Main Content */}
        <main className={`flex-1 min-h-0 min-w-0 w-0 bg-background pb-16 lg:pb-0 ${showWorkspace ? 'overflow-hidden' : 'overflow-y-auto'}`} onClick={() => setIsUserMenuOpen(false)}>
          {showWorkspace ? (
            <LazyBoundary>{renderActiveDashboard()}</LazyBoundary>
          ) : (
            <div className="max-w-7xl mx-auto p-6 lg:p-8">
              <LazyBoundary>{renderActiveDashboard()}</LazyBoundary>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="hidden shrink-0 items-center justify-between border-t border-outline-variant bg-surface px-6 py-2.5 lg:flex">
        <span className="text-xs text-on-surface-variant">© {new Date().getFullYear()} ServiceFY</span>
        <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span className="h-1.5 w-1.5 rounded-full bg-resolved" />
          Operação disponível
        </span>
      </footer>
    </div>
  )
}
