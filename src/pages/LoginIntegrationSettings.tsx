import { useEffect, useState } from 'react'
import { CheckCircle2, Globe2, Loader2, Save, ShieldCheck } from 'lucide-react'
import { loginIntegrationService } from '../lib/login-integration-service'
import { SSO_PROVIDERS, type SsoProvider } from '../lib/sso'
import SettingsPageShell from '../components/settings/SettingsPageShell'

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
    <SettingsPageShell
      title="Integração de login"
      description="Configure Google/Microsoft, domínios autorizados e a exigência de SSO para este tenant."
      scopeLabel="Configuração do tenant"
      onBack={onBack}
      actions={<button onClick={() => void save()} disabled={saving || loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar política</button>}
    >

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border bg-white p-12 text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando política…</div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3"><Globe2 className="h-5 w-5 text-primary" /><div><h2 className="font-black text-slate-900">Domínios vinculados</h2><p className="text-xs text-slate-500">O provisionamento automático usa somente domínios verificados pelo provedor MSP.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {domains.map(domain => (
                  <div key={domain.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                    <div><p className="font-bold text-slate-800">@{domain.domain}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{domain.isPrimary ? 'Principal' : 'Adicional'}</p></div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${domain.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      <CheckCircle2 className="h-3 w-3" /> {domain.verified ? 'Verificado' : 'Pendente'}
                    </span>
                  </div>
                ))}
                {domains.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 sm:col-span-2">
                    Nenhum domínio verificado. Solicite ao provedor MSP a validação do domínio corporativo antes de exigir SSO.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" /><div><h2 className="font-black text-slate-900">Provedores corporativos</h2><p className="text-xs text-slate-500">As credenciais OAuth ficam no ambiente seguro; aqui você controla quais provedores o tenant pode usar.</p></div></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {SSO_PROVIDERS.map(provider => {
                  const selected = providers.includes(provider)
                  const meta = PROVIDER_META[provider]
                  return (
                    <button key={provider} type="button" aria-pressed={selected} onClick={() => toggleProvider(provider)} className={`rounded-2xl border p-5 text-left transition ${selected ? 'border-primary bg-primary-container' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center justify-between"><h3 className="font-black text-slate-900">{meta.title}</h3><span className={`h-5 w-9 rounded-full p-0.5 transition ${selected ? 'bg-primary' : 'bg-slate-300'}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${selected ? 'translate-x-4' : ''}`} /></span></div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{meta.description}</p>
                    </button>
                  )
                })}
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input type="checkbox" checked={!allowLocalLogin} onChange={event => { setAllowLocalLogin(!event.target.checked); setSuccess('') }} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary" />
                <span><b className="block text-sm text-slate-900">Exigir login somente via SSO</b><span className="mt-1 block text-xs leading-5 text-slate-500">Bloqueia autenticação por senha no hook do Supabase, inclusive chamadas diretas à API de Auth.</span></span>
              </label>
            </section>

            {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>}
          </div>
        )}
    </SettingsPageShell>
  )
}
