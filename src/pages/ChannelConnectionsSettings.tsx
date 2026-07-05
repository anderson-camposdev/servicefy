import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, Network, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { platformAdminService, type SafeConnectionHealth } from '../lib/platform-admin-service'
import type { ChannelProvider } from '../lib/platform-foundation'

const PROVIDERS: Array<{ value: ChannelProvider; label: string }> = [
  { value: 'microsoft_graph', label: 'Microsoft 365 · E-mail' },
  { value: 'microsoft_teams', label: 'Microsoft Teams' },
  { value: 'gmail', label: 'Gmail / Google Workspace' },
  { value: 'google_chat', label: 'Google Chat' },
  { value: 'whatsapp_cloud', label: 'WhatsApp Business Cloud' },
  { value: 'imap_smtp', label: 'IMAP / SMTP' },
  { value: 'api', label: 'API' },
]

export default function ChannelConnectionsSettings({ companyId, activeRole, onBack }: {
  companyId: string; activeRole: string; onBack: () => void
}) {
  const [connections, setConnections] = useState<SafeConnectionHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6"><div className="max-w-6xl mx-auto">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="w-4 h-4" /> Central de Configurações</button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-widest text-indigo-600">Canais e Comunicação</p><h1 className="mt-2 text-3xl font-black">Conexões omnichannel</h1><p className="mt-2 text-sm text-slate-500">Credenciais são write-only e nunca podem ser recuperadas.</p></div>
        <button onClick={() => void load()} className="rounded-xl border bg-white p-2.5"><RefreshCw className="w-4 h-4" /></button>
      </header>
      {error && <div className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="w-4 h-4" />{error}</div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-extrabold">Nova conexão segura</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-bold">Provedor<select value={form.provider} onChange={event => setForm(v => ({ ...v, provider: event.target.value as ChannelProvider }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm">{PROVIDERS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            {activeRole === 'sysadmin' && <label className="block text-xs font-bold">Escopo<select value={form.scope} onChange={event => setForm(v => ({ ...v, scope: event.target.value as 'tenant' | 'provider' }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="tenant">Próprio do tenant</option><option value="provider">Compartilhado pelo MSP</option></select></label>}
            <label className="block text-xs font-bold">Nome<input value={form.name} onChange={event => setForm(v => ({ ...v, name: event.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Suporte Microsoft 365" /></label>
            <label className="block text-xs font-bold">Endereço/identificador<input value={form.address} onChange={event => setForm(v => ({ ...v, address: event.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="suporte@empresa.com" /></label>
            <label className="block text-xs font-bold">Credencial<input type="password" value={form.secret} onChange={event => setForm(v => ({ ...v, secret: event.target.value }))} autoComplete="new-password" className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Enviada diretamente ao Vault" /></label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={event => setForm(v => ({ ...v, enabled: event.target.checked }))} /> Ativar após salvar</label>
            <button onClick={() => void save()} disabled={saving || !form.name.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Salvar</button>
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-extrabold"><Network className="w-4 h-4 text-indigo-600" /> Conexões configuradas</h2>
          {loading ? <div className="py-12 text-center text-sm text-slate-500">Carregando…</div> :
            connections.length === 0 ? <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhuma conexão configurada.</div> :
            <div className="mt-4 space-y-3">{connections.map(item => <article key={item.id} className="flex items-center gap-3 rounded-xl border p-4">
              <span className={'h-2.5 w-2.5 rounded-full ' + (item.status === 'healthy' ? 'bg-emerald-500' : item.status === 'error' ? 'bg-red-500' : 'bg-amber-400')} />
              <div className="min-w-0 flex-1"><div className="font-bold">{item.name}</div><div className="truncate text-xs text-slate-500">{item.provider} · {item.address || 'sem endereço'} · {item.status}</div>{item.rotationRequired && <div className="mt-1 text-xs font-bold text-amber-600">Rotação necessária</div>}</div>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <button onClick={() => void revoke(item.id)} title="Revogar" className="rounded-lg p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </article>)}</div>}
        </section>
      </div>
    </div></div>
  )
}
