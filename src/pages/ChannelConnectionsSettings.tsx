import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, Loader2, Network, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import { platformAdminService, type SafeConnectionHealth } from '../lib/platform-admin-service'
import type { ChannelProvider } from '../lib/platform-foundation'
import SettingsPageShell from '../components/settings/SettingsPageShell'

const PROVIDERS: Array<{ value: ChannelProvider; label: string }> = [
  { value: 'microsoft_graph', label: 'Microsoft 365 · E-mail' },
  { value: 'microsoft_teams', label: 'Microsoft Teams' },
  { value: 'gmail', label: 'Gmail / Google Workspace' },
  { value: 'google_chat', label: 'Google Chat' },
  { value: 'whatsapp_cloud', label: 'WhatsApp Business Cloud' },
  { value: 'imap_smtp', label: 'IMAP / SMTP' },
  { value: 'api', label: 'API' },
]

const connectionStatusLabel = (status: SafeConnectionHealth['status']) => {
  if (status === 'healthy') return 'Operacional'
  if (status === 'error') return 'Com erro'
  return 'Requer atenção'
}

export default function ChannelConnectionsSettings({ companyId, activeRole, onBack }: {
  companyId: string; activeRole: string; onBack: () => void
}) {
  const [connections, setConnections] = useState<SafeConnectionHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    provider: 'microsoft_graph' as ChannelProvider,
    scope: 'tenant' as 'tenant' | 'provider',
    name: '', address: '', secret: '', enabled: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const overview = await platformAdminService.getSettingsOverview(companyId)
      setConnections(overview.connections)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar conexões.')
    } finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await platformAdminService.saveConnection({
        companyId, provider: form.provider,
        scope: activeRole === 'sysadmin' ? form.scope : 'tenant',
        name: form.name, address: form.address, enabled: form.enabled,
        secret: form.secret || null,
      })
      setForm(current => ({ ...current, name: '', address: '', secret: '' }))
      setShowForm(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar conexão.')
    } finally { setSaving(false) }
  }

  const revoke = async (id: string) => {
    if (!window.confirm('Revogar esta conexão e sua referência de credencial?')) return
    try { await platformAdminService.revokeConnection(companyId, id); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao revogar conexão.') }
  }

  const healthyConnections = connections.filter(connection => connection.status === 'healthy' && !connection.rotationRequired).length
  const attentionConnections = connections.filter(connection => connection.status !== 'healthy' || connection.rotationRequired).length

  return (
    <SettingsPageShell
      title="Conexões omnichannel"
      description="Cadastre os provedores usados no atendimento. As credenciais são protegidas e nunca voltam a ser exibidas."
      scopeLabel="Configuração do tenant"
      onBack={onBack}
      actions={<>
          <span className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">{healthyConnections} operacionais</span>
          {attentionConnections > 0 && <span className="inline-flex h-10 items-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700">{attentionConnections} requerem atenção</span>}
          <button onClick={() => setShowForm(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? 'Fechar' : 'Nova conexão'}</button>
          <button onClick={() => void load()} aria-label="Atualizar conexões" className="rounded-lg border border-slate-300 bg-white p-2.5 transition hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
      </>}
    >
      {error && <div className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="w-4 h-4" />{error}</div>}
      <div className={`grid gap-5 ${showForm ? 'xl:grid-cols-[22rem_minmax(0,1fr)]' : ''}`}>
        {showForm && <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-950">Nova conexão segura</h2>
          <p className="mt-1 text-sm text-slate-500">Informe o provedor e grave a credencial diretamente no cofre.</p>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-bold">Provedor<select value={form.provider} onChange={event => setForm(v => ({ ...v, provider: event.target.value as ChannelProvider }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{PROVIDERS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            {activeRole === 'sysadmin' && <label className="block text-xs font-bold">Escopo<select value={form.scope} onChange={event => setForm(v => ({ ...v, scope: event.target.value as 'tenant' | 'provider' }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="tenant">Próprio do tenant</option><option value="provider">Compartilhado pelo MSP</option></select></label>}
            <label className="block text-xs font-bold">Nome<input value={form.name} onChange={event => setForm(v => ({ ...v, name: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Suporte Microsoft 365" /></label>
            <label className="block text-xs font-bold">Endereço/identificador<input value={form.address} onChange={event => setForm(v => ({ ...v, address: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="suporte@empresa.com" /></label>
            <label className="block text-xs font-bold">Credencial<input type="password" value={form.secret} onChange={event => setForm(v => ({ ...v, secret: event.target.value }))} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Enviada diretamente ao Vault" /></label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={event => setForm(v => ({ ...v, enabled: event.target.checked }))} /> Ativar após salvar</label>
            <button onClick={() => void save()} disabled={saving || !form.name.trim()} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Salvar conexão</button>
          </div>
        </section>}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-950"><Network className="w-4 h-4 text-slate-500" /> Conexões configuradas</h2>
          {loading ? <div className="py-12 text-center text-sm text-slate-500">Carregando…</div> :
            connections.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center"><Network className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Nenhuma conexão configurada</p><p className="mt-1 text-xs text-slate-500">Cadastre um provedor ao lado para começar a receber ou enviar interações.</p></div> :
            <div className="mt-4 space-y-3">{connections.map(item => <article key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
              <span className={'h-2.5 w-2.5 rounded-full ' + (item.status === 'healthy' ? 'bg-emerald-500' : item.status === 'error' ? 'bg-red-500' : 'bg-amber-400')} />
              <div className="min-w-0 flex-1"><div className="font-bold">{item.name}</div><div className="truncate text-xs text-slate-500">{PROVIDERS.find(provider => provider.value === item.provider)?.label || item.provider} · {item.address || 'sem endereço'} · {connectionStatusLabel(item.status)}</div>{item.rotationRequired && <div className="mt-1 text-xs font-bold text-amber-600">Rotação de credencial necessária</div>}</div>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <button onClick={() => void revoke(item.id)} title="Revogar" className="rounded-lg p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </article>)}</div>}
        </section>
      </div>
    </SettingsPageShell>
  )
}
