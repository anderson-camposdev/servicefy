import { useState, type FormEvent } from 'react'
import { ArrowRight, BookOpenCheck, Eye, EyeOff, Headphones, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import type { TenantBranding } from '../tenant/applyBranding'
import type { SsoProvider } from '../lib/sso'

interface Props {
  branding: TenantBranding
  onSignIn: (email: string, password: string) => Promise<void> | void
  onOAuth?: (provider: SsoProvider) => Promise<void> | void
  providers?: SsoProvider[]
  allowLocalLogin?: boolean
  authError?: string | null
  loading?: boolean
  tenantNotFound?: boolean
}

const heroBackground = (branding: TenantBranding): string => branding.backgroundUrl
  ? `linear-gradient(135deg, rgba(2,6,23,.88), rgba(2,6,23,.42)), url(${JSON.stringify(branding.backgroundUrl)})`
  : [
      'radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--brand-primary) 72%, transparent), transparent 38%)',
      'radial-gradient(circle at 82% 72%, color-mix(in srgb, var(--brand-accent) 45%, transparent), transparent 34%)',
      'linear-gradient(145deg, #07111f 0%, #111827 52%, #020617 100%)',
    ].join(', ')

export default function TenantLoginScreen({
  branding,
  onSignIn,
  onOAuth,
  providers = [],
  allowLocalLogin = true,
  authError = '',
  loading = false,
  tenantNotFound = false,
}: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [oauthSubmitting, setOauthSubmitting] = useState<SsoProvider | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError('')
    if (!email.trim() || !password) {
      setLocalError('Informe e-mail e senha.')
      return
    }
    setSubmitting(true)
    try { await onSignIn(email.trim(), password) } finally { setSubmitting(false) }
  }

  const handleOAuth = async (provider: SsoProvider) => {
    if (!onOAuth) return
    setLocalError('')
    setOauthSubmitting(provider)
    try {
      await onOAuth(provider)
    } catch {
      setLocalError('Não foi possível iniciar o login corporativo. Tente novamente.')
    } finally {
      setOauthSubmitting(null)
    }
  }

  const busy = loading || submitting || oauthSubmitting !== null
  const errorMessage = localError || authError
  const features = [
    { icon: Headphones, title: 'Atendimento', detail: 'Acompanhe solicitações' },
    { icon: BookOpenCheck, title: 'Conhecimento', detail: 'Encontre respostas' },
    { icon: ShieldCheck, title: 'Segurança', detail: 'Acesso protegido' },
  ]

  return (
    <main className="min-h-screen bg-slate-950 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,.85fr)]">
      <section data-testid="tenant-login-hero"
        className="relative isolate flex min-h-[330px] overflow-hidden bg-cover bg-center px-6 py-7 text-white sm:px-10 lg:min-h-screen lg:px-14 lg:py-12 xl:px-20"
        style={{ backgroundImage: heroBackground(branding) }} aria-label={`Apresentação ${branding.name}`}>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(2,6,23,.05),rgba(2,6,23,.68))]" />
        <div className="absolute inset-0 -z-10 opacity-20 [background-image:radial-gradient(rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="flex w-full flex-col justify-between gap-12">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl shadow-black/20">
              {branding.logoUrl
                ? <img src={branding.logoUrl} alt={`Logo ${branding.name}`} className="h-9 w-9 object-contain" />
                : <Sparkles className="h-6 w-6" style={{ color: 'var(--brand-primary)' }} aria-hidden="true" />}
            </div>
            <div><p className="text-lg font-black tracking-tight">{branding.name}</p><p className="text-[10px] font-bold uppercase tracking-[.22em] text-white/60">Central de serviços</p></div>
          </div>

          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-white/80 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Tudo o que você precisa, em um só lugar
            </div>
            <h1 className="max-w-2xl text-3xl font-black leading-[1.08] tracking-[-.035em] sm:text-4xl lg:text-5xl xl:text-6xl"
              style={{ color: branding.titleColor || undefined, fontFamily: branding.titleFont || undefined }}>{branding.welcomeTitle}</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/72 sm:text-base lg:mt-6 lg:text-lg lg:leading-8"
              style={{ color: branding.subtitleColor || undefined, fontFamily: branding.subtitleFont || undefined }}>{branding.welcomeSubtitle}</p>
            <div className="mt-7 grid max-w-xl grid-cols-3 gap-2 sm:gap-3 lg:mt-10">
              {features.map(({ icon: Icon, title, detail }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[.07] p-3 backdrop-blur-md sm:p-4">
                  <Icon className="mb-2 h-4 w-4 text-white/80 sm:h-5 sm:w-5" aria-hidden="true" />
                  <p className="text-[11px] font-extrabold sm:text-xs">{title}</p><p className="mt-1 hidden text-[10px] text-white/50 sm:block">{detail}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="hidden text-[11px] font-medium text-white/40 lg:block">Experiência digital oferecida por {branding.name}</p>
        </div>
      </section>

      <section className="relative flex min-h-[620px] items-center justify-center overflow-hidden bg-slate-50 px-5 py-10 sm:px-10 lg:min-h-screen">
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full opacity-10 blur-3xl" style={{ background: 'var(--brand-primary)' }} />
        <div className="relative w-full max-w-[440px]">
          <div className="mb-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm">
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--brand-primary)' }} /> Ambiente protegido
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>Olá, seja bem-vindo(a)</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.03em] text-slate-950">Acesse sua central</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Entre com suas credenciais corporativas para continuar.</p>
          </div>

          {errorMessage && <div role="alert" className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-600">{errorMessage}</div>}

          {providers.length > 0 && (
            <div className="space-y-3">
              {providers.map(provider => {
                const isGoogle = provider === 'google'
                const label = isGoogle ? 'Google' : 'Microsoft'
                return (
                  <button
                    key={provider}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOAuth(provider)}
                    aria-label={`Continuar com ${label}`}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isGoogle ? (
                      <span className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 text-sm font-black text-blue-600" aria-hidden="true">G</span>
                    ) : (
                      <span className="grid h-5 w-5 grid-cols-2 gap-0.5" aria-hidden="true">
                        <i className="bg-[#f25022]" /><i className="bg-[#7fba00]" /><i className="bg-[#00a4ef]" /><i className="bg-[#ffb900]" />
                      </span>
                    )}
                    {oauthSubmitting === provider ? 'Redirecionando…' : `Continuar com ${label}`}
                  </button>
                )
              })}
            </div>
          )}

          {providers.length > 0 && allowLocalLogin && (
            <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">
              <span className="h-px flex-1 bg-slate-200" /> ou use sua senha <span className="h-px flex-1 bg-slate-200" />
            </div>
          )}

          {allowLocalLogin ? (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="tenant-login-email" className="mb-2 block text-xs font-extrabold text-slate-700">E-mail corporativo</label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="tenant-login-email" type="email" autoComplete="email" value={email}
                  onChange={event => { setEmail(event.target.value); setLocalError('') }} placeholder="voce@empresa.com"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]" />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><label htmlFor="tenant-login-password" className="text-xs font-extrabold text-slate-700">Senha</label><span className="text-[11px] font-semibold text-slate-400">Acesso corporativo</span></div>
              <div className="group relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="tenant-login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
                  onChange={event => { setPassword(event.target.value); setLocalError('') }} placeholder="Digite sua senha"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-12 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]" />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {tenantNotFound && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-700">Este endereço não corresponde a um cliente ativo. Confirme o link com sua equipe.</div>}
            <button type="submit" disabled={busy} className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold text-white shadow-xl transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55" style={{ background: 'var(--brand-primary)' }}>
              {busy ? 'Autenticando…' : 'Entrar na central'} {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
            </button>
          </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-center text-xs font-semibold leading-5 text-indigo-800">
              Sua empresa exige autenticação corporativa via SSO.
            </div>
          )}
          <div className="mt-8 border-t border-slate-200 pt-6 text-center">
            <p className="text-xs text-slate-500">Precisa de ajuda? Fale com a equipe responsável pelo seu atendimento.</p>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[.16em] text-slate-300">Powered by ServiceFY · ITIL v4</p>
          </div>
        </div>
      </section>
    </main>
  )
}
