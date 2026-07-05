// ============================================================
// ServiceFY ITSM — Edge Function: handle-inbound-email (Inbound Loop)
//
// Endpoint do Inbound Email Webhook (Resend/SendGrid/Postmark...).
// Recebe o e-mail de resposta do solicitante, extrai o nº do chamado
// do assunto, valida o remetente e insere o comentário (actor 'user'),
// que aparece em tempo real no Cockpit via Supabase Realtime.
//
// Deploy: supabase functions deploy handle-inbound-email
// Configure o webhook de entrada do provedor para esta URL:
//   https://<ref>.supabase.co/functions/v1/handle-inbound-email
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Aceita formatos comuns de provedores de inbound email.
function parseInbound(payload: Record<string, unknown>) {
  const subject = String(payload.subject ?? payload.Subject ?? '')
  const from = String(
    payload.from ?? payload.From ?? payload.sender ?? payload.envelope_from ?? '',
  )
  const text = String(
    payload.text ?? payload['text-plain'] ?? payload.plain ?? payload.body ?? payload.html ?? '',
  )
  return { subject, from, text }
}

// Extrai apenas o e-mail de "Nome <email@x>" ou "email@x".
function extractEmail(raw: string): string | null {
  const m = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  return m ? m[0].toLowerCase() : null
}

// Remove o histórico citado, mantendo só a resposta nova.
function cleanReply(body: string): string {
  const markers = [
    /^On .*wrote:$/im,
    /^Em .*escreveu:$/im,
    /^-{2,}\s*Original Message\s*-{2,}/im,
    /^_{5,}/m,
    /^De:.*$/im,
    /^From:.*$/im,
  ]
  let cut = body.length
  for (const re of markers) {
    const m = body.match(re)
    if (m && m.index !== undefined && m.index < cut) cut = m.index
  }
  // Também corta blocos citados que começam com ">"
  const lines = body.slice(0, cut).split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (line.trim().startsWith('>')) break
    kept.push(line)
  }
  return kept.join('\n').trim()
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const { subject, from, text } = parseInbound(payload)

    // 1) Extrair o nº do chamado do assunto (fallback no corpo)
    const tag = `${subject}\n${text}`.match(/#((?:INC|REQ)\d+)/i)
    if (!tag) {
      return new Response(JSON.stringify({ error: 'ticket tag not found' }), { status: 422 })
    }
    const ticketNumber = tag[1].toUpperCase()

    // 2) Localizar o incidente pelo número
    const { data: incident, error: incErr } = await admin
      .from('incidents')
      .select('id, company_id, caller_id, caller_name')
      .eq('number', ticketNumber)
      .maybeSingle()
    if (incErr || !incident) {
      return new Response(JSON.stringify({ error: 'incident not found' }), { status: 404 })
    }

    // 3) Validar que o remetente é o solicitante real (segurança via código)
    const senderEmail = extractEmail(from)
    if (incident.caller_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', incident.caller_id)
        .maybeSingle()
      if (!senderEmail || profile?.email?.toLowerCase() !== senderEmail) {
        return new Response(JSON.stringify({ error: 'sender is not the requester' }), { status: 403 })
      }
    }

    // 4) Limpar o corpo e inserir o comentário (actor 'user')
    const cleaned = cleanReply(text)
    if (!cleaned) {
      return new Response(JSON.stringify({ skipped: 'empty body' }), { status: 200 })
    }

    const { error: insErr } = await admin.from('ticket_messages').insert({
      incident_id: incident.id,
      company_id: incident.company_id,
      sender_id: incident.caller_id,
      sender_name: incident.caller_name,
      actor_type: 'user',
      body: cleaned,
      is_internal: false,
    })
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), { status: 500 })
    }

    // Realtime entrega a nova linha ao Cockpit automaticamente.
    return new Response(JSON.stringify({ ok: true, ticket: ticketNumber }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
