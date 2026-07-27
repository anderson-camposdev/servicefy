// ============================================================
// ServiceFY ITSM — Edge Function: inbound-email
// (Fase 24: Motor Inbound de Email-to-Ticket — estilo SendGrid Inbound Parse)
//
// Adaptador fino: NÃO recria o motor de criação de tickets — traduz o
// payload de um provedor de push webhook (SendGrid/Postmark/Mailgun
// Inbound Parse) para o formato que omnichannel-gateway/normalizeEmail já
// esperam (provider='imap_smtp') e delega via x-servicefy-internal-key.
// O roteamento domínio→tenant (channel_routes match_type='domain') e a
// ramificação "novo ticket vs. comentário em ticket existente"
// (materialize_channel_message, via continuidade de conversation_id) já
// existem — não são reimplementados aqui.
//
// Blindagem contra e-mail forjado, em 3 camadas (ver commit para a análise
// completa):
//   1) Segredo compartilhado na URL/header — prova que a requisição veio do
//      relay configurado, não de um atacante que descobriu o endpoint.
//      SendGrid Inbound Parse não assina o payload por padrão.
//   2) Verificação de SPF do remetente (campo `spf` do payload do SendGrid,
//      calculado pelo próprio SendGrid a partir do envelope SMTP real) —
//      rejeita quando não é exatamente "pass". Sem isso, qualquer um poderia
//      alegar um domínio de tenant real no cabeçalho From: (falsificável
//      trivialmente) e a checagem de domínio abaixo aceitaria cegamente.
//   3) Resolução do e-mail de destino (to) para uma channel_connection
//      cadastrada e habilitada — se não houver, a requisição é rejeitada
//      antes mesmo de chegar ao gateway (nenhum tenant "adivinhado").
//
// Deploy: supabase functions deploy inbound-email
// Configure a "Destination URL" do Inbound Parse do provedor para:
//   https://<ref>.supabase.co/functions/v1/inbound-email?key=<INBOUND_PARSE_WEBHOOK_KEY>
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OMNICHANNEL_INTERNAL_KEY = Deno.env.get('OMNICHANNEL_INTERNAL_KEY') ?? ''
const OMNICHANNEL_URL = Deno.env.get('OMNICHANNEL_URL') ?? (SUPABASE_URL + '/functions/v1/omnichannel-gateway')
const INBOUND_PARSE_WEBHOOK_KEY = Deno.env.get('INBOUND_PARSE_WEBHOOK_KEY') ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  if (a.length !== b.length || a.length === 0) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

function extractEmail(raw: string): string | null {
  const match = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  return match ? match[0].toLowerCase() : null
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@')
  return at === -1 ? null : email.slice(at + 1).toLowerCase()
}

interface InboundParsePayload {
  to: string
  from: string
  subject: string
  text: string
  html: string
  envelopeFrom: string | null
  spf: string | null
  headers: string
}

/** Aceita multipart/form-data (SendGrid real) e application/json (testes/outros provedores). */
async function parsePayload(req: Request): Promise<InboundParsePayload> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData()
    const get = (key: string): string => String(form.get(key) ?? '')
    let envelopeFrom: string | null = null
    const envelopeRaw = get('envelope')
    if (envelopeRaw) {
      try { envelopeFrom = extractEmail(String(JSON.parse(envelopeRaw)?.from ?? '')) } catch { envelopeFrom = null }
    }
    return {
      to: get('to'), from: get('from'), subject: get('subject'),
      text: get('text'), html: get('html'),
      envelopeFrom, spf: get('spf') || null, headers: get('headers'),
    }
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>
  const envelope = body.envelope as { from?: string } | undefined
  return {
    to: String(body.to ?? ''), from: String(body.from ?? ''), subject: String(body.subject ?? ''),
    text: String(body.text ?? ''), html: String(body.html ?? ''),
    envelopeFrom: envelope?.from ? extractEmail(String(envelope.from)) : null,
    spf: body.spf ? String(body.spf) : null,
    headers: String(body.headers ?? ''),
  }
}

