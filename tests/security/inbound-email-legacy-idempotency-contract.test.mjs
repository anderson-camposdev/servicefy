import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration172 = read('supabase/migrations/20260723000700_172_ticket_messages_external_id_idempotency.sql')
const edgeFunction = read('supabase/functions/handle-inbound-email/index.ts')

// Pente fino de 2026-07-23: o caminho legado de handle-inbound-email (sem
// connectionId, não passa pelo omnichannel-gateway) inseria direto em
// ticket_messages sem checar Message-ID — redelivery de webhook do
// provedor (SendGrid/Postmark/Resend reentregam em timeout/5xx) duplicava
// o comentário no ticket. O caminho principal (omnichannel-gateway) já é
// idempotente via UNIQUE(connection_id, external_message_id) em
// channel_messages; ticket_messages nunca teve equivalente. Verificado ao
// vivo: 1ª entrega insere normal, redelivery com mesmo Message-ID é
// bloqueada pela constraint, mensagens sem Message-ID (analista/sistema)
// continuam sem limite, mesmo Message-ID em ticket diferente não colide.

test('migration 172: unique index é parcial (só quando external_message_id não é null) e escopada por incidente', () => {
  assert.match(migration172, /CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_messages_incident_external_id\s*\n\s*ON public\.ticket_messages \(incident_id, external_message_id\)\s*\n\s*WHERE external_message_id IS NOT NULL/)
})

test('handle-inbound-email: extrai Message-ID do blob de headers (SendGrid) e de campos diretos (outros provedores)', () => {
  assert.match(edgeFunction, /function extractMessageId/)
  assert.match(edgeFunction, /headers\.match\(\/\^Message-ID:/)
  assert.match(edgeFunction, /payload\.message_id \?\? payload\['Message-Id'\] \?\? payload\.messageId/)
})

test('handle-inbound-email: grava external_message_id no INSERT de ticket_messages', () => {
  const insertBlock = edgeFunction.split(".from('ticket_messages').insert({")[1].split('})')[0]
  assert.match(insertBlock, /external_message_id: externalMessageId/)
})

test('handle-inbound-email: violação da unique constraint (23505) responde 200/duplicate, não 500', () => {
  const afterInsert = edgeFunction.split(".from('ticket_messages').insert({")[1]
  assert.match(afterInsert, /insErr\.code === '23505'/)
  assert.match(afterInsert, /status: 'duplicate' \}\), \{ status: 200 \}/)
})

test('Contrato de idempotência do inbound email legado participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/inbound-email-legacy-idempotency-contract\.test\.mjs/)
})
