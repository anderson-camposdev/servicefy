import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Moon, Plus, RefreshCw, Save, ShieldCheck, Sun, Upload, X, Palette, Image as ImageIcon, LayoutGrid, Type } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { companiesService } from '../lib/services'
import { validateBrandingFile } from '../lib/branding.types'
import type { BrandingSettings, CatalogUiConfig } from '../lib/branding.types'
import type { ThemeName, FontScale } from '../lib/theme-engine'
import { THEME_HEX_COLORS, getPortalSidebar, LIGHT_THEMES, DARK_THEMES } from '../lib/theme-engine'
import type { CompanyRow } from '../lib/database.types'
import { UserImportZone } from '../components/portal/UserImportZone'
import { SmtpSettingsForm } from '../components/portal/SmtpSettingsForm'
import { EmailDeliveryPolicyForm } from '../components/portal/EmailDeliveryPolicyForm'
import { EmailDeliveryHistoryTable } from '../components/portal/EmailDeliveryHistoryTable'
import { useTenantFeatureAccess } from '../hooks/useTenantFeatureAccess'
import { useAuth } from '../auth'
import { useTenant } from '../tenant'

export type OperationalModuleKey = 'domains' | 'macros' | 'templates' | 'ci' | 'compliance' | 'licensing' | 'branding' | 'iam' | 'smtp'

interface Props { moduleKey: OperationalModuleKey; companyId: string; activeRole: string; onBack: () => void }
type Row = Record<string, unknown>
type FormValue = string | boolean

interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'checkbox' | 'number'
  options?: string[]
  required?: boolean
}

interface ModuleDef {
  title: string
  description: string
  table: string
  order: string
  activeField?: 'active' | 'enabled'
  fields: FieldDef[]
  defaults: Record<string, FormValue>
  payload: (form: Record<string, FormValue>, companyId: string) => Row
}

/**
 * Este módulo é um editor CRUD genérico dirigido por config: `ModuleDef.table`
 * é escolhido em runtime, não um literal estático — incompatível por
 * natureza com os overloads de `.from()` do supabase-js tipado (exige um
 * literal do union de tabelas conhecidas; resolver contra um `string`
 * genérico dispara "instantiation excessively deep"). Os poucos pontos de
 * acesso dinâmico deste arquivo usam esta view estrutural mínima da MESMA
 * instância `supabase` (mesma sessão/auth), sem `any`.
 */
interface DynamicTableClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string): Promise<{ data: Row[] | null; error: { message: string } | null }>
      }
    }
    insert(payload: Row): Promise<{ error: { message: string } | null }>
    update(payload: Row): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>
    }
  }
}
const dynamicTable = supabase as unknown as DynamicTableClient

