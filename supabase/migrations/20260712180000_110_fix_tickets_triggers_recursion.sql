-- ServiceFY — Fase 15: saneamento de triggers de tickets pós-divisão polimórfica (096).
--
-- Ver análise completa no changelog do commit. Resumo: a view "incidents"
-- (INSTEAD OF INSERT/UPDATE sobre tickets + incident_attributes/
-- service_request_attributes) nunca terminou de ser sincronizada com o schema
-- novo. Cinco triggers de tickets ficaram quebrados ou recursivos como
-- consequência direta.

-- ═══ 1) Recursão infinita: sync_incident_to_case ↔ tg_incidents_view_update ═══
--
-- Causa raiz: tg_incidents_view_update fazia "UPDATE tickets SET ..." sem
-- incluir case_id na lista de colunas — então "UPDATE incidents SET case_id=..."
-- (chamado de dentro de sync_incident_to_case) nunca persistia o valor. Como
-- case_id nunca deixava de ser NULL, sync_incident_to_case sempre reentrava na
-- mesma ramificação (criar caso + tentar gravar case_id de novo) a cada
-- refire da trigger AFTER UPDATE sem WHEN clause, até estourar a pilha.
--
-- Corrigido em duas camadas: (a) case_id agora é encaminhado corretamente,
-- então o valor persiste já na primeira passada, bastando para quebrar o loop
-- sozinho; (b) uma flag de reentrância por transação como cinto de segurança
-- independente, para qualquer causa futura de recursão indireta via a view.
--
-- Não usamos pg_trigger_depth() aqui: medido empiricamente, a MESMA invocação
-- "de primeiro nível" desta trigger já roda em profundidade 2 quando chamada
-- através da view incidents (INSTEAD OF INSERT/UPDATE aninha um INSERT/UPDATE
-- real em tickets), mas em profundidade 1 se algo inserir direto em tickets.
-- Um limiar fixo de profundidade seria correto para um caminho e errado para
-- o outro — foi exatamente esse engano, testado e corrigido durante esta
-- migration, que silenciava a sincronização de caso por completo. Uma flag de
-- sessão via set_config(..., is_local=true) identifica reentrância de forma
-- inequívoca, independente de quantos níveis de trigger existem acima.
CREATE OR REPLACE FUNCTION public.sync_incident_to_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain_id uuid;
  v_type_id uuid;
  v_case_id uuid;
  v_priority smallint;
