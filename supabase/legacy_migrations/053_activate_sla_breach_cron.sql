-- ============================================================
-- Flowfy ITSM — Migration 053
-- Motor de SLA (5/5): ATIVAÇÃO DO CRON DE ESTOURO DE PRAZO.
--
-- A função public.check_sla_breaches() já existe (Migration 035),
-- pronta e idempotente, mas o agendamento pg_cron nunca foi
-- ativado (ficou comentado). Sem isso, is_response_breached /
-- is_resolution_breached / sla_breached nunca são atualizados
-- em produção.
--
-- pg_cron já está habilitado (Migration 018 — job
-- 'auto-close-resolved-incidents'). Esta migration só agenda
-- mais um job na mesma extensão.
--
-- Idempotente.
-- ============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('check-sla-breaches');
EXCEPTION WHEN OTHERS THEN
  NULL; -- nenhum job anterior
END $$;

SELECT cron.schedule(
  'check-sla-breaches',
  '* * * * *',                      -- a cada 1 minuto
  $$ SELECT public.check_sla_breaches(); $$
);

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT jobname, schedule, active
--     FROM cron.job
--    WHERE jobname IN ('check-sla-breaches', 'auto-close-resolved-incidents');
--   SELECT public.check_sla_breaches(); -- smoke test manual, idempotente
--   SELECT number, is_response_breached, is_resolution_breached
--     FROM public.incidents
--    WHERE is_response_breached OR is_resolution_breached;
-- ────────────────────────────────────────────────────────────
