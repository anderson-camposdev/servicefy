-- ============================================================
-- Flowfy ITSM — Migration 073
-- Confiabilidade do motor de automação:
--   • delay afeta todas as ações subsequentes;
--   • ações desconhecidas falham explicitamente;
--   • ações síncronas podem ser executadas pela fila após o delay;
--   • notificações sem assignee usam grupo/gestores;
--   • escalate aumenta prioridade e notifica a gestão;
--   • leases abandonados voltam à fila ou vão para failed.
-- ============================================================

ALTER TABLE public.workflow_action_queue
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS sequence_no INT NOT NULL DEFAULT 0;

ALTER TABLE public.workflow_action_queue
  DROP CONSTRAINT IF EXISTS workflow_action_queue_status_check;
ALTER TABLE public.workflow_action_queue
  ADD CONSTRAINT workflow_action_queue_status_check
  CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled'));
CREATE INDEX IF NOT EXISTS idx_workflow_queue_chain
  ON public.workflow_action_queue (chain_id, sequence_no);

-- ─── 1. Executor único de ações síncronas ───────────────────

CREATE OR REPLACE FUNCTION public.workflow_execute_sync_action(
  p_rule public.workflow_rules,
  p_incident public.incidents,
  p_action JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT := p_action->>'type';
  v_params JSONB := COALESCE(p_action->'params', '{}'::jsonb);
  v_group_id UUID;
  v_recipient TEXT := COALESCE(v_params->>'recipient', 'assignee');
  v_notified INT := 0;
BEGIN
  CASE v_type
    WHEN 'assign_group' THEN
      SELECT id INTO v_group_id
      FROM public.assignment_groups
      WHERE company_id = p_incident.company_id
        AND (id::text = v_params->>'group_id' OR name = v_params->>'group')
      LIMIT 1;
      IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Grupo de atribuição não encontrado';
      END IF;
      UPDATE public.incidents
         SET assignment_group_id = v_group_id,
             assigned_group_name = COALESCE(v_params->>'group', (
               SELECT name FROM public.assignment_groups WHERE id = v_group_id
             ))
       WHERE id = p_incident.id;

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
      ELSE
        RAISE EXCEPTION 'Campo não permitido em set_field: %', v_params->>'field';
      END IF;

    WHEN 'add_tag' THEN
      IF NULLIF(v_params->>'tag', '') IS NULL THEN
        RAISE EXCEPTION 'add_tag exige uma tag';
      END IF;
      UPDATE public.incidents
         SET tags = array_append(COALESCE(tags, ARRAY[]::TEXT[]), v_params->>'tag')
       WHERE id = p_incident.id
         AND NOT (COALESCE(tags, ARRAY[]::TEXT[]) @> ARRAY[v_params->>'tag']);

    WHEN 'send_notification' THEN
      IF v_recipient = 'requester' AND p_incident.caller_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
        VALUES (p_incident.caller_id, p_rule.name, COALESCE(v_params->>'message', p_rule.name), 'info', p_incident.id, p_incident.ticket_type);
      ELSIF v_recipient = 'managers' THEN
        INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
        SELECT id, p_rule.name, COALESCE(v_params->>'message', p_rule.name), 'warning', p_incident.id, p_incident.ticket_type
        FROM public.profiles
        WHERE company_id = p_incident.company_id AND active = true
          AND role::text IN ('company_admin', 'area_manager', 'it_manager');
      ELSIF p_incident.assigned_to_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
        VALUES (p_incident.assigned_to_id, p_rule.name, COALESCE(v_params->>'message', p_rule.name), 'info', p_incident.id, p_incident.ticket_type);
      ELSIF p_incident.assignment_group_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
        SELECT ug.user_id, p_rule.name, COALESCE(v_params->>'message', p_rule.name), 'info', p_incident.id, p_incident.ticket_type
        FROM public.user_groups ug
        JOIN public.profiles p ON p.id = ug.user_id AND p.active = true
        WHERE ug.group_id = p_incident.assignment_group_id;
      END IF;

      GET DIAGNOSTICS v_notified = ROW_COUNT;
      IF v_notified = 0 THEN
        INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
        SELECT id, p_rule.name, COALESCE(v_params->>'message', p_rule.name), 'warning', p_incident.id, p_incident.ticket_type
        FROM public.profiles
        WHERE company_id = p_incident.company_id AND active = true
          AND role::text IN ('company_admin', 'area_manager', 'it_manager');
        GET DIAGNOSTICS v_notified = ROW_COUNT;
      END IF;
      IF v_notified = 0 THEN
        RAISE EXCEPTION 'Nenhum destinatário elegível para send_notification';
      END IF;

    WHEN 'escalate' THEN
      UPDATE public.incidents
         SET priority = public.workflow_bump_priority(priority)
       WHERE id = p_incident.id;

      INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
      SELECT id,
             'Escalonamento: ' || p_incident.number,
             COALESCE(v_params->>'message', p_rule.name || ' escalonou o chamado.'),
             'warning', p_incident.id, p_incident.ticket_type
      FROM public.profiles
      WHERE company_id = p_incident.company_id AND active = true
        AND role::text IN ('company_admin', 'area_manager', 'it_manager');
      GET DIAGNOSTICS v_notified = ROW_COUNT;
      IF v_notified = 0 AND p_incident.assignment_group_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
        SELECT ug.user_id, 'Escalonamento: ' || p_incident.number,
               COALESCE(v_params->>'message', p_rule.name || ' escalonou o chamado.'),
               'warning', p_incident.id, p_incident.ticket_type
        FROM public.user_groups ug
        JOIN public.profiles p ON p.id = ug.user_id AND p.active = true
        WHERE ug.group_id = p_incident.assignment_group_id;
        GET DIAGNOSTICS v_notified = ROW_COUNT;
      END IF;
      IF v_notified = 0 AND p_incident.assigned_to_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
        VALUES (p_incident.assigned_to_id, 'Escalonamento: ' || p_incident.number,
                COALESCE(v_params->>'message', p_rule.name || ' escalonou o chamado.'),
                'warning', p_incident.id, p_incident.ticket_type);
        v_notified := 1;
      END IF;
      IF v_notified = 0 THEN
        RAISE EXCEPTION 'Escalonamento sem gestor, grupo ou responsável elegível';
      END IF;

    ELSE
      RAISE EXCEPTION 'Ação síncrona desconhecida: %', v_type;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.workflow_execute_sync_action(
  public.workflow_rules, public.incidents, JSONB
) FROM PUBLIC, anon, authenticated;

-- ─── 2. Dispatcher sequencial ───────────────────────────────

CREATE OR REPLACE FUNCTION public.workflow_dispatch_actions(
  p_rule public.workflow_rules,
  p_incident public.incidents
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action JSONB;
  v_type TEXT;
  v_params JSONB;
  v_run_after TIMESTAMPTZ := now();
  v_chain_id UUID := gen_random_uuid();
  v_sequence_no INT := 0;
  v_queue_rest BOOLEAN := false;
  v_incident public.incidents := p_incident;
  v_sync_types CONSTANT TEXT[] := ARRAY[
    'assign_group', 'change_priority', 'change_state', 'set_field',
    'add_tag', 'send_notification', 'escalate'
  ];
  v_async_types CONSTANT TEXT[] := ARRAY['send_email', 'webhook'];
BEGIN
  FOR v_action IN SELECT * FROM jsonb_array_elements(p_rule.actions) LOOP
    v_type := v_action->>'type';
    v_params := COALESCE(v_action->'params', '{}'::jsonb);

    IF v_type = 'delay' THEN
      IF COALESCE((v_params->>'minutes')::INT, 0) < 0 THEN
        RAISE EXCEPTION 'delay não aceita minutos negativos';
      END IF;
      v_run_after := v_run_after + make_interval(mins => COALESCE((v_params->>'minutes')::INT, 0));
      v_queue_rest := true;
    ELSIF v_type = ANY (v_sync_types) AND NOT v_queue_rest AND v_run_after <= now() THEN
      PERFORM public.workflow_execute_sync_action(p_rule, v_incident, v_action);
      SELECT * INTO v_incident FROM public.incidents WHERE id = p_incident.id;
    ELSIF v_type = ANY (v_sync_types) OR v_type = ANY (v_async_types) THEN
      v_sequence_no := v_sequence_no + 1;
      INSERT INTO public.workflow_action_queue
        (company_id, rule_id, incident_id, action, run_after, chain_id, sequence_no)
      VALUES
        (p_incident.company_id, p_rule.id, p_incident.id, v_action, v_run_after, v_chain_id, v_sequence_no);
      v_queue_rest := true;
    ELSE
      RAISE EXCEPTION 'Tipo de ação desconhecido: %', COALESCE(v_type, '(nulo)');
    END IF;
  END LOOP;
END;
$$;

-- Executor chamado exclusivamente pelo worker service_role para ações
-- síncronas que ficaram atrás de um delay.
CREATE OR REPLACE FUNCTION public.workflow_run_queued_sync(p_queue_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.workflow_action_queue;
  v_rule public.workflow_rules;
  v_incident public.incidents;
BEGIN
  SELECT * INTO v_queue FROM public.workflow_action_queue
   WHERE id = p_queue_id AND status = 'processing' FOR UPDATE;
  IF v_queue.id IS NULL THEN RAISE EXCEPTION 'Item de fila não está em processing'; END IF;

  SELECT * INTO v_rule FROM public.workflow_rules WHERE id = v_queue.rule_id;
  SELECT * INTO v_incident FROM public.incidents WHERE id = v_queue.incident_id;
  IF v_rule.id IS NULL OR v_incident.id IS NULL THEN
    RAISE EXCEPTION 'Regra ou chamado da fila não existe mais';
  END IF;

  PERFORM public.workflow_execute_sync_action(v_rule, v_incident, v_queue.action);
END;
$$;

REVOKE ALL ON FUNCTION public.workflow_run_queued_sync(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_run_queued_sync(UUID) TO service_role;

-- ─── 3. Lease e recuperação de workers interrompidos ────────

CREATE OR REPLACE FUNCTION public.workflow_claim_queue_batch(p_limit INT DEFAULT 50)
RETURNS SETOF public.workflow_action_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se uma ação anterior da mesma cadeia falhou, as posteriores não podem
  -- executar fora de ordem nem produzir efeitos parciais inesperados.
  UPDATE public.workflow_action_queue q
     SET status = 'cancelled',
         last_error = 'Cancelada porque uma ação anterior da cadeia falhou',
         processed_at = now()
   WHERE q.status = 'pending'
     AND q.chain_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.workflow_action_queue previous
       WHERE previous.chain_id = q.chain_id
         AND previous.sequence_no < q.sequence_no
         AND previous.status IN ('failed', 'cancelled')
     );

  -- Itens abandonados há mais de cinco minutos voltam à fila. Depois do
  -- limite de tentativas, são encerrados como failed em vez de sumirem.
  UPDATE public.workflow_action_queue
     SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
         attempts = attempts + 1,
         last_error = 'Lease expirado: worker interrompido durante o processamento',
         run_after = CASE WHEN attempts + 1 >= max_attempts THEN run_after ELSE now() END,
         processed_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
         claimed_at = NULL
  WHERE status = 'processing'
     AND (claimed_at IS NULL OR claimed_at < now() - INTERVAL '5 minutes');

  RETURN QUERY
  UPDATE public.workflow_action_queue q
     SET status = 'processing', claimed_at = now()
   WHERE q.id IN (
     SELECT candidate.id FROM public.workflow_action_queue candidate
      WHERE candidate.status = 'pending'
        AND candidate.attempts < candidate.max_attempts
        AND candidate.run_after <= now()
        AND (
          candidate.chain_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM public.workflow_action_queue previous
            WHERE previous.chain_id = candidate.chain_id
              AND previous.sequence_no < candidate.sequence_no
              AND previous.status <> 'done'
          )
        )
      ORDER BY candidate.run_after, candidate.created_at, candidate.sequence_no
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
      FOR UPDATE SKIP LOCKED
   )
   RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.workflow_claim_queue_batch(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_claim_queue_batch(INT) TO service_role;
