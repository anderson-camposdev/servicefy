-- ============================================================
-- 179 — Cron de SLA processa em lotes para caber na janela de 1 minuto
--
-- Medido em 2026-07-26 com 5.000 estouros simultâneos (cenário real após
-- feriado prolongado, indisponibilidade ou migração de base):
--
--     check_sla_breaches()  →  26,9 s  e  32.223 notificações num ciclo
--
-- O cron roda a cada minuto. Como a migration 171 protege contra execuções
-- concorrentes com pg_try_advisory_xact_lock, um ciclo que passa de 60 s faz
-- TODOS os seguintes retornarem sem processar nada — a detecção de SLA
-- congela até o acúmulo drenar. O lock resolveu duplicidade, mas transformou
-- lentidão em parada.
--
-- Correção: teto de itens por ciclo. Cada execução termina rápido e o
-- acúmulo escoa ao longo dos ciclos seguintes, mantendo a detecção viva.
-- Os chamados mais antigos saem primeiro (ORDER BY deadline), então o que
-- estourou há mais tempo é notificado antes.
--
-- 500/ciclo = 30.000/hora, folgado para qualquer pico realista, e mantém o
-- ciclo na casa de poucos segundos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec record;
  v_inc public.tickets;
  v_rule public.workflow_rules;
  v_matched boolean;
  c_batch constant int := 500;
BEGIN
  IF NOT pg_try_advisory_xact_lock(87201001) THEN
    RETURN; -- execução anterior ainda em andamento; pula este ciclo do cron.
  END IF;

  FOR v_rec IN
    SELECT t.id FROM public.tickets t
     WHERE t.state::text NOT IN ('Resolved', 'Closed')
       AND t.paused_at IS NULL AND t.responded_at IS NULL
       AND t.is_response_breached = false
       AND t.sla_response_deadline IS NOT NULL
       AND t.sla_response_deadline < now()
     ORDER BY t.sla_response_deadline
     LIMIT c_batch
  LOOP
    UPDATE public.incidents SET is_response_breached = true WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'response'));
  END LOOP;

  FOR v_rec IN
    SELECT t.id FROM public.tickets t
     WHERE t.state::text NOT IN ('Resolved', 'Closed')
       AND t.paused_at IS NULL AND t.resolved_at IS NULL
       AND t.is_resolution_breached = false
       AND t.sla_resolution_deadline IS NOT NULL
       AND t.sla_resolution_deadline < now()
     ORDER BY t.sla_resolution_deadline
     LIMIT c_batch
  LOOP
    UPDATE public.incidents
       SET is_resolution_breached = true, sla_breached = true
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'resolution'));

    SELECT * INTO v_inc FROM public.tickets WHERE id = v_rec.id;

    PERFORM public.notify_ticket_managers(
      v_inc, 'breach',
      'SLA de resolução estourado: ' || v_inc.number,
      'O chamado ' || v_inc.number || ' ("' || v_inc.short_description || '") estourou o prazo de resolução.'
    );

    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id AND active = true
         AND trigger_event = 'sla_breached' AND ticket_type = v_inc.ticket_type
       ORDER BY priority_order ASC
    LOOP
      v_matched := public.workflow_eval_conditions(v_rule.conditions, v_inc);
      IF v_matched THEN
        PERFORM public.workflow_dispatch_actions(v_rule, v_inc);
      END IF;
      INSERT INTO public.workflow_execution_log
        (company_id, rule_id, rule_name, incident_id, incident_number,
         trigger_event, matched, status, actions_summary)
      VALUES (
        v_inc.company_id, v_rule.id, v_rule.name, v_inc.id, v_inc.number,
        'sla_breached', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched THEN 'Ações aplicadas: ' || COALESCE(
          (SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
        ELSE 'Condição não atendida' END
      );
    END LOOP;
  END LOOP;
END;
$function$;

-- Sustenta o ORDER BY + LIMIT dos dois laços: sem ele o lote ainda varreria
-- a tabela inteira só para achar os 500 mais antigos.
CREATE INDEX IF NOT EXISTS idx_tickets_sla_response_pending
  ON public.tickets (sla_response_deadline)
  WHERE is_response_breached = false AND responded_at IS NULL AND paused_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_sla_resolution_pending
  ON public.tickets (sla_resolution_deadline)
  WHERE is_resolution_breached = false AND resolved_at IS NULL AND paused_at IS NULL;