BEGIN
  IF current_setting('servicefy.sync_incident_to_case_active', true) = 'on' THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('servicefy.sync_incident_to_case_active', 'on', true);

  SELECT d.id, ct.id INTO v_domain_id, v_type_id
  FROM public.service_domains d
  JOIN public.case_types ct ON ct.service_domain_id = d.id AND ct.key = 'incident'
  WHERE d.company_id = NEW.company_id AND d.key = 'it';

  v_priority := CASE
    WHEN NEW.priority::text LIKE 'P1%' THEN 1 WHEN NEW.priority::text LIKE 'P2%' THEN 2
    WHEN NEW.priority::text LIKE 'P3%' THEN 3 WHEN NEW.priority::text LIKE 'P5%' THEN 5
    ELSE 4
  END;

  IF NEW.case_id IS NULL THEN
    INSERT INTO public.cases(
      company_id, service_domain_id, case_type_id, number, title, description, state, priority,
      requester_id, assigned_to_id, assignment_group_id, visibility, source_channel, created_at, updated_at
    ) VALUES (
      NEW.company_id, v_domain_id, v_type_id, NEW.number, NEW.short_description, NEW.description,
      NEW.state::text, v_priority, NEW.caller_id, NEW.assigned_to_id, NEW.assignment_group_id,
      'standard', COALESCE(NEW.opened_via, 'manual'), NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (company_id, number) DO UPDATE SET
      title = EXCLUDED.title, description = EXCLUDED.description, state = EXCLUDED.state,
      priority = EXCLUDED.priority, updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_case_id;
    -- Grava direto em tickets, não na view: um UPDATE incidents aqui refaria
    -- todo o cascade de tg_incidents_view_update (recomputar prioridade,
    -- re-upsertar incident_attributes) só para setar uma coluna — e colidia
    -- com o INSERT (não idempotente) que tg_incidents_view_insert ainda ia
    -- fazer em incident_attributes logo em seguida, na mesma transação. Esta
    -- função já é SECURITY DEFINER; é uma escrita interna de bookkeeping, não
    -- uma edição de usuário — não precisa passar pela view.
    UPDATE public.tickets SET case_id = v_case_id WHERE id = NEW.id AND case_id IS NULL;
  ELSE
    UPDATE public.cases SET
      title = NEW.short_description, description = NEW.description, state = NEW.state::text,
      priority = v_priority, requester_id = NEW.caller_id, assigned_to_id = NEW.assigned_to_id,
      assignment_group_id = NEW.assignment_group_id, updated_at = NEW.updated_at
    WHERE id = NEW.case_id;
  END IF;

  PERFORM set_config('servicefy.sync_incident_to_case_active', 'off', true);
  RETURN NEW;
END;
$$;

-- ═══ 2) tg_incidents_view_insert / tg_incidents_view_update ═══
--
-- Passam a: (a) encaminhar case_id (correção da recursão acima); (b) calcular
-- a prioridade a partir de impact/urgency (antes feito por
-- trg_set_incident_priority, agora removida de tickets — ver seção 3); (c)
-- calcular approval_status de requisições (antes feito por
-- tg_prepare_request_approval, agora removida de tickets — ver seção 4). Em
-- ambos os casos o motivo é o mesmo: NEW.impact/NEW.urgency/NEW.request_item_id
-- só existem no nível da VIEW — no INSERT, incident_attributes/
-- service_request_attributes ainda nem existem; no UPDATE, só são
-- upsertadas DEPOIS do UPDATE em tickets nesta mesma função. Um trigger em
-- tickets nunca veria o dado fresco; calcular aqui, onde o dado da view
-- realmente está, é a única forma correta.
CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_priority public.ticket_priority;
  v_approval_status text;
  v_item public.request_items;
  v_requester public.profiles;
  v_approver_count int := 0;
  v_dept_manager uuid;
  v_dept_alt uuid;
BEGIN
  -- (b) Prioridade a partir de impact/urgência, quando informados; senão mantém o que veio.
  v_priority := NEW.priority;
  IF NEW.ticket_type IS NULL OR NEW.ticket_type = 'incident' THEN
    IF NEW.impact IS NOT NULL AND NEW.urgency IS NOT NULL THEN
      v_priority := public.calculate_incident_priority(NEW.impact, NEW.urgency);
    END IF;
  END IF;

  -- (c) approval_status de requisições (lógica portada de tg_prepare_request_approval).
  IF NEW.ticket_type <> 'request' OR NEW.request_item_id IS NULL THEN
    v_approval_status := 'not_required';
  ELSE
    SELECT * INTO v_item FROM public.request_items WHERE id = NEW.request_item_id;
    IF v_item.id IS NULL OR v_item.company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Item de requisição inválido ou pertencente a outro tenant';
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
        RAISE EXCEPTION 'Aprovação necessária, mas nenhum aprovador ativo foi encontrado (Gestor/Departamento/Grupo)';
      END IF;

      v_approval_status := 'pending';
    END IF;
  END IF;

  INSERT INTO public.tickets (
    id, number, company_id, ticket_type, short_description, description,
    priority, state, caller_id, caller_name, assigned_to_id, assigned_to_name,
    assigned_group_id, assigned_group_name, assignment_group_id, sla_breached,
    sla_response_deadline, sla_resolution_deadline, responded_at, resolved_at, closed_at,
    created_at, updated_at, approval_status,
    catalog_symptom_id, catalog_item_id, catalog_subitem_id, catalog_service_id, symptom_id,
    case_id
  ) VALUES (
    COALESCE(NEW.id, uuid_generate_v4()), NEW.number, NEW.company_id,
    COALESCE(NEW.ticket_type, 'incident')::ticket_type_enum, NEW.short_description, NEW.description,
    v_priority, NEW.state, NEW.caller_id, NEW.caller_name, NEW.assigned_to_id, NEW.assigned_to_name,
    NEW.assigned_group_id, NEW.assigned_group_name, NEW.assignment_group_id, NEW.sla_breached,
    NEW.sla_response_deadline, NEW.sla_resolution_deadline, NEW.responded_at, NEW.resolved_at, NEW.closed_at,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()), v_approval_status,
    NEW.catalog_symptom_id, NEW.catalog_item_id, NEW.catalog_subitem_id, NEW.catalog_service_id, NEW.symptom_id,
    NEW.case_id
  ) RETURNING id INTO NEW.id;

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
$$;

