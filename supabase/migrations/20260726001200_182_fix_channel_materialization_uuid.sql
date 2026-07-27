-- ============================================================
-- 182 — P0: nenhuma mensagem de canal virava chamado
--
-- Descoberto em 26/07/2026 ao testar a conexão de Monitoramento, que usa o
-- mesmo caminho de materialização dos demais canais.
--
-- Em produção: 159 mensagens de entrada recebidas, ZERO materializadas.
-- Todo WhatsApp, e-mail ou mensagem de canal que chegou foi gravado em
-- channel_messages e nunca virou chamado — sem erro visível para quem
-- mandou, sem alerta para quem opera.
--
-- Causa raiz: tg_incidents_view_insert() chama uuid_generate_v4() SEM
-- QUALIFICAR o schema. Essa função vive em `extensions`, não em
-- pg_catalog. Quando o INSERT na view parte de uma sessão comum, o
-- search_path inclui `extensions` e resolve. Mas materialize_channel_message
-- é SECURITY DEFINER com `SET search_path TO ''` — endurecimento correto
-- contra sequestro de search_path — e ali o nome não resolve:
--
--     ERROR: function uuid_generate_v4() does not exist
--
-- O erro estourava dentro do gateway e a mensagem ficava para sempre com
-- ticket_message_id NULL.
--
-- Correção: gen_random_uuid(), nativa do PostgreSQL (pg_catalog) desde a
-- versão 13. Resolve com qualquer search_path, inclusive vazio, e dispensa
-- a extensão uuid-ossp. Trocar por `extensions.uuid_generate_v4()` também
-- funcionaria, mas manteria dependência de extensão onde o core já basta.
--
-- Único ponto afetado: nenhuma outra função em `public` chama
-- uuid_generate_v4() sem qualificação (verificado por varredura em pg_proc).
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_approval_status text;
  v_approval_paused_at timestamptz;
  v_item public.request_items;
  v_requester public.profiles;
  v_approver_count int := 0;
  v_dept_manager uuid;
  v_dept_alt uuid;
  v_group_id uuid;
  v_group_name text;
