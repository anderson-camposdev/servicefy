import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(
  new URL('../../supabase/migrations/20260710110000_101_ticket_email_outbox.sql', import.meta.url),
  'utf8',
)

const functionBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('Outbox de e-mail é idempotente e isolada por tenant', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ticket_email_outbox/)
  assert.match(sql, /UNIQUE \(company_id, idempotency_key\)/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_ticket_email_outbox_due[\s\S]*WHERE status = 'pending'/)
  assert.match(sql, /ALTER TABLE public\.ticket_email_outbox ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /USING \(public\.is_settings_admin\(company_id\)\)/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.ticket_email_outbox FROM authenticated/)
})

test('Worker da outbox é exclusivo de service_role e usa SKIP LOCKED', () => {
  const body = functionBody('claim_ticket_email_outbox')
  assert.match(body, /auth\.role\(\), ''\) <> 'service_role'/)
  assert.match(body, /FOR UPDATE SKIP LOCKED/)
  assert.match(body, /locked_at = now\(\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_ticket_email_outbox\(integer\) FROM public, anon, authenticated/)
})

test('Conclusão registra auditoria imutável e limita retries', () => {
  const body = functionBody('complete_ticket_email_delivery')
  assert.match(body, /v_max_attempts constant integer := 5/)
  assert.match(body, /p_outcome = 'tenant_failed'/)
  assert.match(body, /p_outcome IN \('sent', 'fallback_sent'\)/)
  assert.match(body, /status = 'dead_letter'/)
  assert.match(body, /INSERT INTO public\.ticket_email_delivery_events/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.ticket_email_delivery_events FROM authenticated/)
})