CREATE OR REPLACE FUNCTION public.tg_incidents_view_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_priority public.ticket_priority;
BEGIN
  v_priority := NEW.priority;
  IF NEW.ticket_type IS NULL OR NEW.ticket_type = 'incident' THEN
    IF NEW.impact IS NOT NULL AND NEW.urgency IS NOT NULL THEN
      v_priority := public.calculate_incident_priority(NEW.impact, NEW.urgency);
    END IF;
  END IF;

  UPDATE public.tickets SET
    number = NEW.number,
    company_id = NEW.company_id,
    ticket_type = NEW.ticket_type::ticket_type_enum,
    short_description = NEW.short_description,
    description = NEW.description,
    priority = v_priority,
    state = NEW.state,
    caller_id = NEW.caller_id,
    caller_name = NEW.caller_name,
    assigned_to_id = NEW.assigned_to_id,
    assigned_to_name = NEW.assigned_to_name,
    assigned_group_id = NEW.assigned_group_id,
    assigned_group_name = NEW.assigned_group_name,
    assignment_group_id = NEW.assignment_group_id,
    sla_breached = NEW.sla_breached,
    sla_response_deadline = NEW.sla_response_deadline,
    sla_resolution_deadline = NEW.sla_resolution_deadline,
    responded_at = NEW.responded_at,
    resolved_at = NEW.resolved_at,
    closed_at = NEW.closed_at,
    updated_at = COALESCE(NEW.updated_at, NOW()),
    approval_status = NEW.approval_status,
    case_id = NEW.case_id
  WHERE id = OLD.id;

  IF NEW.ticket_type = 'incident' THEN
    INSERT INTO public.incident_attributes (
      ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id
    ) VALUES (
      OLD.id, NEW.company_id, COALESCE(NEW.category, 'Software'), NEW.impact, NEW.urgency, NEW.root_cause, NEW.workaround, COALESCE(NEW.is_major_incident, false), NEW.related_problem_id
    ) ON CONFLICT (ticket_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      category = EXCLUDED.category,
      impact = EXCLUDED.impact,
      urgency = EXCLUDED.urgency,
      root_cause = EXCLUDED.root_cause,
      workaround = EXCLUDED.workaround,
      is_major_incident = EXCLUDED.is_major_incident,
      related_problem_id = EXCLUDED.related_problem_id;
  ELSIF NEW.ticket_type = 'request' THEN
    INSERT INTO public.service_request_attributes (
      ticket_id, company_id, request_item_id, form_data, cost, currency
    ) VALUES (
      OLD.id, NEW.company_id, NEW.request_item_id, COALESCE(NEW.form_data, '{}'::jsonb), NEW.cost, NEW.currency
    ) ON CONFLICT (ticket_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      request_item_id = EXCLUDED.request_item_id,
      form_data = EXCLUDED.form_data,
      cost = EXCLUDED.cost,
      currency = EXCLUDED.currency;
  END IF;

  RETURN NEW;
END;
$$;

-- ═══ 3) Desativa set_incident_priority_trigger em tickets ═══
-- Lógica portada para dentro das funções da view acima (única forma de ver
-- impact/urgency frescos). A trigger em tickets nunca poderia funcionar
-- corretamente: a coluna não existe na tabela.
DROP TRIGGER IF EXISTS set_incident_priority_trigger ON public.tickets;

-- ═══ 4) Desativa tg_prepare_request_approval em tickets ═══
-- Lógica portada para dentro de tg_incidents_view_insert acima (INSERT-only,
-- igual à trigger original). Mesmo motivo: request_item_id não existe em
-- tickets.
DROP TRIGGER IF EXISTS tg_prepare_request_approval ON public.tickets;