BEGIN
  IF NEW.ticket_type = 'request' AND NEW.request_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.request_items WHERE id = NEW.request_item_id;
    IF v_item.id IS NULL OR v_item.company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Item de requisi��o inv�lido ou pertencente a outro tenant';
    END IF;

    IF NEW.assignment_group_id IS NULL AND v_item.assignment_group_id IS NOT NULL THEN
      SELECT id, name INTO v_group_id, v_group_name
        FROM public.assignment_groups
       WHERE id = v_item.assignment_group_id AND company_id = NEW.company_id AND is_active = true;
    END IF;

    IF NOT v_item.requires_approval THEN
      v_approval_status := 'not_required';
    ELSE
      SELECT * INTO v_requester FROM public.profiles WHERE id = NEW.caller_id;

      IF v_item.approval_type = 'manager' THEN
        IF v_requester.manager_id IS NOT NULL THEN
          SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_requester.manager_id AND active = true;
        END IF;
        IF v_approver_count = 0 AND v_requester.alternate_manager_id IS NOT NULL THEN
          SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_requester.alternate_manager_id AND active = true;
        END IF;
      ELSIF v_item.approval_type = 'department_head' THEN
        IF v_requester.department IS NOT NULL THEN
          SELECT manager_id, alternate_manager_id INTO v_dept_manager, v_dept_alt
            FROM public.departments
           WHERE name = v_requester.department AND company_id = NEW.company_id AND active = true LIMIT 1;
          IF v_dept_manager IS NOT NULL THEN
            SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_dept_manager AND active = true;
          END IF;
          IF v_approver_count = 0 AND v_dept_alt IS NOT NULL THEN
            SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_dept_alt AND active = true;
          END IF;
        END IF;
      END IF;

      IF v_approver_count = 0 AND v_item.approval_group_id IS NOT NULL THEN
        SELECT count(*) INTO v_approver_count
        FROM public.user_groups ug
        JOIN public.profiles p ON p.id = ug.user_id
        WHERE ug.group_id = v_item.approval_group_id
          AND p.company_id = NEW.company_id
          AND p.active = true
          AND p.role::text <> 'end_user';
      END IF;

      IF v_approver_count = 0 THEN
        RAISE EXCEPTION 'Aprova��o necess�ria, mas nenhum aprovador ativo foi encontrado (Gestor/Departamento/Grupo)';
      END IF;

      v_approval_status := 'pending';
    END IF;
  ELSE
    v_approval_status := 'not_required';
  END IF;

  v_approval_paused_at := CASE WHEN v_approval_status = 'pending' THEN COALESCE(NEW.created_at, now()) ELSE NULL END;

  INSERT INTO public.tickets (
    id, number, company_id, ticket_type, short_description, description,
    priority, state, caller_id, caller_name, assigned_to_id, assigned_to_name,
    assigned_group_id, assigned_group_name, assignment_group_id, sla_breached,
    sla_response_deadline, sla_resolution_deadline, responded_at, resolved_at, closed_at,
    close_code, close_notes, resolution_code, resolution_notes, kb_candidate,
    created_at, updated_at, approval_status, approval_paused_at,
    catalog_symptom_id, catalog_item_id, catalog_subitem_id, catalog_service_id, symptom_id,
    priority_level, sla_managed_by_client, paused_at, accumulated_paused_time_minutes,
    pending_reason_id, is_response_breached, is_resolution_breached, request_subcategory_id,
    accumulated_reopen_time_minutes, tags, opened_via, sla_warning_notified,
    approval_decided_at, case_id
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.number, NEW.company_id,
    COALESCE(NEW.ticket_type, 'incident')::ticket_type_enum, NEW.short_description, NEW.description,
    COALESCE(NEW.priority, 'P3 - Moderate'::ticket_priority), COALESCE(NEW.state, 'New'::incident_state), NEW.caller_id, NEW.caller_name, NEW.assigned_to_id, NEW.assigned_to_name,
    COALESCE(NEW.assigned_group_id, v_group_id), COALESCE(NEW.assigned_group_name, v_group_name),
    COALESCE(NEW.assignment_group_id, v_group_id), COALESCE(NEW.sla_breached, false),
    NEW.sla_response_deadline, NEW.sla_resolution_deadline, NEW.responded_at, NEW.resolved_at, NEW.closed_at,
    NEW.close_code, NEW.close_notes, NEW.resolution_code, NEW.resolution_notes, COALESCE(NEW.kb_candidate, false),
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()), v_approval_status, v_approval_paused_at,
    NEW.catalog_symptom_id, NEW.catalog_item_id, NEW.catalog_subitem_id, NEW.catalog_service_id, NEW.symptom_id,
    NEW.priority_level, COALESCE(NEW.sla_managed_by_client, false), NEW.paused_at, COALESCE(NEW.accumulated_paused_time_minutes, 0),
    NEW.pending_reason_id, COALESCE(NEW.is_response_breached, false), COALESCE(NEW.is_resolution_breached, false), NEW.request_subcategory_id,
    COALESCE(NEW.accumulated_reopen_time_minutes, 0), COALESCE(NEW.tags, '{}'::text[]), NEW.opened_via, COALESCE(NEW.sla_warning_notified, false),
    NEW.approval_decided_at, NEW.case_id
  ) RETURNING id, number, state, created_at, updated_at INTO NEW.id, NEW.number, NEW.state, NEW.created_at, NEW.updated_at;

  IF COALESCE(NEW.ticket_type, 'incident') = 'incident' THEN
    INSERT INTO public.incident_attributes (
      ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id
    ) VALUES (
      NEW.id, NEW.company_id, COALESCE(NEW.category, 'Software'), NEW.impact, NEW.urgency, NEW.root_cause, NEW.workaround, COALESCE(NEW.is_major_incident, false), NEW.related_problem_id
    );
  ELSIF NEW.ticket_type = 'request' THEN
    INSERT INTO public.service_request_attributes (
      ticket_id, company_id, request_item_id, form_data, cost, currency
    ) VALUES (
      NEW.id, NEW.company_id, NEW.request_item_id, COALESCE(NEW.form_data, '{}'::jsonb), NEW.cost, NEW.currency
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Causa raiz de classe ────────────────────────────────────────────
-- Os três triggers INSTEAD OF da view `incidents` não fixavam search_path,
-- então herdavam o de quem chamava. Trocar uuid_generate_v4() por
-- gen_random_uuid() resolve UM símbolo; o problema é a classe inteira —
-- `ticket_type_enum`, `ticket_priority` e qualquer outro tipo ou função
-- não qualificada falham do mesmo jeito quando o chamador tem search_path
-- vazio. Fixar aqui resolve todos de uma vez e é também a prática correta
-- de segurança: função de gatilho não deve depender do ambiente do
-- chamador para resolver nomes.
ALTER FUNCTION public.tg_incidents_view_insert() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.tg_incidents_view_update() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.tg_incidents_view_delete() SET search_path TO 'public', 'extensions';