function headerValue(rawHeaders: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const match = rawHeaders.match(re)
  return match ? match[1].trim() : null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 })
  }

  // ── Camada 1: segredo compartilhado (prova que veio do relay configurado) ──
  const url = new URL(req.url)
  const suppliedKey = url.searchParams.get('key') ?? req.headers.get('x-servicefy-webhook-key') ?? ''
  if (!INBOUND_PARSE_WEBHOOK_KEY || !timingSafeEqual(suppliedKey, INBOUND_PARSE_WEBHOOK_KEY)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  let payload: InboundParsePayload
  try {
    payload = await parsePayload(req)
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400 })
  }

  const toEmail = extractEmail(payload.to)
  const fromEmail = extractEmail(payload.from)
  if (!toEmail || !fromEmail) {
    return new Response(JSON.stringify({ error: 'missing_to_or_from' }), { status: 400 })
  }

  // ── Camada 2: SPF do remetente real (envelope), não do header From: exibido ──
  // Fail-closed de propósito: sem veredito SPF explícito de "pass", rejeita.
  // (Requer "Spam Check"/SPF habilitado nas configurações de Inbound Parse do
  // provedor — documentado no deploy; preferir rejeitar a aceitar sem prova.)
  const spfSubjectDomain = domainOf(payload.envelopeFrom ?? fromEmail)
  if (payload.spf?.toLowerCase() !== 'pass') {
    return new Response(JSON.stringify({ error: 'spf_verification_failed', domain: spfSubjectDomain }), { status: 403 })
  }

  // ── Camada 3: e-mail de destino precisa mapear para uma conexão real ──────
  // ilike com '_'/'%' escapados — toEmail vem de regex, mas '_' é caractere
  // válido em local-part de e-mail e é wildcard de um-caractere no ILIKE.
  const escapedToEmail = toEmail.replace(/[%_]/g, char => `\\${char}`)
  // Inclui 'monitoring': a caixa que recebe alerta de Zabbix/PRTG é uma
  // conexão de Monitoramento, não de e-mail de cliente — o que muda é a
  // normalização (correlação pelo gatilho), não o transporte.
  const { data: connection, error: connectionError } = await admin
    .from('channel_connections')
    .select('id, company_id, provider, enabled')
    .in('provider', ['imap_smtp', 'monitoring'])
    .ilike('address', escapedToEmail)
    .eq('enabled', true)
    .maybeSingle()
  if (connectionError || !connection) {
    return new Response(JSON.stringify({ error: 'unknown_destination_mailbox' }), { status: 403 })
  }

  // Tradução para o formato que normalizeEmail(provider='imap_smtp') já espera.
  const messageId = headerValue(payload.headers, 'Message-ID')
    ?? `inbound-parse-${crypto.randomUUID()}`
  const emailShaped = {
    message_id: messageId,
    from: payload.from,
    to: [payload.to],
    subject: payload.subject,
    text: payload.text,
    html: payload.html || undefined,
    'in-reply-to': headerValue(payload.headers, 'In-Reply-To') ?? undefined,
    references: headerValue(payload.headers, 'References') ?? undefined,
    date: new Date().toISOString(),
  }

  if (!OMNICHANNEL_INTERNAL_KEY) {
    return new Response(JSON.stringify({ error: 'gateway_not_configured' }), { status: 503 })
  }

  const gatewayResponse = await fetch(OMNICHANNEL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-servicefy-internal-key': OMNICHANNEL_INTERNAL_KEY,
      'x-servicefy-provider': connection.provider,
      'x-servicefy-connection-id': connection.id,
    },
    body: JSON.stringify(emailShaped),
  })

  const gatewayBody = await gatewayResponse.text()
  return new Response(gatewayBody, {
    status: gatewayResponse.status,
    headers: { 'content-type': 'application/json' },
  })
})