-- ═══ 5) Retarget tg_create_request_approvals: tickets -> service_request_attributes ═══
-- request_item_id é coluna nativa aqui, e o ticket correspondente já está
-- commitado nesta mesma transação (tg_incidents_view_insert insere em tickets
-- antes de inserir em service_request_attributes) — sem risco de dado
-- ausente/desatualizado.
DROP TRIGGER IF EXISTS tg_create_request_approvals ON public.tickets;

CREATE OR REPLACE FUNCTION public.tg_create_request_approvals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.tickets;
  v_item public.request_items;
  v_requester public.profiles;
  v_approver_id uuid := NULL;
  v_dept_manager uuid;
  v_dept_alt uuid;
BEGIN
  SELECT * INTO v_ticket FROM public.tickets WHERE id = NEW.ticket_id;
  IF v_ticket.id IS NULL OR v_ticket.approval_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_item FROM public.request_items WHERE id = NEW.request_item_id;
  SELECT * INTO v_requester FROM public.profiles WHERE id = v_ticket.caller_id;

  IF v_item.approval_type = 'manager' THEN
    IF v_requester.manager_id IS NOT NULL THEN
      SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_requester.manager_id AND active = true;
    END IF;
    IF v_approver_id IS NULL AND v_requester.alternate_manager_id IS NOT NULL THEN
      SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_requester.alternate_manager_id AND active = true;
    END IF;
  ELSIF v_item.approval_type = 'department_head' THEN
    IF v_requester.department IS NOT NULL THEN
      SELECT manager_id, alternate_manager_id INTO v_dept_manager, v_dept_alt
        FROM public.departments
       WHERE name = v_requester.department AND company_id = NEW.company_id AND active = true LIMIT 1;
      IF v_dept_manager IS NOT NULL THEN
        SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_dept_manager AND active = true;
      END IF;
      IF v_approver_id IS NULL AND v_dept_alt IS NOT NULL THEN
        SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_dept_alt AND active = true;
      END IF;
    END IF;
  END IF;

  IF v_approver_id IS NOT NULL THEN
    INSERT INTO public.request_approvals (company_id, incident_id, approver_id)
    VALUES (NEW.company_id, NEW.ticket_id, v_approver_id)
    ON CONFLICT (incident_id, approver_id) DO NOTHING;

    INSERT INTO public.notifications
      (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
    VALUES (
      v_approver_id, 'Nova aprovação pendente',
      'A requisição ' || v_ticket.number || ' aguarda sua decisão.',
      'info', NEW.ticket_id, 'request'
    );
  ELSIF v_item.approval_group_id IS NOT NULL THEN
    INSERT INTO public.request_approvals (company_id, incident_id, approver_id)
    SELECT NEW.company_id, NEW.ticket_id, p.id
    FROM public.user_groups ug
    JOIN public.profiles p ON p.id = ug.user_id
    WHERE ug.group_id = v_item.approval_group_id
      AND p.company_id = NEW.company_id
      AND p.active = true
      AND p.role::text <> 'end_user'
    ON CONFLICT (incident_id, approver_id) DO NOTHING;

    INSERT INTO public.notifications
      (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
    SELECT p.id, 'Nova aprovação pendente',
      'A requisição ' || v_ticket.number || ' aguarda sua decisão.',
      'info', NEW.ticket_id, 'request'
    FROM public.user_groups ug
    JOIN public.profiles p ON p.id = ug.user_id
    WHERE ug.group_id = v_item.approval_group_id
      AND p.company_id = NEW.company_id
      AND p.active = true
      AND p.role::text <> 'end_user';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_create_request_approvals
  AFTER INSERT ON public.service_request_attributes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_create_request_approvals();

-- ═══ 6) tg_handle_sla_pause: request_item_id via subquery ═══
-- Fix pontual, sem relocar: por essa altura o ticket já existe (trigger só
-- roda em UPDATE de state/pending_reason_id de um ticket já criado), então
-- service_request_attributes já está populada e a leitura é confiável.
CREATE OR REPLACE FUNCTION public.tg_handle_sla_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused_states text[] := ARRAY['On Hold', 'Pending User'];
  v_closed_states text[] := ARRAY['Resolved', 'Closed'];
  v_was_paused boolean;
  v_is_paused boolean;
  v_was_closed boolean;
  v_is_closed boolean;
  v_now timestamptz := clock_timestamp();
  v_calendar uuid;
  v_paused_mins int;
  v_reopen_mins int;
  v_pauses_sla boolean := true;
  v_request_item_id uuid;
BEGIN
  IF NEW.ticket_type = 'request' THEN
    SELECT request_item_id INTO v_request_item_id
      FROM public.service_request_attributes
     WHERE ticket_id = NEW.id;
  END IF;

  IF NEW.pending_reason_id IS NOT NULL THEN
    SELECT COALESCE(pauses_sla, true) INTO v_pauses_sla
      FROM public.pending_reasons
     WHERE id = NEW.pending_reason_id;
  END IF;

  v_was_paused := OLD.state::text = ANY (v_paused_states) AND COALESCE((
    SELECT COALESCE(pauses_sla, true)
      FROM public.pending_reasons
     WHERE id = OLD.pending_reason_id
  ), true);

  v_is_paused := NEW.state::text = ANY (v_paused_states) AND v_pauses_sla;

  IF v_is_paused AND NOT v_was_paused THEN
    NEW.paused_at := v_now;
    RETURN NEW;
  END IF;

  IF v_was_paused AND NOT v_is_paused AND OLD.paused_at IS NOT NULL THEN
    v_calendar := public.sla_calendar_for(NEW.symptom_id, v_request_item_id, NEW.company_id);
    v_paused_mins := public.sla_business_minutes_between(v_calendar, OLD.paused_at, v_now);

    NEW.accumulated_paused_time_minutes :=
      COALESCE(OLD.accumulated_paused_time_minutes, 0) + COALESCE(v_paused_mins, 0);
    NEW.paused_at := NULL;

    IF v_paused_mins > 0 THEN
      IF NEW.sla_response_deadline IS NOT NULL AND NEW.responded_at IS NULL THEN
        NEW.sla_response_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_response_deadline, v_paused_mins);
      END IF;
      IF NEW.sla_resolution_deadline IS NOT NULL THEN
        NEW.sla_resolution_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_resolution_deadline, v_paused_mins);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  v_was_closed := OLD.state::text = ANY (v_closed_states);
  v_is_closed := NEW.state::text = ANY (v_closed_states);

  IF v_was_closed AND NOT v_is_closed AND OLD.resolved_at IS NOT NULL THEN
    v_calendar := public.sla_calendar_for(NEW.symptom_id, v_request_item_id, NEW.company_id);
    v_reopen_mins := public.sla_business_minutes_between(v_calendar, OLD.resolved_at, v_now);

    NEW.accumulated_reopen_time_minutes :=
      COALESCE(OLD.accumulated_reopen_time_minutes, 0) + COALESCE(v_reopen_mins, 0);

    IF v_reopen_mins > 0 THEN
      IF NEW.sla_response_deadline IS NOT NULL AND NEW.responded_at IS NULL THEN
        NEW.sla_response_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_response_deadline, v_reopen_mins);
      END IF;
      IF NEW.sla_resolution_deadline IS NOT NULL THEN
        NEW.sla_resolution_deadline :=
          public.sla_add_business_minutes(v_calendar, NEW.sla_resolution_deadline, v_reopen_mins);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- trg_set_incident_priority fica órfã (nenhuma trigger mais a referencia) —
-- mantida no schema por segurança (poderia estar referenciada em algum lugar
-- fora do que este migration consegue ver), só a trigger em tickets foi
-- removida. Sem custo: função não é chamada por ninguém.
