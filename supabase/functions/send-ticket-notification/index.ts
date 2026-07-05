// ============================================================
// ServiceFY ITSM — Edge Function: send-ticket-notification (Outbound)
//
// Disparada pelo trigger trg_notify_ticket_message (migration 013)
// quando um analista insere um comentário PÚBLICO. Envia e-mail ao
// solicitante com a tag estruturada no assunto e Reply-To apontando
// para o webhook de entrada (loop bidirecional).
//
// Deploy: supabase functions deploy send-ticket-notification
// Secrets necessários:
//   supabase secrets set RESEND_API_KEY=...   (ou SENDGRID_API_KEY)
//   supabase secrets set INBOUND_REPLY_TO=chamados@seu-dominio.com
//   (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no runtime)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const REPLY_TO = Deno.env.get('INBOUND_REPLY_TO') ?? 'chamados@seu-dominio.com'
const FROM_ADDRESS = Deno.env.get('OUTBOUND_FROM') ?? 'ServiceFY ITSM <no-reply@seu-dominio.com>'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record ?? payload // suporta Database Webhook { record } ou body direto

    if (!record?.incident_id || record.actor_type !== 'analyst' || record.is_internal) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    // 1) Buscar o incidente (número + solicitante)
    const { data: incident, error: incErr } = await admin
      .from('incidents')
      .select('id, number, short_description, caller_id, caller_name, company_id')
      .eq('id', record.incident_id)
      .single()
    if (incErr || !incident) {
      return new Response(JSON.stringify({ error: 'incident not found' }), { status: 404 })
    }

    // 2) Resolver e-mail do solicitante (via profile)
    let toEmail: string | null = null
    if (incident.caller_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', incident.caller_id)
        .maybeSingle()
      toEmail = profile?.email ?? null
    }
    if (!toEmail) {
      return new Response(JSON.stringify({ skipped: 'no requester email' }), { status: 200 })
    }

    // 3) Montar o e-mail — a TAG no assunto é o que fecha o loop de entrada.
    const subject = `[ServiceFY] Atualização no Chamado #${incident.number}`
    const html = `
      <div style="font-family:system-ui,sans-serif;color:#0f172a">
        <p>Olá ${incident.caller_name ?? ''},</p>
        <p>Há uma nova atualização no seu chamado <b>#${incident.number}</b> — "${incident.short_description}":</p>
        <blockquote style="border-left:3px solid #6366f1;margin:12px 0;padding:8px 12px;background:#f8fafc">
          ${record.body}
        </blockquote>
        <p style="color:#64748b;font-size:13px">Responda este e-mail para falar com o analista. Mantenha a tag <b>#${incident.number}</b> no assunto.</p>
      </div>`

    // 4) Enviar via Resend (placeholder — troque pelo provedor escolhido)
    if (!RESEND_API_KEY) {
      console.warn('[send-ticket-notification] RESEND_API_KEY ausente — e-mail não enviado (dry-run).')
      return new Response(JSON.stringify({ dryRun: true, to: toEmail, subject }), { status: 200 })
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        reply_to: REPLY_TO, // respostas voltam para o webhook de entrada
        subject,
        html,
      }),
    })

    if (!resp.ok) {
      const detail = await resp.text()
      return new Response(JSON.stringify({ error: 'email provider error', detail }), { status: 502 })
    }

    return new Response(JSON.stringify({ sent: true, to: toEmail }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