const defs: Record<Exclude<OperationalModuleKey, 'compliance' | 'licensing' | 'branding' | 'iam' | 'smtp'>, ModuleDef> = {
  domains: {
    title: 'Domínios de serviço', description: 'Separe TI, RH, Jurídico e Facilities com privacidade e ciclo próprios.',
    table: 'service_domains', order: 'name', activeField: 'active',
    fields: [
      { key: 'key', label: 'Chave', required: true }, { key: 'name', label: 'Nome', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea' },
      { key: 'privacy', label: 'Privacidade', type: 'select', options: ['standard', 'private', 'restricted'], required: true },
      { key: 'default_assignment_group_id', label: 'Equipe Solucionadora Padrão', type: 'select', required: false },
    ],
    defaults: { key: '', name: '', description: '', privacy: 'standard', default_assignment_group_id: '' },
    payload: (f, companyId) => ({ company_id: companyId, key: f.key, name: f.name, description: f.description || null, privacy: f.privacy, default_assignment_group_id: f.default_assignment_group_id || null, active: true }),
  },
  macros: {
    title: 'Macros de resposta', description: 'Respostas aprovadas com variáveis, uso público ou interno e governança de conteúdo.',
    table: 'response_macros', order: 'name', activeField: 'active',
    fields: [
      { key: 'name', label: 'Nome', required: true }, { key: 'body', label: 'Mensagem', type: 'textarea', required: true },
      { key: 'visibility', label: 'Visibilidade', type: 'select', options: ['public', 'internal', 'both'], required: true },
    ],
    defaults: { name: '', body: '', visibility: 'public' },
    payload: (f, companyId) => ({ company_id: companyId, name: f.name, body: f.body, visibility: f.visibility, active: true }),
  },
  templates: {
    title: 'Templates e notificações', description: 'Mensagens por evento, canal e idioma com variáveis controladas.',
    table: 'notification_templates', order: 'name', activeField: 'enabled',
    fields: [
      { key: 'key', label: 'Chave do evento', required: true }, { key: 'name', label: 'Nome', required: true },
      { key: 'channel', label: 'Canal', type: 'select', options: ['email', 'portal', 'teams', 'google_chat', 'whatsapp'], required: true },
      { key: 'locale', label: 'Idioma', type: 'select', options: ['pt-BR', 'en-US', 'es-ES'], required: true },
      { key: 'subject_template', label: 'Assunto' }, { key: 'body_template', label: 'Corpo', type: 'textarea', required: true },
    ],
    defaults: { key: '', name: '', channel: 'email', locale: 'pt-BR', subject_template: '', body_template: '' },
    payload: (f, companyId) => ({ company_id: companyId, key: f.key, name: f.name, channel: f.channel, locale: f.locale, subject_template: f.subject_template || null, body_template: f.body_template, variables: [], enabled: true }),
  },
  ci: {
    title: 'Itens de configuração', description: 'CMDB operacional com classe, ciclo de vida, criticidade e identificadores únicos.',
    table: 'configuration_items', order: 'name',
    fields: [
      { key: 'class_id', label: 'Classe', type: 'select', required: true }, { key: 'name', label: 'Nome', required: true },
      { key: 'asset_tag', label: 'Asset tag' }, { key: 'hostname', label: 'Hostname' },
      { key: 'lifecycle', label: 'Ciclo de vida', type: 'select', options: ['planned', 'active', 'maintenance', 'retired', 'disposed'], required: true },
      { key: 'criticality', label: 'Criticidade', type: 'select', options: ['low', 'medium', 'high', 'critical'], required: true },
    ],
    defaults: { class_id: '', name: '', asset_tag: '', hostname: '', lifecycle: 'active', criticality: 'medium' },
    payload: (f, companyId) => ({ company_id: companyId, class_id: f.class_id, name: f.name, asset_tag: f.asset_tag || null, hostname: f.hostname || null, lifecycle: f.lifecycle, criticality: f.criticality, attributes: {} }),
  },
}

const text = (row: Row, key: string) => typeof row[key] === 'string' ? row[key] as string : ''
const bool = (row: Row, key: string) => row[key] === true

export default function PlatformModuleSettings({ moduleKey, companyId, activeRole, onBack }: Props) {
  const { company: authenticatedCompany, refreshCompany } = useAuth()
  const { tenant: resolvedTenant, refreshTenant } = useTenant()
  const def = (moduleKey === 'compliance' || moduleKey === 'licensing' || moduleKey === 'branding' || moduleKey === 'iam' || moduleKey === 'smtp')
    ? null
    : defs[moduleKey as Exclude<OperationalModuleKey, 'compliance' | 'licensing' | 'branding' | 'iam' | 'smtp'>]
  const [rows, setRows] = useState<Row[]>([])
  const [classes, setClasses] = useState<Row[]>([])
  const [groups, setGroups] = useState<Row[]>([])
  const [audit, setAudit] = useState<Row[]>([])
  const [usage, setUsage] = useState<Row | null>(null)
  const [form, setForm] = useState<Record<string, FormValue>>(def?.defaults ?? {})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Fase 12: gate de 'custom_smtp' por plano/assinatura. Consultado uma única
  // vez aqui (não dentro de SmtpSettingsForm) e repassado como prop, evitando
  // uma segunda chamada de RPC quando o componente re-renderiza.
  const customSmtpAccess = useTenantFeatureAccess(companyId, 'custom_smtp', moduleKey === 'smtp')

  // States and refs for branding uploads
  const [logoUploading, setLogoUploading] = useState(false)
  const [bgUploading, setBgUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)

  // States for CMDB Relationships mapping
  const [activeCi, setActiveCi] = useState<Row | null>(null)
  const [relationships, setRelationships] = useState<Row[]>([])
  const [relTypes, setRelTypes] = useState<Row[]>([])
  const [allCis, setAllCis] = useState<Row[]>([])
  const [selectedRelTypeId, setSelectedRelTypeId] = useState('')
  const [selectedTargetCiId, setSelectedTargetCiId] = useState('')
  const [relDirection, setRelDirection] = useState<'upstream' | 'downstream'>('downstream')
  const [loadingRelations, setLoadingRelations] = useState(false)
  const [savingRelation, setSavingRelation] = useState(false)

  const loadRelations = async (ciId: string) => {
    setLoadingRelations(true)
    try {
      const { data, error: relsErr } = await supabase
        .from('ci_relationships')
        .select('*')
        .or(`source_ci_id.eq.${ciId},target_ci_id.eq.${ciId}`)
      if (relsErr) throw relsErr
      setRelationships(data || [])
    } catch (err: any) {
      alert('Erro ao carregar relacionamentos: ' + err.message)
    } finally {
      setLoadingRelations(false)
    }
  }

  const openRelationships = async (ci: Row) => {
    setActiveCi(ci)
    setSelectedRelTypeId('')
    setSelectedTargetCiId('')
    setRelDirection('downstream')
    setRelationships([])
    try {
      const { data: types, error: typesErr } = await supabase
        .from('ci_relationship_types')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')
      if (typesErr) throw typesErr
      setRelTypes(types || [])
      if (types && types.length > 0) {
        setSelectedRelTypeId(types[0].id)
      }

      // configuration_items não tem coluna `active` — o estado é
      // `lifecycle` (migration 079: planned/active/maintenance/retired/
      // disposed). Bug pré-existente descoberto ao ligar a tipagem estrita
      // do client (A1): .eq('active', true) falhava em runtime (coluna
      // inexistente); a query nunca retornava CIs para o mapeamento de
      // relacionamentos.
      const { data: cis, error: cisErr } = await supabase
        .from('configuration_items')
        .select('*')
        .eq('company_id', companyId)
        .eq('lifecycle', 'active')
        .order('name')
      if (cisErr) throw cisErr
      setAllCis(cis || [])

      await loadRelations(text(ci, 'id'))
    } catch (err: any) {
      alert('Erro ao carregar dados de relacionamentos: ' + err.message)
    }
  }

  const addRelationship = async () => {
    if (!selectedRelTypeId || !selectedTargetCiId || !activeCi) return
    setSavingRelation(true)
    try {
      const activeId = text(activeCi, 'id')
      const sourceId = relDirection === 'downstream' ? activeId : selectedTargetCiId
      const targetId = relDirection === 'downstream' ? selectedTargetCiId : activeId

      if (sourceId === targetId) {
        alert('Um CI não pode se relacionar consigo mesmo.')
        return
      }

      const { data, error: insertErr } = await supabase
        .from('ci_relationships')
        .insert({
          company_id: companyId,
          source_ci_id: sourceId,
          target_ci_id: targetId,
          relationship_type_id: selectedRelTypeId,
          attributes: {}
        })
        .select()
        .single()

      if (insertErr) throw insertErr
      setRelationships(prev => [...prev, data])
      setSelectedTargetCiId('')
    } catch (err: any) {
      alert('Erro ao adicionar relacionamento: ' + err.message)
    } finally {
      setSavingRelation(false)
    }
  }

  const deleteRelationship = async (relId: string) => {
    if (!confirm('Remover este relacionamento?')) return
    try {
      const { error: delErr } = await supabase
        .from('ci_relationships')
        .delete()
        .eq('id', relId)
      if (delErr) throw delErr
      setRelationships(prev => prev.filter(r => r.id !== relId))
    } catch (err: any) {
      alert('Erro ao excluir relacionamento: ' + err.message)
    }
  }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (moduleKey === 'compliance') {
        const [policy, events] = await Promise.all([
          supabase.from('attachment_policies').select('*').eq('company_id', companyId).limit(1),
          supabase.from('admin_audit_events').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(20),
        ])
        if (policy.error) throw policy.error; if (events.error) throw events.error
        const policyRow = (policy.data?.[0] ?? {}) as Row
        setRows(policy.data ?? []); setAudit(events.data ?? [])
        setForm({
          allowed_extensions: Array.isArray(policyRow.allowed_extensions) ? policyRow.allowed_extensions.join(', ') : 'pdf, png, jpg, docx, xlsx',
          blocked_extensions: Array.isArray(policyRow.blocked_extensions) ? policyRow.blocked_extensions.join(', ') : 'exe, dll, bat, cmd, ps1, js',
          max_size_mb: String(Math.round(Number(policyRow.max_size_bytes ?? 26214400) / 1048576)),
          retention_days: String(policyRow.retention_days ?? 365),
          malware_scan_required: policyRow.malware_scan_required !== false,
        })
      } else if (moduleKey === 'licensing') {
        const [entitlements, license] = await Promise.all([
          supabase.from('company_module_entitlements').select('*').eq('company_id', companyId).order('module_key'),
          supabase.from('v_license_usage').select('*').eq('company_id', companyId).maybeSingle(),
        ])
        if (entitlements.error) throw entitlements.error
        setRows(entitlements.data ?? []); setUsage((license.data ?? null) as Row | null)
      } else if (moduleKey === 'smtp') {
        setRows([])
      } else if (moduleKey === 'branding' || moduleKey === 'iam') {
        const { data, error: companyErr } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .single()
        if (companyErr) throw companyErr
        const companyRow = data as unknown as CompanyRow
        setRows([companyRow as unknown as Row])

        const config = (companyRow.catalog_ui_config as unknown as CatalogUiConfig | null) ?? {
          card_settings: { layout: 'grid' },
          portal_buttons: {}
        }

        setForm({
          brandName: companyRow.brand_name ?? companyRow.name ?? '',
          themeName: (companyRow.primary_color as ThemeName) || 'CorporateBlue',
          fontScale: (companyRow.title_size as FontScale) || 'standard',
          welcomeTitle: companyRow.welcome_title ?? '',
          welcomeSubtitle: companyRow.welcome_subtitle ?? '',
          greetingPrefix: companyRow.greeting_prefix ?? '',
          greetingColor: companyRow.greeting_color ?? '#94a3b8',
          loginBackground: companyRow.bg_color ?? '',
          logoUrl: companyRow.logo_url ?? '',
          backgroundUrl: companyRow.background_url ?? '',
          cardLayout: config.card_settings?.layout || 'grid',
          incidentLabel: config.portal_buttons?.incident_label || '',
          incidentDesc: config.portal_buttons?.incident_desc || '',
          incidentEmoji: config.portal_buttons?.incident_emoji || '',
          requestLabel: config.portal_buttons?.request_label || '',
          requestDesc: config.portal_buttons?.request_desc || '',
          requestEmoji: config.portal_buttons?.request_emoji || '',
        })
      } else {
        const result = await dynamicTable.from(def!.table).select('*').eq('company_id', companyId).order(def!.order)
        if (result.error) throw result.error
        setRows(result.data ?? [])
        if (moduleKey === 'ci') {
          const classResult = await supabase.from('ci_classes').select('id,name').eq('company_id', companyId).eq('active', true).order('name')
          if (classResult.error) throw classResult.error
          setClasses(classResult.data ?? [])
          setForm(current => ({ ...current, class_id: current.class_id || text((classResult.data?.[0] ?? {}) as Row, 'id') }))
        }
        if (moduleKey === 'domains') {
          const groupResult = await supabase.from('assignment_groups').select('id,name').eq('company_id', companyId).eq('is_active', true).order('name')
          if (groupResult.error) throw groupResult.error
          setGroups(groupResult.data ?? [])
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar configuração.') }
    finally { setLoading(false) }
  }, [companyId, def, moduleKey])

  useEffect(() => { void load() }, [load])

  const fields = useMemo(() => def?.fields.map(field => {
    if (field.key === 'class_id') {
      return { ...field, options: classes.map(row => text(row, 'id')) }
    }
    if (field.key === 'default_assignment_group_id') {
      return { ...field, options: groups.map(row => text(row, 'id')) }
    }
    return field
  }) ?? [], [classes, groups, def])

  const saveNew = async () => {
    if (!def) return
    const missing = def.fields.find(field => field.required && !String(form[field.key] ?? '').trim())
    if (missing) { setError(`Informe: ${missing.label}.`); return }
    setSaving(true); setError('')
    const { error: saveError } = await dynamicTable.from(def.table).insert(def.payload(form, companyId))
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    setSuccess('Configuração salva e auditável.'); setForm(def.defaults); await load()
  }

  const toggle = async (row: Row) => {
    if (!def?.activeField) return
    const { error: updateError } = await dynamicTable.from(def.table).update({ [def.activeField]: !bool(row, def.activeField) }).eq('id', text(row, 'id'))
    if (updateError) setError(updateError.message); else await load()
  }

  const saveCompliance = async () => {
    setSaving(true); setError('')
    const payload = {
      allowed_extensions: String(form.allowed_extensions).split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
      blocked_extensions: String(form.blocked_extensions).split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
      max_size_bytes: Number(form.max_size_mb) * 1048576,
      retention_days: Number(form.retention_days),
      malware_scan_required: Boolean(form.malware_scan_required),
    }
    const existing = rows[0]
    const query = existing
      ? supabase.from('attachment_policies').update(payload).eq('id', text(existing, 'id'))
      : supabase.from('attachment_policies').insert({ company_id: companyId, service_domain_id: null, ...payload })
    const { error: saveError } = await query
    setSaving(false)
    if (saveError) setError(saveError.message); else { setSuccess('Política de segurança atualizada.'); await load() }
  }

  const toggleEntitlement = async (row: Row) => {
    if (activeRole !== 'sysadmin') return
    const { error: updateError } = await supabase.from('company_module_entitlements').update({ enabled: !bool(row, 'enabled'), source: 'override' }).eq('id', text(row, 'id'))
    if (updateError) setError(updateError.message); else await load()
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validation = validateBrandingFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Arquivo inválido.')
      return
    }
    setError('')
    setLogoUploading(true)
    try {
      const url = await companiesService.uploadBrandAsset(companyId, file, 'logo')
      setForm(f => ({ ...f, logoUrl: url }))
      setSuccess('Logotipo enviado com sucesso!')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLogoUploading(false)
      e.target.value = ''
    }
  }

  const handleBgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validation = validateBrandingFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Arquivo inválido.')
      return
    }
    setError('')
    setBgUploading(true)
    try {
      const url = await companiesService.uploadBrandAsset(companyId, file, 'background')
      setForm(f => ({ ...f, backgroundUrl: url }))
      setSuccess('Imagem de fundo enviada com sucesso!')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBgUploading(false)
      e.target.value = ''
    }
  }

  const removeLogo = () => {
    setForm(f => ({ ...f, logoUrl: '' }))
  }

  const removeBg = () => {
    setForm(f => ({ ...f, backgroundUrl: '' }))
  }

  const saveBranding = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const companyRow = rows[0] as unknown as CompanyRow | undefined
      const existingConfig = (companyRow?.catalog_ui_config as unknown as CatalogUiConfig | null) ?? null

      const settings: BrandingSettings = {
        brandName: String(form.brandName || '').trim() || null,
        themeName: (form.themeName as ThemeName) || 'CorporateBlue',
        fontScale: (form.fontScale as FontScale) || 'standard',
        welcomeTitle: String(form.welcomeTitle || '').trim() || null,
        welcomeSubtitle: String(form.welcomeSubtitle || '').trim() || null,
        greetingPrefix: String(form.greetingPrefix || '').trim() || null,
        greetingColor: String(form.greetingColor || '').trim() || null,
        loginBackground: String(form.loginBackground || '').trim() || null,
        logoUrl: String(form.logoUrl || '').trim() || null,
        backgroundUrl: String(form.backgroundUrl || '').trim() || null,
        cardLayout: (form.cardLayout as 'grid' | 'list') || 'grid',
        incidentButton: {
          label: String(form.incidentLabel || '').trim() || null,
          description: String(form.incidentDesc || '').trim() || null,
          emoji: String(form.incidentEmoji || '').trim() || null,
        },
        requestButton: {
          label: String(form.requestLabel || '').trim() || null,
          description: String(form.requestDesc || '').trim() || null,
          emoji: String(form.requestEmoji || '').trim() || null,
        }
      }

      const updatedCompany = await companiesService.updateBrandingSettings(companyId, settings, existingConfig)
      const removals: Promise<void>[] = []
      if (companyRow?.logo_url && !settings.logoUrl) removals.push(companiesService.removeBrandAsset(companyId, 'logo'))
      if (companyRow?.background_url && !settings.backgroundUrl) removals.push(companiesService.removeBrandAsset(companyId, 'background'))
      await Promise.all(removals)
      if (authenticatedCompany?.id === companyId) await refreshCompany()
      if (resolvedTenant?.id === companyId) await refreshTenant()
      setRows([updatedCompany as unknown as Row])
      setSuccess('Identidade visual e configurações de marca atualizadas!')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const title = def?.title ?? (moduleKey === 'compliance' ? 'LGPD, retenção e segurança' : moduleKey === 'branding' ? 'Identidade visual e portal' : moduleKey === 'smtp' ? 'Configurações de E-mail' : 'Módulos contratados e licenças')
  const description = def?.description ?? (moduleKey === 'compliance'
    ? 'Políticas de anexo, retenção, verificação de malware e trilha administrativa.'
    : moduleKey === 'branding'
      ? 'Personalize as cores, logotipos, fontes e mensagens de boas-vindas do portal.'
      : moduleKey === 'smtp'
        ? 'Configure o servidor SMTP e a identidade de envio deste tenant.'
      : 'Entitlements, origem da habilitação e consumo de licenças concorrentes.')

  return <div className="h-full overflow-y-auto bg-slate-50 p-6"><div className="mx-auto max-w-6xl">
    <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Central de Configurações</button>
    <header className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div><button onClick={() => void load()} className="rounded-xl border bg-white p-2.5"><RefreshCw className="h-4 w-4" /></button></header>
    {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {success && <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{success}</div>}
    {loading ? <div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" /></div> : moduleKey === 'compliance' ? (
      <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-extrabold">Política de anexos e retenção</h2><div className="mt-4 space-y-3">
          <TextInput label="Extensões permitidas" value={String(form.allowed_extensions ?? '')} onChange={v => setForm(f => ({ ...f, allowed_extensions: v }))} />
          <TextInput label="Extensões bloqueadas" value={String(form.blocked_extensions ?? '')} onChange={v => setForm(f => ({ ...f, blocked_extensions: v }))} />
          <TextInput label="Tamanho máximo (MB)" type="number" value={String(form.max_size_mb ?? '')} onChange={v => setForm(f => ({ ...f, max_size_mb: v }))} />
          <TextInput label="Retenção (dias)" type="number" value={String(form.retention_days ?? '')} onChange={v => setForm(f => ({ ...f, retention_days: v }))} />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(form.malware_scan_required)} onChange={e => setForm(f => ({ ...f, malware_scan_required: e.target.checked }))} /> Verificação de malware obrigatória</label>
          <button onClick={() => void saveCompliance()} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white"><Save className="h-4 w-4" /> Salvar política</button>
        </div></section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="flex items-center gap-2 font-extrabold"><ShieldCheck className="h-4 w-4 text-indigo-600" /> Auditoria administrativa recente</h2><RowList rows={audit} empty="Nenhum evento administrativo registrado." /></section>
      </div>
    ) : moduleKey === 'licensing' ? (
      <div className="mt-6 space-y-6">
        {usage && <section className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-4"><Metric label="Plano" value={text(usage, 'license_plan')} /><Metric label="Em uso" value={String(usage.active_connections ?? 0)} /><Metric label="Limite" value={String(usage.license_limit ?? 0)} /><Metric label="Status" value={text(usage, 'license_status')} /></section>}
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-extrabold">Entitlements do tenant</h2><div className="mt-4 grid gap-2 md:grid-cols-2">{rows.map(row => <div key={text(row, 'id')} className="flex items-center gap-3 rounded-xl border p-3"><span className={`h-2.5 w-2.5 rounded-full ${bool(row, 'enabled') ? 'bg-emerald-500' : 'bg-slate-300'}`} /><div className="flex-1"><b className="text-sm">{text(row, 'module_key')}</b><p className="text-xs text-slate-500">{text(row, 'source')}</p></div>{activeRole === 'sysadmin' && <button onClick={() => void toggleEntitlement(row)} className="rounded-lg border px-2 py-1 text-xs font-bold">{bool(row, 'enabled') ? 'Desativar' : 'Ativar'}</button>}</div>)}</div></section>
      </div>
    ) : moduleKey === 'smtp' ? (
      <div className="mt-6 space-y-6">
        <SmtpSettingsForm
          companyId={companyId}
          checkingAccess={customSmtpAccess.checking}
          hasCustomSmtpAccess={customSmtpAccess.hasAccess}
          accessCheckError={customSmtpAccess.error}
        />
        {activeRole === 'sysadmin' && <EmailDeliveryPolicyForm companyId={companyId} />}
        <EmailDeliveryHistoryTable companyId={companyId} />
      </div>
    ) : moduleKey === 'branding' ? (
      <div className="mt-6 space-y-6">
        {/* Identidade visual e marca */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card Esquerdo: Imagens e Identidade */}
          <div className="space-y-6">
            <section className="rounded-2xl border bg-white p-6 shadow-sm animate-fade-in">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <ImageIcon className="w-5 h-5 text-indigo-600" />
                Imagens da Marca
              </h2>
              
              <div className="space-y-5">
                {/* Upload Logo */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Logotipo da Empresa</label>
                  {form.logoUrl ? (
                    <div className="relative inline-block">
                      <img
                        src={String(form.logoUrl)}
                        alt="Logo"
                        className="h-16 max-w-xs object-contain border border-slate-200 rounded-xl bg-slate-50 p-2"
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        title="Remover"
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading || bgUploading || saving}
                        className="mt-2 block text-xs text-slate-500 hover:text-slate-700 underline"
                      >
                        {logoUploading ? 'Enviando…' : 'Trocar logotipo'}
                      </button>
                      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} />
                    </div>
                  ) : (
                    <div
                      onClick={() => !logoUploading && !bgUploading && !saving && logoInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition-colors ${logoUploading ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      {logoUploading ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                          <span className="text-sm text-slate-500 font-medium">Enviando logotipo…</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-600">Selecione o logotipo</span>
                          <span className="text-xs text-slate-400">PNG, JPG ou WebP · Máx 2 MB</span>
                        </>
                      )}
                      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} />
                    </div>
                  )}
                </div>

                {/* Upload Background */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Imagem de Fundo do Login e Portal</label>
                  {form.backgroundUrl ? (
                    <div className="space-y-2">
                      <div className="relative rounded-xl overflow-hidden h-28 border border-slate-200">
                        <img src={String(form.backgroundUrl)} alt="Background" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                          <span className="text-xs font-semibold text-white bg-black/40 px-3 py-1 rounded-full">Prévia</span>
                        </div>
                        <button
                          type="button"
                          onClick={removeBg}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => bgInputRef.current?.click()}
                        disabled={logoUploading || bgUploading || saving}
                        className="text-xs text-slate-500 hover:text-slate-700 underline"
                      >
                        {bgUploading ? 'Enviando…' : 'Trocar imagem de fundo'}
                      </button>
                      <input ref={bgInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleBgChange} />
                    </div>
                  ) : (
                    <div
                      onClick={() => !logoUploading && !bgUploading && !saving && bgInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition-colors ${bgUploading ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      {bgUploading ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                          <span className="text-sm text-slate-500 font-medium">Enviando imagem…</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-600">Selecione imagem de fundo</span>
                          <span className="text-xs text-slate-400">PNG, JPG ou WebP · Máx 2 MB</span>
                        </>
                      )}
                      <input ref={bgInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleBgChange} />
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-600" />
                Cores e Temas
              </h2>
              
              {/* Tema Swatches — mini-previews agrupados em Claros/Escuros */}
              <div className="space-y-5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider -mb-1">Selecione o Tema Corporativo</label>
                {([
                  { title: 'Temas Claros', Icon: Sun, list: LIGHT_THEMES },
                  { title: 'Temas Escuros', Icon: Moon, list: DARK_THEMES },
                ] as { title: string; Icon: typeof Sun; list: ThemeName[] }[]).map(group => (
                  <div key={group.title}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <group.Icon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{group.title}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {group.list.map(t => {
                        const hex = THEME_HEX_COLORS[t]
                        const sb = getPortalSidebar(t)
                        const active = form.themeName === t
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, themeName: t }))}
                            className={`rounded-xl border-2 overflow-hidden text-left transition-all ${active ? 'border-indigo-600 shadow-md ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                          >
                            {/* Mini-preview do portal: sidebar + conteúdo + botão primário */}
                            <div className="flex h-14 pointer-events-none">
                              <div style={{ background: sb.bg }} className="w-8 shrink-0 flex flex-col gap-1 p-1.5 border-r border-black/5">
                                <div style={{ background: hex }} className="w-2 h-2 rounded" />
                                <div style={{ background: sb.navActiveBg }} className="h-1 rounded-full" />
                                <div style={{ background: sb.itemBg }} className="h-1 rounded-full" />
                              </div>
                              <div className="flex-1 bg-white p-2 flex flex-col gap-1.5">
                                <div className="h-1.5 w-3/4 rounded-full bg-slate-200" />
                                <div className="h-1.5 w-1/2 rounded-full bg-slate-100" />
                                <div style={{ background: hex }} className="h-2.5 w-10 rounded mt-auto" />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 border-t border-slate-100 bg-white">
                              <span className="text-[11px] font-bold text-slate-700 truncate">{THEME_LABELS[t]}</span>
                              {active && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Escala da Fonte */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Escala da Fonte</label>
                <select
                  value={String(form.fontScale ?? 'standard')}
                  onChange={e => setForm(f => ({ ...f, fontScale: e.target.value }))}
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="compact">Compacto</option>
                  <option value="standard">Padrão</option>
                  <option value="large">Grande</option>
                  <option value="display">Display</option>
                </select>
              </div>

              {/* Layout do Catálogo */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Layout dos Cards do Catálogo</label>
                <select
                  value={String(form.cardLayout ?? 'grid')}
                  onChange={e => setForm(f => ({ ...f, cardLayout: e.target.value }))}
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="grid">Grade (Grid)</option>
                  <option value="list">Lista (List)</option>
                </select>
              </div>
            </section>
          </div>

          {/* Card Direito: Textos e Customização de Botões */}
          <div className="space-y-6">
            <section className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Type className="w-5 h-5 text-indigo-600" />
                Textos do Portal
              </h2>

              <TextInput label="Nome da Marca" value={String(form.brandName ?? '')} onChange={v => setForm(f => ({ ...f, brandName: v }))} />
              <TextInput label="Título de Boas-vindas" value={String(form.welcomeTitle ?? '')} onChange={v => setForm(f => ({ ...f, welcomeTitle: v }))} />
              <TextInput label="Subtítulo de Boas-vindas" value={String(form.welcomeSubtitle ?? '')} onChange={v => setForm(f => ({ ...f, welcomeSubtitle: v }))} />
              
              <TextInput label="Saudação (Prefixo)" value={String(form.greetingPrefix ?? '')} onChange={v => setForm(f => ({ ...f, greetingPrefix: v }))} />
              <ColorSwatchField
                label="Cor da Saudação"
                value={String(form.greetingColor ?? '')}
                onChange={v => setForm(f => ({ ...f, greetingColor: v }))}
                presets={GREETING_COLOR_PRESETS}
              />

              <div>
                <ColorSwatchField
                  label="Fundo da Tela de Login"
                  value={String(form.loginBackground ?? '')}
                  onChange={v => setForm(f => ({ ...f, loginBackground: v }))}
                  presets={LOGIN_BG_PRESETS}
                />
                <details className="mt-2" open={/^https?:\/\//i.test(String(form.loginBackground ?? ''))}>
                  <summary className="text-xs font-semibold text-slate-400 cursor-pointer hover:text-slate-600 select-none">Avançado — usar imagem por URL</summary>
                  <input
                    type="url"
                    value={String(form.loginBackground ?? '')}
                    onChange={e => setForm(f => ({ ...f, loginBackground: e.target.value }))}
                    placeholder="https://exemplo.com/fundo.jpg"
                    className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
                  />
                </details>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-indigo-600" />
                Customização dos Botões de Abertura
              </h2>

              <div className="space-y-4">
                {/* Botão Incidente */}
                <div className="border-b pb-4 space-y-3">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Botão de Incidente (Reportar Problema)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <TextInput label="Rótulo" value={String(form.incidentLabel ?? '')} onChange={v => setForm(f => ({ ...f, incidentLabel: v }))} />
                    </div>
                    <div>
                      <TextInput label="Emoji" value={String(form.incidentEmoji ?? '')} onChange={v => setForm(f => ({ ...f, incidentEmoji: v }))} />
                    </div>
                  </div>
                  <TextInput label="Descrição" value={String(form.incidentDesc ?? '')} onChange={v => setForm(f => ({ ...f, incidentDesc: v }))} />
                </div>

                {/* Botão Requisição */}
                <div className="space-y-3">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Botão de Requisição (Solicitar Serviço)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <TextInput label="Rótulo" value={String(form.requestLabel ?? '')} onChange={v => setForm(f => ({ ...f, requestLabel: v }))} />
                    </div>
                    <div>
                      <TextInput label="Emoji" value={String(form.requestEmoji ?? '')} onChange={v => setForm(f => ({ ...f, requestEmoji: v }))} />
                    </div>
                  </div>
                  <TextInput label="Descrição" value={String(form.requestDesc ?? '')} onChange={v => setForm(f => ({ ...f, requestDesc: v }))} />
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Ação Principal: Salvar */}
        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={() => void saveBranding()}
            disabled={saving || logoUploading || bgUploading}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
      </div>
    ) : moduleKey === 'iam' ? (
      <div className="mt-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Importação em Lote de Usuários</h2>
          <UserImportZone 
            companyId={companyId} 
            tenantDomain={text(rows[0] ?? {}, 'domain') || 'tenant.local'} 
            onSuccess={() => void load()} 
          />
        </section>
      </div>
    ) : (
      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-extrabold">Nova configuração</h2><div className="mt-4 space-y-3">{fields.map(field => <FormField key={field.key} field={field} value={form[field.key]} classes={classes} groups={groups} onChange={value => setForm(current => ({ ...current, [field.key]: value }))} />)}<button onClick={() => void saveNew()} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Adicionar</button></div></section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-extrabold">Configurações atuais</h2><RowList rows={rows} empty="Nenhuma configuração cadastrada." activeField={def!.activeField} groups={groups} onToggle={toggle} onManageRelations={moduleKey === 'ci' ? openRelationships : undefined} /></section>
      </div>
    )}

    {activeCi && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fade-in">
          <header className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-base font-bold text-slate-800">Relacionamentos do CI</h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">{text(activeCi, 'name')}</p>
            </div>
            <button onClick={() => setActiveCi(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">✕</button>
          </header>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <section className="bg-slate-50 border rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Adicionar Novo Relacionamento</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">
                  Direção
                  <select
                    value={relDirection}
                    onChange={e => setRelDirection(e.target.value as 'upstream' | 'downstream')}
                    className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs font-semibold"
                  >
                    <option value="downstream">Downstream (Saída)</option>
                    <option value="upstream">Upstream (Entrada)</option>
                  </select>
                </label>

                <label className="block text-[10px] font-bold text-slate-500 uppercase">
                  Tipo de Relacionamento
                  <select
                    value={selectedRelTypeId}
                    onChange={e => setSelectedRelTypeId(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs font-semibold"
                  >
                    <option value="">Selecione…</option>
                    {relTypes.map(t => (
                      <option key={text(t, 'id')} value={text(t, 'id')}>
                        {relDirection === 'downstream' ? text(t, 'name') : text(t, 'inverse_name')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-[10px] font-bold text-slate-500 uppercase">
                  CI Relacionado
                  <select
                    value={selectedTargetCiId}
                    onChange={e => setSelectedTargetCiId(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs font-semibold"
                  >
                    <option value="">Selecione…</option>
                    {allCis.filter(c => text(c, 'id') !== text(activeCi, 'id')).map(c => (
                      <option key={text(c, 'id')} value={text(c, 'id')}>
                        {text(c, 'name')}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                onClick={() => void addRelationship()}
                disabled={savingRelation || !selectedRelTypeId || !selectedTargetCiId}
                className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors mt-2"
              >
                {savingRelation ? 'Salvando...' : 'Adicionar Dependência'}
              </button>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Relacionamentos Ativos</h3>
              {loadingRelations ? (
                <div className="text-center py-6 text-xs text-slate-400 animate-pulse">Carregando relacionamentos…</div>
              ) : relationships.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 italic border border-dashed rounded-xl bg-slate-50/50">
                  Nenhum relacionamento mapeado para este item de configuração.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {relationships.map(rel => {
                    const isSource = text(rel, 'source_ci_id') === text(activeCi, 'id')
                    const relatedCiId = isSource ? text(rel, 'target_ci_id') : text(rel, 'source_ci_id')
                    const relatedCi = allCis.find(c => text(c, 'id') === relatedCiId)
                    const type = relTypes.find(t => text(t, 'id') === text(rel, 'relationship_type_id'))
                    const relText = type
                      ? (isSource ? text(type, 'name') : text(type, 'inverse_name'))
                      : 'Conectado a'

                    return (
                      <div key={text(rel, 'id')} className="flex items-center justify-between p-3 border rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                        <div className="text-xs">
                          <span className="font-semibold text-slate-500">Este CI</span>{' '}
                          <span className="font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 text-[10px] uppercase tracking-wide">{relText}</span>{' '}
                          <span className="font-bold text-slate-800">{relatedCi ? text(relatedCi, 'name') : 'CI Desconhecido'}</span>
                        </div>
                        <button
                          onClick={() => void deleteRelationship(text(rel, 'id'))}
                          className="text-red-500 hover:text-red-700 text-xs font-bold hover:underline transition-colors"
                        >
                          Excluir
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    )}
  </div></div>
}

function FormField({ field, value, classes, groups, onChange }: { field: FieldDef; value: FormValue | undefined; classes: Row[]; groups: Row[]; onChange: (value: FormValue) => void }) {
  if (field.type === 'textarea') return <label className="block text-xs font-bold">{field.label}<textarea value={String(value ?? '')} onChange={e => onChange(e.target.value)} className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 text-sm" /></label>
  if (field.type === 'select') return <label className="block text-xs font-bold">{field.label}<select value={String(value ?? '')} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">Selecione…</option>{(field.options ?? []).map(option => <option key={option} value={option}>{
    field.key === 'class_id' ? text(classes.find(row => text(row, 'id') === option) ?? {}, 'name') :
    field.key === 'default_assignment_group_id' ? text(groups.find(row => text(row, 'id') === option) ?? {}, 'name') :
    option
  }</option>)}</select></label>
  return <TextInput label={field.label} type={field.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={onChange} />
}

function TextInput({ label, value, type = 'text', onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold">{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
}

const THEME_LABELS: Record<ThemeName, string> = {
  // Claros
  Pearl: 'Pearl Light', Breeze: 'Sky Breeze', Meadow: 'Meadow Green', Blush: 'Blush Rose', Stone: 'Warm Stone',
  // Escuros
  CorporateBlue: 'Corporate Blue', Ocean: 'Ocean Blue', Midnight: 'Midnight Indigo', Emerald: 'Emerald Green', Graphite: 'Slate Graphite',
  Ruby: 'Ruby Rose', Amethyst: 'Amethyst Purple', Sunset: 'Sunset Orange', Crimson: 'Crimson Red', Forest: 'Forest Teal',
}

const GREETING_COLOR_PRESETS = [
  { name: 'Branco', hex: '#ffffff' },
  { name: 'Cinza claro', hex: '#94a3b8' },
  { name: 'Grafite', hex: '#0f172a' },
  { name: 'Azul céu', hex: '#38bdf8' },
  { name: 'Esmeralda', hex: '#34d399' },
  { name: 'Âmbar', hex: '#fbbf24' },
  { name: 'Rosa', hex: '#f472b6' },
  { name: 'Violeta', hex: '#a78bfa' },
]

const LOGIN_BG_PRESETS = [
  { name: 'Claro neutro', hex: '#f8fafc' },
  { name: 'Índigo suave', hex: '#eef2ff' },
  { name: 'Céu suave', hex: '#f0f9ff' },
  { name: 'Verde suave', hex: '#ecfdf5' },
  { name: 'Grafite escuro', hex: '#0f172a' },
  { name: 'Índigo profundo', hex: '#1e1b4b' },
]

/** Paleta de swatches clicáveis + picker personalizado — substitui inputs crus de hex. */
function ColorSwatchField({ label, value, onChange, presets }: { label: string; value: string; onChange: (v: string) => void; presets: { name: string; hex: string }[] }) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim().toLowerCase() : ''
  const isPreset = presets.some(p => p.hex === normalized)
  const customActive = Boolean(normalized) && !isPreset
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => (
          <button
            key={p.hex}
            type="button"
            title={p.name}
            aria-label={p.name}
            onClick={() => onChange(p.hex)}
            style={{ background: p.hex }}
            className={`w-8 h-8 rounded-full border transition-transform hover:scale-110 ${normalized === p.hex ? 'ring-2 ring-indigo-500 ring-offset-2 border-slate-200' : 'border-slate-200 shadow-sm'}`}
          />
        ))}
        <label
          title="Cor personalizada"
          style={customActive ? { background: normalized } : { background: 'conic-gradient(from 0deg, #f43f5e, #fbbf24, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)' }}
          className={`relative w-8 h-8 rounded-full border cursor-pointer transition-transform hover:scale-110 ${customActive ? 'ring-2 ring-indigo-500 ring-offset-2 border-slate-200' : 'border-slate-200 shadow-sm'}`}
        >
          <input
            type="color"
            value={normalized || '#6366f1'}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  )
}

function RowList({ rows, empty, activeField, groups, onToggle, onManageRelations }: { rows: Row[]; empty: string; activeField?: 'active' | 'enabled'; groups?: Row[]; onToggle?: (row: Row) => void; onManageRelations?: (row: Row) => void }) {
  if (!rows.length) return <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{empty}</div>
  return <div className="mt-4 space-y-2">{rows.map((row, index) => {
    const grpId = text(row, 'default_assignment_group_id')
    const grpName = grpId && groups ? text(groups.find(g => text(g, 'id') === grpId) ?? {}, 'name') : ''
    return (
      <article key={text(row, 'id') || String(index)} className="flex items-center gap-3 rounded-xl border p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <b className="text-sm">{text(row, 'name') || text(row, 'action') || text(row, 'module_key') || text(row, 'key') || `Registro ${index + 1}`}</b>
            {grpName && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">{grpName}</span>}
          </div>
          <p className="truncate text-xs text-slate-500">{text(row, 'description') || text(row, 'body') || text(row, 'resource_type') || text(row, 'lifecycle') || text(row, 'channel')}</p>
        </div>
        <div className="flex items-center gap-2">
          {onManageRelations && (
            <button onClick={() => onManageRelations(row)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors">Relacionamentos</button>
          )}
          {activeField && onToggle && <button onClick={() => void onToggle(row)} className="rounded-lg border px-2 py-1 text-xs font-bold">{bool(row, activeField) ? 'Desativar' : 'Ativar'}</button>}
        </div>
      </article>
    )
  })}</div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-slate-800">{value || '—'}</p></div>
}
