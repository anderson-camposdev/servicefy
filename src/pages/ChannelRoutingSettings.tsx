// ============================================================
// ServiceFY — Rotas e Triagem Omnichannel (Central de Configurações)
// Aba Rotas: CRUD de channel_routes (identificação, prioridade, grupo).
// Aba Triagem: inbox de eventos ambíguos (channel_triage_events) com
// atribuir/descartar/reprocessar. Segurança real na RLS/RPC.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, Plus, Trash2, RefreshCw, AlertTriangle, Network, Inbox,
  CheckCircle2, XCircle, RotateCcw, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  platformAdminService,
  type ChannelRoute, type ChannelTriageEvent, type ChannelMatchType, type ConnectionOption,
} from '../lib/platform-admin-service'

interface Props { companyId: string; activeRole: string; onBack: () => void }
interface Group { id: string; name: string }

const MATCH_TYPES: Array<{ value: ChannelMatchType; label: string }> = [
  { value: 'address', label: 'Endereço exato' },
  { value: 'alias', label: 'Alias' },
  { value: 'domain', label: 'Domínio (@empresa.com)' },
  { value: 'phone', label: 'Telefone' },
  { value: 'external_identity', label: 'Identidade externa' },
  { value: 'default', label: 'Padrão (fallback)' },
]
const REASON_LABEL: Record<ChannelTriageEvent['reason'], string> = {
  ambiguous_route: 'Rota ambígua',
  route_not_found: 'Rota não encontrada',
  invalid_tenant: 'Tenant inválido',
}

