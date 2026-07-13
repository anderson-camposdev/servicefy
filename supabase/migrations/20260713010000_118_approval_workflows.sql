-- ServiceFY — Fase 21: Motor de Aprovações Departamentais para Service
-- Requests (ITIL v4). request_approvals/decide_request_approval/
-- tg_create_request_approvals já existiam (migrations 072/095), mas quatro
-- regressões/bugs pré-existentes deixavam o motor inteiro inoperante — todos
-- confirmados empiricamente via psql antes desta migration (ver análise no
-- commit). Esta migration conserta os quatro, adiciona a pausa de SLA
-- durante approval_status='pending' e a resolução de assignment_group_id a
-- partir de request_items para requisições.

-- ─── 1) Pausa de SLA durante aprovação pendente ────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS approval_paused_at timestamptz;

COMMENT ON COLUMN public.tickets.approval_paused_at IS 'Fase 21: timestamp de quando approval_status entrou em pending. tg_handle_approval_sla_pause usa para empurrar sla_response_deadline/sla_resolution_deadline pelos minutos úteis gastos aguardando aprovação, na saída de pending (aprovado ou rejeitado) — mesmo padrão de tg_handle_sla_pause para On Hold, em coluna separada para não colidir com aquela pausa.';

-- ─── 2) Restaura o cálculo de approval_status + resolve o grupo do item de
-- requisição — ambos só existem no nível da VIEW no INSERT (request_item_id
-- só está em service_request_attributes, nunca em tickets; o UPSERT dessa
-- tabela só acontece MAIS ABAIXO nesta mesma função) ────────────────────────
--
-- Achado #1 (regressão da Fase 18): tg_incidents_view_insert foi reescrita na
-- migration 115 para encaminhar close_code/resolution_code/kb_candidate, mas
-- a reescrita partiu de uma versão anterior à migration 110 e perdeu, sem
-- querer, o cálculo de approval_status (que virou um simples
-- COALESCE(NEW.approval_status, 'not_required') — nenhuma requisição volta a
-- entrar na fila de aprovação desde então). Restaurado abaixo, fundido com a
-- lógica desta fase.
CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
      RAISE EXCEPTION 'Item de requisição inválido ou pertencente a outro tenant';
    END IF;

    -- Fase 21, achado adicional: tg_triage_incident nunca lê
    -- request_items.assignment_group_id (não é o mesmo caminho de resolução
    -- de grupo usado por incidentes) e nem poderia — request_item_id não
    -- existe em tickets, só aqui na view. Resolve aqui; tg_triage_incident já
    -- respeita "IF NEW.assignment_group_id IS NULL" e não sobrescreve.
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
        RAISE EXCEPTION 'Aprovação necessária, mas nenhum aprovador ativo foi encontrado (Gestor/Departamento/Grupo)';
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
    catalog_symptom_id, catalog_item_id, catalog_subitem_id, catalog_service_id, symptom_id
  ) VALUES (
    COALESCE(NEW.id, uuid_generate_v4()), NEW.number, NEW.company_id,
    COALESCE(NEW.ticket_type, 'incident')::ticket_type_enum, NEW.short_description, NEW.description,
    NEW.priority, NEW.state, NEW.caller_id, NEW.caller_name, NEW.assigned_to_id, NEW.assigned_to_name,
    COALESCE(NEW.assigned_group_id, v_group_id), COALESCE(NEW.assigned_group_name, v_group_name),
    COALESCE(NEW.assignment_group_id, v_group_id), NEW.sla_breached,
    NEW.sla_response_deadline, NEW.sla_resolution_deadline, NEW.responded_at, NEW.resolved_at, NEW.closed_at,
    NEW.close_code, NEW.close_notes, NEW.resolution_code, NEW.resolution_notes, COALESCE(NEW.kb_candidate, false),
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()), v_approval_status, v_approval_paused_at,
    NEW.catalog_symptom_id, NEW.catalog_item_id, NEW.catalog_subitem_id, NEW.catalog_service_id, NEW.symptom_id
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

-- ─── 3) Pausa/retoma o SLA durante approval_status='pending' ──────────────
CREATE OR REPLACE FUNCTION public.tg_handle_approval_sla_pause()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calendar uuid;
  v_paused_mins int;
  v_request_item_id uuid;
