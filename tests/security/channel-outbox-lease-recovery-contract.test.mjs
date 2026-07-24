import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration084 = read('supabase/migrations/20260706220000_084_omnichannel_outbound.sql')
const migration173 = read('supabase/migrations/20260723000800_173_channel_outbox_lease_recovery.sql')

// Pente fino de 2026-07-23: claim_channel_outbox era a única fila do
// sistema (das 4: ticket_email_outbox, webhook_events_queue,
// workflow_action_queue, channel_outbox) sem recuperação de lease
// abandonado — se o worker caísse entre reivindicar um lote e chamar
// complete_channel_outbox, a linha ficava 'processing' pra sempre. Fix:
// mesmo padrão já usado em claim_ticket_email_outbox (migration 106).
// Verificado ao vivo: item preso com tentativas restantes volta a
// 'pending' e é reclamado na mesma chamada; item que já esgotou tentativas
// (>= 6, mesmo limite de complete_channel_outbox) vai para 'dead_letter'
// sem ser reclamado; item com lease ainda válido (< 5min) fica intocado.
// Bug real encontrado e corrigido durante a verificação: o CASE que
// escolhe o novo status precisa de cast explícito para o enum
// delivery_status — Postgres não infere automaticamente.

test('migration 084 original não tinha nenhuma recuperação de lease em claim_channel_outbox', () => {
  const fn = migration084.split('CREATE OR REPLACE FUNCTION public.claim_channel_outbox')[1].split('CREATE OR REPLACE FUNCTION public.complete_channel_outbox')[0]
  assert.doesNotMatch(fn, /locked_at < now\(\)/)
})

test('migration 173: recupera lease preso há mais de 5 minutos antes de reivindicar lote novo', () => {
  const fn = migration173.split('CREATE OR REPLACE FUNCTION public.claim_channel_outbox')[1]
  assert.match(fn, /WHERE o\.status = 'processing'\s*\n\s*AND o\.locked_at < now\(\) - interval '5 minutes'/)
})

test('migration 173: cast explícito para o enum delivery_status no UPDATE de recuperação (bug real corrigido durante o teste)', () => {
  const fn = migration173.split('CREATE OR REPLACE FUNCTION public.claim_channel_outbox')[1]
  assert.match(fn, /\)::public\.delivery_status/)
})

test('migration 173: mesmo limite de tentativas (6) usado por complete_channel_outbox antes de ir para dead_letter', () => {
  assert.match(migration173, /v_max_attempts CONSTANT integer := 6/)
})

test('Contrato de lease recovery do channel_outbox participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/channel-outbox-lease-recovery-contract\.test\.mjs/)
})
