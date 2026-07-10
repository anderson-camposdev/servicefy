// ============================================================
// ServiceFY ITSM — Edge Function: run-workflow-actions (Motor de Automação)
//
// Drena public.workflow_action_queue (ações assíncronas do Motor
// de Automação: send_email, webhook, delay) a cada minuto via
// pg_cron + pg_net — mesmo padrão de agendamento já usado no
// pipeline de e-mail de saída (Migration 013), só que via cron em
// vez de disparo por INSERT (mais simples de operar/reter).
//
// Reivindica um lote atomicamente via a RPC
// workflow_claim_queue_batch (FOR UPDATE SKIP LOCKED — evita duas
// execuções sobrepostas processarem a mesma linha).
//
// send_email reaproveita exatamente a chamada Resend já escrita
// em send-ticket-notification/index.ts.
//
// Deploy: supabase functions deploy run-workflow-actions
// Agendamento (rodar uma vez, com a service_role key no Vault —
// mesmo segredo 'service_role_key' já documentado na Migration 013):
//   SELECT cron.schedule(
//     'drain-workflow-queue', '* * * * *',
//     $$ SELECT net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/run-workflow-actions',
//          headers := jsonb_build_object(
//            'Content-Type', 'application/json',
//            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1)
//          ),
//          body := '{}'::jsonb
//        ); $$
//   );
// Secrets necessários (mesmos da send-ticket-notification):
//   supabase secrets set RESEND_API_KEY=...
//   supabase secrets set OUTBOUND_FROM="ServiceFY ITSM <no-reply@seu-dominio.com>"
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_ADDRESS = Deno.env.get('OUTBOUND_FROM') ?? 'ServiceFY ITSM <no-reply@seu-dominio.com>'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

interface QueueRow {
  id: string
  company_id: string
  rule_id: string | null
  incident_id: string
  action: { type: string; params?: Record<string, string> }
  attempts: number
  max_attempts: number
}

const SYNC_ACTIONS = new Set([
  'assign_group', 'change_priority', 'change_state', 'set_field',
  'add_tag', 'send_notification', 'escalate',
])

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Substitui tokens {{variavel}} pelos dados do chamado — mesmo vocabulário
// de variáveis já exposto em WorkflowBuilder.tsx (VARIABLES_GROUPS).
function fillTemplate(template: string, incident: Record<string, unknown>, html = false): string {
  const value = (input: unknown) => html ? escapeHtml(input) : String(input ?? '')
  return template
    .replace(/\{\{chamado\.numero\}\}/g, value(incident.number))
    .replace(/\{\{chamado\.titulo\}\}/g, value(incident.short_description))
    .replace(/\{\{usuario\.nome\}\}/g, value(incident.caller_name))
    .replace(/\{\{usuario\.email\}\}/g, value(incident.caller_email))
}

async function processEmail(row: QueueRow, incident: any): Promise<{ ok: boolean; error?: string }> {
  const params = row.action.params ?? {}
  const to = fillTemplate(params.recipients ?? '', incident) || incident.caller_email
  if (!to) return { ok: false, error: 'no recipient email' }

  const subject = fillTemplate(params.subject ?? `[ServiceFY] ${incident.number}`, incident)
  const html = `<div style="font-family:system-ui,sans-serif;color:#0f172a">${fillTemplate(params.body ?? params.message ?? '', incident, true)}</div>`

  if (!RESEND_API_KEY) {
    console.warn('[run-workflow-actions] RESEND_API_KEY ausente — e-mail não enviado (dry-run).')
    return { ok: true }
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  })

  if (!resp.ok) {
    return { ok: false, error: `email provider error: ${await resp.text()}` }
  }
  return { ok: true }
}

