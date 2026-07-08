import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260707060000_091_sla_resolution_governance.sql')
const packageJson = read('package.json')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('sla_events.event_type ganha resolution_achieved sem remover os valores existentes', () => {
  assert.match(sql, /DROP CONSTRAINT sla_events_event_type_check/)
  const check = sql.split('ADD CONSTRAINT sla_events_event_type_check')[1].split(';')[0]
  for (const t of ['response_start', 'response_achieved', 'resolution_start', 'resolution_achieved', 'paused', 'resumed', 'breached', 'reopened']) {
    assert.match(check, new RegExp(`'${t}'`))
  }
})

test('resolution_achieved é gravado quando resolved_at sai de NULL, com breached calculado', () => {
  const body = fnBody('tg_sla_events_on_update')
  assert.match(body, /OLD\.resolved_at IS NULL AND NEW\.resolved_at IS NOT NULL/)
  assert.match(body, /'resolution_achieved'/)
  assert.match(body, /NEW\.sla_resolution_deadline IS NOT NULL AND NEW\.resolved_at > NEW\.sla_resolution_deadline/)
})

test('response_achieved também ganha o campo breached', () => {
  const body = fnBody('tg_sla_events_on_update')
  assert.match(body, /NEW\.sla_response_deadline IS NOT NULL AND NEW\.responded_at > NEW\.sla_response_deadline/)
})

test('o trigger passa a disparar também quando resolved_at muda', () => {
  assert.match(sql, /CREATE TRIGGER tg_sla_events_on_update\s+AFTER UPDATE OF state, responded_at, resolved_at ON public\.incidents/)
})

test('Contrato de governança de resolução de SLA participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/sla-resolution-governance-contract\.test\.mjs/)
})
