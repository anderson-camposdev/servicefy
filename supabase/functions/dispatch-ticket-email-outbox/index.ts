import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.10.1'
import {
  escapeHtml,
  renderTenantTemplate,
} from '../_shared/notification-template-renderer.mjs'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTERNAL_KEY = Deno.env.get('TICKET_EMAIL_WORKER_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_API_URL = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com/emails'
const GLOBAL_FROM_ADDRESS = Deno.env.get('OUTBOUND_FROM') ?? 'ServiceFY ITSM <no-reply@seu-dominio.com>'
const GLOBAL_REPLY_TO = Deno.env.get('INBOUND_REPLY_TO') ?? ''
const SMTP_TIMEOUT_MS = 10_000

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

type Transport = 'tenant_smtp' | 'global_smtp' | 'none'

interface OutboxRow {
  id: string
  company_id: string
  ticket_id: string
  event_type: string
  recipient_email: string
  payload: Record<string, unknown>
  attempt_count: number
}

interface SmtpSettings {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  from_email: string
  from_name: string
  encryption_type: 'tls' | 'ssl' | 'none'
}

interface DeliveryResult {
  ok: boolean
  error?: string
  permanent?: boolean
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

const isPrivateHost = (host: string) => {
  const normalized = host.trim().toLowerCase().replace(/[[\]]/g, '')
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.local')
    || /^10\./.test(normalized)
    || /^192\.168\./.test(normalized)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
}

function classifySmtpError(cause: unknown): DeliveryResult {
  const error = cause as { code?: string; responseCode?: number }
  if (error?.code === 'EAUTH' || error?.responseCode === 535) {
    return { ok: false, permanent: true, error: 'Autenticacao SMTP recusada.' }
  }
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET' || error?.code === 'ECONNREFUSED') {
    return { ok: false, permanent: false, error: 'Servidor SMTP indisponivel temporariamente.' }
  }
  return { ok: false, permanent: false, error: 'Falha de comunicacao com o servidor SMTP.' }
}

const EVENT_LABEL: Record<string, string> = {
  ticket_opened: 'Novo chamado registrado',
  status_changed: 'Status do chamado atualizado',
  assignment_changed: 'Chamado atribuido a voce',
  ticket_closed: 'Chamado fechado',
  public_comment: 'Nova atualizacao no chamado',
}

/**
 * Texto embutido, usado quando o tenant não tem template para o evento
 * (removido, desabilitado, ou empresa criada antes da migration 183).
 * Notificação nunca deve deixar de sair por falta de configuração.
 */
function renderDefault(row: OutboxRow, isFallback: boolean) {
  const ticketNumber = escapeHtml(row.payload.ticket_number)
  const description = escapeHtml(row.payload.short_description)
  const state = escapeHtml(row.payload.state)
  const callerName = escapeHtml(row.payload.caller_name)
  const label = EVENT_LABEL[row.event_type] ?? 'Atualizacao de chamado'
  const comment = row.event_type === 'public_comment'
    ? `<blockquote style="border-left:3px solid #4f46e5;margin:12px 0;padding:8px 12px;background:#f8fafc">${escapeHtml(row.payload.comment_body)}</blockquote>`
    : ''
  const fallbackFooter = isFallback
    ? '<p style="color:#64748b;font-size:12px">Esta notificacao foi entregue pelo canal de contingencia do ServiceFY.</p>'
    : ''
  return {
    subject: `[ServiceFY] ${label} #${ticketNumber}`,
    html: `<div style="font-family:system-ui,sans-serif;color:#0f172a"><p>Ola ${callerName},</p><p><strong>${label}</strong></p><p>Chamado <strong>#${ticketNumber}</strong>: ${description}</p><p>Status atual: ${state}</p>${comment}${fallbackFooter}</div>`,
  }
}

async function renderMessage(row: OutboxRow, isFallback = false) {
  const fallback = renderDefault(row, isFallback)
  const { data: template, error } = await admin
    .from('notification_templates')
    .select('subject_template, body_template')
    .eq('company_id', row.company_id)
    .eq('key', row.event_type)
    .eq('channel', 'email')
    .eq('locale', 'pt-BR')
    .eq('enabled', true)
    .maybeSingle()

  if (error) {
    console.error('notification_template_lookup_failed', {
      company_id: row.company_id,
      event_type: row.event_type,
      error_code: error.code,
    })
  }
  if (!template?.body_template?.trim()) return fallback

  const fallbackFooter = isFallback
    ? '<p style="color:#64748b;font-size:12px">Esta notificacao foi entregue pelo canal de contingencia do ServiceFY.</p>'
    : ''

  return renderTenantTemplate(template, row.payload, {
    fallbackSubject: fallback.subject,
    fallbackFooter,
  })
}

async function loadTenantSmtp(companyId: string): Promise<{ settings: SmtpSettings; password: string } | null> {
  const { data } = await admin.rpc('get_tenant_smtp_delivery_credential', {
    p_company_id: companyId,
  })
  const credential = (data as Array<SmtpSettings & { smtp_password?: string }> | null)?.[0]
  if (!credential || isPrivateHost(credential.smtp_host)) return null

  const { smtp_password: password, ...settings } = credential
  if (!password) return null
  return { settings, password }
}

async function sendViaTenant(row: OutboxRow, smtp: { settings: SmtpSettings; password: string }): Promise<DeliveryResult> {
  try {
    const transport = nodemailer.createTransport({
      host: smtp.settings.smtp_host,
      port: smtp.settings.smtp_port,
      secure: smtp.settings.encryption_type === 'ssl',
      requireTLS: smtp.settings.encryption_type === 'tls',
      auth: { user: smtp.settings.smtp_user, pass: smtp.password },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    })
    const message = await renderMessage(row)
    await transport.sendMail({
      from: `${smtp.settings.from_name} <${smtp.settings.from_email}>`,
      to: row.recipient_email,
      subject: message.subject,
      html: message.html,
    })
    transport.close()
    return { ok: true }
  } catch (cause) {
    return classifySmtpError(cause)
  }
}

async function sendViaGlobalFallback(row: OutboxRow): Promise<DeliveryResult> {
  if (!RESEND_API_KEY) return { ok: false, permanent: true, error: 'Provedor global de e-mail nao configurado.' }
  try {
    const message = await renderMessage(row, true)
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: GLOBAL_FROM_ADDRESS,
        to: [row.recipient_email],
        reply_to: GLOBAL_REPLY_TO || undefined,
        subject: message.subject,
        html: message.html,
      }),
      signal: AbortSignal.timeout(SMTP_TIMEOUT_MS),
    })
    if (response.ok) return { ok: true }
    return { ok: false, permanent: response.status >= 400 && response.status < 500, error: 'Provedor global recusou a notificacao.' }
  } catch {
    return { ok: false, permanent: false, error: 'Provedor global indisponivel temporariamente.' }
  }
}

