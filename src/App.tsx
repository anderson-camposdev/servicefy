import { useState, useMemo, useEffect } from 'react'
import type { AppView, User, Company, Role } from './types'
import {
  mockApiEndpoints,
  mockNotifications,
} from './services'
import { useIncidents } from './hooks/useIncidents'
import { useAppData, useRequests, useProblems, useChanges, useCatalog } from './hooks/useDbData'
import type { IncidentRow, ServiceRequestRow, ProblemRow, ChangeRow, CompanyRow, ProfileRow } from './lib/database.types'
import { incidentsService, requestsService, companiesService, profilesService, catalogService, cioService } from './lib/services'

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
    domain: row.domain,
    active: row.active,
    createdAt: row.created_at,
    concurrentLicenses: row.concurrent_licenses ?? 10,
    licensePlan: (row.license_plan ?? 'starter') as 'starter' | 'professional' | 'enterprise',
    licenseExpiresAt: row.license_expires_at ?? undefined,
    branding: {
      logoUrl: row.logo_url ?? undefined,
      primaryColor: row.primary_color,
      accentColor: row.accent_color,
      backgroundColor: row.bg_color,
      welcomeTitle: row.welcome_title,
      welcomeSubtitle: row.welcome_subtitle,
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
  'P4 - Low':      'bg-slate-100 text-slate-500 border border-slate-200 font-semibold',
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

const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}min atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  return `${Math.floor(hrs / 24)}d atrás`
}

// ─── Shared Components ────────────────────────────────────────

