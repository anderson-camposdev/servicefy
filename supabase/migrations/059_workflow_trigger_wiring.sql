-- ============================================================
-- Flowfy ITSM — Migration 059
-- Motor de Automação (5/5): TRIGGERS DE INTEGRAÇÃO.
--
-- tg_workflow_on_incident_change() é deliberadamente AFTER
-- INSERT OR UPDATE — nunca disputa ordem com os triggers BEFORE
-- do motor de SLA (tg_calculate_ticket_sla, tg_handle_sla_pause);
-- lê o NEW já com os campos de SLA computados.
--
-- comment_added: trigger fino em ticket_messages, mesma lógica
-- de matching/dispatch, condições avaliadas contra o incidente-pai.
--
-- sla_breached: check_sla_breaches() (035/053) passa a disparar
-- o motor também, na mesma varredura que já marca os flags.
--
-- sla_warning: nova função irmã check_sla_warnings(), mesmo
-- padrão de cron, com guarda de idempotência própria
-- (sla_warning_notified).
--
-- scheduled: FORA DO ESCOPO desta entrega — estruturalmente
-- diferente (sem chamado para avaliar condição contra, no caso
-- de relatórios agendados sem contexto de ticket). Ver nota no
-- final da migration.
--
-- Idempotente.
-- ============================================================

-- ─── 0. Guarda de idempotência para sla_warning ───────────────
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS sla_warning_notified BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.incidents.sla_warning_notified IS
  'Evita disparar sla_warning repetidamente enquanto o chamado permanece &lt;30min do prazo. Resetado quando o prazo é empurrado (pausa/reabertura). Migration 059.';

-- Resetar o aviso sempre que o prazo de solução for empurrado para frente
-- (pausa/retomada ou reabertura já fazem isso via tg_handle_sla_pause —
-- aqui só garantimos que o novo prazo maior permita um novo aviso).
CREATE OR REPLACE FUNCTION public.tg_reset_sla_warning_on_deadline_push()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sla_resolution_deadline IS DISTINCT FROM OLD.sla_resolution_deadline
     AND NEW.sla_resolution_deadline > OLD.sla_resolution_deadline THEN
    NEW.sla_warning_notified := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_reset_sla_warning_on_deadline_push ON public.incidents;
CREATE TRIGGER tg_reset_sla_warning_on_deadline_push
  BEFORE UPDATE OF sla_resolution_deadline ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_reset_sla_warning_on_deadline_push();

-- ─── 1. Trigger principal: incident_created / updated / resolved / closed ─
CREATE OR REPLACE FUNCTION public.tg_workflow_on_incident_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event   TEXT;
  v_rule    public.workflow_rules;
  v_matched BOOLEAN;
  v_depth   INT;
