import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const migration = readFileSync(resolve(root, 'supabase/migrations/20260705203004_074_csat_and_response_macros.sql'), 'utf8')
const portal = readFileSync(resolve(root, 'src/pages/UserPortalLayout.tsx'), 'utf8')
const cockpit = readFileSync(resolve(root, 'src/pages/AnalystCockpit.tsx'), 'utf8')

test('CSAT nasce na resolução e aceita uma resposta autenticada', () => {
  assert.match(migration, /tg_create_csat_on_resolution/)
  assert.match(migration, /rating BETWEEN 1 AND 5/)
  assert.match(migration, /requester_id IS DISTINCT FROM v_profile_id/)
  assert.match(migration, /status <> 'pending'/)
})

test('pesquisa pendente expira na reabertura', () => {
  assert.match(migration, /SET status = 'expired'/)
  assert.match(migration, /NEW\.state::text NOT IN \('Resolved', 'Closed'\)/)
})

test('portal oferece nota de 1 a 5 e envia via RPC', () => {
  assert.match(portal, /\[1, 2, 3, 4, 5\]/)
  assert.match(portal, /csatService\.submit/)
  assert.match(portal, /Como foi o atendimento\?/)
})

test('macros são restritas à equipe e suportam variáveis', () => {
  assert.match(migration, /public\.is_current_user_ticket_staff\(\)/)
  assert.match(migration, /\{\{usuario\.nome\}\}/)
  assert.match(migration, /\{\{chamado\.numero\}\}/)
  assert.match(cockpit, /Inserir resposta pronta/)
  assert.match(cockpit, /applyResponseMacro/)
})
