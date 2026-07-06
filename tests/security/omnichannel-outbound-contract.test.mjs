import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260706220000_084_omnichannel_outbound.sql')
const shared = read('supabase/functions/_shared/omnichannel.ts')
const worker = read('supabase/functions/dispatch-channel-outbox/index.ts')
const service = read('src/lib/platform-admin-service.ts')
const center = read('src/pages/SettingsCenter.tsx')
const ui = read('src/pages/ChannelRoutingSettings.tsx')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('Enfileiramento só ocorre em resposta pública do analista e é idempotente', () => {
  assert.match(sql, /CREATE TRIGGER trg_enqueue_channel_reply\s+AFTER INSERT ON public\.ticket_messages/)
  const body = fnBody('tg_enqueue_channel_reply')
  assert.match(body, /NEW\.actor_type <> 'analyst' OR COALESCE\(NEW\.is_internal, false\) OR NEW\.incident_id IS NULL/)
  // Só enfileira para conversa de canal com conexão habilitada
  assert.match(body, /JOIN public\.channel_connections cc ON cc\.id = c\.connection_id[\s\S]*cc\.enabled/)
  // Idempotência: uma linha por ticket_message
  assert.match(sql, /uq_channel_outbox_source_message[\s\S]*source_ticket_message_id/)
  assert.match(body, /ON CONFLICT \(source_ticket_message_id\)[\s\S]*DO NOTHING/)
})

test('Worker de outbox é restrito a service_role e usa SKIP LOCKED', () => {
  const claim = fnBody('claim_channel_outbox')
  assert.match(claim, /auth\.role\(\), ''\) <> 'service_role'/)
  assert.match(claim, /FOR UPDATE SKIP LOCKED/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_channel_outbox\(integer\) FROM public, anon, authenticated/)
  const complete = fnBody('complete_channel_outbox')
  assert.match(complete, /auth\.role\(\), ''\) <> 'service_role'/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.complete_channel_outbox\(uuid, text, text, text\) FROM public, anon, authenticated/)
})

test('complete_channel_outbox faz backoff e dead_letter (sem retry infinito)', () => {
  const complete = fnBody('complete_channel_outbox')
  assert.match(complete, /v_max_attempts constant integer := 6/)
  assert.match(complete, /p_status = 'not_configured'[\s\S]*status = 'dead_letter'/)
  assert.match(complete, /next_attempt_at = now\(\) \+ \(interval '1 minute' \* power\(2, v_row\.attempt_count\)\)/)
  assert.match(complete, /attempt_count >= v_max_attempts[\s\S]*status = 'dead_letter'/)
  assert.match(complete, /INSERT INTO public\.channel_delivery_events/)
})

test('Triagem exige admin do tenant e é auditada', () => {
  const t = fnBody('resolve_channel_triage')
  assert.match(t, /p_action NOT IN \('assigned', 'discarded', 'reprocessed'\)/)
  assert.match(t, /public\.is_settings_admin\(v_row\.company_id\)/)
  assert.match(t, /public\.write_admin_audit\(\s*v_row\.company_id, 'omnichannel\.triage\.'/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.resolve_channel_triage\(uuid, text, uuid\) TO authenticated/)
})

test('Worker roda por cron chamando a edge com service_role do Vault', () => {
  assert.match(sql, /cron\.schedule\(\s*'dispatch-channel-outbox'/)
  assert.match(sql, /functions\/v1\/dispatch-channel-outbox/)
  assert.match(sql, /vault\.decrypted_secrets WHERE name = 'service_role_key'/)
})

test('Adaptadores de envio existem como estrutura e não vazam segredo', () => {
  assert.match(shared, /export const sendOutbound = async/)
  for (const p of ['whatsapp_cloud', 'microsoft_graph', 'gmail', 'microsoft_teams', 'google_chat', 'imap_smtp']) {
    assert.match(shared, new RegExp("case '" + p + "':"))
  }
  assert.match(shared, /status: 'not_configured'/)
  // Fase estrutura: o worker não manipula segredo real (passa null a sendOutbound)
  assert.match(worker, /sendOutbound\(row\.provider, message, null\)/)
})

test('Serviço tipado (sem any) e UI conectada à seção routing', () => {
  assert.doesNotMatch(service.split('platformAdminService')[1] ?? service, /:\s*any\b/)
  for (const m of ['listRoutes', 'saveRoute', 'deleteRoute', 'listTriage', 'resolveTriage']) {
    assert.match(service, new RegExp('async ' + m + '\\b|' + m + '\\s*\\('))
  }
  assert.match(center, /selected\?\.key === 'routing'/)
  assert.match(center, /<ChannelRoutingSettings/)
  assert.match(ui, /platformAdminService\.saveRoute/)
  assert.match(ui, /platformAdminService\.resolveTriage/)
})
