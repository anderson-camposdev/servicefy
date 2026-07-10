import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(
  new URL('../../supabase/migrations/20260710160000_106_fix_ticket_email_outbox_claim.sql', import.meta.url),
  'utf8',
)

test('Claim da outbox qualifica colunas das CTEs para não colidir com RETURNS TABLE', () => {
  assert.match(sql, /RETURN QUERY\s+WITH expired AS/)
  assert.match(sql, /RETURNING outbox\.id, outbox\.company_id, outbox\.attempt_count/)
  assert.match(sql, /SELECT expired\.id, expired\.company_id,/)
  assert.match(sql, /SELECT updated\.id, updated\.company_id, 'sending', 'none' FROM updated/)
  assert.match(sql, /SELECT updated\.\* FROM updated/)
})
