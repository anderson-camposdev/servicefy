import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Globe2, KeyRound, Loader2, Save, ShieldCheck } from 'lucide-react'
import { loginIntegrationService } from '../lib/login-integration-service'
import { SSO_PROVIDERS, type SsoProvider } from '../lib/sso'

interface Props {
  companyId: string
  onBack: () => void
}

const PROVIDER_META: Record<SsoProvider, { title: string; description: string }> = {
  azure: {
    title: 'Microsoft Entra ID',
    description: 'Contas corporativas do Microsoft 365 e Azure AD.',
  },
  google: {
    title: 'Google Workspace',
    description: 'Contas corporativas gerenciadas pelo Google.',
  },
}

export default function LoginIntegrationSettings({ companyId, onBack }: Props) {
  const [domains, setDomains] = useState<Array<{ id: string; domain: string; isPrimary: boolean; verified: boolean }>>([])
  const [providers, setProviders] = useState<SsoProvider[]>([])
  const [allowLocalLogin, setAllowLocalLogin] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loginIntegrationService.getPolicy(companyId)
      .then(policy => {
        if (cancelled) return
        setProviders(policy.providers)
        setAllowLocalLogin(policy.allowLocalLogin)
        setDomains(policy.domains.map(domain => ({
          id: domain.id,
          domain: domain.domain,
          isPrimary: domain.is_primary,
          verified: domain.verified_at !== null,
        })))
        setError('')
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Falha ao carregar a política de login.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId])

  const toggleProvider = (provider: SsoProvider) => {
    setSuccess('')
    setProviders(current => current.includes(provider)
      ? current.filter(item => item !== provider)
      : [...current, provider])
  }

  const save = async () => {
    setError('')
    setSuccess('')
    if (!allowLocalLogin && providers.length === 0) {
      setError('Habilite Google ou Microsoft antes de exigir login somente via SSO.')
      return
    }
    setSaving(true)
    try {
      await loginIntegrationService.updatePolicy(companyId, allowLocalLogin, providers)
      setSuccess('Política de autenticação atualizada com sucesso.')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar a política de login.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 p-5 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Central de Configurações
        </button>

        <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><KeyRound className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-indigo-600">Identidade Enterprise</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Integração de Login</h1>
              <p className="mt-2 text-sm text-slate-500">Configure Google/Microsoft, domínios autorizados e a exigência de SSO para este tenant.</p>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="mt-5 flex items-center justify-center rounded-3xl border bg-white p-12 text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando política…</div>
        ) : (
          <div className="mt-5 space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3"><Globe2 className="h-5 w-5 text-indigo-600" /><div><h2 className="font-black text-slate-900">Domínios vinculados</h2><p className="text-xs text-slate-500">O JIT usa somente domínios verificados. Novos domínios são validados pelo provedor MSP.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {domains.map(domain => (
                  <div key={domain.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                    <div><p className="font-bold text-slate-800">@{domain.domain}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{domain.isPrimary ? 'Principal' : 'Adicional'}</p></div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${domain.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      <CheckCircle2 className="h-3 w-3" /> {domain.verified ? 'Verificado' : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-indigo-600" /><div><h2 className="font-black text-slate-900">Provedores corporativos</h2><p className="text-xs text-slate-500">As credenciais OAuth são configuradas no Supabase Cloud; aqui você habilita o provedor para o tenant.</p></div></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {SSO_PROVIDERS.map(provider => {
                  const selected = providers.includes(provider)
                  const meta = PROVIDER_META[provider]
                  return (
                    <button key={provider} type="button" aria-pressed={selected} onClick={() => toggleProvider(provider)} className={`rounded-2xl border-2 p-5 text-left transition ${selected ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center justify-between"><h3 className="font-black text-slate-900">{meta.title}</h3><span className={`h-5 w-9 rounded-full p-0.5 transition ${selected ? 'bg-indigo-600' : 'bg-slate-300'}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${selected ? 'translate-x-4' : ''}`} /></span></div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{meta.description}</p>
                    </button>
                  )
                })}
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input type="checkbox" checked={!allowLocalLogin} onChange={event => { setAllowLocalLogin(!event.target.checked); setSuccess('') }} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" />
                <span><b className="block text-sm text-slate-900">Exigir login somente via SSO</b><span className="mt-1 block text-xs leading-5 text-slate-500">Bloqueia autenticação por senha no hook do Supabase, inclusive chamadas diretas à API de Auth.</span></span>
              </label>
            </section>

            {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>}
            <div className="flex justify-end"><button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar política</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