BEGIN
  -- Guarda de recursão: uma ação que altera o próprio chamado não deve
  -- re-disparar o motor indefinidamente na mesma transação.
  v_depth := COALESCE(NULLIF(current_setting('flowfy.workflow_depth', true), '')::INT, 0);
  IF v_depth >= 3 THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('flowfy.workflow_depth', (v_depth + 1)::TEXT, true);

  v_event := CASE
    WHEN TG_OP = 'INSERT' THEN 'incident_created'
    WHEN NEW.state::text = 'Resolved' AND OLD.state::text IS DISTINCT FROM 'Resolved' THEN 'incident_resolved'
    WHEN NEW.state::text = 'Closed'   AND OLD.state::text IS DISTINCT FROM 'Closed'   THEN 'incident_closed'
    ELSE 'incident_updated'
  END;

  FOR v_rule IN
    SELECT * FROM public.workflow_rules
     WHERE company_id = NEW.company_id
       AND active = true
       AND trigger_event = v_event
       AND ticket_type = NEW.ticket_type
       AND (trigger_source = 'any' OR trigger_source = NEW.opened_via)
     ORDER BY priority_order ASC
  LOOP
    v_matched := public.workflow_eval_conditions(v_rule.conditions, NEW);
    IF v_matched THEN
      PERFORM public.workflow_dispatch_actions(v_rule, NEW);
    END IF;

    INSERT INTO public.workflow_execution_log
      (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
    VALUES (
      NEW.company_id, v_rule.id, v_rule.name, NEW.id, NEW.number, v_event, v_matched,
      CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
      CASE WHEN v_matched
           THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
           ELSE 'Condição não atendida'
      END
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_workflow_on_incident_change ON public.incidents;
CREATE TRIGGER tg_workflow_on_incident_change
  AFTER INSERT OR UPDATE ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_workflow_on_incident_change();

-- ─── 2. comment_added: trigger fino em ticket_messages ────────
CREATE OR REPLACE FUNCTION public.tg_workflow_on_comment_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident public.incidents;
  v_rule     public.workflow_rules;
  v_matched  BOOLEAN;
  v_depth    INT;
BEGIN
  v_depth := COALESCE(NULLIF(current_setting('flowfy.workflow_depth', true), '')::INT, 0);
  IF v_depth >= 3 THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('flowfy.workflow_depth', (v_depth + 1)::TEXT, true);

  SELECT * INTO v_incident FROM public.incidents WHERE id = NEW.incident_id;
  IF v_incident.id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.workflow_rules
     WHERE company_id = v_incident.company_id
       AND active = true
       AND trigger_event = 'comment_added'
       AND ticket_type = v_incident.ticket_type
       AND (trigger_source = 'any' OR trigger_source = v_incident.opened_via)
     ORDER BY priority_order ASC
  LOOP
    v_matched := public.workflow_eval_conditions(v_rule.conditions, v_incident);
    IF v_matched THEN
      PERFORM public.workflow_dispatch_actions(v_rule, v_incident);
    END IF;

    INSERT INTO public.workflow_execution_log
      (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
    VALUES (
      v_incident.company_id, v_rule.id, v_rule.name, v_incident.id, v_incident.number, 'comment_added', v_matched,
      CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
      CASE WHEN v_matched
           THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
           ELSE 'Condição não atendida'
      END
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_workflow_on_comment_added ON public.ticket_messages;
CREATE TRIGGER tg_workflow_on_comment_added
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_workflow_on_comment_added();

-- ─── 3. sla_breached: motor também dispara na varredura já existente ─
CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec  RECORD;
  v_inc  public.incidents;
  v_rule public.workflow_rules;
  v_matched BOOLEAN;
BEGIN
  -- (A) Estouro de RESPOSTA: ainda não respondido e prazo vencido.
  FOR v_rec IN
    SELECT id FROM public.incidents
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND responded_at IS NULL
       AND is_response_breached = false
       AND sla_response_deadline IS NOT NULL
       AND sla_response_deadline < now()
  LOOP
    UPDATE public.incidents
       SET is_response_breached = true
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'response'));
  END LOOP;

  -- (B) Estouro de SOLUÇÃO: ainda não resolvido e prazo vencido.
  FOR v_rec IN
    SELECT id FROM public.incidents
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND resolved_at IS NULL
       AND is_resolution_breached = false
       AND sla_resolution_deadline IS NOT NULL
       AND sla_resolution_deadline < now()
  LOOP
    UPDATE public.incidents
       SET is_resolution_breached = true,
           sla_breached           = true
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'resolution'));

    -- Motor de Automação: dispara regras 'sla_breached' para este chamado.
    SELECT * INTO v_inc FROM public.incidents WHERE id = v_rec.id;
    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id
         AND active = true
         AND trigger_event = 'sla_breached'
         AND ticket_type = v_inc.ticket_type
       ORDER BY priority_order ASC
    LOOP
      v_matched := public.workflow_eval_conditions(v_rule.conditions, v_inc);
      IF v_matched THEN
        PERFORM public.workflow_dispatch_actions(v_rule, v_inc);
      END IF;
      INSERT INTO public.workflow_execution_log
        (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
      VALUES (
        v_inc.company_id, v_rule.id, v_rule.name, v_inc.id, v_inc.number, 'sla_breached', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched
             THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
             ELSE 'Condição não atendida'
        END
      );
    END LOOP;
  END LOOP;
END;
$$;

-- ─── 4. sla_warning: nova varredura (<30min do prazo) ─────────
CREATE OR REPLACE FUNCTION public.check_sla_warnings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inc  public.incidents;
  v_rule public.workflow_rules;
  v_matched BOOLEAN;
BEGIN
  FOR v_inc IN
    SELECT * FROM public.incidents
     WHERE state::text NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND resolved_at IS NULL
       AND sla_warning_notified = false
       AND sla_resolution_deadline IS NOT NULL
       AND sla_resolution_deadline > now()
       AND sla_resolution_deadline - now() < INTERVAL '30 minutes'
  LOOP
    UPDATE public.incidents SET sla_warning_notified = true WHERE id = v_inc.id;

    FOR v_rule IN
      SELECT * FROM public.workflow_rules
       WHERE company_id = v_inc.company_id
         AND active = true
         AND trigger_event = 'sla_warning'
         AND ticket_type = v_inc.ticket_type
       ORDER BY priority_order ASC
    LOOP
      v_matched := public.workflow_eval_conditions(v_rule.conditions, v_inc);
      IF v_matched THEN
        PERFORM public.workflow_dispatch_actions(v_rule, v_inc);
      END IF;
      INSERT INTO public.workflow_execution_log
        (company_id, rule_id, rule_name, incident_id, incident_number, trigger_event, matched, status, actions_summary)
      VALUES (
        v_inc.company_id, v_rule.id, v_rule.name, v_inc.id, v_inc.number, 'sla_warning', v_matched,
        CASE WHEN v_matched THEN 'success' ELSE 'skipped' END,
        CASE WHEN v_matched
             THEN 'Ações aplicadas: ' || COALESCE((SELECT string_agg(a->>'type', ', ') FROM jsonb_array_elements(v_rule.actions) a), '—')
             ELSE 'Condição não atendida'
        END
      );
    END LOOP;
  END LOOP;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('check-sla-warnings');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'check-sla-warnings',
  '* * * * *',
  $$ SELECT public.check_sla_warnings(); $$
);

