import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.10.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ENCRYPTION_TYPES = new Set(['tls', 'ssl', 'none'])
const MAX_REQUEST_BYTES = 16_384
const SMTP_TIMEOUT_MS = 10_000

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

interface SmtpTestPayload {
  companyId: string
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
  encryptionType: 'tls' | 'ssl' | 'none'
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  },
})

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const isPrivateHost = (host: string) => {
  const normalized = host.trim().toLowerCase().replace(/[\[\]]/g, '')
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.local')
    || /^10\./.test(normalized)
    || /^192\.168\./.test(normalized)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
}

const parsePayload = (payload: unknown): SmtpTestPayload | null => {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload as Record<string, unknown>
  if (typeof candidate.companyId !== 'string' || !candidate.companyId.trim()) return null
  if (typeof candidate.host !== 'string' || !candidate.host.trim() || isPrivateHost(candidate.host)) return null
  if (typeof candidate.port !== 'number' || !Number.isInteger(candidate.port) || candidate.port < 1 || candidate.port > 65_535) return null
  if (typeof candidate.user !== 'string' || !candidate.user.trim()) return null
  if (typeof candidate.password !== 'string' || !candidate.password) return null
  if (typeof candidate.fromEmail !== 'string' || !isValidEmail(candidate.fromEmail)) return null
  if (typeof candidate.fromName !== 'string' || !candidate.fromName.trim()) return null
  if (typeof candidate.encryptionType !== 'string' || !ALLOWED_ENCRYPTION_TYPES.has(candidate.encryptionType)) return null

  return {
    companyId: candidate.companyId,
    host: candidate.host.trim(),
    port: candidate.port,
    user: candidate.user,
    password: candidate.password,
    fromEmail: candidate.fromEmail.trim(),
    fromName: candidate.fromName.trim(),
    encryptionType: candidate.encryptionType as SmtpTestPayload['encryptionType'],
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }
  if (request.method !== 'POST') return json({ success: false, message: 'Método não permitido.' }, 405)
  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ success: false, message: 'Autenticação necessária.' }, 401)

  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > MAX_REQUEST_BYTES) return json({ success: false, message: 'Payload de teste inválido.' }, 413)

  try {
    const payload = parsePayload(await request.json())
    if (!payload) return json({ success: false, message: 'Informe parâmetros SMTP válidos.' }, 400)

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data: userData, error: authError } = await authClient.auth.getUser(authorization.slice(7))
    if (authError || !userData.user) return json({ success: false, message: 'Sessão inválida.' }, 401)

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('company_id')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileError || profile?.company_id !== payload.companyId) {
      return json({ success: false, message: 'Tenant não autorizado para este teste.' }, 403)
    }

    const transport = nodemailer.createTransport({
      host: payload.host,
      port: payload.port,
      secure: payload.encryptionType === 'ssl',
      requireTLS: payload.encryptionType === 'tls',
      auth: { user: payload.user, pass: payload.password },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    })

    await transport.verify()
    await transport.sendMail({
      from: `${payload.fromName} <${payload.fromEmail}>`,
      to: payload.fromEmail,
      subject: 'Teste de conexão SMTP - ServiceFY',
      text: 'Este e-mail confirma que a conexão SMTP do seu tenant foi estabelecida com sucesso.',
    })
    transport.close()

    return json({ success: true, message: 'Conexão estabelecida com sucesso. E-mail de teste enviado.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha de comunicação com o servidor SMTP.'
    console.error('[test-smtp-connection]', message)
    return json({ success: false, message: `Falha na conexão SMTP: ${message}` }, 502)
  }
})