BEGIN
  IF OLD.approval_paused_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.ticket_type = 'request' THEN
    SELECT request_item_id INTO v_request_item_id FROM public.service_request_attributes WHERE ticket_id = NEW.id;
  END IF;

  v_calendar := public.sla_calendar_for(NEW.symptom_id, v_request_item_id, NEW.company_id);
  v_paused_mins := public.sla_business_minutes_between(v_calendar, OLD.approval_paused_at, clock_timestamp());

  NEW.approval_paused_at := NULL;

  IF v_paused_mins > 0 THEN
    IF NEW.sla_response_deadline IS NOT NULL AND NEW.responded_at IS NULL THEN
      NEW.sla_response_deadline := public.sla_add_business_minutes(v_calendar, NEW.sla_response_deadline, v_paused_mins);
    END IF;
    IF NEW.sla_resolution_deadline IS NOT NULL THEN
      NEW.sla_resolution_deadline := public.sla_add_business_minutes(v_calendar, NEW.sla_resolution_deadline, v_paused_mins);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_handle_approval_sla_pause() IS 'Fase 21: espelha tg_handle_sla_pause, mas para approval_status em vez de state — o relógio de SLA não corre enquanto approval_status=pending. Nome com prefixo tg_ (não zzz_) garante, por ordem alfabética de disparo, que rode depois de tg_calculate_ticket_sla (que resetaria o deadline) e antes de zzz_consolidate_sla_resolution (Fase 19), que precisa ler o deadline já empurrado ao calcular is_resolution_breached na mesma transação de rejeição.';

REVOKE ALL ON FUNCTION public.tg_handle_approval_sla_pause() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS tg_handle_approval_sla_pause ON public.tickets;
CREATE TRIGGER tg_handle_approval_sla_pause
  BEFORE UPDATE OF approval_status ON public.tickets
  FOR EACH ROW
  WHEN (OLD.approval_status = 'pending' AND NEW.approval_status IS DISTINCT FROM OLD.approval_status)
  EXECUTE FUNCTION public.tg_handle_approval_sla_pause();