function StatCard({ label, value, accent, icon }: { label: string; value: number | string; accent: string; icon: React.ReactNode }) {
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

function SLABadge({ breached }: { breached: boolean }) {
  return breached
    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded uppercase tracking-wider"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />SLA</span>
    : null
}

function StateBadge({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${stateText[state] ?? 'text-slate-500 bg-slate-100 border-slate-200'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${stateDot[state] ?? 'bg-slate-400'}`} />
      {state}
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

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
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

function LoginScreen({
  companies,
  users,
  onLogin,
}: {
  companies: Company[]
  users: User[]
  onLogin: (user: User, company: Company) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [showDemo, setShowDemo] = useState(true)

  const typedDomain = useMemo(() => {
    const parts = email.split('@')
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase().trim() : ''
  }, [email])

  const company = useMemo(() => {
    if (!typedDomain) return null
    return companies.find(c => c.domain.toLowerCase() === typedDomain) || null
  }, [typedDomain, companies])

  const ssoProviders = useMemo(() => {
    if (!company) return []
    const parsed = (typeof company.authConfig?.providers === 'string'
      ? JSON.parse(company.authConfig.providers)
      : company.authConfig?.providers) as any[] || []
    return parsed.filter(p => p.enabled)
  }, [company])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    if (!company) {
      setLoginError('Por favor, insira um e-mail com domínio corporativo cadastrado.')
      return
    }
    const companyUsers = users.filter(u => u.companyId === company.id)
    const user = companyUsers.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!user) {
      setLoginError('E-mail corporativo não encontrado.')
      return
    }
    onLogin(user, company)
  }

  const handleSSOLogin = (_providerType: string) => {
    if (!company) return
    const companyUsers = users.filter(u => u.companyId === company.id)
    // Map default user for the provider type or role
    const user = companyUsers.find(u => u.role !== 'end_user') || companyUsers[0]
    if (user) {
      onLogin(user, company)
    } else {
      setLoginError('Nenhum usuário cadastrado neste tenant.')
    }
  }

  const brandColor = company?.branding?.primaryColor || '#10b981'
  const brandLogo = company?.branding?.logoUrl || 'https://ui-avatars.com/api/?name=Flowfy&background=10b981&color=fff&size=64&bold=true'
  const welcomeTitle = company?.branding?.welcomeTitle || 'Flowfy ITSM Enterprise'
  const welcomeSubtitle = company?.branding?.welcomeSubtitle || 'Plataforma ITSM multi-tenant baseada no ITIL v4'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-50 flex items-center justify-center p-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 via-transparent to-slate-100/50" />

      <div className="relative w-full max-w-md">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transition-all" style={{ backgroundColor: brandColor }}>
              {company ? (
                <img src={brandLogo} alt="Logo" className="w-8 h-8 rounded-xl object-contain" />
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-800">
              {company ? company.name : 'Flowfy'}
            </span>
          </div>
          <h1 className="text-slate-800 font-extrabold text-lg transition-all">{welcomeTitle}</h1>
          <p className="text-slate-500 text-xs mt-1 transition-all">{welcomeSubtitle}</p>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xl shadow-slate-200/80 space-y-5">
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Login Corporativo</label>
            <input
              type="email"
              placeholder="Digite seu e-mail (ex: carlos.mendez@acme.com)"
              value={email}
              onChange={e => { setEmail(e.target.value); setLoginError('') }}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all shadow-sm"
              style={company ? { borderColor: brandColor, borderWidth: '1px' } : {}}
            />
          </div>

          {loginError && (
            <div className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-xl p-3">
              {loginError}
            </div>
          )}

          {company ? (
            <div className="space-y-4 animate-fade-in">
              {ssoProviders.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Provedores SSO Ativos</div>
                  {ssoProviders.map((provider: any) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => handleSSOLogin(provider.type)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm text-sm font-medium text-slate-700 transition-all cursor-pointer group"
                    >
                      {provider.type === 'microsoft' && (
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 23 23" fill="none">
                          <rect width="11" height="11" fill="#f25022" /><rect x="12" width="11" height="11" fill="#7fba00" />
                          <rect y="12" width="11" height="11" fill="#00a4ef" /><rect x="12" y="12" width="11" height="11" fill="#ffb900" />
                        </svg>
                      )}
                      {provider.type === 'google' && (
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                      )}
                      {provider.type === 'active_directory' && (
                        <svg className="w-5 h-5 shrink-0 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      )}
                      <span>{provider.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {company.authConfig.allowLocalLogin && (
                <form onSubmit={handleLogin} className="space-y-3 pt-2">
                  <div className="h-px bg-slate-100 my-2" />
                  <input
                    type="password"
                    placeholder="Digite sua senha corporativa"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none transition-all shadow-sm"
                  />
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.99] cursor-pointer shadow-lg"
                    style={{ backgroundColor: brandColor }}
                  >
                    Entrar com Senha
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400">
              Digite seu e-mail corporativo para identificar sua empresa e carregar os métodos de login.
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => setShowDemo(d => !d)}
              className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              {showDemo ? 'Ocultar Atalhos de Demonstração' : 'Ver Atalhos de Demonstração (Acesso Rápido)'}
            </button>

            {showDemo && (
              <div className="flex flex-wrap gap-1.5 justify-center mt-3 animate-fade-in">
                {users.map(u => {
                  const comp = companies.find(c => c.id === u.companyId)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => onLogin(u, comp!)}
                      className="px-2 py-1 rounded-lg text-[9px] bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-all cursor-pointer font-semibold border border-slate-200"
                    >
                      {u.name.split(' ')[0]} ({u.role.replace('_', ' ')})
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PAGE HEADER ──────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>
      <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
    </div>
  )
}

// ─── TABLE WRAPPER ────────────────────────────────────────────

function TableCard({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {header && <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">{header}</div>}
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-slate-100">
        {cols.map(h => <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>)}
      </tr>
    </thead>
  )
}

// ─── INCIDENT DASHBOARD ───────────────────────────────────────

function IncidentDashboard({ companyId, currentUserName }: { companyId: string; currentUserName: string }) {
  const {
    incidents, kpis, loading, error,
    search, stateFilter, priorityFilter,
    setSearch, setStateFilter,
    updateState, addComment,
  } = useIncidents(companyId)

  const [detail, setDetail] = useState<IncidentRow | null>(null)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [detailHistory, setDetailHistory] = useState<import('./hooks/useIncidents').IncidentHistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const filtered = useMemo(() => {
    return incidents.filter(i => {
      const q = search.toLowerCase()
      const matchSearch = !q || i.number.toLowerCase().includes(q) || i.short_description.toLowerCase().includes(q) || i.caller_name.toLowerCase().includes(q)
      const matchState = stateFilter === 'all' || i.state === stateFilter
      const matchPriority = priorityFilter === 'all' || i.priority === priorityFilter
      return matchSearch && matchState && matchPriority
    })
  }, [incidents, search, stateFilter, priorityFilter])

  const openDetail = async (inc: IncidentRow) => {
    setDetail(inc)
    setLoadingHistory(true)
    try {
      const full = await incidentsService.getById(inc.id, companyId)
      setDetailHistory(full.history)
    } catch { /* noop */ } finally { setLoadingHistory(false) }
  }

  const handleAddComment = async () => {
    if (!detail || !commentText.trim()) return
    setSubmittingComment(true)
    try {
      await addComment(detail.id, commentText, currentUserName)
      setCommentText('')
      const full = await incidentsService.getById(detail.id, companyId)
      setDetailHistory(full.history)
    } finally { setSubmittingComment(false) }
  }

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-500 text-sm">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <div className="text-2xl mb-2">⚠️</div>
        <div className="font-semibold">Erro ao carregar incidentes</div>
        <div className="text-red-400 mt-1 text-xs font-mono">{error}</div>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Gerenciamento de Incidentes" subtitle="Rastreamento de falhas não planejadas — ITIL v4" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={loading ? '…' : kpis.total} accent="bg-slate-100 text-slate-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="P1 — Crítico" value={loading ? '…' : kpis.critical} accent="bg-red-50 text-red-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard label="Em Andamento" value={loading ? '…' : kpis.inProgress} accent="bg-violet-50 text-violet-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="SLA Violado" value={loading ? '…' : kpis.slaBreached} accent="bg-red-50 text-red-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Sem Atribuição" value={loading ? '…' : kpis.unassigned} accent="bg-amber-50 text-amber-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
      </div>

      <TableCard header={
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {([['all', 'Todos'], ['In Progress', 'Em Andamento'], ['New', 'Novos'], ['On Hold', 'Aguardando'], ['Resolved', 'Resolvidos']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setStateFilter(v as typeof stateFilter)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${stateFilter === v ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {loading && <span className="text-xs text-slate-400 animate-pulse">● atualizando…</span>}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar número, descrição..." className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-600 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all w-56 shadow-sm" />
          </div>
        </div>
      }>
        <table className="w-full text-left text-sm min-w-[820px]">
          <TableHead cols={['Número', 'Descrição', 'Prioridade', 'Estado', 'Categoria', 'Solicitante', 'Atribuído a', 'Criado']} />
          <tbody className="divide-y divide-slate-50">
            {loading && incidents.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center">
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                  <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
                  Carregando incidentes do banco de dados…
                </div>
              </td></tr>
            )}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">Nenhum incidente encontrado.</td></tr>}
            {filtered.map(inc => (
              <tr key={inc.id} onClick={() => openDetail(inc)} className="hover:bg-slate-50 cursor-pointer transition-colors group">
                <td className="px-5 py-3.5 font-mono text-emerald-600 text-xs font-bold whitespace-nowrap">
                  <span className="group-hover:underline">{inc.number}</span>{' '}
                  <SLABadge breached={inc.sla_breached} />
                </td>
                <td className="px-5 py-3.5 max-w-[200px] truncate text-slate-700 font-medium text-sm">{inc.short_description}</td>
                <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wide ${priorityBadge[inc.priority]}`}>{inc.priority}</span></td>
                <td className="px-5 py-3.5"><StateBadge state={inc.state} /></td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">{inc.category}</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{inc.caller_name}</td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">{inc.assigned_to_name ?? <span className="italic text-slate-300">Não atribuído</span>}</td>
                <td className="px-5 py-3.5 text-slate-400 text-xs whitespace-nowrap">{relativeTime(inc.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {detail && (
        <Modal title={detail.number} subtitle="Detalhes do Incidente" onClose={() => { setDetail(null); setDetailHistory([]) }}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-md text-xs uppercase tracking-wide ${priorityBadge[detail.priority]}`}>{detail.priority}</span>
              <StateBadge state={detail.state} />
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs border border-slate-200">{detail.category}</span>
              {detail.sla_breached && <SLABadge breached />}
            </div>
            {/* Quick state transition */}
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Alterar Estado</div>
              <div className="flex flex-wrap gap-1.5">
                {(['New','In Progress','On Hold','Pending User','Resolved','Closed'] as const).map(s => (
                  <button key={s} onClick={() => { updateState(detail.id, s, currentUserName); setDetail(prev => prev ? {...prev, state: s} : null) }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${detail.state === s ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <InfoBlock label="Descrição Curta" value={detail.short_description} />
            {detail.description && <InfoBlock label="Descrição Detalhada" value={detail.description} mono />}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <InfoBlock label="Solicitante" value={detail.caller_name} />
              <InfoBlock label="Atribuído a" value={detail.assigned_to_name ?? 'Não atribuído'} />
              <InfoBlock label="Grupo" value={detail.assigned_group_name ?? '—'} />
              <InfoBlock label="Criado" value={new Date(detail.created_at).toLocaleString('pt-BR')} />
            </div>
            {/* History / Comments */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Histórico de Atividades</div>
              {loadingHistory && <div className="text-xs text-slate-400 text-center py-4 animate-pulse">Carregando histórico…</div>}
              {!loadingHistory && detailHistory.length === 0 && <div className="text-xs text-slate-400">Nenhuma atividade registrada.</div>}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {detailHistory.map(h => (
                  <div key={h.id} className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-bold text-slate-700">{h.changed_by_name}</span>
                      {h.field_name !== 'comment' && <>
                        <span className="text-slate-400">alterou</span>
                        <span className="font-mono text-slate-500">{h.field_name}</span>
                        {h.old_value && <><span className="text-slate-400">de</span><span className="text-red-500 line-through">{h.old_value}</span></>}
                        <span className="text-slate-400">para</span>
                        <span className="text-emerald-600 font-semibold">{h.new_value}</span>
                      </>}
                      <span className="ml-auto text-slate-400 text-[10px]">{relativeTime(h.created_at)}</span>
                    </div>
                    {h.comment && <div className="text-slate-500 italic">{h.comment}</div>}
                  </div>
                ))}
              </div>
              {/* Add comment */}
              <div className="flex gap-2 mt-3">
                <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Adicionar comentário..." className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all" />
                <button onClick={handleAddComment} disabled={submittingComment || !commentText.trim()} className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer">
                  {submittingComment ? '…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── PORTAL DO PROVEDOR MSP (ALLIED IT) ───────────────────────

function MspProviderPortal({
  companyId,
  currentUserName,
  companies,
}: {
  companyId: string
  currentUserName: string
  companies: Company[]
}) {
  const {
    incidents,
    kpis,
    loading,
    error,
    search,
    stateFilter,
    priorityFilter,
    filterCompanyId,
    setSearch,
    setStateFilter,
    setFilterCompanyId,
    updateState,
    addComment,
  } = useIncidents(companyId)

  const [detail, setDetail] = useState<IncidentRow | null>(null)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [detailHistory, setDetailHistory] = useState<import('./hooks/useIncidents').IncidentHistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const filtered = useMemo(() => {
    return incidents.filter(i => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        i.number.toLowerCase().includes(q) ||
        i.short_description.toLowerCase().includes(q) ||
        i.caller_name.toLowerCase().includes(q)
      const matchState = stateFilter === 'all' || i.state === stateFilter
      const matchPriority = priorityFilter === 'all' || i.priority === priorityFilter
      return matchSearch && matchState && matchPriority
    })
  }, [incidents, search, stateFilter, priorityFilter])

  const openDetail = async (inc: IncidentRow) => {
    setDetail(inc)
    setLoadingHistory(true)
    try {
      const full = await incidentsService.getById(inc.id, companyId)
      setDetailHistory(full.history)
    } catch {
      /* noop */
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleAddComment = async () => {
    if (!detail || !commentText.trim()) return
    setSubmittingComment(true)
    try {
      await addComment(detail.id, commentText, currentUserName)
      setCommentText('')
      const full = await incidentsService.getById(detail.id, companyId)
      setDetailHistory(full.history)
    } finally {
      setSubmittingComment(false)
    }
  }

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-500 text-sm">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <div className="text-2xl mb-2">⚠️</div>
        <div className="font-semibold text-slate-800">Erro ao carregar o portal MSP</div>
        <div className="text-red-400 mt-1 text-xs font-mono">{error}</div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span className="p-1.5 bg-sky-100 text-sky-600 rounded-xl">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </span>
            Portal do Provedor MSP — Allied IT
          </h1>
          <p className="text-slate-400 text-sm mt-1">Console centralizado de atendimento multi-cliente</p>
        </div>

        {/* Multi-Tenant Filter */}
        <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-xl px-3 py-1.5 shadow-sm shrink-0">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cliente/Empresa:</span>
          <select
            value={filterCompanyId}
            onChange={e => setFilterCompanyId(e.target.value)}
            className="text-xs font-semibold text-slate-700 bg-white border-none outline-none cursor-pointer focus:ring-0"
          >
            <option value="all">Todos os Clientes (Fila Global)</option>
            {companies.filter(c => c.id !== '44444444-4444-4444-4444-444444444444').map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Geral" value={loading ? '…' : kpis.total} accent="bg-slate-100 text-slate-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="P1 — Crítico" value={loading ? '…' : kpis.critical} accent="bg-red-50 text-red-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard label="Em Andamento" value={loading ? '…' : kpis.inProgress} accent="bg-violet-50 text-violet-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="SLA Violado" value={loading ? '…' : kpis.slaBreached} accent="bg-red-50 text-red-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Sem Atribuição" value={loading ? '…' : kpis.unassigned} accent="bg-amber-50 text-amber-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
      </div>

      <TableCard header={
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {([['all', 'Todos'], ['In Progress', 'Em Andamento'], ['New', 'Novos'], ['On Hold', 'Aguardando'], ['Resolved', 'Resolvidos']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setStateFilter(v as typeof stateFilter)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${stateFilter === v ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {loading && <span className="text-xs text-slate-400 animate-pulse">● atualizando…</span>}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar número, descrição..." className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-600 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all w-56 shadow-sm" />
          </div>
        </div>
      }>
        <table className="w-full text-left text-sm min-w-[920px]">
          <TableHead cols={['Número', 'Cliente', 'Descrição', 'Prioridade', 'Estado', 'Categoria', 'Solicitante', 'Atribuído a', 'Criado']} />
          <tbody className="divide-y divide-slate-50">
            {loading && incidents.length === 0 && (
              <tr><td colSpan={9} className="py-12 text-center">
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                  <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
                  Carregando fila multi-cliente do banco de dados…
                </div>
              </td></tr>
            )}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="py-12 text-center text-slate-400 text-sm">Nenhum incidente encontrado.</td></tr>}
            {filtered.map(inc => {
              const compName = companies.find(c => c.id === inc.company_id)?.name || 'Allied IT'
              return (
                <tr key={inc.id} onClick={() => openDetail(inc)} className="hover:bg-slate-50 cursor-pointer transition-colors group">
                  <td className="px-5 py-3.5 font-mono text-emerald-600 text-xs font-bold whitespace-nowrap">
                    <span className="group-hover:underline">{inc.number}</span>{' '}
                    <SLABadge breached={inc.sla_breached} />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-100">
                      {compName}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 max-w-[200px] truncate text-slate-700 font-medium text-sm">{inc.short_description}</td>
                  <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wide ${priorityBadge[inc.priority]}`}>{inc.priority}</span></td>
                  <td className="px-5 py-3.5"><StateBadge state={inc.state} /></td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{inc.category}</td>
                  <td className="px-5 py-3.5 text-slate-600 text-xs">{inc.caller_name}</td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{inc.assigned_to_name ?? <span className="italic text-slate-300">Não atribuído</span>}</td>
                  <td className="px-5 py-3.5 text-slate-400 text-xs whitespace-nowrap">{relativeTime(inc.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>

      {detail && (
        <Modal title={detail.number} subtitle={`Detalhes do Incidente · ${companies.find(c => c.id === detail.company_id)?.name || 'Allied IT'}`} onClose={() => { setDetail(null); setDetailHistory([]) }}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-md text-xs uppercase tracking-wide ${priorityBadge[detail.priority]}`}>{detail.priority}</span>
              <StateBadge state={detail.state} />
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs border border-slate-200">{detail.category}</span>
              {detail.sla_breached && <SLABadge breached />}
            </div>
            {/* Quick state transition */}
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Alterar Estado</div>
              <div className="flex flex-wrap gap-1.5">
                {(['New','In Progress','On Hold','Pending User','Resolved','Closed'] as const).map(s => (
                  <button key={s} onClick={() => { updateState(detail.id, s, currentUserName); setDetail(prev => prev ? {...prev, state: s} : null) }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${detail.state === s ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <InfoBlock label="Cliente" value={companies.find(c => c.id === detail.company_id)?.name || 'Allied IT'} />
            <InfoBlock label="Descrição Curta" value={detail.short_description} />
            {detail.description && <InfoBlock label="Descrição Detalhada" value={detail.description} mono />}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <InfoBlock label="Solicitante" value={detail.caller_name} />
              <InfoBlock label="Atribuído a" value={detail.assigned_to_name ?? 'Não atribuído'} />
              <InfoBlock label="Grupo" value={detail.assigned_group_name ?? '—'} />
              <InfoBlock label="Criado" value={new Date(detail.created_at).toLocaleString('pt-BR')} />
            </div>
            {/* History / Comments */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Histórico de Atividades</div>
              {loadingHistory && <div className="text-xs text-slate-400 text-center py-4 animate-pulse">Carregando histórico…</div>}
              {!loadingHistory && detailHistory.length === 0 && <div className="text-xs text-slate-400">Nenhuma atividade registrada.</div>}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {detailHistory.map(h => (
                  <div key={h.id} className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-bold text-slate-700">{h.changed_by_name}</span>
                      {h.field_name !== 'comment' && <>
                        <span className="text-slate-400">alterou</span>
                        <span className="font-mono text-slate-500">{h.field_name}</span>
                        {h.old_value && <><span className="text-slate-400">de</span><span className="text-red-500 line-through">{h.old_value}</span></>}
                        <span className="text-slate-400">para</span>
                        <span className="text-emerald-600 font-semibold">{h.new_value}</span>
                      </>}
                      <span className="ml-auto text-slate-400 text-[10px]">{relativeTime(h.created_at)}</span>
                    </div>
                    {h.comment && <div className="text-slate-500 italic">{h.comment}</div>}
                  </div>
                ))}
              </div>
              {/* Add comment */}
              <div className="flex gap-2 mt-3">
                <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Adicionar comentário..." className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all" />
                <button onClick={handleAddComment} disabled={submittingComment || !commentText.trim()} className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer">
                  {submittingComment ? '…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── SERVICE REQUEST DASHBOARD ────────────────────────────────

function RequestDashboard({ companyId }: { companyId: string }) {
  const { requests, kpis, loading, error } = useRequests(companyId)
  const [detail, setDetail] = useState<ServiceRequestRow | null>(null)

  if (error) return <div className="text-red-500 text-sm p-4">{error}</div>

  return (
    <div>
      <PageHeader title="Gerenciamento de Requisições" subtitle="Solicitações formais de serviço ao Catálogo — ITIL v4" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={loading ? '…' : kpis.total} accent="bg-slate-100 text-slate-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>} />
        <StatCard label="Aguardando Aprovação" value={loading ? '…' : kpis.awaiting} accent="bg-amber-50 text-amber-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Atendidas" value={loading ? '…' : kpis.fulfilled} accent="bg-emerald-50 text-emerald-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>} />
        <StatCard label="Custo Acumulado" value={loading ? '…' : `R$ ${kpis.cost.toLocaleString('pt-BR')}`} accent="bg-sky-50 text-sky-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <TableCard header={<span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Requisições de Serviço</span>}>
        <table className="w-full text-left text-sm min-w-[720px]">
          <TableHead cols={['Número', 'Item Solicitado', 'Estado', 'Prioridade', 'Solicitante', 'Aprovador', 'Custo', 'Criado']} />
          <tbody className="divide-y divide-slate-50">
            {requests.length === 0 && !loading && <tr><td colSpan={8} className="py-12 text-center text-slate-400">Nenhuma requisição encontrada.</td></tr>}
            {loading && requests.length === 0 && <tr><td colSpan={8} className="py-12 text-center"><span className="text-slate-400 animate-pulse text-sm">Carregando…</span></td></tr>}
            {requests.map(req => (
              <tr key={req.id} onClick={() => setDetail(req)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                <td className="px-5 py-3.5 font-mono text-sky-600 text-xs font-bold">{req.number}</td>
                <td className="px-5 py-3.5 text-slate-700 font-medium max-w-[180px] truncate">{req.catalog_item_name}</td>
                <td className="px-5 py-3.5"><StateBadge state={req.state} /></td>
                <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wide ${priorityBadge[req.priority]}`}>{req.priority}</span></td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{req.requester_name}</td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">{req.approver_name ?? <span className="italic text-slate-300">Pendente</span>}</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{req.cost ? `R$ ${req.cost.toLocaleString('pt-BR')}` : '—'}</td>
                <td className="px-5 py-3.5 text-slate-400 text-xs">{relativeTime(req.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {detail && (
        <Modal title={detail.number} subtitle="Detalhes da Requisição de Serviço" onClose={() => setDetail(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-md text-xs uppercase ${priorityBadge[detail.priority]}`}>{detail.priority}</span>
              <StateBadge state={detail.state} />
            </div>
            <InfoBlock label="Item Solicitado" value={detail.catalog_item_name} />
            <InfoBlock label="Solicitante" value={detail.requester_name} />
            {detail.approver_name && <InfoBlock label="Aprovador" value={detail.approver_name} />}
            {detail.cost && <InfoBlock label="Custo" value={`R$ ${detail.cost.toLocaleString('pt-BR')} ${detail.currency ?? ''}`} />}
            {detail.form_data && Object.keys(detail.form_data as Record<string,unknown>).length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Dados do Formulário</div>
                {Object.entries(detail.form_data as Record<string,unknown>).map(([k, v]) => <InfoBlock key={k} label={k} value={String(v)} />)}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── PROBLEM DASHBOARD ────────────────────────────────────────

function ProblemDashboard({ companyId }: { companyId: string }) {
  const [detail, setDetail] = useState<ProblemRow | null>(null)
  const { problems: base, kpis: stats, loading, error } = useProblems(companyId)

  if (error) return <div className="text-red-500 text-sm p-4">{error}</div>

  return (
    <div>
      <PageHeader title="Gerenciamento de Problemas" subtitle="Análise de Causa Raiz e KEDB — ITIL v4" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={loading ? '…' : stats.total} accent="bg-slate-100 text-slate-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>} />
        <StatCard label="Problemas Ativos" value={loading ? '…' : stats.active} accent="bg-orange-50 text-orange-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Causa Raiz Identificada" value={loading ? '…' : stats.rootCause} accent="bg-teal-50 text-teal-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg>} />
        <StatCard label="Erros Conhecidos (KEDB)" value={loading ? '…' : stats.knownError} accent="bg-amber-50 text-amber-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>} />
      </div>

      <TableCard header={<span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Problemas Registrados</span>}>
        <table className="w-full text-left text-sm min-w-[760px]">
          <TableHead cols={['Número', 'Descrição', 'Prioridade', 'Estado', 'Categoria', 'Causa Raiz', 'KEDB', 'Incidentes']} />
          <tbody className="divide-y divide-slate-50">
            {base.length === 0 && !loading && <tr><td colSpan={8} className="py-12 text-center text-slate-400">Nenhum problema encontrado.</td></tr>}
            {loading && base.length === 0 && <tr><td colSpan={8} className="py-12 text-center"><span className="text-slate-400 animate-pulse text-sm">Carregando…</span></td></tr>}
            {base.map(prb => (
              <tr key={prb.id} onClick={() => setDetail(prb)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                <td className="px-5 py-3.5 font-mono text-teal-600 text-xs font-bold">{prb.number}</td>
                <td className="px-5 py-3.5 text-slate-700 font-medium max-w-[180px] truncate">{prb.short_description}</td>
                <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wide ${priorityBadge[prb.priority]}`}>{prb.priority}</span></td>
                <td className="px-5 py-3.5"><StateBadge state={prb.state} /></td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">{prb.category}</td>
                <td className="px-5 py-3.5 text-slate-500 text-xs max-w-[160px] truncate">{prb.root_cause ?? <span className="italic text-slate-300">Em investigação</span>}</td>
                <td className="px-5 py-3.5">
                  {prb.known_error
                    ? <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">KEDB</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

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
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <InfoBlock label="Atribuído a" value={detail.assigned_to_name ?? '—'} />
              <InfoBlock label="Grupo" value={detail.assigned_group_name ?? '—'} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ChangeDashboard({ companyId }: { companyId: string }) {
  const [detail, setDetail] = useState<ChangeRow | null>(null)
  const { changes: base, kpis: stats, loading, error } = useChanges(companyId)

  if (error) return <div className="text-red-500 text-sm p-4">{error}</div>

  return (
    <div>
      <PageHeader title="Change Enablement" subtitle="Controle de Mudanças com aprovação CAB — ITIL v4" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={loading ? '…' : stats.total} accent="bg-slate-100 text-slate-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>} />
        <StatCard label="Aguardando CAB" value={loading ? '…' : stats.awaitingCAB} accent="bg-amber-50 text-amber-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <StatCard label="Emergenciais" value={loading ? '…' : stats.emergency} accent="bg-red-50 text-red-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
        <StatCard label="Alto Risco" value={loading ? '…' : stats.highRisk} accent="bg-orange-50 text-orange-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard label="Agendadas" value={loading ? '…' : stats.scheduled} accent="bg-sky-50 text-sky-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
      </div>

      <TableCard header={<span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Registro de Mudanças</span>}>
        <table className="w-full text-left text-sm min-w-[820px]">
          <TableHead cols={['Número', 'Descrição', 'Tipo', 'Risco', 'Estado', 'Solicitante', 'CAB', 'Janela']} />
          <tbody className="divide-y divide-slate-50">
            {base.length === 0 && !loading && <tr><td colSpan={8} className="py-12 text-center text-slate-400">Nenhuma mudança encontrada.</td></tr>}
            {loading && base.length === 0 && <tr><td colSpan={8} className="py-12 text-center"><span className="text-slate-400 animate-pulse text-sm">Carregando…</span></td></tr>}
            {base.map(chg => {
              const riskBadge: Record<string, string> = {
                Low: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                Medium: 'text-amber-700 bg-amber-50 border-amber-200',
                High: 'text-orange-700 bg-orange-50 border-orange-200',
                Critical: 'text-red-700 bg-red-50 border-red-200',
              }
              const typeColor: Record<string, string> = {
                Standard: 'text-slate-500', Normal: 'text-sky-600 font-semibold', Emergency: 'text-red-600 font-bold'
              }
              const approvals = (typeof chg.cab_approvals === 'string' ? JSON.parse(chg.cab_approvals) : chg.cab_approvals) as Record<string, boolean> || {}
              const approvers = (typeof chg.cab_approvers === 'string' ? JSON.parse(chg.cab_approvers) : chg.cab_approvers) as string[] || []

              return (
                <tr key={chg.id} onClick={() => setDetail(chg)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                  <td className="px-5 py-3.5 font-mono text-violet-600 text-xs font-bold">{chg.number}</td>
                  <td className="px-5 py-3.5 text-slate-700 font-medium max-w-[200px] truncate">{chg.short_description}</td>
                  <td className={`px-5 py-3.5 text-xs ${typeColor[chg.type]}`}>{chg.type}</td>
                  <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${riskBadge[chg.risk]}`}>{chg.risk}</span></td>
                  <td className="px-5 py-3.5"><StateBadge state={chg.state} /></td>
                  <td className="px-5 py-3.5 text-slate-600 text-xs">{chg.requested_by_name}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{Object.keys(approvals).length}/{approvers.length} aprovações</td>
                  <td className="px-5 py-3.5 text-slate-400 text-xs">{chg.change_window_start ? new Date(chg.change_window_start).toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>

      {detail && (
        <Modal title={detail.number} subtitle="Detalhes da Mudança" onClose={() => setDetail(null)}>
          {(() => {
            const approvals = (typeof detail.cab_approvals === 'string' ? JSON.parse(detail.cab_approvals) : detail.cab_approvals) as Record<string, boolean> || {}
            const approvers = (typeof detail.cab_approvers === 'string' ? JSON.parse(detail.cab_approvers) : detail.cab_approvers) as string[] || []

            return (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${detail.type === 'Emergency' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>{detail.type}</span>
                  <StateBadge state={detail.state} />
                </div>
                <InfoBlock label="Descrição Curta" value={detail.short_description} />
                {detail.description && <InfoBlock label="Justificativa" value={detail.justification ?? detail.description} mono />}
                {detail.implementation_plan && <InfoBlock label="Plano de Implementação" value={detail.implementation_plan} mono />}
                {detail.test_plan && <InfoBlock label="Plano de Testes" value={detail.test_plan} mono />}
                {detail.backout_plan && <InfoBlock label="Plano de Rollback (Backout)" value={detail.backout_plan} mono />}
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <InfoBlock label="Solicitado por" value={detail.requested_by_name} />
                  <InfoBlock label="Janela de Mudança" value={detail.change_window_start ? `${new Date(detail.change_window_start).toLocaleString('pt-BR')} → ${new Date(detail.change_window_end ?? '').toLocaleString('pt-BR')}` : 'Não agendada'} />
                  <InfoBlock label="Aprovações CAB" value={`${Object.keys(approvals).length} de ${approvers.length}`} />
                </div>
              </div>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}

// ─── USER PORTAL ──────────────────────────────────────────────

function UserPortal({ currentUser, company }: { currentUser: User; company: Company }) {
  const [activeTab, setActiveTab] = useState<'catalog' | 'my_tickets'>('catalog')
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<string | null>(null)
  const [submittedForm, setSubmittedForm] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)

  const { items: dbCatalog, loading: catalogLoading } = useCatalog(company.id)
  const { requests: dbRequests, loading: requestsLoading } = useRequests(company.id)
  const { incidents: dbIncidents, loading: incidentsLoading } = useIncidents(company.id)

  const catalog = useMemo(() => {
    return dbCatalog
      .filter(i => (i.visible_to_roles as any[]).includes(currentUser.role))
      .map(i => ({
        id: i.id,
        companyId: i.company_id,
        name: i.name,
        description: i.description ?? '',
        category: i.category,
        icon: i.icon,
        estimatedDeliveryDays: i.estimated_delivery_days,
        cost: i.cost ? Number(i.cost) : undefined,
        currency: i.currency ?? undefined,
        requiresApproval: i.requires_approval,
        visibleToRoles: i.visible_to_roles,
        formFields: (typeof i.form_fields === 'string' ? JSON.parse(i.form_fields) : i.form_fields) as any[],
        active: i.active,
      }))
  }, [dbCatalog, currentUser.role])

  const myRequests = useMemo(() => {
    return dbRequests
      .filter(r => r.requester_id === currentUser.id)
      .map(r => ({
        id: r.id,
        number: r.number,
        catalogItemName: r.catalog_item_name,
        state: r.state,
        createdAt: r.created_at,
      }))
  }, [dbRequests, currentUser.id])

  const myIncidents = useMemo(() => {
    return dbIncidents
      .filter(i => i.caller_id === currentUser.id)
      .map(i => ({
        id: i.id,
        number: i.number,
        priority: i.priority,
        state: i.state,
        shortDescription: i.short_description,
        createdAt: i.created_at,
      }))
  }, [dbIncidents, currentUser.id])

  const catalogItem = catalog.find(c => c.id === selectedCatalogItem)
  const { primaryColor, accentColor, backgroundColor } = company.branding

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catalogItem) return
    setSubmitting(true)
    try {
      await requestsService.create({
        companyId: company.id,
        catalogItemId: catalogItem.id,
        catalogItemName: catalogItem.name,
        requesterId: currentUser.id,
        requesterName: currentUser.name,
        formData,
        cost: catalogItem.cost,
      })
      setSubmittedForm(true)
      setFormData({})
    } catch (err) {
      alert('Erro ao enviar solicitação: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  const loading = catalogLoading || requestsLoading || incidentsLoading

  return (
    <div className="min-h-screen" style={{ backgroundColor, fontFamily: 'system-ui, sans-serif' }}>
      {/* Branded Header */}
      <header className="px-6 py-4 flex items-center justify-between shadow-sm" style={{ backgroundColor: primaryColor }}>
        <div className="flex items-center gap-3">
          <img src={company.branding.logoUrl} alt={company.name} className="w-9 h-9 rounded-xl shadow-sm" />
          <div>
            <div className="text-white font-bold text-base leading-tight">{company.name}</div>
            <div className="text-white/60 text-[10px] uppercase tracking-widest font-semibold">Portal de Atendimento</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-white font-semibold text-sm">{currentUser.name}</div>
            <div className="text-white/60 text-[10px]">{currentUser.department}</div>
          </div>
          <img src={currentUser.avatarUrl} className="w-9 h-9 rounded-full border-2 border-white/30 object-cover" alt={currentUser.name} />
        </div>
      </header>

      {/* Welcome Banner */}
      <div className="px-6 py-10 text-center" style={{ background: `linear-gradient(135deg, ${primaryColor}18, ${accentColor}10, ${backgroundColor})` }}>
        <h1 className="text-2xl font-bold mb-1.5" style={{ color: primaryColor }}>{company.branding.welcomeTitle}</h1>
        <p className="text-slate-500 text-sm">{company.branding.welcomeSubtitle}</p>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 pb-12 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 pb-0">
          {[['catalog', '🛒 Catálogo de Serviços'], ['my_tickets', `📋 Meus Chamados (${myRequests.length + myIncidents.length})`]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab as 'catalog' | 'my_tickets')}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all cursor-pointer -mb-px ${activeTab === tab ? 'border-b-2 text-white' : 'border-transparent text-slate-500 hover:text-slate-700 bg-transparent'}`}
              style={activeTab === tab ? { borderBottomColor: primaryColor, backgroundColor: primaryColor } : {}}>
              {label}
            </button>
          ))}
        </div>

        {/* Catalog */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            {submittedForm ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm text-center py-16 space-y-3">
                <div className="text-5xl">✅</div>
                <h2 className="text-xl font-bold text-slate-800">Solicitação Enviada!</h2>
                <p className="text-slate-500 text-sm">Sua solicitação foi registrada e será processada em breve.</p>
                <button onClick={() => { setSubmittedForm(false); setSelectedCatalogItem(null) }} className="px-5 py-2 rounded-xl text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90 shadow-md" style={{ backgroundColor: primaryColor }}>
                  Nova Solicitação
                </button>
              </div>
            ) : selectedCatalogItem && catalogItem ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-start gap-4">
                  <span className="text-4xl">{catalogItem.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{catalogItem.name}</h2>
                    <p className="text-slate-500 text-sm mt-1">{catalogItem.description}</p>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-400">
                      <span>⏱ {catalogItem.estimatedDeliveryDays} dias úteis</span>
                      {catalogItem.cost && <span>💰 R$ {catalogItem.cost.toLocaleString('pt-BR')}</span>}
                      {catalogItem.requiresApproval && <span>✅ Requer aprovação</span>}
                    </div>
                  </div>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-100">
                  {catalogItem.formFields.map(field => (
                    <div key={field.id}>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea required={field.required} rows={3} value={formData[field.label] || ''} onChange={e => setFormData(prev => ({ ...prev, [field.label]: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all resize-none bg-white shadow-sm" />
                      ) : field.type === 'select' ? (
                        <select required={field.required} value={formData[field.label] || ''} onChange={e => setFormData(prev => ({ ...prev, [field.label]: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all bg-white shadow-sm">
                          <option value="">Selecione...</option>
                          {field.options?.map((opt: string) => <option key={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={field.type} required={field.required} value={formData[field.label] || ''} onChange={e => setFormData(prev => ({ ...prev, [field.label]: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all bg-white shadow-sm" />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setSelectedCatalogItem(null)} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 border border-slate-200 hover:bg-slate-50 cursor-pointer transition-all">Cancelar</button>
                    <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90 shadow-md disabled:opacity-50" style={{ backgroundColor: primaryColor }}>
                      {submitting ? 'Enviando...' : 'Enviar Solicitação'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalog.map(item => (
                  <button key={item.id} onClick={() => setSelectedCatalogItem(item.id)} className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all cursor-pointer group">
                    <div className="text-3xl mb-3">{item.icon}</div>
                    <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                    <div className="text-slate-400 text-xs mt-1 line-clamp-2">{item.description}</div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">{item.category}</span>
                      {item.cost && <span className="ml-auto text-[10px] font-bold text-slate-500">R$ {item.cost.toLocaleString('pt-BR')}</span>}
                    </div>
                    <span className="mt-2 inline-flex items-center text-xs font-semibold transition-opacity group-hover:opacity-80" style={{ color: primaryColor }}>Solicitar →</span>
                  </button>
                ))}
                {loading && <div className="col-span-3 text-center py-12 text-slate-400 animate-pulse">Carregando catálogo do banco de dados...</div>}
                {!loading && catalog.length === 0 && <div className="col-span-3 text-center py-12 text-slate-400">Nenhum item disponível no catálogo.</div>}
              </div>
            )}
          </div>
        )}

        {/* My Tickets */}
        {activeTab === 'my_tickets' && (
          <div className="space-y-6">
            {loading ? (
              <div className="text-center py-12 text-slate-400 animate-pulse">Carregando chamados...</div>
            ) : myRequests.length === 0 && myIncidents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm text-center py-16 text-slate-400 space-y-2">
                <div className="text-4xl">📭</div>
                <p className="text-sm">Nenhum chamado encontrado para o seu usuário.</p>
              </div>
            ) : (
              <>
                {myRequests.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Minhas Requisições</h2>
                    <div className="space-y-2">
                      {myRequests.map(req => (
                        <div key={req.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 hover:border-slate-300 transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-sky-600">{req.number}</span>
                              <StateBadge state={req.state} />
                            </div>
                            <div className="text-sm font-semibold text-slate-700 mt-0.5 truncate">{req.catalogItemName}</div>
                          </div>
                          <div className="text-xs text-slate-400 shrink-0">{relativeTime(req.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {myIncidents.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Meus Incidentes</h2>
                    <div className="space-y-2">
                      {myIncidents.map(inc => (
                        <div key={inc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 hover:border-slate-300 transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-red-500">{inc.number}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wide ${priorityBadge[inc.priority]}`}>{inc.priority}</span>
                              <StateBadge state={inc.state} />
                            </div>
                            <div className="text-sm font-semibold text-slate-700 mt-0.5 truncate">{inc.shortDescription}</div>
                          </div>
                          <div className="text-xs text-slate-400 shrink-0">{relativeTime(inc.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
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
      <PageHeader title="API de Integração" subtitle="Referência REST para integrações externas com o Flowfy ITSM" />

      {/* Info Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <span className="text-slate-400">Base URL:</span>
          <span className="text-emerald-600 font-semibold">https://api.flowfy.com</span>
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

// ─── ADMIN DASHBOARD ──────────────────────────────────────────

function AdminDashboard({ refetchAppData, currentCompany }: { refetchAppData?: () => Promise<void>; currentCompany: Company }) {
  const [activeAdminTab, setActiveAdminTab] = useState<'tenants' | 'users' | 'catalog'>('tenants')
  
  // States for tenant onboarding
  const [tenantName, setTenantName] = useState('')
  const [tenantDomain, setTenantDomain] = useState('')
  const [tenantLogo, setTenantLogo] = useState('')
  const [tenantPrimary, setTenantPrimary] = useState('#2563EB')
  const [tenantAccent, setTenantAccent] = useState('#3B82F6')
  const [tenantBg, _setTenantBg] = useState('#EFF6FF')
  const [tenantWelcomeTitle, _setTenantWelcomeTitle] = useState('Central de Serviços')
  const [tenantWelcomeSubtitle, _setTenantWelcomeSubtitle] = useState('Como podemos te ajudar hoje?')
  const [tenantLocalLogin, _setTenantLocalLogin] = useState(true)
  const [tenantSchema, setTenantSchema] = useState('')
  const [tenantSaving, setTenantSaving] = useState(false)
  
  // States for user onboarding
  const [usrName, setUsrName] = useState('')
  const [usrEmail, setUsrEmail] = useState('')
  const [usrRole, setUsrRole] = useState<Role>('end_user')
  const [usrDept, setUsrDept] = useState('')
  const [usrCompanyId, setUsrCompanyId] = useState(currentCompany.id)
  const [usrSaving, setUsrSaving] = useState(false)
  
  // States for catalog item onboarding
  const [catName, setCatName] = useState('')
  const [catDesc, setCatDesc] = useState('')
  const [catCategory, setCatCategory] = useState('Equipamentos')
  const [catCost, setCatCost] = useState(0)
  const [catDelivery, setCatDelivery] = useState(3)
  const [catApproval, _setCatApproval] = useState(true)
  const [catIcon, setCatIcon] = useState('💻')
  const [catCompanyId, setCatCompanyId] = useState(currentCompany.id)
  const [catSaving, setCatSaving] = useState(false)

  // Fetch all companies and profiles for administration lists
  const { companies: rawCompanies, profiles: rawProfiles } = useAppData()

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setTenantSaving(true)
    try {
      const payload: any = {
        name: tenantName,
        domain: tenantDomain,
        logo_url: tenantLogo || null,
        primary_color: tenantPrimary,
        accent_color: tenantAccent,
        bg_color: tenantBg,
        welcome_title: tenantWelcomeTitle,
        welcome_subtitle: tenantWelcomeSubtitle,
        allow_local_login: tenantLocalLogin,
        schema_name: tenantSchema || null,
        sso_providers: [
          { id: 'msft', type: 'microsoft', label: 'Microsoft Entra ID', tenantId: `${tenantDomain}-tenant`, enabled: true }
        ],
        active: true,
      }
      await companiesService.create(payload)
      alert('Empresa cadastrada com sucesso!')
      setTenantName('')
      setTenantDomain('')
      setTenantLogo('')
      setTenantSchema('')
      if (refetchAppData) await refetchAppData()
    } catch (err: any) {
      alert('Erro ao cadastrar empresa: ' + err.message)
    } finally {
      setTenantSaving(false)
    }
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUsrSaving(true)
    try {
      const payload: any = {
        name: usrName,
        email: usrEmail,
        role: usrRole,
        department: usrDept || null,
        company_id: usrCompanyId,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${usrName.split(' ')[0]}`,
        active: true,
      }
      await profilesService.create(payload)
      alert('Usuário cadastrado com sucesso!')
      setUsrName('')
      setUsrEmail('')
      setUsrDept('')
      if (refetchAppData) await refetchAppData()
    } catch (err: any) {
      alert('Erro ao cadastrar usuário: ' + err.message)
    } finally {
      setUsrSaving(false)
    }
  }

  const handleSaveCatalog = async (e: React.FormEvent) => {
    e.preventDefault()
    setCatSaving(true)
    try {
      const payload: any = {
        name: catName,
        description: catDesc || null,
        category: catCategory,
        cost: catCost || null,
        estimated_delivery_days: catDelivery,
        requires_approval: catApproval,
        visible_to_roles: ['end_user', 'technician', 'company_admin'],
        icon: catIcon,
        company_id: catCompanyId,
        active: true,
        form_fields: [
          { id: 'f1', label: 'Justificativa de Negócio', type: 'textarea', required: true }
        ]
      }
      await catalogService.create(payload)
      alert('Item do catálogo cadastrado com sucesso!')
      setCatName('')
      setCatDesc('')
      setCatCost(0)
    } catch (err: any) {
      alert('Erro ao cadastrar item do catálogo: ' + err.message)
    } finally {
      setCatSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Governança Global (Admin)" subtitle="Administração Central de Tenants, Usuários e Portais Flowfy" />
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-0 mb-6">
        {[['tenants', '🏢 Gestão de Clientes'], ['users', '👥 Usuários & RBAC'], ['catalog', '⚙️ Design de Serviços (Catálogo)']].map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveAdminTab(tab as any)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all cursor-pointer -mb-px ${activeAdminTab === tab ? 'border-b-2 text-slate-800 border-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700 bg-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeAdminTab === 'tenants' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3">Empresas Cadastradas (Tenants)</h3>
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
              {rawCompanies.map(c => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img src={c.logo_url || ''} className="w-8 h-8 rounded-lg" alt={c.name} />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{c.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{c.domain} · Schema: {c.schema_name || 'public'}</div>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-semibold uppercase">Ativo</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Onboarding de Novo Cliente</h3>
            <form onSubmit={handleSaveTenant} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome da Empresa</label>
                <input required type="text" value={tenantName} onChange={e => setTenantName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: Globex IT" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Domínio de E-mail</label>
                <input required type="text" value={tenantDomain} onChange={e => setTenantDomain(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: globex.io" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">URL da Logo</label>
                <input type="text" value={tenantLogo} onChange={e => setTenantLogo(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: https://logo.com" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cor Primária</label>
                  <input required type="text" value={tenantPrimary} onChange={e => setTenantPrimary(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cor Secundária</label>
                  <input required type="text" value={tenantAccent} onChange={e => setTenantAccent(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Instância DB Schema (Postgres)</label>
                <input type="text" value={tenantSchema} onChange={e => setTenantSchema(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: tenant_globex (deixe em branco para public)" />
              </div>
              <button type="submit" disabled={tenantSaving} className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs mt-3 disabled:opacity-50">
                {tenantSaving ? 'Salvando...' : 'Onboard Company'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeAdminTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3">Usuários & Matriz de Acessos</h3>
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
              {rawProfiles.map(p => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img src={p.avatar_url || ''} className="w-7 h-7 rounded-full" alt={p.name} />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{p.email} · {p.department || 'Operações'}</div>
                    </div>
                  </div>
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase">{p.role}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Adicionar Novo Colaborador</h3>
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome Completo</label>
                <input required type="text" value={usrName} onChange={e => setUsrName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: Ana Silva" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail Corporativo</label>
                <input required type="email" value={usrEmail} onChange={e => setUsrEmail(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: ana@acme.com" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Departamento</label>
                <input type="text" value={usrDept} onChange={e => setUsrDept(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: TI" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Papel de Acesso (RBAC)</label>
                <select value={usrRole} onChange={e => setUsrRole(e.target.value as Role)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white">
                  <option value="end_user">EndUser (Usuário Final)</option>
                  <option value="technician">Technician (Analista)</option>
                  <option value="area_manager">AreaManager (Gerente de Área)</option>
                  <option value="it_manager">ITManager (Gerente de TI)</option>
                  <option value="client_manager">ClientManager (Gestor Cliente)</option>
                  <option value="cio">CIO (Executivo de TI)</option>
                  <option value="sysadmin">SysAdmin (Admin Global)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Empresa / Tenant</label>
                <select value={usrCompanyId} onChange={e => setUsrCompanyId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white">
                  {rawCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={usrSaving} className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs mt-3 disabled:opacity-50">
                {usrSaving ? 'Salvando...' : 'Create Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeAdminTab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3">Serviços Globais Publicados</h3>
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
              {rawCompanies.map(c => (
                <div key={c.id} className="pt-2">
                  <h4 className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded mb-2">{c.name} Catalog</h4>
                  <CatalogList companyId={c.id} />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Design de Novo Serviço</h3>
            <form onSubmit={handleSaveCatalog} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do Item</label>
                <input required type="text" value={catName} onChange={e => setCatName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: iPhone 15 Pro Max" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição do Serviço</label>
                <textarea required value={catDesc} onChange={e => setCatDesc(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" rows={2} placeholder="ex: Fornecimento de smartphone corporativo..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Categoria</label>
                  <input required type="text" value={catCategory} onChange={e => setCatCategory(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Custo (R$)</label>
                  <input required type="number" value={catCost} onChange={e => setCatCost(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">SLA Entrega (Dias)</label>
                  <input required type="number" value={catDelivery} onChange={e => setCatDelivery(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ícone (Emoji)</label>
                  <input required type="text" value={catIcon} onChange={e => setCatIcon(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Empresa Destino</label>
                <select value={catCompanyId} onChange={e => setCatCompanyId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white">
                  {rawCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={catSaving} className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs mt-3 disabled:opacity-50">
                {catSaving ? 'Salvando...' : 'Publish Service Item'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogList({ companyId }: { companyId: string }) {
  const { items, loading } = useCatalog(companyId)
  if (loading) return <div className="text-[10px] text-slate-400 animate-pulse px-3 py-2">Carregando catálogo...</div>
  if (items.length === 0) return <div className="text-[10px] text-slate-300 italic px-3 py-2">Nenhum item publicado.</div>
  return (
    <div className="space-y-1 px-3 pb-3">
      {items.map(item => (
        <div key={item.id} className="text-[11px] text-slate-600 flex justify-between">
          <span>{item.icon} {item.name}</span>
          <span className="font-semibold text-slate-400">{item.cost ? `R$ ${item.cost}` : 'Sem custo'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── CIO DASHBOARD ───────────────────────────────────────────

function CIODashboard({ companyId }: { companyId: string }) {
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

function ClientManagerDashboard({ companyId }: { companyId: string }) {
  const { requests, kpis: reqKPIs, loading: reqLoading } = useRequests(companyId)
  const { incidents, kpis: incKPIs, loading: incLoading } = useIncidents(companyId)

  if (reqLoading || incLoading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando painel do cliente...</div>

  return (
    <div>
      <PageHeader title="Client Performance Panel" subtitle="Acompanhamento operacional de SLAs e consumo financeiro do catálogo da sua empresa" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Chamados" value={incidents.length + requests.length} accent="bg-slate-100 text-slate-500" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="Requisições Atendidas" value={reqKPIs.fulfilled} accent="bg-emerald-50 text-emerald-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>} />
        <StatCard label="Custo Acumulado" value={`R$ ${reqKPIs.cost.toLocaleString('pt-BR')}`} accent="bg-sky-50 text-sky-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="SLA Violado" value={incKPIs.slaBreached} accent="bg-red-50 text-red-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 overflow-hidden">
        <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Chamados Ativos da sua Empresa</h3>
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
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── IT MANAGER DASHBOARD ────────────────────────────────────

function ITManagerDashboard({ companyId }: { companyId: string }) {
  const { kpis: incKPIs, loading: incLoading } = useIncidents(companyId)
  const { kpis: reqKPIs, loading: reqLoading } = useRequests(companyId)
  const { changes, kpis: chgKPIs, loading: chgLoading } = useChanges(companyId)

  if (incLoading || reqLoading || chgLoading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando painel do gerente de TI...</div>

  return (
    <div>
      <PageHeader title="IT Operations Manager Panel" subtitle="Acompanhamento geral de SLAs operacionais, produtividade analistas e aprovações CAB" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Aprovação CAB" value={chgKPIs.awaitingCAB} accent="bg-amber-50 text-amber-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>} />
        <StatCard label="Mudanças Agendadas" value={chgKPIs.scheduled} accent="bg-sky-50 text-sky-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
        <StatCard label="SLA Violado (Incidentes)" value={incKPIs.slaBreached} accent="bg-red-50 text-red-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard label="Custo Geral Catálogo" value={`R$ ${reqKPIs.cost.toLocaleString('pt-BR')}`} accent="bg-emerald-50 text-emerald-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
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
              <span>Incidentes P1 (Críticos) Ativos:</span>
              <span className="font-bold text-red-600">{incKPIs.critical}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
              <span>Média SLAs de Requisição Atendidos:</span>
              <span className="font-bold text-emerald-600">97.8%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AREA MANAGER DASHBOARD ──────────────────────────────────

function AreaManagerDashboard({ companyId }: { companyId: string }) {
  const { incidents, loading: incLoading } = useIncidents(companyId)
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
      <PageHeader title="Area / Technical Tower Manager Panel" subtitle="Fila de incidentes e SLAs específicos por torre operacional (Infra vs Sistemas)" />
      
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
        <StatCard label="Incidentes Ativos Torre" value={filteredIncidents.length} accent="bg-slate-100 text-slate-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="SLA Violado Torre" value={filteredIncidents.filter(i => i.sla_breached).length} accent="bg-red-50 text-red-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Chamados Sem Analista" value={filteredIncidents.filter(i => !i.assigned_to_id).length} accent="bg-amber-50 text-amber-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 overflow-hidden">
        <h3 className="text-slate-800 font-bold text-xs uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Incidentes Ativos na Torre</h3>
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

function TechnicianDashboard({ companyId, currentUser }: { companyId: string; currentUser: User }) {
  const { incidents, loading, refetch } = useIncidents(companyId)
  
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
      <PageHeader title="Fila Operacional Analista" subtitle="Atendimento diário, triagem e execução de chamados técnicos" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Total Incidentes" value={incidents.length} accent="bg-slate-100 text-slate-600" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
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
  const { companies: dbCompanies, profiles: dbProfiles, loading: dbLoading, error: dbError } = useAppData()

  const companies = useMemo(() => {
    return dbCompanies.map(mapCompany)
  }, [dbCompanies])

  const users = useMemo(() => {
    return dbProfiles.map(mapUser)
  }, [dbProfiles])

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
  const [activeView, setActiveView] = useState<AppView>('dashboard_incidents')
  const [isCompanySwitcherOpen, setIsCompanySwitcherOpen] = useState(false)
  const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false)
  const [simulatedRole, setSimulatedRole] = useState<Role | null>(null)

  const activeRole = simulatedRole || (currentUser ? currentUser.role : 'end_user')

  const handleLogin = (user: User, company: Company) => {
    setCurrentUser(user)
    setCurrentCompany(company)
    setSimulatedRole(user.role)
    setActiveView(user.role === 'end_user' ? 'user_portal' : 'dashboard_incidents')
  }
  
  const handleLogout = () => {
    setCurrentUser(null)
    setCurrentCompany(null)
    setSimulatedRole(null)
  }

  const unreadNotifs = useMemo(() => mockNotifications.filter(n => !n.read).length, [])

  if (dbLoading) {
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
          <div className="text-red-400 mt-1 text-xs font-mono">{dbError}</div>
        </div>
      </div>
    )
  }

  if (!currentUser || !currentCompany) return <LoginScreen companies={companies} users={users} onLogin={handleLogin} />

  // User Portal — full page, no sidebar
  if (activeView === 'user_portal' || activeRole === 'end_user') {
    return (
      <div>
        <div className="fixed top-4 right-4 z-50 flex gap-2">
          {currentUser.role !== 'end_user' && (
            <>
              {/* Role Sim Selector for testing */}
              <div className="flex items-center gap-1 border border-slate-200 bg-white rounded-xl px-2 py-1 shadow-sm shrink-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Simular Papel:</span>
                <select
                  value={activeRole}
                  onChange={e => {
                    const r = e.target.value as Role
                    setSimulatedRole(r)
                    if (r === 'end_user') {
                      setActiveView('user_portal')
                    } else if (r === 'sysadmin') {
                      setActiveView('admin_dashboard')
                    } else {
                      setActiveView('dashboard_incidents')
                    }
                  }}
                  className="text-xs font-semibold text-slate-700 bg-white border-none outline-none cursor-pointer focus:ring-0"
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
              <button onClick={() => { setSimulatedRole('sysadmin'); setActiveView('admin_dashboard') }} className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-sm">
                ← Painel do Agente
              </button>
            </>
          )}
          <button onClick={handleLogout} className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-sm">Sair</button>
        </div>
        <UserPortal currentUser={currentUser} company={currentCompany} />
      </div>
    )
  }

  const navItems: { view: AppView; label: string; icon: React.ReactNode }[] = [
    { view: 'dashboard_incidents', label: 'Incidentes', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> },
    { view: 'dashboard_requests', label: 'Requisições', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
    { view: 'dashboard_problems', label: 'Problemas', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { view: 'dashboard_changes', label: 'Mudanças', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> },
    { view: 'user_portal', label: 'Portal do Usuário', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
    { view: 'api_docs', label: 'API de Integração', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg> },
  ]

  if (activeRole === 'sysadmin') {
    navItems.push({ view: 'admin_dashboard', label: 'Governança Admin', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> })
  }

  const renderActiveDashboard = () => {
    if (activeView === 'admin_dashboard' && activeRole === 'sysadmin') {
      return <AdminDashboard refetchAppData={async () => {}} currentCompany={currentCompany} />
    }
    
    // Customize layout if viewing the default dashboard view based on active role
    if (activeView === 'dashboard_incidents') {
      if (currentCompany.id === '44444444-4444-4444-4444-444444444444') {
        return <MspProviderPortal companyId={currentCompany.id} currentUserName={currentUser.name} companies={companies} />
      }
      switch (activeRole) {
        case 'cio':
          return <CIODashboard companyId={currentCompany.id} />
        case 'client_manager':
          return <ClientManagerDashboard companyId={currentCompany.id} />
        case 'it_manager':
          return <ITManagerDashboard companyId={currentCompany.id} />
        case 'area_manager':
          return <AreaManagerDashboard companyId={currentCompany.id} />
        case 'technician':
          return <TechnicianDashboard companyId={currentCompany.id} currentUser={currentUser} />
        default:
          return <IncidentDashboard companyId={currentCompany.id} currentUserName={currentUser.name} />
      }
    }

    if (activeView === 'dashboard_requests') return <RequestDashboard companyId={currentCompany.id} />
    if (activeView === 'dashboard_problems') return <ProblemDashboard companyId={currentCompany.id} />
    if (activeView === 'dashboard_changes') return <ChangeDashboard companyId={currentCompany.id} />
    if (activeView === 'api_docs') return <ApiDocs />
    
    return <IncidentDashboard companyId={currentCompany.id} currentUserName={currentUser.name} />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 lg:px-6 py-3 flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/25">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <span className="text-lg font-black tracking-tight text-slate-800 hidden sm:block">Flowfy</span>
          <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest hidden sm:block">ITSM</span>
        </div>

        <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

        {/* Company Switcher */}
        <div className="relative">
          <button onClick={() => { setIsCompanySwitcherOpen(v => !v); setIsUserSwitcherOpen(false) }} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer text-xs font-semibold text-slate-700 shadow-sm">
            <img src={currentCompany.branding.logoUrl} alt={currentCompany.name} className="w-5 h-5 rounded-md" />
            <span className="hidden sm:block">{currentCompany.name}</span>
            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCompanySwitcherOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {isCompanySwitcherOpen && (
            <div className="absolute top-full mt-1.5 left-0 bg-white border border-slate-200 rounded-2xl shadow-xl w-56 z-50 overflow-hidden">
              <div className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Trocar Empresa</div>
              {companies.map(c => (
                <button key={c.id} onClick={() => { setCurrentCompany(c); setCurrentUser(users.find(u => u.companyId === c.id && u.role === (currentUser.role === 'sysadmin' ? 'sysadmin' : 'agent')) ?? users.find(u => u.companyId === c.id)!); setIsCompanySwitcherOpen(false) }}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 text-xs transition-all cursor-pointer ${currentCompany.id === c.id ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                  <img src={c.branding.logoUrl} alt={c.name} className="w-7 h-7 rounded-lg" />
                  <div><div className="font-semibold">{c.name}</div><div className="text-slate-400 text-[10px]">{c.domain}</div></div>
                  {currentCompany.id === c.id && <svg className="ml-auto w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Role Simulator Dropdown */}
        <div className="flex items-center gap-1.5 border border-slate-200 bg-white rounded-xl px-2 py-1 shadow-sm shrink-0">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider hidden md:inline">Simular Papel:</span>
          <select
            value={activeRole}
            onChange={e => {
              const r = e.target.value as Role
              setSimulatedRole(r)
              if (r === 'end_user') {
                setActiveView('user_portal')
              } else if (r === 'sysadmin') {
                setActiveView('admin_dashboard')
              } else {
                setActiveView('dashboard_incidents')
              }
            }}
            className="text-xs font-semibold text-slate-700 bg-white border-none outline-none cursor-pointer focus:ring-0"
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Switcher */}
        <div className="relative">
          <button onClick={() => { setIsUserSwitcherOpen(v => !v); setIsCompanySwitcherOpen(false) }} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-sm">
            <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-6 h-6 rounded-full" />
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-slate-700">{currentUser.name.split(' ')[0]}</div>
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{currentUser.role.replace('_', ' ')}</div>
            </div>
            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isUserSwitcherOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {isUserSwitcherOpen && (
            <div className="absolute top-full mt-1.5 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl w-68 z-50 overflow-hidden">
              <div className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Simular Perfil RBAC</div>
              {users.map(u => (
                <button key={u.id} onClick={() => { setCurrentUser(u); setSimulatedRole(u.role); setCurrentCompany(companies.find(c => c.id === u.companyId)!); setActiveView(u.role === 'end_user' ? 'user_portal' : 'dashboard_incidents'); setIsUserSwitcherOpen(false) }}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs transition-all cursor-pointer ${currentUser.id === u.id ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                  <img src={u.avatarUrl} alt={u.name} className="w-7 h-7 rounded-full shrink-0" />
                  <div className="min-w-0"><div className="font-semibold truncate">{u.name}</div><div className="text-[10px] text-slate-400">{u.role.replace('_', ' ')} · {companies.find(c => c.id === u.companyId)?.name}</div></div>
                  {currentUser.id === u.id && <svg className="ml-auto w-3.5 h-3.5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </button>
              ))}
              <div className="border-t border-slate-100 p-2">
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer font-semibold">Encerrar Sessão</button>
              </div>
            </div>
          )}
        </div>

        {/* Notification Bell */}
        <button className="relative p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          {unreadNotifs > 0 && <span className="absolute top-1.5 right-1.5 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>}
        </button>
      </header>

      {/* Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-slate-200 shrink-0 hidden lg:flex flex-col py-4">
          <div className="px-3 space-y-0.5">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest px-3 py-2">Módulos ITIL v4</div>
            {navItems.slice(0, 4).map(item => (
              <button key={item.view} onClick={() => setActiveView(item.view)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${activeView === item.view ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                <span className={activeView === item.view ? 'text-emerald-400' : 'text-slate-400'}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
          <div className="px-3 space-y-0.5 mt-4 pt-4 border-t border-slate-100">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest px-3 py-2">Acesso</div>
            {navItems.slice(4).map(item => (
              <button key={item.view} onClick={() => setActiveView(item.view)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${activeView === item.view ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                <span className={activeView === item.view ? 'text-emerald-400' : 'text-slate-400'}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
          {/* Active Company Card */}
          <div className="mt-auto px-3 pb-2">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">Tenant Ativo</div>
              <img src={currentCompany.branding.logoUrl} alt={currentCompany.name} className="w-9 h-9 rounded-xl mx-auto mb-1.5 shadow-sm" />
              <div className="text-[11px] text-slate-700 font-bold">{currentCompany.name}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">{currentCompany.domain}</div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-50" onClick={() => { setIsCompanySwitcherOpen(false); setIsUserSwitcherOpen(false) }}>
          <div className="max-w-7xl mx-auto">
            {renderActiveDashboard()}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-3 px-6 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">© {new Date().getFullYear()} Flowfy ITSM · ITIL v4 · Multi-Tenant</span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Todos os sistemas operacionais
        </span>
      </footer>
    </div>
  )
}
