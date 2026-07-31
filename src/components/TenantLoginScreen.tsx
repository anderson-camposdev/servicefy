import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, Eye, EyeOff, Gauge, LockKeyhole, Mail, ShieldCheck, Workflow } from 'lucide-react'
import type { TenantBranding } from '../tenant/applyBranding'
import type { SsoProvider } from '../lib/sso'
import { getTenantInitials, presentAuthError } from '../lib/login-presentation'
import ServiceFyLogo from './brand/ServiceFyLogo'

interface Props {
  branding: TenantBranding
  onSignIn: (email: string, password: string) => Promise<void> | void
  onOAuth?: (provider: SsoProvider) => Promise<void> | void
  onRequestPasswordRecovery?: (email: string) => Promise<void> | void
  onUpdatePassword?: (password: string) => Promise<void> | void
  recoveryMode?: boolean
  providers?: SsoProvider[]
  allowLocalLogin?: boolean
  authError?: string | null
  loading?: boolean
  tenantNotFound?: boolean
}

const heroBackground = (branding: TenantBranding): string => branding.backgroundUrl
  ? `linear-gradient(135deg, rgba(2,6,23,.88), rgba(2,6,23,.42)), url(${JSON.stringify(branding.backgroundUrl)})`
  : 'radial-gradient(circle at 86% 16%, rgba(14,165,233,.16), transparent 32%), linear-gradient(145deg, #071225 0%, #0b172a 58%, #0a2239 100%)'

const operationalProof = [
  { icon: Gauge, title: 'SLA sob controle', detail: 'Prazos e prioridades visíveis' },
  { icon: Workflow, title: 'Fluxos conectados', detail: 'Do catálogo à resolução' },
  { icon: Building2, title: 'Isolamento por empresa', detail: 'Acesso e dados protegidos' },
] as const