async function complete(outboxId: string, outcome: string, transport: Transport, error?: string) {
  await admin.rpc('complete_ticket_email_delivery', {
    p_outbox_id: outboxId,
    p_outcome: outcome,
    p_transport: transport,
    p_error: error ?? null,
  })
}

Deno.serve(async (request) => {
  const authorization = request.headers.get('authorization') ?? ''
  const isServiceRole = authorization === `Bearer ${SERVICE_ROLE_KEY}`
  const isInternalCall = Boolean(INTERNAL_KEY) && request.headers.get('x-servicefy-internal-key') === INTERNAL_KEY
  if (!isServiceRole && !isInternalCall) return json({ error: 'Nao autorizado.' }, 401)

  try {
    const { data, error } = await admin.rpc('claim_ticket_email_outbox', { p_limit: 25 })
    if (error) return json({ error: 'Nao foi possivel reivindicar a outbox.' }, 500)

    const rows = (data ?? []) as OutboxRow[]
    let sent = 0
    let retried = 0
    let deadLetter = 0

    for (const row of rows) {
      const { data: policy } = await admin
        .from('tenant_email_delivery_policies')
        .select('allow_global_fallback')
        .eq('company_id', row.company_id)
        .eq('event_type', row.event_type)
        .maybeSingle()
      const fallbackAllowed = policy?.allow_global_fallback === true
      const smtp = await loadTenantSmtp(row.company_id)
      const tenantResult = smtp
        ? await sendViaTenant(row, smtp)
        : { ok: false, permanent: true, error: 'SMTP do tenant nao configurado ou requer rotacao de credencial.' }

      if (tenantResult.ok) {
        await complete(row.id, 'sent', 'tenant_smtp')
        sent++
        continue
      }

      await complete(row.id, 'tenant_failed', smtp ? 'tenant_smtp' : 'none', tenantResult.error)

      if (fallbackAllowed) {
        const fallbackResult = await sendViaGlobalFallback(row)
        if (fallbackResult.ok) {
          await complete(row.id, 'fallback_sent', 'global_smtp')
          sent++
        } else if (fallbackResult.permanent) {
          await complete(row.id, 'dead_letter', 'global_smtp', fallbackResult.error)
          deadLetter++
        } else {
          await complete(row.id, 'retry_scheduled', 'global_smtp', fallbackResult.error)
          retried++
        }
      } else if (tenantResult.permanent) {
        await complete(row.id, 'dead_letter', smtp ? 'tenant_smtp' : 'none', tenantResult.error)
        deadLetter++
      } else {
        await complete(row.id, 'retry_scheduled', smtp ? 'tenant_smtp' : 'none', tenantResult.error)
        retried++
      }
    }

    return json({ claimed: rows.length, sent, retried, dead_letter: deadLetter })
  } catch {
    return json({ error: 'Falha inesperada no worker de e-mail.' }, 500)
  }
})
