import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const worker = readFileSync(resolve(root, 'supabase/functions/send-ticket-notification/index.ts'), 'utf8')

test('exige Bearer service_role antes de ler o corpo da requisição', () => {
  assert.match(worker, /authorization !== `Bearer \$\{SERVICE_ROLE_KEY\}`/)
  assert.match(worker, /status: 401/)
})

test('escapa o corpo do comentário e os campos do chamado antes de interpolar no HTML do e-mail (evita HTML injection)', () => {
  assert.match(worker, /function escapeHtml/)
  assert.match(worker, /escapeHtml\(record\.body\)/)
  assert.match(worker, /escapeHtml\(incident\.short_description\)/)
  assert.match(worker, /escapeHtml\(incident\.caller_name\)/)
  assert.doesNotMatch(worker, /\$\{record\.body\}/)
})
