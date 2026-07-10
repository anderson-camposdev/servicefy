import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(
  new URL('../../supabase/migrations/20260710120000_102_ticket_email_producers.sql', import.meta.url),
  'utf8',
)

const functionBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('Produtor de tickets cobre eventos semânticos e evita duplicação no fechamento', () => {
  const body = functionBody('tg_enqueue_ticket_email_notifications')
  assert.match(sql, /CREATE TRIGGER tg_enqueue_ticket_email_notifications\s+AFTER INSERT OR UPDATE ON public\.tickets/)
  assert.match(body, /TG_OP = 'INSERT'/)
  assert.match(body, /NEW\.state IS DISTINCT FROM OLD\.state/)
  assert.match(body, /v_event := 'ticket_closed'/)
  assert.match(body, /v_event := 'status_changed'/)
  assert.match(body, /NEW\.assigned_to_id IS DISTINCT FROM OLD\.assigned_to_id/)
  assert.match(body, /NEW\.assigned_group_id IS DISTINCT FROM OLD\.assigned_group_id/)
})

test('Atribuição notifica responsável ou grupo e eventos são idempotentes', () => {
  const body = functionBody('tg_enqueue_ticket_email_notifications')
  assert.match(body, /NEW\.assigned_to_id IS NOT NULL/)
  assert.match(body, /FROM public\.user_groups ug/)
  const enqueue = functionBody('enqueue_ticket_email_notification')
  assert.match(enqueue, /ON CONFLICT \(company_id, idempotency_key\) DO NOTHING/)
  assert.match(enqueue, /INSERT INTO public\.ticket_email_delivery_events/)
})

test('Comentário público substitui o envio legado direto por outbox', () => {
  const body = functionBody('tg_enqueue_public_comment_email')
  assert.match(body, /NEW\.actor_type <> 'analyst'/)
  assert.match(body, /COALESCE\(NEW\.is_internal, false\)/)
  assert.match(body, /'public_comment'/)
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_notify_ticket_message ON public\.ticket_messages/)
  assert.match(sql, /CREATE TRIGGER tg_enqueue_public_comment_email\s+AFTER INSERT ON public\.ticket_messages/)
})
