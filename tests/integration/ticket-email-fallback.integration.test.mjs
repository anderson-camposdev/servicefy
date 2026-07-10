/**
 * Teste de integração opt-in: fallback de e-mail quando o SMTP do tenant falha.
 *
 * Pré-requisitos para executar:
 *   1. Supabase local ativo: `supabase start`
 *   2. Worker local já em execução com variáveis do fixture:
 *      $status = supabase status --output json | ConvertFrom-Json
 *      $env:SUPABASE_URL = $status.API_URL
 *      $env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
 *      supabase functions serve --no-verify-jwt --env-file tests/integration/fixtures/ticket-email-fallback.env
 *   3. Mock Docker ativo:
 *      $server = "const http=require('http');http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{console.log(b);res.writeHead(200,{'content-type':'application/json'});res.end('{\"id\":\"ok\"}')})}).listen(8799)"
 *      docker run -d --rm --network supabase_network_servicefy --name servicefy-fallback-mock node:24-alpine node -e $server
 *   4. Definir SERVICEFY_RUN_EMAIL_INTEGRATION=1 SERVICEFY_LOCAL_SERVICE_ROLE_KEY=<chave service_role>
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

const runIntegration = process.env.SERVICEFY_RUN_EMAIL_INTEGRATION === '1'
const companyId = '11111111-1111-1111-1111-111111111111'
const outboxKey = 'mailpit-integration-fallback-001'
const supabaseUrl = 'http://127.0.0.1:54321'
const fallbackContainer = 'servicefy-fallback-mock'

function localServiceRoleKey() {
  const key = process.env.SERVICEFY_LOCAL_SERVICE_ROLE_KEY
  assert.ok(key, 'Defina SERVICEFY_LOCAL_SERVICE_ROLE_KEY para executar a integração local.')
  return key
}

function runSql(sql) {
  return execFileSync('docker', [
    'exec', '-i', 'supabase_db_servicefy', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A',
  ], { input: sql, encoding: 'utf8' })
}

test('falha SMTP do tenant usa fallback global e preserva o rodape de contingencia', { skip: !runIntegration }, async testContext => {
  const serviceRoleKey = localServiceRoleKey()

  testContext.after(() => {
    try {
      runSql(`DELETE FROM public.ticket_email_outbox WHERE idempotency_key = '${outboxKey}'; DELETE FROM public.tenant_email_delivery_policies WHERE company_id = '${companyId}' AND event_type = 'ticket_opened'; DELETE FROM public.tenant_smtp_settings WHERE company_id = '${companyId}';`)
    } catch {
      // A falha principal do teste deve permanecer visível.
    }
  })

  runSql(`
    DO $$
    DECLARE secret_id uuid;
    BEGIN
      SELECT id INTO secret_id FROM vault.secrets WHERE name = 'servicefy_integration_fallback';
      IF secret_id IS NULL THEN
        SELECT vault.create_secret('fallback-password', 'servicefy_integration_fallback', 'Fallback integration credential', NULL) INTO secret_id;
      END IF;
      INSERT INTO public.tenant_smtp_settings (company_id, smtp_host, smtp_port, smtp_user, smtp_vault_secret_id, from_email, from_name, encryption_type, rotation_required)
      VALUES ('${companyId}', '127.0.0.2', 1, 'fallback', secret_id, 'servicefy@local.test', 'ServiceFY Integration', 'none', false)
      ON CONFLICT (company_id) DO UPDATE SET smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port, smtp_user = EXCLUDED.smtp_user, smtp_vault_secret_id = EXCLUDED.smtp_vault_secret_id, from_email = EXCLUDED.from_email, from_name = EXCLUDED.from_name, encryption_type = EXCLUDED.encryption_type, rotation_required = false;
    END;
    $$;
    INSERT INTO public.tenant_email_delivery_policies (company_id, event_type, allow_global_fallback)
    VALUES ('${companyId}', 'ticket_opened', true)
    ON CONFLICT (company_id, event_type) DO UPDATE SET allow_global_fallback = true;
    INSERT INTO public.ticket_email_outbox (company_id, ticket_id, event_type, recipient_email, payload, idempotency_key)
    SELECT '${companyId}', id, 'ticket_opened', 'fallback-recipient@local.test', jsonb_build_object('ticket_number', 'INT-FALLBACK-001', 'short_description', 'Falha SMTP', 'state', 'New', 'caller_name', 'Integracao'), '${outboxKey}'
    FROM public.tickets WHERE company_id = '${companyId}' LIMIT 1
    ON CONFLICT (company_id, idempotency_key) DO UPDATE SET status = 'pending', attempt_count = 0, next_attempt_at = now(), locked_at = NULL, last_error = NULL, sent_at = NULL;
    DELETE FROM public.ticket_email_delivery_events WHERE outbox_id = (SELECT id FROM public.ticket_email_outbox WHERE idempotency_key = '${outboxKey}');
  `)

  const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-ticket-email-outbox`, {
    method: 'POST',
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    body: '{}',
  })
  assert.equal(response.status, 200)
  const workerResult = await response.json()
  const deliveryState = runSql(`SELECT o.status || ':' || COALESCE(o.last_error, '') || ':' || string_agg(e.event_type, ',' ORDER BY e.created_at) FROM public.ticket_email_outbox o JOIN public.ticket_email_delivery_events e ON e.outbox_id = o.id WHERE o.idempotency_key = '${outboxKey}' GROUP BY o.status, o.last_error;`).trim()
  assert.deepEqual(workerResult, { claimed: 1, sent: 1, retried: 0, dead_letter: 0 }, deliveryState)

  // O mock e um container de longa duracao (pode ja ter atendido chamadas de execucoes
  // anteriores) — usamos apenas a ultima linha de log, correspondente a esta chamada.
  const fallbackLog = execFileSync('docker', ['logs', '--tail', '1', fallbackContainer], { encoding: 'utf8' }).trim()
  const fallbackPayload = JSON.parse(fallbackLog)
  assert.equal(fallbackPayload.to[0], 'fallback-recipient@local.test')
  assert.match(fallbackPayload.html, /canal de contingencia do ServiceFY/)

  const result = runSql(`SELECT o.status || ':' || string_agg(e.event_type, ',' ORDER BY e.created_at) FROM public.ticket_email_outbox o JOIN public.ticket_email_delivery_events e ON e.outbox_id = o.id WHERE o.idempotency_key = '${outboxKey}' GROUP BY o.status;`).trim()
  assert.equal(result, 'sent:sending,tenant_failed,fallback_sent')
})