export default function ChannelRoutingSettings({ companyId, onBack }: Props) {
  const [tab, setTab] = useState<'routes' | 'triage'>('routes')
  const [connections, setConnections] = useState<ConnectionOption[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [routes, setRoutes] = useState<ChannelRoute[]>([])
  const [triage, setTriage] = useState<ChannelTriageEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const [form, setForm] = useState({
    connectionId: '', matchType: 'address' as ChannelMatchType, matchValue: '',
    priority: 100, assignmentGroupId: '', enabled: true,
  })

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [conns, rts, trg] = await Promise.all([
        platformAdminService.listConnectionOptions(companyId),
        platformAdminService.listRoutes(companyId),
        platformAdminService.listTriage(companyId),
      ])
      setConnections(conns)
      setRoutes(rts)
      setTriage(trg)
      if (conns[0] && !form.connectionId) setForm(f => ({ ...f, connectionId: conns[0].id }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar rotas.')
    } finally { setLoading(false) }
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    supabase.from('assignment_groups').select('id,name').eq('company_id', companyId).order('name')
      .then(r => setGroups((r.data ?? []) as Group[]))
  }, [companyId])

  const connName = (id: string) => connections.find(c => c.id === id)?.name ?? id
  const groupName = (id: string | null) => (id ? groups.find(g => g.id === id)?.name ?? '—' : '—')

  const addRoute = async () => {
    if (!form.connectionId) { setError('Selecione uma conexão.'); return }
    if (form.matchType !== 'default' && !form.matchValue.trim()) { setError('Informe o valor de identificação.'); return }
    try {
      await platformAdminService.saveRoute({
        connectionId: form.connectionId, targetCompanyId: companyId,
        priority: form.priority, matchType: form.matchType,
        matchValue: form.matchValue.trim() || null,
        assignmentGroupId: form.assignmentGroupId || null, enabled: form.enabled,
      })
      setForm(f => ({ ...f, matchValue: '' }))
      flash('Rota salva.'); load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar rota.') }
  }

  const removeRoute = async (r: ChannelRoute) => {
    if (!window.confirm('Excluir esta rota? Mensagens deste canal deixarão de casar por ela.')) return
    try { await platformAdminService.deleteRoute(r.id); flash('Rota excluída.'); load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao excluir.') }
  }

  const resolve = async (ev: ChannelTriageEvent, action: 'assigned' | 'discarded' | 'reprocessed') => {
    try {
      await platformAdminService.resolveTriage(ev.id, action, action === 'assigned' ? companyId : null)
      flash(action === 'discarded' ? 'Evento descartado.' : action === 'reprocessed' ? 'Evento reenfileirado.' : 'Evento atribuído.')
      load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao resolver triagem.') }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6"><div className="mx-auto max-w-6xl">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Central de Configurações</button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Canais e comunicação</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Rotas e filas</h1>
          <p className="mt-2 text-sm text-slate-500">Identificação de destinatário, prioridade e triagem de eventos ambíguos.</p>
        </div>
        <button onClick={() => void load()} className="rounded-xl border bg-white p-2.5"><RefreshCw className="h-4 w-4" /></button>
      </header>

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('routes')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold ${tab === 'routes' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}><Network className="h-4 w-4" /> Rotas</button>
        <button onClick={() => setTab('triage')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold ${tab === 'triage' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}>
          <Inbox className="h-4 w-4" /> Triagem {triage.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-700">{triage.length}</span>}
        </button>
      </div>

      {error && <div className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{error}</div>}

      {tab === 'routes' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-extrabold">Nova rota</h2>
            {connections.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-slate-500">Cadastre uma conexão em "Conexões omnichannel" antes de criar rotas.</p>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-bold">Conexão<select value={form.connectionId} onChange={e => setForm(f => ({ ...f, connectionId: e.target.value }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm">{connections.map(c => <option key={c.id} value={c.id}>{c.name} · {c.provider}</option>)}</select></label>
                <label className="block text-xs font-bold">Identificação<select value={form.matchType} onChange={e => setForm(f => ({ ...f, matchType: e.target.value as ChannelMatchType }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm">{MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
                {form.matchType !== 'default' && (
                  <label className="block text-xs font-bold">Valor<input value={form.matchValue} onChange={e => setForm(f => ({ ...f, matchValue: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder={form.matchType === 'domain' ? 'empresa.com' : form.matchType === 'phone' ? '+5511999999999' : 'suporte@empresa.com'} /></label>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold">Prioridade<input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
                  <label className="block text-xs font-bold">Grupo<select value={form.assignmentGroupId} onChange={e => setForm(f => ({ ...f, assignmentGroupId: e.target.value }))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">— Nenhum —</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> Ativa</label>
                <button onClick={() => void addRoute()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary hover:opacity-90"><Plus className="h-4 w-4" /> Adicionar rota</button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-extrabold"><Network className="h-4 w-4 text-primary" /> Rotas configuradas</h2>
            {loading ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> :
              routes.length === 0 ? <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhuma rota configurada.</div> :
              <div className="mt-4 space-y-2">{routes.map(r => (
                <article key={r.id} className="flex items-center gap-3 rounded-xl border p-4">
                  <span className={'h-2.5 w-2.5 rounded-full ' + (r.enabled ? 'bg-emerald-500' : 'bg-slate-300')} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{MATCH_TYPES.find(m => m.value === r.match_type)?.label}{r.match_value ? `: ${r.match_value}` : ''}</div>
                    <div className="truncate text-xs text-slate-500">{connName(r.connection_id)} · prioridade {r.priority} · grupo {groupName(r.assignment_group_id)}</div>
                  </div>
                  <button onClick={() => void removeRoute(r)} title="Excluir" className="rounded-lg p-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </article>
              ))}</div>}
          </section>
        </div>
      )}

      {tab === 'triage' && (
        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-extrabold"><Inbox className="h-4 w-4 text-primary" /> Eventos aguardando triagem</h2>
          {loading ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> :
            triage.length === 0 ? <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhum evento pendente. Rotas ambíguas ou sem correspondência aparecem aqui.</div> :
            <div className="mt-4 space-y-2">{triage.map(ev => (
              <article key={ev.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{REASON_LABEL[ev.reason]}</span>
                    <span className="truncate font-bold text-slate-800">{ev.subject || '(sem assunto)'}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">de {ev.sender || 'desconhecido'} · {new Date(ev.created_at).toLocaleString('pt-BR')}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => void resolve(ev, 'assigned')} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:opacity-90"><CheckCircle2 className="h-3.5 w-3.5" /> Atribuir a este tenant</button>
                  <button onClick={() => void resolve(ev, 'reprocessed')} title="Reprocessar" className="rounded-lg border p-2 text-slate-500 hover:text-primary"><RotateCcw className="h-4 w-4" /></button>
                  <button onClick={() => void resolve(ev, 'discarded')} title="Descartar" className="rounded-lg border p-2 text-slate-500 hover:text-red-600"><XCircle className="h-4 w-4" /></button>
                </div>
              </article>
            ))}</div>}
        </section>
      )}

      {toast && <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg"><CheckCircle2 className="h-4 w-4 text-emerald-400" />{toast}</div>}
    </div></div>
  )
}
