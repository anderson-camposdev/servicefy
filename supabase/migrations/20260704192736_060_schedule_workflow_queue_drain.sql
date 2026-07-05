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
);;
