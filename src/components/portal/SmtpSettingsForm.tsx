import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, Lock, Save, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SMTP_ENCRYPTION_TYPES, testSmtpConnection, type SmtpEncryptionType } from '../../lib/smtp'

interface SmtpSettingsFormProps {
  companyId: string
  /** Verificação da feature 'custom_smtp' ainda em andamento (RPC check_tenant_feature_access). */
  checkingAccess: boolean
  /** Resultado da verificação: tenant tem a feature 'custom_smtp' ativa no plano. */
  hasCustomSmtpAccess: boolean
  /** Mensagem de erro da checagem de acesso (falha de rede/RPC), distinta de "sem acesso". */
  accessCheckError: string
}

interface SmtpFormState {
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPassword: string
  fromEmail: string
  fromName: string
  encryptionType: SmtpEncryptionType
}

const EMPTY_FORM: SmtpFormState = {
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPassword: '',
  fromEmail: '',
  fromName: '',
  encryptionType: 'tls',
}

export function SmtpSettingsForm({ companyId, checkingAccess, hasCustomSmtpAccess, accessCheckError }: SmtpSettingsFormProps) {
  const [form, setForm] = useState<SmtpFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [smtpConnectionValidated, setSmtpConnectionValidated] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    // Sem acesso à feature (ou checagem ainda em andamento): não busca as
    // configurações — evita uma chamada desnecessária e mantém a tela em
    // estado de bloqueio até a checagem resolver.
    if (checkingAccess || !hasCustomSmtpAccess) {
      setLoading(false)
      return
    }

    const loadSettings = async () => {
      setLoading(true)
      setError('')
      const { data, error: loadError } = await supabase
        .from('tenant_smtp_settings')
        .select('smtp_host,smtp_port,smtp_user,from_email,from_name,encryption_type')
        .eq('company_id', companyId)
        .maybeSingle()

      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
      } else if (data) {
        setForm({
          smtpHost: data.smtp_host ?? '',
          smtpPort: String(data.smtp_port ?? 587),
          smtpUser: data.smtp_user ?? '',
          smtpPassword: '',
          fromEmail: data.from_email ?? '',
          fromName: data.from_name ?? '',
          encryptionType: (SMTP_ENCRYPTION_TYPES as readonly string[]).includes(data.encryption_type)
            ? data.encryption_type as SmtpFormState['encryptionType']
            : 'tls',
        })
      }
      setLoading(false)
    }

    void loadSettings()
    return () => { cancelled = true }
  }, [companyId, checkingAccess, hasCustomSmtpAccess])

  const setField = <K extends keyof SmtpFormState>(field: K, value: SmtpFormState[K]) => {
    setForm(current => ({ ...current, [field]: value }))
    setSmtpConnectionValidated(false)
    setSuccess('')
    setError('')
  }

  const save = async () => {
    if (!smtpConnectionValidated) {
      setError('Teste a conexão SMTP antes de salvar as configurações.')
      return
    }

    if (!form.smtpPassword) {
      setError('Informe a senha para salvar as configurações.')
      return
    }

    const port = Number(form.smtpPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('Informe uma porta SMTP válida entre 1 e 65535.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    const { error: saveError } = await supabase.rpc('save_tenant_smtp_settings', {
      p_company_id: companyId,
      p_smtp_host: form.smtpHost.trim(),
      p_smtp_port: port,
      p_smtp_user: form.smtpUser.trim(),
      p_from_email: form.fromEmail.trim(),
      p_from_name: form.fromName.trim(),
      p_encryption_type: form.encryptionType,
      p_password: form.smtpPassword,
    })
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }
    setForm(current => ({ ...current, smtpPassword: '' }))
    setPasswordVisible(false)
    setSuccess('Configurações SMTP salvas.')
  }

  const testConnection = async () => {
    if (!form.smtpPassword) {
      setError('Informe a senha para testar a conexão.')
      return
    }

    const port = Number(form.smtpPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('Informe uma porta SMTP válida entre 1 e 65535.')
      return
    }

    setTesting(true)
    setSmtpConnectionValidated(false)
    setError('')
    setSuccess('')
    try {
      await testSmtpConnection({
        companyId,
        host: form.smtpHost.trim(),
        port,
        user: form.smtpUser.trim(),
        password: form.smtpPassword,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim(),
        encryptionType: form.encryptionType,
      })
      setSmtpConnectionValidated(true)
      setSuccess('Conexão estabelecida com sucesso. E-mail de teste enviado.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na conexão SMTP.')
    } finally {
      setTesting(false)
    }
  }

  const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50'

  if (checkingAccess) {
    return <div className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Verificando plano do tenant...</div>
  }

  if (accessCheckError) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">
        Não foi possível verificar o acesso a este recurso: {accessCheckError}
      </section>
    )
  }

  if (!hasCustomSmtpAccess) {
    return (
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
          <Lock className="h-6 w-6 text-indigo-600" />
        </div>
        <h2 className="mt-4 text-lg font-extrabold text-slate-900">Recurso Premium</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          O SMTP customizado por tenant não está disponível no plano atual deste cliente.
          Faça o upgrade do plano para liberar o envio de e-mails pelo próprio servidor SMTP.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white opacity-90">
          <Sparkles className="h-4 w-4" /> Faça o upgrade do seu plano
        </div>
      </section>
    )
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações SMTP...</div>
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-extrabold text-slate-900">SMTP customizado</h2>
        <p className="mt-1 text-sm text-slate-500">Configure o servidor de envio deste tenant. A senha nunca é carregada de volta.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Host
          <input aria-label="Host" value={form.smtpHost} onChange={event => setField('smtpHost', event.target.value)} className={inputClass} disabled={saving || testing} required />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Porta
          <input aria-label="Porta" type="number" min="1" max="65535" value={form.smtpPort} onChange={event => setField('smtpPort', event.target.value)} className={inputClass} disabled={saving || testing} required />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Usuário
          <input aria-label="Usuário" value={form.smtpUser} onChange={event => setField('smtpUser', event.target.value)} className={inputClass} disabled={saving || testing} required />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Senha
          <span className="relative mt-1 block">
            <input aria-label="Senha" type={passwordVisible ? 'text' : 'password'} value={form.smtpPassword} onChange={event => setField('smtpPassword', event.target.value)} className={`${inputClass} pr-11`} autoComplete="new-password" disabled={saving || testing} required />
            <button type="button" aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setPasswordVisible(current => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" disabled={saving || testing}>
              {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">E-mail de Origem
          <input aria-label="E-mail de Origem" type="email" value={form.fromEmail} onChange={event => setField('fromEmail', event.target.value)} className={inputClass} disabled={saving || testing} required />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome de Origem
          <input aria-label="Nome de Origem" value={form.fromName} onChange={event => setField('fromName', event.target.value)} className={inputClass} disabled={saving || testing} required />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500 md:col-span-2">Tipo de Criptografia
          <select aria-label="Tipo de Criptografia" value={form.encryptionType} onChange={event => setField('encryptionType', event.target.value as SmtpEncryptionType)} className={inputClass} disabled={saving || testing}>
            {SMTP_ENCRYPTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
        <button type="button" aria-label="Testar Conexão" onClick={() => void testConnection()} disabled={saving || testing} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {testing ? 'Testando conexão...' : 'Testar Conexão'}
        </button>
        <button type="button" aria-label="Salvar configurações SMTP" onClick={() => void save()} disabled={saving || testing || !smtpConnectionValidated} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configurações
        </button>
      </div>
    </section>
  )
}
