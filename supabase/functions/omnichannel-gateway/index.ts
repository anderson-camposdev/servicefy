import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeInbound, routeValues, type ChannelProvider, type NormalizedInboundEvent } from '../_shared/omnichannel.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTERNAL_KEY = Deno.env.get('OMNICHANNEL_INTERNAL_KEY') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const chooseCompany = async (
  connection: { id: string; company_id: string; scope: 'tenant' | 'provider' },
  event: NormalizedInboundEvent,
): Promise<string | null> => {
  if (connection.scope === 'tenant') return connection.company_id
  const { data: routes } = await admin
    .from('channel_routes')
    .select('target_company_id,match_type,match_value,priority')
    .eq('connection_id', connection.id)
    .eq('enabled', true)
    .order('priority')

  const values = routeValues(event)
  const matches = (routes ?? []).filter(route => {
    if (route.match_type === 'default') return true
    const expected = String(route.match_value ?? '').toLowerCase()
    if (route.match_type === 'domain') return values.some(value => value.endsWith('@' + expected) || value === expected)
    return values.includes(expected)
  })
  const exact = matches.filter(route => route.match_type !== 'default')
  if (new Set(exact.map(route => route.target_company_id)).size > 1) return null
  return exact[0]?.target_company_id ?? matches.find(route => route.match_type === 'default')?.target_company_id ?? null
}

const upsertIdentity = async (companyId: string, event: NormalizedInboundEvent): Promise<string> => {
  const { data, error } = await admin
    .from('external_identities')
    .upsert({
      company_id: companyId,
      provider: event.provider,
      external_id: event.sender.externalId,
      email: event.sender.email ?? null,
      phone_e164: event.sender.phone ?? null,
      display_name: event.sender.displayName ?? null,
      metadata: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,provider,external_id' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

const persistEvent = async (
  connection: { id: string; company_id: string; scope: 'tenant' | 'provider' },
  event: NormalizedInboundEvent,
) => {
  const companyId = await chooseCompany(connection, event)
  if (!companyId) {
    return { status: 'ambiguous', externalMessageId: event.externalMessageId }
  }

  const identityId = await upsertIdentity(companyId, event)
  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .upsert({
      company_id: companyId,
      connection_id: connection.id,
      external_conversation_id: event.externalConversationId,
      subject: event.subject ?? null,
      requester_identity_id: identityId,
      last_message_at: event.occurredAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'connection_id,external_conversation_id' })
    .select('id,incident_id,case_id')
    .single()
  if (conversationError) throw conversationError

  const { data: message, error: messageError } = await admin
    .from('channel_messages')
    .insert({
      company_id: companyId,
      conversation_id: conversation.id,
      connection_id: connection.id,
      external_event_id: event.externalEventId,
      external_message_id: event.externalMessageId,
      reply_to_external_id: event.replyToMessageId ?? null,
      direction: 'inbound',
      sender_identity_id: identityId,
      subject: event.subject ?? null,
      body_text: event.text,
      body_html: event.html ?? null,
      references_header: event.references,
      delivery_status: 'delivered',
      raw_payload: event.raw,
      occurred_at: event.occurredAt,
    })
    .select('id')
    .single()

  if (messageError?.code === '23505') {
    return { status: 'duplicate', externalMessageId: event.externalMessageId }
  }
  if (messageError) throw messageError

  if (event.attachments.length) {
    const { error } = await admin.from('channel_message_attachments').insert(
      event.attachments.map(attachment => ({
        company_id: companyId,
        message_id: message.id,
        external_id: attachment.externalId,
        file_name: attachment.name,
        content_type: attachment.contentType,
        size_bytes: attachment.size ?? null,
        storage_path: attachment.url ?? null,
      })),
    )
    if (error) throw error
  }

  if (conversation.incident_id && event.text) {
    await admin.from('ticket_messages').insert({
      incident_id: conversation.incident_id,
      case_id: conversation.case_id,
      company_id: companyId,
      sender_name: event.sender.displayName ?? event.sender.email ?? event.sender.phone ?? 'Canal externo',
      actor_type: 'user',
      body: event.text,
      is_internal: false,
    })
  }

  return { status: 'accepted', externalMessageId: event.externalMessageId, conversationId: conversation.id }
}

Deno.serve(async request => {
  if (request.method === 'GET') return json({ service: 'servicefy-omnichannel', ok: true })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  if (!INTERNAL_KEY || request.headers.get('x-servicefy-internal-key') !== INTERNAL_KEY) {
    return json({ error: 'unauthorized' }, 401)
  }

  const provider = request.headers.get('x-servicefy-provider') as ChannelProvider | null
  const connectionId = request.headers.get('x-servicefy-connection-id')
  if (!provider || !connectionId) return json({ error: 'missing_provider_or_connection' }, 400)

  const { data: connection, error: connectionError } = await admin
    .from('channel_connections')
    .select('id,company_id,scope,provider,enabled')
    .eq('id', connectionId)
    .single()
  if (connectionError || !connection) return json({ error: 'connection_not_found' }, 404)
  if (!connection.enabled || connection.provider !== provider) return json({ error: 'connection_disabled_or_mismatch' }, 403)

  try {
    const payload = await request.json()
    const events = normalizeInbound(provider, payload, connectionId)
    if (!events.length) return json({ accepted: 0, ignored: true }, 202)
    const results = []
    for (const event of events) results.push(await persistEvent(connection, event))
    const ambiguous = results.filter(result => result.status === 'ambiguous').length
    return json({ accepted: results.length - ambiguous, ambiguous, results }, ambiguous ? 202 : 200)
  } catch (error) {
    console.error('[omnichannel-gateway]', error)
    return json({ error: 'processing_failed' }, 500)
  }
})