-- ─── 4) Achado #4 (colisão com a Fase 16): notifications.company_id é
-- NOT NULL desde a migration 111 — os dois INSERTs abaixo nunca a
-- preenchiam, então falhavam silenciosamente (ou derrubavam a transação
-- inteira, já que fazem parte do mesmo INSERT/UPDATE em tickets) ───────────
CREATE OR REPLACE FUNCTION public.tg_create_request_approvals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      (company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link)
    VALUES (
      NEW.company_id, v_approver_id, 'Nova aprovação pendente',
      'A requisição ' || v_ticket.number || ' aguarda sua decisão.',
      'info', NEW.ticket_id, 'request', '/tickets/' || NEW.ticket_id::text
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
      (company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link)
    SELECT NEW.company_id, p.id, 'Nova aprovação pendente',
      'A requisição ' || v_ticket.number || ' aguarda sua decisão.',
      'info', NEW.ticket_id, 'request', '/tickets/' || NEW.ticket_id::text
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

-- ─── 5) process_approval_action: correção de decide_request_approval em vez
-- de um nome novo em paralelo — já existe, já está referenciado por
-- GRANT/RLS, e precisava de 3 correções (achados #2, #3, #4), não de um
-- substituto. Manter o nome evita duas RPCs para o mesmo conceito ─────────
--
-- Achado #2: "SELECT ... FROM public.incidents ... FOR UPDATE" falhava
-- sempre (Postgres recusa FOR UPDATE do lado nulável de um LEFT JOIN — a
-- view "incidents" tem dois). Corrigido travando/escrevendo em
-- public.tickets diretamente — mesmo padrão já usado por
-- sync_incident_to_case (Fase 15) para escritas internas do motor.
--
-- Achado #3: a rejeição gravava só close_code/close_notes; trg_guard_
-- resolution_governance (Fase 18) exige resolution_code/resolution_notes
-- não vazios em qualquer transição para Resolved/Closed. Corrigido
-- preenchendo os quatro campos juntos.
CREATE OR REPLACE FUNCTION public.decide_request_approval(p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
RETURNS public.request_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles;
  v_approval public.request_approvals;
  v_ticket public.tickets;
  v_mode TEXT;
  v_final_status TEXT;
  v_note TEXT := NULLIF(trim(p_note), '');
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  SELECT * INTO v_approval FROM public.request_approvals
   WHERE id = p_approval_id FOR UPDATE;

  IF v_profile.id IS NULL OR v_approval.id IS NULL
     OR v_approval.approver_id IS DISTINCT FROM v_profile.id THEN
    RAISE EXCEPTION 'Aprovação não pertence ao usuário autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Aprovação já foi decidida';
  END IF;

  -- Trava o TICKET (não a view) — concorrência real: se dois aprovadores
  -- decidirem ao mesmo tempo, a segunda transação bloqueia aqui até a
  -- primeira commitar; ao destravar, relê approval_status já mudado e cai no
  -- RAISE EXCEPTION abaixo em vez de sobrescrever silenciosamente.
  SELECT * INTO v_ticket FROM public.tickets
   WHERE id = v_approval.incident_id FOR UPDATE;
  IF v_ticket.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Requisição não está mais aguardando aprovação';
  END IF;

  SELECT approval_mode INTO v_mode
  FROM public.request_items ri
  JOIN public.service_request_attributes sra ON sra.request_item_id = ri.id
  WHERE sra.ticket_id = v_ticket.id;

  UPDATE public.request_approvals
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decision_note = v_note,
         decided_at = now()
   WHERE id = p_approval_id
   RETURNING * INTO v_approval;

  IF NOT p_approve THEN
    v_final_status := 'rejected';
  ELSIF v_mode = 'any' THEN
    v_final_status := 'approved';
    UPDATE public.request_approvals
       SET status = 'cancelled', decided_at = now()
     WHERE incident_id = v_ticket.id AND status = 'pending';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.request_approvals
    WHERE incident_id = v_ticket.id AND status = 'pending'
  ) THEN
    v_final_status := 'approved';
  END IF;

  IF v_final_status IS NOT NULL THEN
    PERFORM set_config('flowfy.request_approval_transition', 'on', true);
    UPDATE public.tickets
       SET approval_status = v_final_status,
           approval_decided_at = now(),
           state = CASE WHEN v_final_status = 'rejected'
                        THEN 'Closed'::public.incident_state ELSE state END,
           closed_at = CASE WHEN v_final_status = 'rejected' THEN now() ELSE closed_at END,
           close_code = CASE WHEN v_final_status = 'rejected' THEN 'Rejected' ELSE close_code END,
           close_notes = CASE WHEN v_final_status = 'rejected'
                              THEN COALESCE(v_note, 'Requisição rejeitada na aprovação.')
                              ELSE close_notes END,
           resolution_code = CASE WHEN v_final_status = 'rejected' THEN 'Rejeitado em Aprovação' ELSE resolution_code END,
           resolution_notes = CASE WHEN v_final_status = 'rejected'
                              THEN COALESCE(v_note, 'Requisição rejeitada na aprovação.')
                              ELSE resolution_notes END
     WHERE id = v_ticket.id;

    INSERT INTO public.incident_history
      (incident_id, changed_by_id, changed_by_name, field_name, new_value, comment, is_public)
    VALUES
      (v_ticket.id, v_profile.id, v_profile.name, 'approval_status',
       v_final_status, v_note, true);

    IF v_ticket.caller_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link)
      VALUES
        (v_ticket.company_id, v_ticket.caller_id,
         CASE WHEN v_final_status = 'approved' THEN 'Requisição aprovada' ELSE 'Requisição rejeitada' END,
         'A requisição ' || v_ticket.number || ' foi ' ||
           CASE WHEN v_final_status = 'approved' THEN 'aprovada.' ELSE 'rejeitada.' END,
         CASE WHEN v_final_status = 'approved' THEN 'success' ELSE 'warning' END,
         v_ticket.id, 'request', '/tickets/' || v_ticket.id::text);
    END IF;
  END IF;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.decide_request_approval(uuid, boolean, text) IS 'Fase 21: processa Aprovar/Rejeitar de forma transacional. Trava request_approvals (linha do aprovador) e tickets (linha do ticket, não a view — FOR UPDATE não funciona através do LEFT JOIN da view incidents) via SELECT ... FOR UPDATE, serializando decisões concorrentes no mesmo ticket. Rejeição grava close_code/close_notes E resolution_code/resolution_notes juntos (exigido por trg_guard_resolution_governance da Fase 18) e move state para Closed; aprovação final (sem mais pendências) só atualiza approval_status — state permanece o que já era (guard_request_approval_transition libera a mudança de estado normal a partir daqui).';

REVOKE ALL ON FUNCTION public.decide_request_approval(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_request_approval(uuid, boolean, text) TO authenticated;
