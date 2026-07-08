-- ServiceFY — Fecha o cronômetro de SOLUÇÃO no livro-caixa de eventos de SLA.
--
-- `sla_events` já registrava início de resposta/solução, pausa, retomada,
-- reabertura e violação — mas nunca o encerramento da SOLUÇÃO (quando o
-- chamado é resolvido). O usuário também pediu que tanto o evento de
-- resposta cumprida quanto o de solução cumprida deixem explícito se o
-- prazo foi respeitado ou não (não dá pra saber isso só pelo "cumprido em X").
--
-- Mudanças:
--  1. CHECK de sla_events.event_type ganha 'resolution_achieved'.
--  2. tg_sla_events_on_update: passa a disparar também quando `resolved_at`
--     muda (além de state/responded_at); grava 'resolution_achieved' com
--     `breached` calculado comparando resolved_at ao prazo. O evento
--     'response_achieved' existente também ganha esse campo `breached`.

ALTER TABLE public.sla_events DROP CONSTRAINT sla_events_event_type_check;
ALTER TABLE public.sla_events
  ADD CONSTRAINT sla_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'response_start','response_achieved','resolution_start','resolution_achieved',
    'paused','resumed','breached','reopened'
  ]));

CREATE OR REPLACE FUNCTION public.tg_sla_events_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.responded_at IS NULL AND NEW.responded_at IS NOT NULL THEN
    PERFORM public.sla_log_event(
      NEW.id, 'response_achieved',
      jsonb_build_object(
        'at', NEW.responded_at,
        'breached', (NEW.sla_response_deadline IS NOT NULL AND NEW.responded_at > NEW.sla_response_deadline)
      )
    );
  END IF;

  IF OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN
    PERFORM public.sla_log_event(
      NEW.id, 'resolution_achieved',
      jsonb_build_object(
        'at', NEW.resolved_at,
        'breached', (NEW.sla_resolution_deadline IS NOT NULL AND NEW.resolved_at > NEW.sla_resolution_deadline)
      )
    );
  END IF;

  IF OLD.state IS DISTINCT FROM NEW.state THEN
    IF public.sla_is_paused_state(NEW.state::text) AND NOT public.sla_is_paused_state(OLD.state::text) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'paused',
        jsonb_build_object('state', NEW.state, 'reason_id', NEW.pending_reason_id, 'at', NEW.paused_at)
      );
    ELSIF public.sla_is_paused_state(OLD.state::text) AND NOT public.sla_is_paused_state(NEW.state::text) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'resumed',
        jsonb_build_object(
          'state', NEW.state,
          'accumulated_paused_minutes', NEW.accumulated_paused_time_minutes,
          'resolution_deadline', NEW.sla_resolution_deadline
        )
      );
    ELSIF OLD.state::text = ANY (ARRAY['Resolved','Closed']) AND NOT (NEW.state::text = ANY (ARRAY['Resolved','Closed'])) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'reopened',
        jsonb_build_object(
          'from_state', OLD.state,
          'to_state', NEW.state,
          'elapsed_minutes', NEW.accumulated_reopen_time_minutes - COALESCE(OLD.accumulated_reopen_time_minutes, 0),
          'resolution_deadline', NEW.sla_resolution_deadline
        )
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_sla_events_on_update ON public.incidents;
CREATE TRIGGER tg_sla_events_on_update
  AFTER UPDATE OF state, responded_at, resolved_at ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sla_events_on_update();

-- ─── Verificação (comentada) ─────────────────────────────────────────────────
--   -- resolver um chamado (state→Resolved + resolved_at) grava 'resolution_achieved'
--   --   com breached=true se resolved_at > sla_resolution_deadline, senão false.
--   -- responder um chamado grava 'response_achieved' com o mesmo campo breached.
