import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Plus, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

export type OperationalModuleKey = 'domains' | 'macros' | 'templates' | 'ci' | 'compliance' | 'licensing'

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

const defs: Record<Exclude<OperationalModuleKey, 'compliance' | 'licensing'>, ModuleDef> = {
  domains: {
    title: 'Domínios de serviço', description: 'Separe TI, RH, Jurídico e Facilities com privacidade e ciclo próprios.',
    table: 'service_domains', order: 'name', activeField: 'active',
    fields: [
      { key: 'key', label: 'Chave', required: true }, { key: 'name', label: 'Nome', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea' },
      { key: 'privacy', label: 'Privacidade', type: 'select', options: ['standard', 'private', 'restricted'], required: true },
    ],
    defaults: { key: '', name: '', description: '', privacy: 'standard' },
    payload: (f, companyId) => ({ company_id: companyId, key: f.key, name: f.name, description: f.description || null, privacy: f.privacy, active: true }),
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
  const def = moduleKey === 'compliance' || moduleKey === 'licensing' ? null : defs[moduleKey]
  const [rows, setRows] = useState<Row[]>([])
  const [classes, setClasses] = useState<Row[]>([])
  const [audit, setAudit] = useState<Row[]>([])
  const [usage, setUsage] = useState<Row | null>(null)
  const [form, setForm] = useState<Record<string, FormValue>>(def?.defaults ?? {})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      } else {
        const result = await supabase.from(def!.table).select('*').eq('company_id', companyId).order(def!.order)
        if (result.error) throw result.error
        setRows(result.data ?? [])
        if (moduleKey === 'ci') {
          const classResult = await supabase.from('ci_classes').select('id,name').eq('company_id', companyId).eq('active', true).order('name')
          if (classResult.error) throw classResult.error
          setClasses(classResult.data ?? [])
          setForm(current => ({ ...current, class_id: current.class_id || text((classResult.data?.[0] ?? {}) as Row, 'id') }))
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar configuração.') }
    finally { setLoading(false) }
  }, [companyId, def, moduleKey])

  useEffect(() => { void load() }, [load])

  const fields = useMemo(() => def?.fields.map(field => field.key === 'class_id'
    ? { ...field, options: classes.map(row => text(row, 'id')) }
    : field) ?? [], [classes, def])

  const saveNew = async () => {
    if (!def) return
    const missing = def.fields.find(field => field.required && !String(form[field.key] ?? '').trim())
    if (missing) { setError(`Informe: ${missing.label}.`); return }
    setSaving(true); setError('')
    const { error: saveError } = await supabase.from(def.table).insert(def.payload(form, companyId))
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    setSuccess('Configuração salva e auditável.'); setForm(def.defaults); await load()
  }

  const toggle = async (row: Row) => {
    if (!def?.activeField) return
    const { error: updateError } = await supabase.from(def.table).update({ [def.activeField]: !bool(row, def.activeField) }).eq('id', text(row, 'id'))
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

  const title = def?.title ?? (moduleKey === 'compliance' ? 'LGPD, retenção e segurança' : 'Módulos contratados e licenças')
  const description = def?.description ?? (moduleKey === 'compliance'
    ? 'Políticas de anexo, retenção, verificação de malware e trilha administrativa.'
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
    ) : (
      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-extrabold">Nova configuração</h2><div className="mt-4 space-y-3">{fields.map(field => <FormField key={field.key} field={field} value={form[field.key]} classes={classes} onChange={value => setForm(current => ({ ...current, [field.key]: value }))} />)}<button onClick={() => void saveNew()} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Adicionar</button></div></section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-extrabold">Configurações atuais</h2><RowList rows={rows} empty="Nenhuma configuração cadastrada." activeField={def!.activeField} onToggle={toggle} /></section>
      </div>
    )}
  </div></div>
}

function FormField({ field, value, classes, onChange }: { field: FieldDef; value: FormValue | undefined; classes: Row[]; onChange: (value: FormValue) => void }) {
  if (field.type === 'textarea') return <label className="block text-xs font-bold">{field.label}<textarea value={String(value ?? '')} onChange={e => onChange(e.target.value)} className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 text-sm" /></label>
  if (field.type === 'select') return <label className="block text-xs font-bold">{field.label}<select value={String(value ?? '')} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">Selecione…</option>{(field.options ?? []).map(option => <option key={option} value={option}>{field.key === 'class_id' ? text(classes.find(row => text(row, 'id') === option) ?? {}, 'name') : option}</option>)}</select></label>
  return <TextInput label={field.label} type={field.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={onChange} />
}

function TextInput({ label, value, type = 'text', onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold">{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
}

function RowList({ rows, empty, activeField, onToggle }: { rows: Row[]; empty: string; activeField?: 'active' | 'enabled'; onToggle?: (row: Row) => void }) {
  if (!rows.length) return <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{empty}</div>
  return <div className="mt-4 space-y-2">{rows.map((row, index) => <article key={text(row, 'id') || String(index)} className="flex items-center gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1"><b className="text-sm">{text(row, 'name') || text(row, 'action') || text(row, 'module_key') || text(row, 'key') || `Registro ${index + 1}`}</b><p className="truncate text-xs text-slate-500">{text(row, 'description') || text(row, 'body') || text(row, 'resource_type') || text(row, 'lifecycle') || text(row, 'channel')}</p></div>{activeField && onToggle && <button onClick={() => void onToggle(row)} className="rounded-lg border px-2 py-1 text-xs font-bold">{bool(row, activeField) ? 'Desativar' : 'Ativar'}</button>}</article>)}</div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-slate-800">{value || '—'}</p></div>
}
