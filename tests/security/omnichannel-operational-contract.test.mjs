import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20260706210000_083_omnichannel_email_operational.sql')
const gateway = read('supabase/functions/omnichannel-gateway/index.ts')
const inbound = read('supabase/functions/handle-inbound-email/index.ts')
const pkg = JSON.parse(read('package.json'))

test('mensagem inbound é materializada em incidente e caso uma única vez', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS ticket_message_id/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.materialize_channel_message/)
  assert.match(migration, /FOR UPDATE OF m, c/)
  assert.match(migration, /INSERT INTO public\.incidents/)
  assert.match(migration, /INSERT INTO public\.ticket_messages/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.materialize_channel_message\(uuid\) TO service_role/)
})

test('eventos ambíguos entram em triagem administrativa', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.channel_triage_events/)
  assert.match(migration, /UNIQUE\(connection_id, external_event_id\)/)
  assert.match(migration, /public\.is_settings_admin\(company_id\)/)
  assert.match(gateway, /channel_triage_events/)
  assert.match(gateway, /ambiguous_route/)
})

test('gateway repara reentrega e devolve o incidente correlacionado', () => {
  assert.match(gateway, /materialize_channel_message/)
  assert.match(gateway, /ticketMessageId/)
  assert.match(gateway, /incidentNumber/)
  assert.match(gateway, /messageError\?\.code === '23505'/)
})

test('webhook genérico de e-mail exige segredo e restringe provedores', () => {
  assert.match(inbound, /INBOUND_EMAIL_WEBHOOK_KEY/)
  assert.match(inbound, /x-servicefy-webhook-key/)
  assert.match(inbound, /timingSafeEqual/)
  assert.match(inbound, /EMAIL_PROVIDERS/)
  assert.match(inbound, /unauthorized/)
})

test('contrato operacional participa da suíte de segurança', () => {
  assert.match(pkg.scripts['test:security'], /omnichannel-operational-contract\.test\.mjs/)
})
