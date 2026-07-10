-- ServiceFY - Fase 9: agendamento do worker interno da outbox de e-mail.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-ticket-email-outbox');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dispatch-ticket-email-outbox',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://enxtvrvsfwvcnpyspyfl.supabase.co/functions/v1/dispatch-ticket-email-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
            FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
