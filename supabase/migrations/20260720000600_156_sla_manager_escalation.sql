-- ServiceFY — escalonamento de SLA para gestão. Achado da auditoria ITSM:
-- check_sla_warnings/check_sla_breaches só notificavam quem já estava
-- atribuído ao chamado (via ação 'send_notification' de workflow_rules, e
-- só SE o tenant tivesse configurado uma regra para isso — sem regra
-- configurada, nada acontecia), e nunca por e-mail. Um chamado podia
-- estourar SLA sem que nenhum gestor soubesse até o cliente reclamar.
--
-- Corrigido tornando a notificação de gestão INCONDICIONAL (não depende de
-- workflow_rules configurada pelo tenant) — mesmo princípio já usado para
-- timestamps de SLA: comportamento crítico de governança não pode depender
-- de configuração opcional. Gestores (ops_manager/governance_manager/
-- company_admin) do tenant recebem notificação in-app + e-mail (via a fila
-- workflow_action_queue já existente, action 'send_email', processada pelo
-- worker run-workflow-actions já implantado) quando um chamado está prestes
-- a estourar o SLA de resolução e quando de fato estoura.

CREATE OR REPLACE FUNCTION public.notify_ticket_managers(
  p_incident public.tickets,
  p_kind text,
  p_title text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager record;
BEGIN
  FOR v_manager IN
    SELECT p.id, p.email FROM public.profiles p
     WHERE p.company_id = p_incident.company_id
       AND p.active = true
       AND p.role::text IN ('ops_manager', 'governance_manager', 'company_admin')
  LOOP
    INSERT INTO public.notifications (company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type)
    VALUES (p_incident.company_id, v_manager.id, p_title, p_message, 'warning', p_incident.id, p_incident.ticket_type);

    IF v_manager.email IS NOT NULL THEN
      INSERT INTO public.workflow_action_queue (company_id, rule_id, incident_id, action, run_after)
      VALUES (
        p_incident.company_id, NULL, p_incident.id,
        jsonb_build_object(
          'type', 'send_email',
          'params', jsonb_build_object(
            'recipients', v_manager.email,
            'subject', '[ServiceFY] ' || p_title,
            'body', p_message
          )
        ),
        now()
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_ticket_managers(public.tickets, text, text, text) FROM PUBLIC, anon, authenticated;

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

-- Bug pré-existente encontrado ao testar a migration acima: a ação
-- 'send_notification' do motor de automação (migration 058) nunca informava
-- notifications.company_id (NOT NULL, sem default) — qualquer regra de
-- workflow com essa ação configurada falharia com violação de constraint
-- assim que disparasse. Provavelmente nunca foi exercitado em produção
-- porque nenhum tenant tinha uma regra assim configurada ainda. Corrigido
-- de passagem, mesma classe de bug do achado acima.
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
          IF p_incident.assigned_to_id IS NOT NULL THEN
            INSERT INTO public.notifications (company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type)
            VALUES (p_incident.company_id, p_incident.assigned_to_id, p_rule.name, COALESCE(v_params->>'message', p_rule.name), 'info', p_incident.id, p_incident.ticket_type);
          END IF;

        WHEN 'escalate' THEN
          UPDATE public.incidents
             SET priority = public.workflow_bump_priority(priority)
           WHERE id = p_incident.id;
      END CASE;
    ELSE
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