export default function TenantLoginScreen({
  branding,
  onSignIn,
  onOAuth,
  onRequestPasswordRecovery,
  onUpdatePassword,
  recoveryMode = false,
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
  const [logoFailed, setLogoFailed] = useState(false)
  const [recovering, setRecovering] = useState(false)
  // Quebra-vidro: quando a empresa exige SSO (allowLocalLogin=false), o
  // formulário de e-mail/senha fica escondido por padrão — mas sysadmin e
  // company_admin ainda precisam conseguir entrar se o SSO cair. Este link
  // discreto revela o mesmo formulário; a autorização de fato acontece no
  // backend (AuthContext.signIn/canUseLocalLoginBreakGlass), que desloga
  // na hora qualquer conta que não seja admin — este toggle é só UX,
  // não é a camada de segurança.
  const [breakGlassRevealed, setBreakGlassRevealed] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoverySent, setRecoverySent] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')

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

  const handleRecoveryRequest = async (event: FormEvent) => {
    event.preventDefault()
    if (!onRequestPasswordRecovery || !recoveryEmail.trim()) {
      setLocalError('Informe seu e-mail corporativo.')
      return
    }
    setSubmitting(true)
    setLocalError('')
    try { await onRequestPasswordRecovery(recoveryEmail.trim()) } catch { /* resposta uniforme */ }
    finally {
      setRecoverySent(true)
      setSubmitting(false)
    }
  }

  const handlePasswordUpdate = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 12) return setLocalError('Use uma senha com pelo menos 12 caracteres.')
    if (newPassword !== passwordConfirmation) return setLocalError('As senhas informadas não coincidem.')
    if (!onUpdatePassword) return
    setSubmitting(true)
    setLocalError('')
    try { await onUpdatePassword(newPassword) }
    catch { setLocalError('Não foi possível atualizar a senha. Solicite um novo link.') }
    finally { setSubmitting(false) }
  }

  const busy = loading || submitting || oauthSubmitting !== null
  const errorMessage = localError || presentAuthError(authError)
  const isServiceFyBrand = branding.name.trim().toLocaleLowerCase('pt-BR') === 'servicefy'
  return (
    <main className="h-[100dvh] overflow-y-auto bg-slate-950 overscroll-contain lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,.92fr)] lg:overflow-hidden">
      <section data-testid="tenant-login-hero"
        className="relative isolate flex min-h-[320px] overflow-hidden bg-cover bg-center px-6 py-7 text-white sm:min-h-[360px] sm:px-10 sm:py-9 lg:min-h-screen lg:px-14 lg:py-12 xl:px-20"
        style={{ backgroundImage: heroBackground(branding), backgroundColor: '#071225' }} aria-label={`Apresentação ${branding.name}`}>
        {isServiceFyBrand && (
          <ServiceFyLogo
            decorative
            className="pointer-events-none absolute -right-28 top-[28%] hidden h-auto w-[34rem] opacity-[.055] lg:block xl:-right-20 xl:w-[40rem]"
          />
        )}
        <div className="relative z-10 flex w-full flex-col justify-between gap-8 lg:gap-12">
          <header className="flex min-h-14 items-center">
            {isServiceFyBrand && (!branding.logoUrl || logoFailed) ? (
              <div className="flex items-center gap-4">
                <ServiceFyLogo className="h-12 w-auto sm:h-14" />
                <div className="border-l border-white/20 pl-4">
                  <p className="text-sm font-bold text-white">Plataforma ITSM</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-300">Gestão de serviços empresariais</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-14 min-w-14 max-w-44 items-center justify-center overflow-hidden rounded-xl bg-white px-2">
                  {branding.logoUrl && !logoFailed
                    ? <img src={branding.logoUrl} onError={() => setLogoFailed(true)} alt={`Logo ${branding.name}`} className="h-10 max-w-36 object-contain" />
                    : <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>{getTenantInitials(branding.name)}</span>}
                </div>
                <div><p className="text-lg font-bold tracking-tight">{branding.name}</p><p className="text-xs text-slate-300">Central de serviços</p></div>
              </div>
            )}
          </header>

          <div className="max-w-3xl py-2 lg:py-0">
            <h1 className="max-w-[15ch] text-3xl font-bold leading-[1.1] tracking-[-.025em] text-balance sm:text-4xl lg:text-[3.25rem]"
              style={{ color: branding.titleColor || undefined, fontFamily: branding.titleFont || undefined }}>{branding.welcomeTitle}</h1>
            <p className="mt-4 max-w-[62ch] text-sm leading-6 text-slate-300 sm:text-base lg:mt-6 lg:text-lg lg:leading-8"
              style={{ color: branding.subtitleColor || undefined, fontFamily: branding.subtitleFont || undefined }}>{branding.welcomeSubtitle}</p>
            <p className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-300 sm:text-sm lg:mt-8">
              <ShieldCheck className="h-4 w-4 text-yellow-300" aria-hidden="true" />
              Ambiente corporativo para usuários autorizados
            </p>
          </div>

          <ul className="hidden max-w-4xl grid-cols-3 gap-7 border-t border-white/15 pt-6 lg:grid" aria-label="Diferenciais da plataforma">
            {operationalProof.map(item => {
              const Icon = item.icon
              return (
                <li key={item.title} className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Icon className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                    <span>{item.title}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-400">{item.detail}</p>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="relative flex min-h-[620px] items-center justify-center bg-background px-5 py-10 sm:px-10 lg:min-h-screen">
        <div className="relative w-full max-w-[440px]">
          <div className="mb-8">
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold text-on-surface-variant"><ShieldCheck className="h-4 w-4 text-[var(--brand-primary)]" /> Conta corporativa</p>
            <h2 className="text-3xl font-bold tracking-[-.025em] text-on-surface">{recoveryMode ? 'Defina uma nova senha' : recovering ? 'Recupere seu acesso' : 'Acesse sua central'}</h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">{recoveryMode ? 'Crie uma senha exclusiva com pelo menos 12 caracteres.' : recovering ? 'Enviaremos as instruções para o e-mail informado.' : 'Use sua conta corporativa para continuar.'}</p>
          </div>

          {errorMessage && <div role="alert" className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-600">{errorMessage}</div>}

          {!recoveryMode && !recovering && providers.length > 0 && (
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
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface px-5 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-55"
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

          {!recoveryMode && !recovering && providers.length > 0 && (allowLocalLogin || breakGlassRevealed) && (
            <div className="my-5 flex items-center gap-3 text-xs font-medium text-slate-500">
              <span className="h-px flex-1 bg-slate-200" /> ou entre com e-mail e senha <span className="h-px flex-1 bg-slate-200" />
            </div>
          )}

          {recoveryMode ? (
            <form onSubmit={handlePasswordUpdate} className="space-y-5" noValidate>
              <div><label htmlFor="new-password" className="mb-2 block text-xs font-extrabold text-slate-700">Nova senha</label><input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="h-14 w-full rounded-xl border border-outline-variant bg-surface px-4 text-sm outline-none" /></div>
              <div><label htmlFor="confirm-password" className="mb-2 block text-xs font-extrabold text-slate-700">Confirmar nova senha</label><input id="confirm-password" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} className="h-14 w-full rounded-xl border border-outline-variant bg-surface px-4 text-sm outline-none" /></div>
              <button type="submit" disabled={busy} className="h-14 w-full rounded-xl text-sm font-bold text-white disabled:opacity-55" style={{ background: 'var(--brand-primary)' }}>Atualizar senha</button>
            </form>
          ) : recovering ? (
            recoverySent ? <div role="status" className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-800">Se houver uma conta elegível para este e-mail, as instruções serão enviadas em instantes.</div> :
            <form onSubmit={handleRecoveryRequest} className="space-y-5" noValidate>
              <div><label htmlFor="recovery-email" className="mb-2 block text-xs font-extrabold text-slate-700">E-mail para recuperação</label><input id="recovery-email" type="email" autoComplete="email" value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} className="h-14 w-full rounded-xl border border-outline-variant bg-surface px-4 text-sm outline-none" /></div>
              <button type="submit" disabled={busy} className="h-14 w-full rounded-xl text-sm font-bold text-white disabled:opacity-55" style={{ background: 'var(--brand-primary)' }}>Enviar instruções</button>
            </form>
          ) : allowLocalLogin || breakGlassRevealed ? (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {!allowLocalLogin && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
                Acesso de emergência: só entra por aqui quem tem conta de administrador. Contas comuns continuam exigindo SSO.
              </div>
            )}
            <div>
              <label htmlFor="tenant-login-email" className="mb-2 block text-xs font-extrabold text-slate-700">E-mail corporativo</label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="tenant-login-email" type="email" autoComplete="email" value={email}
                  onChange={event => { setEmail(event.target.value); setLocalError('') }} placeholder="voce@empresa.com"
                  className="h-14 w-full rounded-xl border border-outline-variant bg-surface pl-11 pr-4 text-sm font-medium text-on-surface outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]" />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><label htmlFor="tenant-login-password" className="text-xs font-extrabold text-slate-700">Senha</label><span className="text-[11px] font-semibold text-slate-400">Acesso corporativo</span></div>
              <div className="group relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="tenant-login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
                  onChange={event => { setPassword(event.target.value); setLocalError('') }} placeholder="Digite sua senha"
                  className="h-14 w-full rounded-xl border border-outline-variant bg-surface pl-11 pr-12 text-sm font-medium text-on-surface outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]" />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {tenantNotFound && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-700">Este endereço não corresponde a um cliente ativo. Confirme o link com sua equipe.</div>}
            <button type="submit" disabled={busy} className="group flex h-14 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55" style={{ background: 'var(--brand-primary)' }}>
              {busy ? 'Autenticando…' : 'Entrar na central'} {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
            </button>
            {onRequestPasswordRecovery && <button type="button" onClick={() => { setRecovering(true); setLocalError('') }} className="w-full text-center text-xs font-bold text-[var(--brand-primary)]">Esqueci minha senha</button>}
          </form>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-center text-xs font-semibold leading-5 text-indigo-800">
                Sua empresa exige autenticação corporativa via SSO.
              </div>
              <button type="button" onClick={() => setBreakGlassRevealed(true)} className="w-full text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600">
                Sou administrador e preciso de acesso de emergência
              </button>
            </div>
          )}
          <div className="mt-8 border-t border-slate-200 pt-6 text-center">
            <p className="text-xs text-slate-500">Precisa de ajuda? Fale com a equipe responsável pelo seu atendimento.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
