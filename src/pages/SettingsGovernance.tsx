import { useState, useEffect, useCallback, useMemo } from 'react'
import { CalendarClock, Gauge, PauseCircle, Plus, Trash2, Save, X, Pencil, AlertCircle, Lock, Paintbrush, Building, Users, Network, BookOpen, FileText, Layout, Image as ImageIcon, Upload } from 'lucide-react'
import { pendingReasonsService, slaPolicyService, companiesService } from '../lib/services'
import { supabase } from '../lib/supabase'
import { useToast } from '../context'
import type { PendingReasonRow, SLAPolicyRow } from '../lib/database.types'
import SlaCalendarManager from './SlaCalendarManager'
import { useAppData } from '../hooks/useDbData'
import AdminDashboard from './AdminDashboard'

const getMsg = (e: unknown): string => {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown }
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.details === 'string' && o.details) return o.details
  }
  return e instanceof Error ? e.message : 'Falha na operação.'
}

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const PRIORITY_META: Record<number, { label: string; color: string; dot: string }> = {
  1: { label: 'P1 · Crítica', color: 'bg-red-500/10 text-red-500 border-red-500/20', dot: 'bg-red-500' },
  2: { label: 'P2 · Alta',    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', dot: 'bg-orange-500' },
  3: { label: 'P3 · Média',   color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dot: 'bg-amber-500' },
  4: { label: 'P4 · Baixa',   color: 'bg-sky-500/10 text-sky-500 border-sky-500/20', dot: 'bg-sky-500' },
  5: { label: 'P5 · Planejada', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20', dot: 'bg-slate-500' },
}

const humanize = (mins: number): string => {
  if (!mins || mins <= 0) return '—'
  if (mins < 60) return `${mins}min`
  if (mins < 1440) return `${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h`
  return `${(mins / 1440).toFixed(mins % 1440 ? 1 : 0)}d`
}

interface DraftRow {
  response: string
  resolution: string
}

type GovTab =
  | 'appearance'
  | 'policies'
  | 'pending_reasons'
  | 'tenants'
  | 'users'
  | 'groups'
  | 'catalog_incidents'
  | 'catalog_requests'
  | 'form_templates'

export default function SettingsGovernance({ companyId, activeRole }: { companyId: string; activeRole: string }) {
  const { toast } = useToast()
  const { companies } = useAppData()
  
  const isAlpha = false
  const isBeta = false

  const [managedCompanyId, setManagedCompanyId] = useState(companyId)
  
  useEffect(() => {
    setManagedCompanyId(companyId)
  }, [companyId])

  const currentCompanyRow = companies.find(c => c.id === managedCompanyId)
  const currentCompany = useMemo(() => {
    return currentCompanyRow
      ? {
          id: currentCompanyRow.id,
          name: currentCompanyRow.name,
          domain: currentCompanyRow.domain,
          branding: {
            logoUrl: currentCompanyRow.logo_url ?? undefined,
            primaryColor: currentCompanyRow.primary_color,
            secondaryColor: currentCompanyRow.accent_color,
            accentColor: currentCompanyRow.accent_color,
            backgroundColor: currentCompanyRow.bg_color,
            welcomeTitle: currentCompanyRow.welcome_title,
            welcomeSubtitle: currentCompanyRow.welcome_subtitle,
          },
          authConfig: {
            companyId: currentCompanyRow.id,
            providers: (currentCompanyRow.sso_providers as any) ?? [],
            allowLocalLogin: currentCompanyRow.allow_local_login,
          },
          createdAt: currentCompanyRow.created_at,
          active: currentCompanyRow.active,
          schemaName: currentCompanyRow.schema_name ?? undefined,
          concurrentLicenses: 10,
          licensePlan: 'enterprise' as const,
        }
      : {
          id: managedCompanyId,
          name: 'Carregando...',
          domain: '',
          branding: { primaryColor: '#2563EB', accentColor: '#3B82F6', backgroundColor: '#EFF6FF', welcomeTitle: '', welcomeSubtitle: '' },
          authConfig: { companyId: managedCompanyId, providers: [], allowLocalLogin: true },
          createdAt: '',
          active: true,
          concurrentLicenses: 10,
          licensePlan: 'enterprise' as const,
        }
  }, [currentCompanyRow, managedCompanyId])

  // View & Tab State
  const [viewMode, setViewMode] = useState<'list' | 'details'>(activeRole === 'sysadmin' ? 'list' : 'details')
  const [activeTab, setActiveTab] = useState<GovTab>('appearance')

  // Policies States
  const [policies, setPolicies] = useState<SLAPolicyRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})
  const [loadingPolicies, setLoadingPolicies] = useState(true)
  const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)

  // Reasons States
  const [reasons, setReasons] = useState<PendingReasonRow[]>([])
  const [loadingReasons, setLoadingReasons] = useState(true)
  const [reasonError, setReasonError] = useState<string | null>(null)

  // Reason Modal Form States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReason, setEditingReason] = useState<PendingReasonRow | null>(null)
  const [reasonName, setReasonName] = useState('')
  const [reasonSlug, setReasonSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [requiresCustomerAction, setRequiresCustomerAction] = useState(false)
  const [pausesSLA, setPausesSLA] = useState(true)
  const [savingReason, setSavingReason] = useState(false)

  // Style Tokens matching theme variables
  const cardClass = 'bg-surface border border-outline-variant rounded-xl shadow-sm'
  const inputClass = 'bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary text-text-main outline-none px-4 py-3 text-base font-medium'
  const buttonPrimaryClass = 'bg-primary text-on-primary rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all font-bold'
  const buttonSecondaryClass = 'border border-outline-variant text-text-main hover:bg-surface-container rounded-lg transition-all font-semibold'
  const fontClass = 'font-sans'

  // Access Control check (CIOs, managers and administrators are authorized)
  const isAuthorized = ['sysadmin', 'company_admin', 'cio', 'it_manager', 'area_manager', 'client_manager'].includes(activeRole)
  const isSysAdmin = activeRole === 'sysadmin'

  // -- Appearance Form State --
  const [appearanceForm, setAppearanceForm] = useState({
    primary_color: currentCompanyRow?.primary_color || '#2563EB',
    accent_color: currentCompanyRow?.accent_color || '#3B82F6',
    bg_color: currentCompanyRow?.bg_color || '#F1F5F9',
    logo_url: currentCompanyRow?.logo_url || '',
    brand_name: currentCompanyRow?.brand_name || '',
    welcome_title: currentCompanyRow?.welcome_title || 'Como podemos ajudar?',
    welcome_subtitle: currentCompanyRow?.welcome_subtitle || 'Encontre respostas rapidamente ou abra um chamado.',
    title_color: currentCompanyRow?.title_color || '',
    title_font: currentCompanyRow?.title_font || '',
    title_size: currentCompanyRow?.title_size || '',
    subtitle_color: currentCompanyRow?.subtitle_color || '',
    subtitle_font: currentCompanyRow?.subtitle_font || '',
    subtitle_size: currentCompanyRow?.subtitle_size || '',
    catalog_headline: currentCompanyRow?.catalog_headline || '',
    greeting_prefix: currentCompanyRow?.greeting_prefix || '',
    greeting_color: currentCompanyRow?.greeting_color || '',
    catalog_headline_color: currentCompanyRow?.catalog_headline_color || '',
    catalog_headline_size: currentCompanyRow?.catalog_headline_size || '',
  })
  const [savingAppearance, setSavingAppearance] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingBg, setUploadingBg] = useState(false)

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentCompanyRow) return
    setUploadingLogo(true)
    try {
      const url = await companiesService.uploadBrandAsset(currentCompanyRow.id, file)
      setAppearanceForm(f => ({ ...f, logo_url: url }))
      toast.success('Logo enviada com sucesso!')
    } catch (err: any) { toast.error('Erro ao enviar logo: ' + err.message) }
    finally { setUploadingLogo(false); e.target.value = '' }
  }

  const handleUploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentCompanyRow) return
    setUploadingBg(true)
    try {
      const url = await companiesService.uploadBrandAsset(currentCompanyRow.id, file)
      setAppearanceForm(f => ({ ...f, bg_color: `url('${url}') center/cover no-repeat fixed` }))
      toast.success('Imagem de fundo enviada!')
    } catch (err: any) { toast.error('Erro ao enviar imagem: ' + err.message) }
    finally { setUploadingBg(false); e.target.value = '' }
  }

  // Sync state if currentCompanyRow changes (e.g. from realtime update)
  useEffect(() => {
    if (currentCompanyRow) {
      setAppearanceForm({
        primary_color: currentCompanyRow.primary_color || '#2563EB',
        accent_color: currentCompanyRow.accent_color || '#3B82F6',
        bg_color: currentCompanyRow.bg_color || '#F1F5F9',
        logo_url: currentCompanyRow.logo_url || '',
        brand_name: currentCompanyRow.brand_name || '',
        welcome_title: currentCompanyRow.welcome_title || 'Como podemos ajudar?',
        welcome_subtitle: currentCompanyRow.welcome_subtitle || 'Encontre respostas rapidamente ou abra um chamado.',
        title_color: currentCompanyRow.title_color || '',
        title_font: currentCompanyRow.title_font || '',
        title_size: currentCompanyRow.title_size || '',
        subtitle_color: currentCompanyRow.subtitle_color || '',
        subtitle_font: currentCompanyRow.subtitle_font || '',
        subtitle_size: currentCompanyRow.subtitle_size || '',
        catalog_headline: currentCompanyRow.catalog_headline || '',
        greeting_prefix: currentCompanyRow.greeting_prefix || '',
        greeting_color: currentCompanyRow.greeting_color || '',
        catalog_headline_color: currentCompanyRow.catalog_headline_color || '',
        catalog_headline_size: currentCompanyRow.catalog_headline_size || '',
      })
    }
  }, [currentCompanyRow])

  const handleSaveAppearance = async () => {
    if (!currentCompanyRow) {
      toast.error('Empresa não carregada. Recarregue a página.')
      return
    }
    setSavingAppearance(true)
    const payload = {
      primary_color: appearanceForm.primary_color,
      accent_color: appearanceForm.accent_color,
      bg_color: appearanceForm.bg_color,
      logo_url: appearanceForm.logo_url || null,
      brand_name: appearanceForm.brand_name || null,
      welcome_title: appearanceForm.welcome_title,
      welcome_subtitle: appearanceForm.welcome_subtitle,
      title_color: appearanceForm.title_color || null,
      title_font: appearanceForm.title_font || null,
      title_size: appearanceForm.title_size || null,
      subtitle_color: appearanceForm.subtitle_color || null,
      subtitle_font: appearanceForm.subtitle_font || null,
      subtitle_size: appearanceForm.subtitle_size || null,
      catalog_headline: appearanceForm.catalog_headline || null,
      greeting_prefix: appearanceForm.greeting_prefix || null,
      greeting_color: appearanceForm.greeting_color || null,
      catalog_headline_color: appearanceForm.catalog_headline_color || null,
      catalog_headline_size: appearanceForm.catalog_headline_size || null,
    }
    try {
      const { error } = await supabase
        .from('companies')
        .update(payload)
        .eq('id', currentCompanyRow.id)
      if (error) {
        console.error('[SettingsGovernance] save appearance error:', error)
        toast.error(`Erro ao salvar: ${error.message}`)
        return
      }
      toast.success('Aparência salva com sucesso!')
      setTimeout(() => window.location.reload(), 800)
    } catch (e: any) {
      console.error('[SettingsGovernance] save appearance exception:', e)
      toast.error('Erro inesperado: ' + (e?.message ?? String(e)))
    } finally {
      setSavingAppearance(false)
    }
  }

  // Load Policies
  const loadPolicies = useCallback(async () => {
    if (!managedCompanyId || !isAuthorized) return
    setLoadingPolicies(true)
    setPolicyError(null)
    try {
      const rows = await slaPolicyService.list(managedCompanyId)
      setPolicies(rows)
      const d: Record<string, DraftRow> = {}
      rows.forEach(r => {
        d[r.id] = {
          response: String(r.response_time_minutes),
          resolution: String(r.resolution_time_minutes),
        }
      })
      setDrafts(d)
    } catch (e) {
      setPolicyError(getMsg(e))
    } finally {
      setLoadingPolicies(false)
    }
  }, [managedCompanyId, isAuthorized])

  const handleSetDefaultCalendar = async (calendarId: string) => {
    if (!currentCompanyRow) return
    try {
      await companiesService.update(currentCompanyRow.id, { default_sla_calendar_id: calendarId })
      toast.success('Calendário padrão atualizado!')
      window.location.reload()
    } catch (e) {
      toast.error('Erro ao definir calendário padrão: ' + getMsg(e))
    }
  }

  // Load Reasons
  const loadReasons = useCallback(async () => {
    if (!managedCompanyId || !isAuthorized) return
    setLoadingReasons(true)
    setReasonError(null)
    try {
      const rows = await pendingReasonsService.list(managedCompanyId)
      setReasons(rows)
    } catch (e) {
      setReasonError(getMsg(e))
    } finally {
      setLoadingReasons(false)
    }
  }, [managedCompanyId, isAuthorized])

  useEffect(() => {
    if (isAuthorized) {
      loadPolicies()
      loadReasons()
    }
  }, [loadPolicies, loadReasons, isAuthorized])

  // Draft changes helper
  const setDraft = (id: string, field: keyof DraftRow, value: string) => {
    const clean = value.replace(/\D/g, '')
    setDrafts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: clean,
      },
    }))
  }

  // Dirty check
  const isPolicyDirty = (r: SLAPolicyRow): boolean => {
    const d = drafts[r.id]
    if (!d) return false
    return (
      Number(d.response) !== r.response_time_minutes ||
      Number(d.resolution) !== r.resolution_time_minutes
    )
  }

  // Save policy row
  const savePolicy = async (r: SLAPolicyRow) => {
    const d = drafts[r.id]
    if (!d) return
    setSavingPolicyId(r.id)
    setPolicyError(null)
    try {
      const resp = Number(d.response)
      const reso = Number(d.resolution)
      if (isNaN(resp) || resp < 0 || isNaN(reso) || reso < 0) {
        throw new Error('Insira valores numéricos positivos para os prazos.')
      }

      await slaPolicyService.update(r.id, managedCompanyId, {
        response_time_minutes: resp,
        resolution_time_minutes: reso,
      })

      toast.success(`Políticas da prioridade P${r.priority} salvas!`)
      loadPolicies()
    } catch (e) {
      setPolicyError(getMsg(e))
    } finally {
      setSavingPolicyId(null)
    }
  }

  // Toggle SLA pause on click
  const handleToggleSlaPausing = async (r: PendingReasonRow) => {
    setReasonError(null)
    try {
      await pendingReasonsService.update(r.id, managedCompanyId, { active: !r.active })
      toast.success(`Status de pausa de SLA alterado para o motivo: ${r.name}`)
      loadReasons()
    } catch (e) {
      setReasonError(getMsg(e))
    }
  }

  // Delete Reason helper
  const handleDeleteReason = async (r: PendingReasonRow) => {
    if (!confirm(`Tem certeza que deseja excluir o motivo de pausa "${r.name}"?`)) return
    setReasonError(null)
    try {
      await pendingReasonsService.remove(r.id, managedCompanyId)
      toast.success('Motivo de pendência excluído com sucesso.')
      loadReasons()
    } catch (e) {
      setReasonError(getMsg(e))
    }
  }

  // Form actions
  const openAddModal = () => {
    setEditingReason(null)
    setReasonName('')
    setReasonSlug('')
    setSlugTouched(false)
    setRequiresCustomerAction(false)
    setPausesSLA(true)
    setIsModalOpen(true)
  }

  const openEditModal = (r: PendingReasonRow) => {
    setEditingReason(r)
    setReasonName(r.name)
    setReasonSlug(r.slug)
    setSlugTouched(true)
    setRequiresCustomerAction(r.requires_customer_action)
    setPausesSLA(r.active) // active is mapped to pausesSLA
    setIsModalOpen(true)
  }

  const handleSaveReason = async () => {
    if (!reasonName.trim() || !reasonSlug.trim()) {
      alert('Preencha os campos obrigatórios do motivo.')
      return
    }
    setSavingReason(true)
    setReasonError(null)
    try {
      if (editingReason) {
        await pendingReasonsService.update(editingReason.id, managedCompanyId, {
          name: reasonName.trim(),
          slug: reasonSlug.trim(),
          requires_customer_action: requiresCustomerAction,
          active: pausesSLA,
        })
        toast.success('Motivo de pausa atualizado!')
      } else {
        await pendingReasonsService.create({
          companyId: managedCompanyId,
          name: reasonName.trim(),
          slug: reasonSlug.trim(),
          requiresCustomerAction,
        })
        toast.success('Novo motivo de pausa cadastrado!')
      }
      setIsModalOpen(false)
      loadReasons()
    } catch (e) {
      setReasonError(getMsg(e))
    } finally {
      setSavingReason(false)
    }
  }

  useEffect(() => {
    if (!slugTouched && isModalOpen) {
      setReasonSlug(slugify(reasonName))
    }
  }, [reasonName, slugTouched, isModalOpen])

  // Access Denied card
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8">
        <div className={`p-8 text-center flex flex-col items-center justify-center border border-dashed ${
          isAlpha 
            ? 'bg-zinc-900/10 border-zinc-800 rounded-xl' 
            : isBeta 
              ? 'bg-slate-50/50 border-zinc-200 rounded-sm' 
              : 'bg-surface border-outline-variant rounded-2xl'
        }`}>
          <div className={`w-14 h-14 flex items-center justify-center mb-4 ${
            isAlpha 
              ? 'rounded-lg bg-zinc-950 text-cyan-400 border border-zinc-800' 
              : isBeta 
                ? 'rounded-sm bg-blue-50 text-medical-blue' 
                : 'rounded-2xl bg-surface-container text-on-surface-variant'
          }`}>
            <Lock className="w-6 h-6" />
          </div>
          <h3 className={`text-lg font-bold ${isAlpha ? 'text-zinc-300 font-mono' : 'text-on-surface'}`}>
            Acesso Restrito
          </h3>
          <p className={`text-sm mt-2 max-w-sm ${isAlpha ? 'text-zinc-500 font-mono' : 'text-on-surface-variant'}`}>
            Você não tem permissão para acessar esta área de Configurações. Este painel é restrito a administradores do tenant, CIOs e gestores.
          </p>
        </div>
      </div>
    )
  }

  // Lista dinâmica de abas unificadas
  const tabs = [
    { key: 'appearance', label: 'Aparência e Temas', icon: <Paintbrush className="w-5 h-5" /> },
    { key: 'policies', label: 'Políticas de SLA', icon: <Gauge className="w-5 h-5" /> },
    { key: 'pending_reasons', label: 'Motivos de Pausa', icon: <PauseCircle className="w-5 h-5" /> },
  ]

  if (isSysAdmin) {
    tabs.push(
      { key: 'users', label: 'Usuários & RBAC', icon: <Users className="w-5 h-5" /> },
      { key: 'groups', label: 'Equipes Solucionadoras', icon: <Network className="w-5 h-5" /> },
      { key: 'catalog_incidents', label: 'Catálogo de Incidentes', icon: <BookOpen className="w-5 h-5" /> },
      { key: 'catalog_requests', label: 'Catálogo de Requisições', icon: <FileText className="w-5 h-5" /> },
      { key: 'form_templates', label: 'Biblioteca de Formulários', icon: <Layout className="w-5 h-5" /> }
    )
  }

  // Visualização de Lista de Tenants (Apenas Sysadmin)
  if (isSysAdmin && viewMode === 'list') {
    return (
      <div className={`max-w-6xl mx-auto px-4 py-8 space-y-6 ${fontClass}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className={`text-5xl font-extrabold tracking-tight ${isAlpha ? 'text-zinc-100 font-mono' : 'text-slate-900'}`}>
              Tenants
            </h2>
            <p className="text-base text-on-surface-variant/80 mt-1.5">
              Gerencie as empresas cadastradas na plataforma. Clique no ícone de configuração para acessar os detalhes do tenant.
            </p>
          </div>
        </div>
        <div className={`${cardClass} p-6 bg-surface`}>
          <AdminDashboard
            activeTab="tenants"
            currentCompany={currentCompany as any}
            setManagedCompanyId={(id) => {
              setManagedCompanyId(id)
              setViewMode('details')
              setActiveTab('appearance')
            }}
            setActiveTab={setActiveTab}
            refetchAppData={async () => {
              await loadPolicies()
              await loadReasons()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`max-w-6xl mx-auto px-4 py-8 space-y-6 ${fontClass}`}>
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className={`text-5xl font-extrabold tracking-tight ${isAlpha ? 'text-zinc-100 font-mono' : 'text-slate-900'}`}>
            {isSysAdmin ? `Configurando: ${currentCompany?.name}` : 'Configurações'}
          </h2>
          <p className="text-base text-on-surface-variant/80 mt-1.5">
            Administração de políticas de SLA, motivos de pausa, aparência do sistema e parametrizações globais.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {isSysAdmin && (
            <button
              onClick={() => {
                setViewMode('list')
              }}
              className={`flex items-center gap-2 px-5 py-2.5 text-base font-bold cursor-pointer ${buttonSecondaryClass}`}
            >
              <Building className="w-5 h-5" /> Voltar para Lista
            </button>
          )}

          {activeTab === 'pending_reasons' && (
            <button
              onClick={openAddModal}
              className={`flex items-center gap-2 px-5 py-2.5 text-base font-bold cursor-pointer ${buttonPrimaryClass}`}
            >
              <Plus className="w-5 h-5" /> Novo Motivo
            </button>
          )}
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-outline-variant gap-2 overflow-x-auto hide-scrollbar">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as GovTab)}
            className={`flex items-center gap-2 px-6 py-4 text-base font-bold border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
              activeTab === t.key 
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="space-y-4">
        {/* Aparência e Temas */}
        {activeTab === 'appearance' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
            {/* FORMULÁRIO */}
            <div className={`${cardClass} p-8 space-y-8 bg-surface`}>
              <div>
                <h3 className="text-2xl font-bold text-text-main flex items-center gap-2.5">
                  <Paintbrush className="w-6 h-6 text-primary" /> Personalização Visual
                </h3>
                <p className="text-sm text-on-surface-variant mt-1.5">
                  Ajuste logo, cores, fontes e textos do portal. O preview ao lado atualiza em tempo real.
                </p>
              </div>

              {/* ── Seção 1: Identidade da Marca ── */}
              <div className="space-y-5">
                <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Identidade da Marca</h4>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nome de Exibição da Marca</label>
                  <input
                    type="text" value={appearanceForm.brand_name}
                    onChange={e => setAppearanceForm({ ...appearanceForm, brand_name: e.target.value })}
                    placeholder="Ex: ACME TI — deixe vazio para usar o nome do tenant"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Logo</label>
                  <div className="relative group rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-white transition-all overflow-hidden cursor-pointer">
                    <input
                      type="file" accept="image/*"
                      onChange={handleUploadLogo}
                      disabled={uploadingLogo}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                    />
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden relative">
                        {appearanceForm.logo_url ? (
                          <img src={appearanceForm.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-300" />
                        )}
                        {uploadingLogo && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                          <Upload className="w-4 h-4" /> {uploadingLogo ? 'Enviando...' : 'Clique para fazer upload'}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">PNG, JPG, SVG até 2 MB</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">URL:</span>
                    <input
                      type="text" value={appearanceForm.logo_url}
                      onChange={e => setAppearanceForm({ ...appearanceForm, logo_url: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 bg-transparent text-xs text-slate-500 border-b border-slate-200 focus:border-indigo-500 outline-none pb-0.5 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* ── Seção 2: Textos do Portal ── */}
              <div className="border-t border-outline-variant pt-6 space-y-6">
                <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Textos da Página Inicial</h4>

                {/* Catálogo de Serviços */}
                <div className="p-4 border border-outline-variant rounded-2xl bg-surface-container/20 space-y-5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Catálogo de Serviços</div>

                  {/* Saudação */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Prefixo da Saudação</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text" value={appearanceForm.greeting_prefix}
                        onChange={e => setAppearanceForm({ ...appearanceForm, greeting_prefix: e.target.value })}
                        placeholder='Olá'
                        className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="color" value={appearanceForm.greeting_color || appearanceForm.primary_color || '#2563EB'}
                        onChange={e => setAppearanceForm({ ...appearanceForm, greeting_color: e.target.value })}
                        title="Cor da saudação"
                        className="w-10 h-10 border border-slate-200 p-0.5 rounded-lg cursor-pointer bg-transparent shrink-0"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">Aparece como: "{appearanceForm.greeting_prefix || 'Olá'}, {'{nome}'}! 👋"</p>
                  </div>

                  {/* Título do catálogo */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Título do Catálogo</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text" value={appearanceForm.catalog_headline}
                        onChange={e => setAppearanceForm({ ...appearanceForm, catalog_headline: e.target.value })}
                        placeholder='Como podemos te ajudar hoje?'
                        className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="color" value={appearanceForm.catalog_headline_color || '#1e293b'}
                        onChange={e => setAppearanceForm({ ...appearanceForm, catalog_headline_color: e.target.value })}
                        title="Cor do título"
                        className="w-10 h-10 border border-slate-200 p-0.5 rounded-lg cursor-pointer bg-transparent shrink-0"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <label className="text-[10px] font-bold text-slate-400 shrink-0">TAMANHO:</label>
                      <select
                        value={appearanceForm.catalog_headline_size}
                        onChange={e => setAppearanceForm({ ...appearanceForm, catalog_headline_size: e.target.value })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="">Padrão (32–40px)</option>
                        <option value="1.25rem">Pequeno (20px)</option>
                        <option value="1.5rem">Médio (24px)</option>
                        <option value="2rem">Grande (32px)</option>
                        <option value="2.5rem">Extra (40px)</option>
                        <option value="3rem">Gigante (48px)</option>
                        <option value="4rem">Colossal (64px)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Banner de Boas-vindas (App.tsx) */}
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest -mb-2">Banner de Boas-vindas</div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5 border border-outline-variant rounded-2xl bg-surface-container/30">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Título Principal</label>
                      <input
                        type="text" value={appearanceForm.welcome_title}
                        onChange={e => setAppearanceForm({ ...appearanceForm, welcome_title: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fonte do Título</label>
                        <select
                          value={appearanceForm.title_font}
                          onChange={e => setAppearanceForm({ ...appearanceForm, title_font: e.target.value })}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Padrão (Inter)</option>
                          <option value="'Montserrat', sans-serif">Montserrat</option>
                          <option value="'Playfair Display', serif">Playfair Display</option>
                          <option value="'Roboto Mono', monospace">Roboto Mono</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tamanho do Título</label>
                        <select
                          value={appearanceForm.title_size}
                          onChange={e => setAppearanceForm({ ...appearanceForm, title_size: e.target.value })}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Padrão</option>
                          <option value="1.5rem">Médio (24px)</option>
                          <option value="2rem">Grande (32px)</option>
                          <option value="2.5rem">Extra (40px)</option>
                          <option value="3rem">Gigante (48px)</option>
                          <option value="4rem">Colossal (64px)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cor do Título</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color" value={appearanceForm.title_color || '#000000'}
                          onChange={e => setAppearanceForm({ ...appearanceForm, title_color: e.target.value })}
                          className="w-10 h-10 border-0 p-0 rounded-lg cursor-pointer bg-transparent"
                        />
                        <input
                          type="text" value={appearanceForm.title_color}
                          onChange={e => setAppearanceForm({ ...appearanceForm, title_color: e.target.value })}
                          placeholder="Vazio para padrão"
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Subtítulo</label>
                      <input
                        type="text" value={appearanceForm.welcome_subtitle}
                        onChange={e => setAppearanceForm({ ...appearanceForm, welcome_subtitle: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fonte do Subtítulo</label>
                        <select
                          value={appearanceForm.subtitle_font}
                          onChange={e => setAppearanceForm({ ...appearanceForm, subtitle_font: e.target.value })}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Padrão (Inter)</option>
                          <option value="'Montserrat', sans-serif">Montserrat</option>
                          <option value="'Playfair Display', serif">Playfair Display</option>
                          <option value="'Roboto Mono', monospace">Roboto Mono</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tamanho do Subtítulo</label>
                        <select
                          value={appearanceForm.subtitle_size}
                          onChange={e => setAppearanceForm({ ...appearanceForm, subtitle_size: e.target.value })}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Padrão</option>
                          <option value="1rem">Pequeno (16px)</option>
                          <option value="1.125rem">Médio (18px)</option>
                          <option value="1.25rem">Grande (20px)</option>
                          <option value="1.5rem">Extra (24px)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cor do Subtítulo</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color" value={appearanceForm.subtitle_color || '#64748B'}
                          onChange={e => setAppearanceForm({ ...appearanceForm, subtitle_color: e.target.value })}
                          className="w-10 h-10 border-0 p-0 rounded-lg cursor-pointer bg-transparent"
                        />
                        <input
                          type="text" value={appearanceForm.subtitle_color}
                          onChange={e => setAppearanceForm({ ...appearanceForm, subtitle_color: e.target.value })}
                          placeholder="Vazio para padrão"
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Seção 3: Cores e Fundo ── */}
              <div className="border-t border-outline-variant pt-6 space-y-6">
                <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Cores e Fundo</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-on-surface-variant uppercase tracking-wider">Cor Primária</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={appearanceForm.primary_color}
                        onChange={e => setAppearanceForm({ ...appearanceForm, primary_color: e.target.value })}
                        className="w-11 h-10 border-0 rounded-lg cursor-pointer p-0 bg-transparent"
                      />
                      <input type="text" maxLength={7} value={appearanceForm.primary_color}
                        onChange={e => setAppearanceForm({ ...appearanceForm, primary_color: e.target.value })}
                        className={`flex-1 ${inputClass} font-mono`} placeholder="#2563EB"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-on-surface-variant uppercase tracking-wider">Cor Secundária (Accent)</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={appearanceForm.accent_color}
                        onChange={e => setAppearanceForm({ ...appearanceForm, accent_color: e.target.value })}
                        className="w-11 h-10 border-0 rounded-lg cursor-pointer p-0 bg-transparent"
                      />
                      <input type="text" maxLength={7} value={appearanceForm.accent_color}
                        onChange={e => setAppearanceForm({ ...appearanceForm, accent_color: e.target.value })}
                        className={`flex-1 ${inputClass} font-mono`} placeholder="#3B82F6"
                      />
                    </div>
                  </div>
                </div>

                {/* Fundo: Cor sólida ou imagem */}
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-on-surface-variant uppercase tracking-wider">Fundo do Portal</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Cor sólida */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Cor Sólida</div>
                      <div className="flex items-center gap-2">
                        <input type="color"
                          value={appearanceForm.bg_color.startsWith('#') ? appearanceForm.bg_color : '#F1F5F9'}
                          onChange={e => setAppearanceForm({ ...appearanceForm, bg_color: e.target.value })}
                          className="w-11 h-10 border-0 rounded-lg cursor-pointer p-0 bg-transparent"
                        />
                        <input type="text" value={appearanceForm.bg_color}
                          onChange={e => setAppearanceForm({ ...appearanceForm, bg_color: e.target.value })}
                          className={`flex-1 ${inputClass} font-mono`} placeholder="#F8FAFC ou url(...)"
                        />
                      </div>
                    </div>
                    {/* Imagem */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Imagem de Fundo (upload)</div>
                      <div className="relative group rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-all overflow-hidden cursor-pointer h-10">
                        <input type="file" accept="image/*"
                          onChange={handleUploadBgImage}
                          disabled={uploadingBg}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-center gap-2 h-full px-3">
                          {uploadingBg ? (
                            <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
                              <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> Enviando…
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-indigo-600 font-semibold">
                              <Upload className="w-3.5 h-3.5" /> PNG, JPG (cobre 100% da tela)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="border-t border-outline-variant pt-5 flex justify-end items-center bg-surface-container/10 -mx-8 -mb-8 px-8 py-5 rounded-b-xl">
                <button
                  onClick={handleSaveAppearance}
                  disabled={savingAppearance}
                  className={`px-5 py-2.5 text-sm font-bold cursor-pointer flex items-center gap-2 disabled:opacity-50 ${buttonPrimaryClass}`}
                >
                  <Save className="w-4 h-4" />
                  {savingAppearance ? 'Salvando...' : 'Salvar Aparência'}
                </button>
              </div>
            </div>

            {/* PREVIEW AO VIVO */}
            <div className="hidden xl:block">
              <div className="sticky top-6 space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Pré-visualização do Portal</div>
                <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-200"
                  style={{ background: appearanceForm.bg_color || '#f8fafc', backgroundSize: 'cover', backgroundPosition: 'center' }}>

                  {/* Mini header */}
                  <div className="px-3 py-2.5 flex items-center gap-2" style={{ backgroundColor: appearanceForm.primary_color }}>
                    <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {appearanceForm.logo_url
                        ? <img src={appearanceForm.logo_url} alt="" className="w-full h-full object-contain p-0.5" />
                        : <span className="text-white text-[10px] font-black">{(appearanceForm.brand_name || currentCompanyRow?.name || 'F').charAt(0)}</span>
                      }
                    </div>
                    <div>
                      <div className="text-white text-[11px] font-bold leading-tight">{appearanceForm.brand_name || currentCompanyRow?.name}</div>
                      <div className="text-white/60 text-[8px] uppercase tracking-widest">Portal de Atendimento</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-white/20 border border-white/30" />
                    </div>
                  </div>

                  {/* Mini welcome banner */}
                  <div className="px-4 py-5 text-center" style={{ background: `linear-gradient(135deg, ${appearanceForm.primary_color}18, ${appearanceForm.accent_color}10)` }}>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: appearanceForm.primary_color }}>Olá, Anderson! 👋</div>
                    <div className="font-extrabold text-slate-800 leading-tight mb-1"
                      style={{
                        color: appearanceForm.title_color || appearanceForm.primary_color,
                        fontFamily: appearanceForm.title_font || undefined,
                        fontSize: appearanceForm.title_size ? `calc(${appearanceForm.title_size} * 0.45)` : '0.9rem',
                      }}>
                      {appearanceForm.welcome_title || 'Como podemos ajudar?'}
                    </div>
                    <div className="text-[10px] text-slate-500"
                      style={{
                        color: appearanceForm.subtitle_color || undefined,
                        fontFamily: appearanceForm.subtitle_font || undefined,
                      }}>
                      {appearanceForm.welcome_subtitle || 'Selecione uma opção abaixo'}
                    </div>
                  </div>

                  {/* Mini catalog */}
                  <div className="px-4 pb-4 pt-1">
                    <div className="text-center mb-3">
                      <div className="text-[9px] font-semibold" style={{ color: appearanceForm.greeting_color || appearanceForm.primary_color }}>{appearanceForm.greeting_prefix || 'Olá'}, Anderson! 👋</div>
                      <div className="font-extrabold mt-0.5" style={{ color: appearanceForm.catalog_headline_color || '#1e293b', fontSize: appearanceForm.catalog_headline_size ? `calc(${appearanceForm.catalog_headline_size} * 0.38)` : '0.7rem' }}>{appearanceForm.catalog_headline || 'Como podemos te ajudar hoje?'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                        <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center mb-1.5 text-sm">🔴</div>
                        <div className="text-[10px] font-bold text-slate-800">Reportar Problema</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">Abrir Incidente →</div>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center mb-1.5 text-sm">🛒</div>
                        <div className="text-[10px] font-bold text-slate-800">Solicitar Serviço</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">Abrir Requisição →</div>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-3 text-center">
                    <span className="text-[9px] bg-white/80 text-slate-400 px-2 py-0.5 rounded-full font-semibold border border-slate-200/60">
                      Live Preview Interativo
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Políticas de SLA */}
        {activeTab === 'policies' && (
          <div className="space-y-6">
            <div className={`${cardClass} overflow-hidden`}>
              {policyError && (
                <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-500 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {policyError}
                </div>
              )}
              <div className={`px-6 py-5 border-b ${isAlpha ? 'border-zinc-800' : 'border-outline-variant'} bg-surface-container/20 flex items-center gap-2.5`}>
                <Gauge className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold text-on-surface">Prazos por Nível de Prioridade</h3>
                <span className="ml-auto text-sm text-on-surface-variant font-semibold">Tempos configurados em minutos úteis</span>
              </div>
              <table className="w-full text-base">
                <thead className={`bg-surface-container/10 border-b ${isAlpha ? 'border-zinc-800' : 'border-outline-variant'}`}>
                  <tr className="text-on-surface-variant font-bold uppercase text-xs tracking-wider">
                    <th className="px-6 py-4.5 text-left">Prioridade</th>
                    <th className="px-6 py-4.5 text-left">Tempo de Resposta (minutos)</th>
                    <th className="px-6 py-4.5 text-left">Tempo de Solução (minutos)</th>
                    <th className="px-6 py-4.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isAlpha ? 'divide-zinc-800' : 'divide-outline-variant'}`}>
                  {loadingPolicies ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant animate-pulse">
                        Carregando políticas de SLA...
                      </td>
                    </tr>
                  ) : policies.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant">
                        Nenhuma política encontrada.
                      </td>
                    </tr>
                  ) : (
                    policies.map(r => {
                      const meta = PRIORITY_META[r.priority] ?? { label: `P${r.priority}`, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20', dot: 'bg-slate-500' }
                      const d = drafts[r.id] ?? { response: '0', resolution: '0' }
                      return (
                        <tr key={r.id} className="text-on-surface hover:bg-surface-container/10">
                          <td className="px-6 py-4.5">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border uppercase tracking-wider font-semibold ${meta.color}`}>
                              <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-6 py-4.5">
                            <div className="flex items-center gap-4">
                              <input
                                value={d.response}
                                onChange={e => setDraft(r.id, 'response', e.target.value)}
                                inputMode="numeric"
                                className={`w-32 text-center ${inputClass}`}
                              />
                              <span className="text-sm font-semibold text-on-surface-variant">{humanize(Number(d.response))}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4.5">
                            <div className="flex items-center gap-4">
                              <input
                                value={d.resolution}
                                onChange={e => setDraft(r.id, 'resolution', e.target.value)}
                                inputMode="numeric"
                                className={`w-32 text-center ${inputClass}`}
                              />
                              <span className="text-sm font-semibold text-on-surface-variant">{humanize(Number(d.resolution))}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4.5 text-right">
                            <button
                              onClick={() => savePolicy(r)}
                              disabled={!isPolicyDirty(r) || savingPolicyId === r.id}
                              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${buttonPrimaryClass}`}
                            >
                              <Save className="w-4 h-4" />
                              {savingPolicyId === r.id ? 'Salvando…' : 'Salvar'}
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Calendários de Atendimento anexados verticalmente */}
            <div className={`${cardClass} p-6`}>
              <div className="px-1 py-2 mb-4 border-b border-outline-variant/60 flex items-center gap-2.5">
                <CalendarClock className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold text-on-surface">Calendários de Atendimento</h3>
              </div>
              <SlaCalendarManager 
                companyId={managedCompanyId}
                defaultCalendarId={currentCompanyRow?.default_sla_calendar_id}
                onSetDefault={handleSetDefaultCalendar}
              />
            </div>
          </div>
        )}

        {/* Motivos de Pausa */}
        {activeTab === 'pending_reasons' && (
          <div className={`${cardClass} overflow-hidden`}>
            {reasonError && (
              <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-500 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {reasonError}
              </div>
            )}
            <div className={`px-6 py-5 border-b ${isAlpha ? 'border-zinc-800' : 'border-outline-variant'} bg-surface-container/20 flex items-center gap-2.5`}>
              <PauseCircle className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-bold text-on-surface">Motivos de Pausa Configurados</h3>
              <span className="ml-auto text-sm text-on-surface-variant font-semibold">Motivos de pendência que pausam ou não o relógio de SLA</span>
            </div>
            <table className="w-full text-base">
              <thead className={`bg-surface-container/10 border-b ${isAlpha ? 'border-zinc-800' : 'border-outline-variant'}`}>
                <tr className="text-on-surface-variant font-bold uppercase text-xs tracking-wider">
                  <th className="px-6 py-4.5 text-left">Motivo</th>
                  <th className="px-6 py-4.5 text-left">Slug</th>
                  <th className="px-6 py-4.5 text-center">Exige Ação do Usuário</th>
                  <th className="px-6 py-4.5 text-center">Pausa o SLA?</th>
                  <th className="px-6 py-4.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isAlpha ? 'divide-zinc-800' : 'divide-outline-variant'}`}>
                {loadingReasons ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant animate-pulse">
                      Carregando motivos de pendência...
                    </td>
                  </tr>
                ) : reasons.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant">
                      Nenhum motivo cadastrado.
                    </td>
                  </tr>
                ) : (
                  reasons.map(r => (
                    <tr key={r.id} className="text-on-surface hover:bg-surface-container/10">
                      <td className="px-6 py-4.5 font-bold text-base">{r.name}</td>
                      <td className="px-6 py-4.5 font-mono text-sm text-on-surface-variant">{r.slug}</td>
                      <td className="px-6 py-4.5 text-center">
                        {r.requires_customer_action ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Sim
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20">
                            Não
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4.5 text-center">
                        <button
                          onClick={() => handleToggleSlaPausing(r)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                            r.active
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                              : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'
                          }`}
                        >
                          {r.active ? 'Pausa SLA' : 'Não Pausa'}
                        </button>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openEditModal(r)}
                            className={`p-2 text-on-surface-variant hover:text-primary rounded-lg transition-colors cursor-pointer hover:bg-surface-container`}
                            title="Editar"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteReason(r)}
                            className="p-2 text-on-surface-variant hover:text-red-500 rounded-lg transition-colors cursor-pointer hover:bg-red-500/10"
                            title="Excluir"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Abas Administrativas do SysAdmin */}
        {isSysAdmin && ['users', 'groups', 'catalog_incidents', 'catalog_requests', 'form_templates'].includes(activeTab) && (
          <div className={`${cardClass} p-6 bg-surface`}>
            <AdminDashboard
              activeTab={activeTab}
              currentCompany={currentCompany as any}
              setManagedCompanyId={setManagedCompanyId}
              setActiveTab={setActiveTab}
              refetchAppData={async () => {
                await loadPolicies()
                await loadReasons()
              }}
            />
          </div>
        )}
      </div>

      {/* Modal Form Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardClass} w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] bg-surface`}>
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b ${isAlpha ? 'border-zinc-800' : 'border-outline-variant'} flex items-center justify-between`}>
              <h3 className={`text-base font-bold text-on-surface ${isAlpha ? 'font-mono' : ''}`}>
                {editingReason ? 'Editar Motivo de Pendência' : 'Cadastrar Motivo de Pendência'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded-full cursor-pointer hover:bg-surface-container"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  Nome do Motivo
                </label>
                <input
                  value={reasonName}
                  onChange={e => setReasonName(e.target.value)}
                  placeholder="Ex: Aguardando Fornecedor"
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  Slug (Auto-derivado)
                </label>
                <input
                  value={reasonSlug}
                  onChange={e => {
                    setReasonSlug(slugify(e.target.value))
                    setSlugTouched(true)
                  }}
                  placeholder="aguardando-fornecedor"
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="pt-2 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={requiresCustomerAction}
                    onChange={e => setRequiresCustomerAction(e.target.checked)}
                    className={`w-4 h-4 border-outline-variant text-primary focus:ring-primary ${
                      isBeta ? 'rounded-sm' : isAlpha ? 'rounded-lg' : 'rounded'
                    }`}
                  />
                  <div>
                    <span className="text-sm font-medium text-on-surface">Exige Ação do Usuário (Regra de Ouro)</span>
                    <p className="text-xs text-on-surface-variant">Sinaliza que a pendência depende do cliente responder.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pausesSLA}
                    onChange={e => setPausesSLA(e.target.checked)}
                    className={`w-4 h-4 border-outline-variant text-primary focus:ring-primary ${
                      isBeta ? 'rounded-sm' : isAlpha ? 'rounded-lg' : 'rounded'
                    }`}
                  />
                  <div>
                    <span className="text-sm font-medium text-on-surface">Pausa o Cronômetro de SLA?</span>
                    <p className="text-xs text-on-surface-variant">Define se o prazo de atendimento fica congelado enquanto estiver neste motivo.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`px-6 py-4 border-t ${isAlpha ? 'border-zinc-800' : 'border-outline-variant'} flex justify-end gap-2 bg-surface-container/20`}>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`px-4 py-2 text-sm font-semibold cursor-pointer ${buttonSecondaryClass}`}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveReason}
                disabled={savingReason}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold cursor-pointer ${buttonPrimaryClass}`}
              >
                {savingReason ? 'Salvando…' : 'Salvar Motivo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
