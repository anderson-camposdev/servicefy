-- ============================================================
-- Flowfy ITSM — Migration 058
-- Motor de Automação (4/5): DISPATCHER DE AÇÕES.
--
-- workflow_dispatch_actions(rule, incident) percorre rule.actions
-- e separa por tipo:
--   SÍNCRONAS (aplicadas na mesma transação, direto no chamado):
--     assign_group, change_priority, change_state, add_tag,
--     escalate, send_notification (notifications já existe pronta),
--     set_field (allow-list explícito de campos — nunca SQL
--     dinâmico sobre nome de coluna arbitrário).
--   ASSÍNCRONAS (enfileiradas em workflow_action_queue para a
--   Edge Function run-workflow-actions drenar):
--     send_email, webhook, delay.
--
-- Idempotente.
-- ============================================================

-- ─── Helper: subir um nível de prioridade (escalate) ──────────
CREATE OR REPLACE FUNCTION public.workflow_bump_priority(p_current public.ticket_priority)
RETURNS public.ticket_priority
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_current
    WHEN 'P5 - Planning' THEN 'P4 - Low'::public.ticket_priority
    WHEN 'P4 - Low'      THEN 'P3 - Moderate'::public.ticket_priority
    WHEN 'P3 - Moderate' THEN 'P2 - High'::public.ticket_priority
    WHEN 'P2 - High'     THEN 'P1 - Critical'::public.ticket_priority
    ELSE 'P1 - Critical'::public.ticket_priority -- já no topo
  END;
$$;

-- ─── Dispatcher principal ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workflow_dispatch_actions(
  p_rule public.workflow_rules,
  p_incident public.incidents
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action    JSONB;
  v_type      TEXT;
  v_params    JSONB;
  v_group_id  UUID;
BEGIN
  FOR v_action IN SELECT * FROM jsonb_array_elements(p_rule.actions) LOOP
    v_type   := v_action->>'type';
    v_params := v_action->'params';

    IF v_type IN ('assign_group', 'change_priority', 'change_state', 'set_field', 'add_tag', 'send_notification', 'escalate') THEN
      -- ── SÍNCRONO ──────────────────────────────────────────────
      CASE v_type
        WHEN 'assign_group' THEN
          SELECT id INTO v_group_id
            FROM public.assignment_groups
           WHERE company_id = p_incident.company_id AND name = (v_params->>'group')
           LIMIT 1;
          IF v_group_id IS NOT NULL THEN
            UPDATE public.incidents
               SET assignment_group_id = v_group_id,
                   assigned_group_name = v_params->>'group'
             WHERE id = p_incident.id;
          END IF;

        WHEN 'change_priority' THEN
          UPDATE public.incidents
             SET priority = (v_params->>'value')::public.ticket_priority
           WHERE id = p_incident.id;

        WHEN 'change_state' THEN
          UPDATE public.incidents
             SET state = (v_params->>'value')::public.incident_state
           WHERE id = p_incident.id;

        WHEN 'set_field' THEN
          -- Allow-list explícito — nunca EXECUTE format(...) sobre nome de coluna.
          IF v_params->>'field' = 'category' THEN
            UPDATE public.incidents SET category = (v_params->>'value')::public.incident_category WHERE id = p_incident.id;
          ELSIF v_params->>'field' = 'priority' THEN
            UPDATE public.incidents SET priority = (v_params->>'value')::public.ticket_priority WHERE id = p_incident.id;
          END IF;

        WHEN 'add_tag' THEN
          UPDATE public.incidents
             SET tags = array_append(tags, v_params->>'tag')
           WHERE id = p_incident.id
             AND (v_params->>'tag') IS NOT NULL
             AND NOT (tags @> ARRAY[v_params->>'tag']);

        WHEN 'send_notification' THEN
          -- notifications.user_id é NOT NULL — chamado sem responsável não gera notificação.
          IF p_incident.assigned_to_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
            VALUES (p_incident.assigned_to_id, p_rule.name, COALESCE(v_params->>'message', p_rule.name), 'info', p_incident.id, p_incident.ticket_type);
          END IF;

        WHEN 'escalate' THEN
          UPDATE public.incidents
             SET priority = public.workflow_bump_priority(priority)
           WHERE id = p_incident.id;
      END CASE;
    ELSE
      -- ── ASSÍNCRONO (send_email, webhook, delay) ───────────────
      INSERT INTO public.workflow_action_queue (company_id, rule_id, incident_id, action, run_after)
      VALUES (
        p_incident.company_id, p_rule.id, p_incident.id, v_action,
        CASE WHEN v_type = 'delay'
             THEN now() + make_interval(mins => COALESCE((v_params->>'minutes')::INT, 0))
             ELSE now()
        END
      );
    END IF;
  END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT public.workflow_bump_priority('P4 - Low'::public.ticket_priority); -- deve retornar 'P3 - Moderate'
--   SELECT public.workflow_dispatch_actions(r.*, i.*)
--     FROM workflow_rules r, incidents i
--    WHERE r.id = '<id-de-teste>' AND i.number = 'INCxxxxxxx';
--   SELECT tags FROM incidents WHERE number = 'INCxxxxxxx';
--   SELECT * FROM workflow_action_queue ORDER BY created_at DESC LIMIT 5;
-- ────────────────────────────────────────────────────────────
