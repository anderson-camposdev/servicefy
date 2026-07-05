CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('check-sla-breaches');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'check-sla-breaches',
  '* * * * *',
  $$ SELECT public.check_sla_breaches(); $$
);;
