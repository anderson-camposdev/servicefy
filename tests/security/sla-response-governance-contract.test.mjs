import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260707050000_090_sla_response_governance.sql')
const packageJson = read('package.json')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('Sair de "New" para qualquer outro estado grava responded_at (idempotente)', () => {
  const body = fnBody('tg_stamp_first_response')
  assert.match(body, /NEW\.responded_at IS NULL/)
  assert.match(body, /OLD\.state::text = 'New'/)
  assert.match(body, /NEW\.state::text <> 'New'/)
  assert.match(body, /NEW\.responded_at := clock_timestamp\(\)/)
  assert.match(sql, /CREATE TRIGGER tg_stamp_first_response\s+BEFORE UPDATE OF state ON public\.incidents/)
})

test('Mensagem pública do analista grava responded_at; nota interna não', () => {
  const body = fnBody('tg_ticket_message_stamps_response')
  assert.match(body, /NEW\.actor_type = 'analyst'/)
  assert.match(body, /NOT COALESCE\(NEW\.is_internal, false\)/)
  assert.match(body, /responded_at IS NULL/)
  assert.match(body, /state::text NOT IN \('Resolved', 'Closed'\)/)
  assert.match(sql, /CREATE TRIGGER tg_ticket_message_stamps_response\s+AFTER INSERT ON public\.ticket_messages/)
})

test('Migration não altera a checagem de violação existente (check_sla_breaches)', () => {
  // A correção é só sobre QUANDO responded_at é gravado — a função de
  // violação (que já ignora responded_at preenchido) não precisa mudar.
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.check_sla_breaches/)
})

test('Contrato de governança de SLA participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/sla-response-governance-contract\.test\.mjs/)
})
