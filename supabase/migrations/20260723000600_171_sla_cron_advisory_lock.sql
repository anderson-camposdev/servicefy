-- ServiceFY — check_sla_breaches()/check_sla_warnings() rodam a cada
-- minuto via pg_cron (migrations 053/059/156) fazendo select-depois-update
-- sem nenhuma trava. pg_cron não impede execuções sobrepostas por padrão —
-- se uma execução atrasar além de 1 minuto (plausível sob carga com muitos
-- tenants/tickets), duas execuções concorrentes podem enxergar o mesmo
-- ticket como "ainda não notificado" e disparar e-mail de estouro de SLA
-- e ações de automação em duplicidade, visível para gestores/clientes.
--
-- Achado no pente fino de 2026-07-23. Agravante: a migration 159 já
-- documentou que essas mesmas funções falharam silenciosamente por um
-- período sem nada capturar em CI — pouca cobertura de teste de execução
-- real nesse caminho crítico.
--
-- Fix: pg_try_advisory_xact_lock no início de cada função — se uma
-- execução anterior ainda estiver rodando (lock ocupado), a nova chamada
-- simplesmente retorna sem fazer nada, em vez de processar os mesmos
-- tickets em paralelo. Lock transacional (xact): libera sozinho ao fim da
-- transação da chamada, sem risco de ficar preso por falha no meio do
-- caminho.

CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_inc public.tickets;
  v_rule public.workflow_rules;
  v_matched boolean;
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
$$;

CREATE OR REPLACE FUNCTION public.check_sla_warnings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inc public.tickets;
  v_rule public.workflow_rules;
  v_matched boolean;
BEGIN
  IF NOT pg_try_advisory_xact_lock(87201002) THEN
    RETURN; -- execução anterior ainda em andamento; pula este ciclo do cron.
  END IF;

  FOR v_inc IN
    SELECT * FROM public.tickets
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL AND resolved_at IS NULL
       AND sla_warning_notified = false
       AND sla_resolution_deadline IS NOT NULL
       AND sla_resolution_deadline > now()
       AND sla_resolution_deadline - now() < interval '30 minutes'
  LOOP
    UPDATE public.incidents SET sla_warning_notified = true WHERE id = v_inc.id;

    PERFORM public.notify_ticket_managers(
      v_inc, 'warning',
      'SLA prestes a estourar: ' || v_inc.number,
      'O chamado ' || v_inc.number || ' ("' || v_inc.short_description || '") está a menos de 30 minutos do prazo de resolução.'
    );

    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id AND active = true
         AND trigger_event = 'sla_warning' AND ticket_type = v_inc.ticket_type
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
        'sla_warning', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched THEN 'Ações aplicadas: ' || COALESCE(
          (SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
        ELSE 'Condição não atendida' END
      );
    END LOOP;
  END LOOP;
END;
$$;

-- Permissões/agendamento cron inalterados (CREATE OR REPLACE preserva
-- GRANT/REVOKE e o job pg_cron continua chamando os mesmos nomes de função).
