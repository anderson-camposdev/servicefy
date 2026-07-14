// ============================================================
// ServiceFY ITSM — Edge Function: webhook-dispatcher (Fase 25)
//
// Drena public.webhook_events_queue (INSERT/UPDATE em tickets → eventos
// 'ticket.created'/'ticket.resolved') a cada minuto via pg_cron + pg_net —
// mesmo padrão de agendamento já usado em run-workflow-actions.
//
// Reivindica um lote atomicamente via webhook_claim_queue_batch (FOR UPDATE
// SKIP LOCKED — evita duas execuções sobrepostas processarem a mesma
// linha). Diferente de run-workflow-actions (loop sequencial), este
// dispatcher processa o lote em PARALELO via Promise.allSettled — um
// endpoint lento de um tenant nunca atrasa a entrega dos demais.
//
// Assinatura HMAC-SHA256 por webhook (segredo em Vault, resolvido via
// get_webhook_signing_secret — só service_role); disjuntor via
// record_webhook_delivery_result desativa a assinatura após muitas falhas
// consecutivas.
//
// Deploy: supabase functions deploy webhook-dispatcher
// Agendamento (mesmo padrão de run-workflow-actions):
//   SELECT cron.schedule(
//     'drain-webhook-queue', '* * * * *',
//     $$ SELECT net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/webhook-dispatcher',
//          headers := jsonb_build_object(
//            'Content-Type', 'application/json',
//            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1)
//          ),
//          body := '{}'::jsonb
//        ); $$
//   );
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isBlockedTarget } from '../_shared/ssrf-guard.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FAILURE_THRESHOLD = Number(Deno.env.get('WEBHOOK_FAILURE_THRESHOLD') ?? '10')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

interface QueueRow {
  id: string
  company_id: string
  webhook_id: string
  event_type: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

interface DeliveryOutcome {
  ok: boolean
  error?: string
}

async function signPayload(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `sha256=${Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')}`
}

async function deliver(row: QueueRow): Promise<DeliveryOutcome> {
  const { data: credential, error: credentialError } = await admin
    .rpc('get_webhook_signing_secret', { p_webhook_id: row.webhook_id })
    .single()
  if (credentialError || !credential) {
    return { ok: false, error: 'webhook não encontrado ou sem credencial' }
  }
  const { target_url: targetUrl, signing_secret: signingSecret } = credential as { target_url: string; signing_secret: string | null }

  if (isBlockedTarget(targetUrl)) {
    return { ok: false, error: 'destino bloqueado (guarda de SSRF de linha de base)' }
  }

  const body = JSON.stringify({
    event: row.event_type,
    company_id: row.company_id,
    data: row.payload,
    delivered_at: new Date().toISOString(),
  })

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-servicefy-event': row.event_type,
  }
  if (signingSecret) {
    headers['x-servicefy-signature'] = await signPayload(signingSecret, body)
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return { ok: false, error: `endpoint respondeu ${response.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function processRow(row: QueueRow): Promise<{ id: string; outcome: DeliveryOutcome }> {
  const outcome = await deliver(row)
  return { id: row.id, outcome }
}

Deno.serve(async (req) => {
  const authorization = req.headers.get('authorization') ?? ''
  if (authorization !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Nao autorizado.' }), { status: 401 })
  }

  try {
    const { data: batch, error: claimError } = await admin.rpc('webhook_claim_queue_batch', { p_limit: 50 })
    if (claimError) {
      return new Response(JSON.stringify({ error: claimError.message }), { status: 500 })
    }

    const rows = (batch ?? []) as QueueRow[]
    // Despacho em paralelo — um endpoint lento de um tenant não atrasa a
    // entrega dos demais (diferente do loop sequencial de
    // run-workflow-actions, deliberado para este caso de uso).
    const results = await Promise.allSettled(rows.map(processRow))

    let done = 0, failed = 0, retried = 0

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const settled = results[index]
      const outcome: DeliveryOutcome = settled.status === 'fulfilled'
        ? settled.value.outcome
        : { ok: false, error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) }

      await admin.rpc('record_webhook_delivery_result', {
        p_webhook_id: row.webhook_id,
        p_success: outcome.ok,
        p_failure_threshold: FAILURE_THRESHOLD,
      })

      if (outcome.ok) {
        await admin.from('webhook_events_queue').update({
          status: 'done', processed_at: new Date().toISOString(), claimed_at: null,
        }).eq('id', row.id)
        done++
      } else {
        const attempts = row.attempts + 1
        if (attempts >= row.max_attempts) {
          await admin.from('webhook_events_queue').update({
            status: 'failed', attempts, last_error: outcome.error, processed_at: new Date().toISOString(), claimed_at: null,
          }).eq('id', row.id)
          failed++
        } else {
          // Backoff linear: 2min * tentativas — mesmo ritmo de run-workflow-actions.
          const runAfter = new Date(Date.now() + attempts * 2 * 60_000).toISOString()
          await admin.from('webhook_events_queue').update({
            status: 'pending', attempts, last_error: outcome.error, run_after: runAfter, claimed_at: null,
          }).eq('id', row.id)
          retried++
        }
      }
    }

    return new Response(JSON.stringify({ processed: rows.length, done, retried, failed }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 })
  }
})
