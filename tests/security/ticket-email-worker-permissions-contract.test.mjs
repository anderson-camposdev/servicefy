import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(
  new URL('../../supabase/migrations/20260710150000_105_ticket_email_worker_permissions.sql', import.meta.url),
  'utf8',
)

test('Worker recebe apenas as permissões service_role necessárias para processar a outbox', () => {
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_ticket_email_outbox\(integer\) TO service_role/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.complete_ticket_email_delivery\(uuid,text,text,text\) TO service_role/)
  assert.match(sql, /GRANT SELECT ON public\.tenant_email_delivery_policies TO service_role/)
})

test('Permissões do worker não ampliam acesso de clientes à outbox ou à política', () => {
  assert.doesNotMatch(sql, /GRANT .* TO (anon|authenticated|public)/)
})