async function processWebhook(row: QueueRow, incident: any): Promise<{ ok: boolean; error?: string }> {
  const params = row.action.params ?? {}
  if (!params.url) return { ok: false, error: 'webhook sem url' }

  try {
    const body = JSON.stringify({ incident, rule_id: row.rule_id })
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-ServiceFY-Event': 'workflow.action',
      'X-Flowfy-Event': 'workflow.action',
    }
    if (params.secret) {
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(params.secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
      )
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
      const signatureHeader = `sha256=${Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')}`
      headers['X-ServiceFY-Signature'] = signatureHeader
      headers['X-Flowfy-Signature'] = signatureHeader
    }
    const resp = await fetch(params.url, {
      method: params.method ?? 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return { ok: false, error: `webhook respondeu ${resp.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

Deno.serve(async (req) => {
  const authorization = req.headers.get('authorization') ?? ''
  if (authorization !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Nao autorizado.' }), { status: 401 })
  }

  try {
    const { data: batch, error: claimErr } = await admin.rpc('workflow_claim_queue_batch', { p_limit: 50 })
    if (claimErr) {
      return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 })
    }

    const rows = (batch ?? []) as QueueRow[]
    let done = 0
    let failed = 0
    let retried = 0

    for (const row of rows) {
      const { data: incident } = await admin
        .from('incidents')
        .select('id, number, short_description, caller_name, caller_id, company_id')
        .eq('id', row.incident_id)
        .maybeSingle()

      let caller_email: string | null = null
      if (incident?.caller_id) {
        const { data: profile } = await admin.from('profiles').select('email').eq('id', incident.caller_id).maybeSingle()
        caller_email = profile?.email ?? null
      }
      const incidentWithEmail = { ...incident, caller_email }

      let result: { ok: boolean; error?: string }
      if (!incident) {
        result = { ok: false, error: 'incident not found' }
      } else if (row.action.type === 'send_email') {
        result = await processEmail(row, incidentWithEmail)
      } else if (row.action.type === 'webhook') {
        result = await processWebhook(row, incidentWithEmail)
      } else if (SYNC_ACTIONS.has(row.action.type)) {
        const { error } = await admin.rpc('workflow_run_queued_sync', { p_queue_id: row.id })
        result = error ? { ok: false, error: error.message } : { ok: true }
      } else if (row.action.type === 'delay') {
        // Compatibilidade com itens criados pela migration 058. A migration
        // 073 não enfileira mais o delay; ela agenda as ações subsequentes.
        result = { ok: true }
      } else {
        result = { ok: false, error: `unknown action type: ${row.action.type}` }
      }

      const logStatus = result.ok ? 'success' : 'error'
      const logSummary = result.ok ? `Ação ${row.action.type} executada.` : `Falha em ${row.action.type}: ${result.error}`

      if (result.ok) {
        await admin.from('workflow_action_queue').update({ status: 'done', processed_at: new Date().toISOString(), claimed_at: null }).eq('id', row.id)
        done++
      } else {
        const attempts = row.attempts + 1
        if (attempts >= row.max_attempts) {
          await admin.from('workflow_action_queue').update({
            status: 'failed', attempts, last_error: result.error, processed_at: new Date().toISOString(), claimed_at: null,
          }).eq('id', row.id)
          failed++
        } else {
          // Backoff linear: 2min * tentativas.
          const runAfter = new Date(Date.now() + attempts * 2 * 60_000).toISOString()
          await admin.from('workflow_action_queue').update({
            status: 'pending', attempts, last_error: result.error, run_after: runAfter, claimed_at: null,
          }).eq('id', row.id)
          retried++
        }
      }

      await admin.from('workflow_execution_log').insert({
        company_id: row.company_id,
        rule_id: row.rule_id,
        rule_name: 'Ação assíncrona',
        incident_id: row.incident_id,
        incident_number: incident?.number ?? null,
        trigger_event: 'async_action',
        matched: true,
        status: logStatus,
        actions_summary: logSummary,
      })
    }

    return new Response(JSON.stringify({ processed: rows.length, done, retried, failed }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
