// ============================================================
// ServiceFY — Edge Function: dispatch-channel-outbox (Outbound worker)
//
// Acionada por pg_cron a cada minuto (migration 084). Reivindica um lote
// da fila channel_outbox (claim_channel_outbox, SKIP LOCKED), envia cada
// mensagem pelo provider do canal (sendOutbound) e registra o resultado
// (complete_channel_outbox → status + channel_delivery_events).
//
// Segurança: roda com service_role; opcionalmente valida OMNICHANNEL_INTERNAL_KEY.
// Envio real por provider ainda é estrutura (retorna not_configured) até haver
// credenciais — ver _shared/omnichannel.ts.
//
// Deploy: supabase functions deploy dispatch-channel-outbox
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendOutbound, type ChannelProvider, type OutboundMessage } from '../_shared/omnichannel.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTERNAL_KEY = Deno.env.get('OMNICHANNEL_INTERNAL_KEY') ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

interface OutboxRow {
  id: string
  connection_id: string
  conversation_id: string
  company_id: string
  provider: ChannelProvider
  vault_secret_id: string | null
  attempt_count: number
  payload: { subject?: string | null; body?: string; to?: OutboundMessage['to'] }
}

Deno.serve(async (req) => {
  // Chamado pelo cron (Bearer service_role) ou por um trigger interno com a chave.
  const authorization = req.headers.get('authorization') ?? ''
  const isServiceRole = authorization === `Bearer ${SERVICE_ROLE_KEY}`
  const isInternalCall = Boolean(INTERNAL_KEY) && req.headers.get('x-servicefy-internal-key') === INTERNAL_KEY
  if (!isServiceRole && !isInternalCall) return json({ error: 'Nao autorizado.' }, 401)

  try {
    const { data: batch, error } = await admin.rpc('claim_channel_outbox', { p_limit: 25 })
    if (error) return json({ error: error.message }, 500)

    const rows = (batch ?? []) as OutboxRow[]
    let sent = 0, failed = 0, pending = 0

    for (const row of rows) {
      try {
        const message: OutboundMessage = {
          subject: row.payload?.subject ?? null,
          body: row.payload?.body ?? '',
          to: row.payload?.to ?? {},
        }
        // O segredo real seria lido do Vault aqui quando o envio for implementado.
        const result = await sendOutbound(row.provider, message, null)

        await admin.rpc('complete_channel_outbox', {
          p_id: row.id,
          p_status: result.status,
          p_provider_event_id: result.providerEventId ?? null,
          p_error: result.error ?? null,
        })

        if (result.status === 'sent') sent++
        else if (result.status === 'failed') { failed++; pending++ }
        else failed++ // not_configured → dead_letter
      } catch (itemError) {
        // Falha isolada: marca como transitória para retry, sem derrubar o lote.
        await admin.rpc('complete_channel_outbox', {
          p_id: row.id, p_status: 'failed', p_provider_event_id: null,
          p_error: itemError instanceof Error ? itemError.message : 'erro desconhecido',
        }).catch(() => {})
        failed++
      }
    }

    return json({ claimed: rows.length, sent, failed, pending })
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'erro desconhecido' }, 500)
  }
})
