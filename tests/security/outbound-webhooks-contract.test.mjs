import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260715000000_122_outbound_webhooks.sql').replace(/\r\n/g, '\n')
const dispatcher = read('supabase/functions/webhook-dispatcher/index.ts')
const ssrfGuard = read('supabase/functions/_shared/ssrf-guard.ts')
const pkg = JSON.parse(read('package.json'))

function fnBody(name, closer = '\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split(closer)[0]
}

test('outbound_webhooks isolado por tenant via RLS (is_settings_admin), URL exige https e eventos restritos a um conjunto conhecido', () => {
  assert.match(sql, /CREATE POLICY outbound_webhooks_admin ON public\.outbound_webhooks\s+FOR ALL TO authenticated\s+USING \(public\.is_settings_admin\(company_id\)\)\s+WITH CHECK \(public\.is_settings_admin\(company_id\)\)/)
  assert.match(sql, /CONSTRAINT outbound_webhooks_target_url_https CHECK \(target_url ~ '\^https:\/\/'\)/)
  assert.match(sql, /CONSTRAINT outbound_webhooks_events_known CHECK \(events_subscribed <@ ARRAY\['ticket\.created','ticket\.resolved'\]::text\[\]\)/)
})

test('segredo HMAC é por webhook (não por tenant) e fica em Vault, nunca em texto puro na tabela outbound_webhooks', () => {
  const tableDef = sql.split('CREATE TABLE IF NOT EXISTS public.outbound_webhooks (')[1].split(');')[0]
  assert.match(tableDef, /vault_secret_id uuid/)
  assert.doesNotMatch(tableDef, /secret text/)
  assert.match(sql, /vault\.create_secret/)
})

test('webhook_events_queue nunca é gravável por authenticated diretamente — só a trigger SECURITY DEFINER e o dispatcher (service_role)', () => {
  assert.match(sql, /CREATE POLICY webhook_events_queue_admin_read ON public\.webhook_events_queue\s+FOR SELECT TO authenticated\s+USING \(public\.is_settings_admin\(company_id\)\)/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.webhook_events_queue FROM authenticated/)
})

test('trigger de fan-out é não-bloqueante: nenhuma chamada de rede, só INSERT...SELECT isolado por company_id', () => {
  const body = fnBody('tg_enqueue_webhook_events()')
  assert.match(body, /INSERT INTO public\.webhook_events_queue \(company_id, webhook_id, event_type, payload\)\s+SELECT NEW\.company_id, w\.id, v_event_type, v_payload\s+FROM public\.outbound_webhooks w\s+WHERE w\.company_id = NEW\.company_id/)
  assert.doesNotMatch(body, /net\.http_post|fetch\(/)
})

test('dispara em ticket.created (AFTER INSERT) e ticket.resolved (AFTER UPDATE OF state, WHEN transição real para Resolved)', () => {
  assert.match(sql, /CREATE TRIGGER tg_enqueue_webhook_events_insert\s+AFTER INSERT ON public\.tickets/)
  assert.match(sql, /CREATE TRIGGER tg_enqueue_webhook_events_update\s+AFTER UPDATE OF state ON public\.tickets\s+FOR EACH ROW\s+WHEN \(NEW\.state::text = 'Resolved' AND OLD\.state::text IS DISTINCT FROM 'Resolved'\)/)
})

test('reivindicação atômica via FOR UPDATE SKIP LOCKED, com recuperação de lease abandonado (mesmo padrão de workflow_claim_queue_batch)', () => {
  const body = fnBody('webhook_claim_queue_batch(p_limit integer DEFAULT 50)')
  assert.match(body, /FOR UPDATE SKIP LOCKED/)
  assert.match(body, /claimed_at < now\(\) - INTERVAL '5 minutes'/)
  assert.match(body, /attempts \+ 1 >= max_attempts THEN 'failed'/)
})

test('claim RPC restrita a service_role — authenticated não pode drenar a fila diretamente', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.webhook_claim_queue_batch\(integer\) FROM public, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.webhook_claim_queue_batch\(integer\) TO service_role/)
})

test('resolução do segredo (get_webhook_signing_secret) e o disjuntor (record_webhook_delivery_result) exigem auth.role()=service_role e são revogados de authenticated', () => {
  const secretBody = fnBody('get_webhook_signing_secret(p_webhook_id uuid)')
  const breakerBody = fnBody('record_webhook_delivery_result(p_webhook_id uuid, p_success boolean, p_failure_threshold integer DEFAULT 10)')
  assert.match(secretBody, /IF COALESCE\(auth\.role\(\), ''\) <> 'service_role' THEN/)
  assert.match(breakerBody, /IF COALESCE\(auth\.role\(\), ''\) <> 'service_role' THEN/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_webhook_signing_secret\(uuid\) FROM public, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_webhook_delivery_result\(uuid, boolean, integer\) FROM public, anon, authenticated/)
})

test('disjuntor desativa o webhook após atingir o limiar de falhas consecutivas e reseta o contador em sucesso', () => {
  const body = fnBody('record_webhook_delivery_result(p_webhook_id uuid, p_success boolean, p_failure_threshold integer DEFAULT 10)')
  assert.match(body, /IF p_success THEN\s*\n\s*UPDATE public\.outbound_webhooks SET consecutive_failures = 0/)
  assert.match(body, /is_active = CASE WHEN consecutive_failures \+ 1 >= p_failure_threshold THEN false ELSE is_active END/)
})

test('save_outbound_webhook exige is_settings_admin, valida https e audita sem vazar o segredo', () => {
  const body = fnBody('save_outbound_webhook(\n  p_company_id uuid,\n  p_webhook_id uuid,\n  p_target_url text,\n  p_events_subscribed text[],\n  p_is_active boolean,\n  p_secret text DEFAULT NULL\n)')
  assert.match(body, /IF NOT public\.is_settings_admin\(p_company_id\) THEN/)
  assert.match(body, /IF p_target_url !~ '\^https:\/\/' THEN/)
  assert.match(body, /write_admin_audit/)
  assert.match(body, /to_jsonb\(v_saved\) - 'vault_secret_id'/)
})

test('dispatcher despacha o lote em paralelo (Promise.allSettled) — endpoint lento de um tenant não atrasa os demais', () => {
  assert.match(dispatcher, /Promise\.allSettled\(rows\.map\(processRow\)\)/)
  assert.doesNotMatch(dispatcher, /for \(const row of rows\)/)
})

test('dispatcher assina o payload com HMAC-SHA256 e aplica timeout de 10s por requisição', () => {
  assert.match(dispatcher, /name: 'HMAC', hash: 'SHA-256'/)
  assert.match(dispatcher, /x-servicefy-signature/)
  assert.match(dispatcher, /AbortSignal\.timeout\(10_000\)/)
})

test('dispatcher tem guarda de SSRF de linha de base contra alvos óbvios (loopback, redes privadas, metadados de nuvem) — guarda compartilhada com run-workflow-actions', () => {
  assert.match(dispatcher, /isBlockedTarget/)
  assert.match(dispatcher, /from '\.\.\/_shared\/ssrf-guard\.ts'/)
  assert.match(ssrfGuard, /BLOCKED_HOSTNAMES/)
  assert.match(ssrfGuard, /169\.254\.169\.254/)
})

test('dispatcher exige Bearer service_role para ser acionado', () => {
  assert.match(dispatcher, /authorization !== `Bearer \$\{SERVICE_ROLE_KEY\}`/)
  assert.match(dispatcher, /status: 401/)
})

test('Contrato de webhooks outbound participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /outbound-webhooks-contract\.test\.mjs/)
})