-- ─── 5. Claim atômico de lote da fila (para a Edge Function) ──
-- FOR UPDATE SKIP LOCKED evita duas execuções sobrepostas de
-- run-workflow-actions processarem a mesma linha.
CREATE OR REPLACE FUNCTION public.workflow_claim_queue_batch(p_limit INT DEFAULT 50)
RETURNS SETOF public.workflow_action_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.workflow_action_queue q
     SET status = 'processing'
   WHERE q.id IN (
     SELECT id FROM public.workflow_action_queue
      WHERE status = 'pending' AND run_after <= now()
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
   RETURNING q.*;
END;
$$;

-- ─── NOTA: gatilho 'scheduled' fora do escopo desta entrega ───
-- "Agendamento (cron)" não tem um chamado para avaliar condição
-- contra (ex: relatório diário sem contexto de ticket) — precisa
-- de uma semântica de produto própria (rodar contra todo chamado
-- aberto? disparar uma vez sem contexto?). A UI deve manter essa
-- opção desabilitada/"em breve" até essa decisão ser tomada.

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   INSERT INTO workflow_rules (company_id, ticket_type, name, trigger_event, conditions, actions)
--     SELECT company_id, 'incident', 'Teste P1', 'incident_created',
--       '[{"field":"priority","operator":"equals","value":"P1 - Critical","logicOp":"AND"}]'::jsonb,
--       '[{"type":"add_tag","params":{"tag":"teste-motor"}}]'::jsonb
--     FROM companies LIMIT 1;
--   -- criar um incidente P1 dessa empresa e conferir:
--   SELECT tags FROM incidents WHERE priority = 'P1 - Critical' ORDER BY created_at DESC LIMIT 1;
--   SELECT * FROM workflow_execution_log ORDER BY created_at DESC LIMIT 5;
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'check-sla-warnings';
-- ────────────────────────────────────────────────────────────
