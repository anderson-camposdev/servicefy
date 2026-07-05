-- ============================================================
-- Flowfy ITSM — Migration 060
-- Motor de Automação: AGENDAMENTO DO DRAIN DA FILA ASSÍNCRONA.
--
-- Mesmo padrão pg_net + Vault já usado em notify_ticket_message()
-- (Migration 013) — só que via pg_cron (drenagem por lote a cada
-- minuto) em vez de disparo por INSERT (mais simples de operar e
-- de conter picos de volume).
--
-- Depende do segredo 'service_role_key' existir no Vault — mesmo
-- segredo documentado na nota de setup da Migration 013. Se ainda
-- não foi criado (nenhuma Edge Function estava deployada até esta
-- entrega), rode manualmente uma vez no SQL Editor do Supabase:
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- (pegue a service_role key em Project Settings → API — nunca cole
-- esse valor em um chat/log; rode o comando direto no SQL Editor.)
--
-- Idempotente.
-- ============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('drain-workflow-queue');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'drain-workflow-queue',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://enxtvrvsfwvcnpyspyfl.supabase.co/functions/v1/run-workflow-actions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          ''
        )
      ),
      body := '{}'::jsonb
    );
  $$
);

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'drain-workflow-queue';
--   -- Depois de criar o secret no Vault, aguarde até 1 minuto e confira:
--   SELECT status, processed_at FROM workflow_action_queue ORDER BY created_at DESC LIMIT 10;
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5; -- respostas HTTP do pg_net
-- ────────────────────────────────────────────────────────────
