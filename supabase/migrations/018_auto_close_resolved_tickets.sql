-- ============================================================
-- Flowfy ITSM — Migration 018
-- Automação de ciclo de vida do chamado:
--   1) Fechamento automático: Resolved → Closed após 72h de resolved_at
--      (pg_cron, de hora em hora).
--   2) Reabertura automática: nova mensagem do SOLICITANTE (actor 'user')
--      num chamado Resolved → volta para In Progress e limpa resolved_at.
--      Trigger em ticket_messages cobre os dois canais (web + e-mail).
-- ============================================================

-- ─── 1. Fechamento automático (pg_cron) ───────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.auto_close_resolved_incidents()
RETURNS void AS $$
  UPDATE public.incidents
     SET state = 'Closed',
         closed_at = now()
   WHERE state = 'Resolved'
     AND resolved_at IS NOT NULL
     AND resolved_at <= now() - INTERVAL '72 hours';
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_close_resolved_incidents IS
  'Fecha automaticamente chamados Resolved há mais de 72h (governança ServiceNow).';

-- Agendamento horário (idempotente: remove o job anterior se existir).
DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-resolved-incidents');
EXCEPTION WHEN OTHERS THEN
  NULL; -- nenhum job anterior
END $$;

SELECT cron.schedule(
  'auto-close-resolved-incidents',
  '0 * * * *', -- a cada hora, no minuto 0
  $$ SELECT public.auto_close_resolved_incidents(); $$
);

-- ─── 2. Reabertura automática por interação do solicitante ─────
CREATE OR REPLACE FUNCTION public.reopen_incident_on_user_message()
RETURNS TRIGGER AS $$
DECLARE
  v_reopened BOOLEAN := false;
BEGIN
  IF NEW.actor_type = 'user' THEN
    UPDATE public.incidents
       SET state = 'In Progress',
           resolved_at = NULL
     WHERE id = NEW.incident_id
       AND state = 'Resolved';

    GET DIAGNOSTICS v_reopened = ROW_COUNT;

    IF v_reopened THEN
      INSERT INTO public.incident_history
        (incident_id, changed_by_name, field_name, new_value, comment, is_public)
      VALUES
        (NEW.incident_id, COALESCE(NEW.sender_name, 'Solicitante'), 'state',
         'In Progress', 'Reaberto automaticamente por nova interação do solicitante.', true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reopen_incident_on_user_message ON public.ticket_messages;
CREATE TRIGGER trg_reopen_incident_on_user_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.reopen_incident_on_user_message();

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'auto-close-resolved-incidents';
--   -- teste manual do fechamento:
--   SELECT public.auto_close_resolved_incidents();
-- ────────────────────────────────────────────────────────────
