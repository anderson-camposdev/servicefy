import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const worker = read('supabase/functions/dispatch-ticket-email-outbox/index.ts')
const sql = read('supabase/migrations/20260710130000_103_schedule_ticket_email_outbox.sql')

test('Worker de e-mail exige chamada interna e drena a outbox por RPC', () => {
  assert.match(worker, /authorization === `Bearer \$\{SERVICE_ROLE_KEY\}`/)
  assert.match(worker, /x-servicefy-internal-key/)
  assert.match(worker, /claim_ticket_email_outbox/)
  assert.match(worker, /complete_ticket_email_delivery/)
})

test('Worker reutiliza proteções SMTP e aplica fallback somente por política', () => {
  assert.match(worker, /nodemailer/)
  assert.match(worker, /AbortSignal\.timeout\(SMTP_TIMEOUT_MS\)/)
  assert.match(worker, /isPrivateHost/)
  assert.match(worker, /tenant_email_delivery_policies/)
  assert.match(worker, /allow_global_fallback/)
  assert.match(worker, /tenant_failed/)
  assert.match(worker, /fallback_sent/)
})

test('Fallback conserva o endpoint Resend em produção e permite um endpoint de teste controlado', () => {
  assert.match(worker, /Deno\.env\.get\('RESEND_API_URL'\) \?\? 'https:\/\/api\.resend\.com\/emails'/)
  assert.match(worker, /fetch\(RESEND_API_URL/)
})

test('Cron chama o worker com service_role obtida do Vault', () => {
  assert.match(sql, /cron\.schedule\(/)
  assert.match(sql, /dispatch-ticket-email-outbox/)
  assert.match(sql, /functions\/v1\/dispatch-ticket-email-outbox/)
  assert.match(sql, /vault\.decrypted_secrets WHERE name = 'service_role_key'/)
})
