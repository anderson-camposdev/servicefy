-- ServiceFY — Fase 18: Motor de Resolução Estruturada de Tickets (ITIL v4).
--
-- Mapeamento (ver análise antes desta migration): resolution_code/
-- resolution_notes/kb_candidate são campos de encerramento — mesma categoria
-- de close_code/close_notes, que já vivem em public.tickets (base), não em
-- incident_attributes/service_request_attributes (migration 096). Esses dois
-- últimos guardam só o que é exclusivo de um tipo de ticket; resolução não é.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS resolution_code text,
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS kb_candidate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tickets.resolution_code IS 'Fase 18: motivo estruturado da resolução (ex.: Solução Definitiva, Contorno/Workaround). Obrigatório junto com resolution_notes quando state entra em Resolved/Closed (ver trg_guard_resolution_governance).';
COMMENT ON COLUMN public.tickets.kb_candidate IS 'Fase 18: analista sinaliza que esta resolução é candidata a virar artigo da base de conhecimento.';

-- A view "incidents" precisa expor as novas colunas — sem isso, o UPDATE via
-- .from('incidents') nem chega a compilar (coluna inexistente na view), então
-- isso é pré-requisito para o forwarding da trigger abaixo funcionar.
CREATE OR REPLACE VIEW public.incidents AS
SELECT
  t.id, t.number, t.company_id, t.short_description, t.description, t.priority,
  t.state, t.caller_id, t.caller_name, t.assigned_to_id, t.assigned_to_name,
  t.assigned_group_id, t.assigned_group_name, t.sla_breached, t.sla_deadline,
  t.created_at, t.updated_at, t.resolved_at, t.closed_at, t.catalog_item_id,
  t.catalog_subitem_id, t.catalog_symptom_id, t.assignment_group_id,
  t.close_code, t.close_notes,
  t.ticket_type, t.catalog_service_id, t.symptom_id, t.responded_at,
  t.priority_level, t.sla_response_deadline, t.sla_resolution_deadline,
  t.sla_managed_by_client, t.paused_at, t.accumulated_paused_time_minutes,
  t.pending_reason_id, t.is_response_breached, t.is_resolution_breached,
  t.request_subcategory_id, t.accumulated_reopen_time_minutes, t.tags,
  t.opened_via, t.sla_warning_notified, t.approval_status, t.approval_decided_at,
  t.case_id,
  ia.category, ia.impact, ia.urgency, ia.root_cause, ia.workaround,
  ia.is_major_incident, ia.related_problem_id,
  sra.request_item_id, sra.form_data, sra.cost, sra.currency,
  t.resolution_code, t.resolution_notes, t.kb_candidate
FROM public.tickets t
LEFT JOIN public.incident_attributes ia ON t.id = ia.ticket_id
LEFT JOIN public.service_request_attributes sra ON t.id = sra.ticket_id;

-- ─── Achado crítico durante a análise: close_code/close_notes já vazavam ────
-- silenciosamente pela view "incidents" — INSTEAD OF UPDATE nunca as incluía
-- na lista de SET do UPDATE aninhado em public.tickets (mesma classe de bug
-- da Fase 14, achada ali para assignment_group_id). Confirmado empiricamente
-- via psql antes desta migration: UPDATE incidents SET close_code=... não
-- persistia em tickets.close_code. Sem esta correção, a trigger de governança
-- abaixo bloquearia Resolved/Closed para sempre — a view sempre entregaria
-- resolution_code NULL a tickets, mesmo com o modal enviando o valor certo,
-- já que todo o fluxo real do app escreve via .from('incidents'), não em
-- tickets diretamente.
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
    close_code = NEW.close_code,
    close_notes = NEW.close_notes,
    resolution_code = NEW.resolution_code,
    resolution_notes = NEW.resolution_notes,
    kb_candidate = COALESCE(NEW.kb_candidate, false),
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

-- Mesma correção de forwarding no INSERT (por completude/consistência — um
-- ticket criado já resolvido, ex. importação, não deve perder esses campos).
CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.tickets (
    id, number, company_id, ticket_type, short_description, description,
    priority, state, caller_id, caller_name, assigned_to_id, assigned_to_name,
    assigned_group_id, assigned_group_name, assignment_group_id, sla_breached,
    sla_response_deadline, sla_resolution_deadline, responded_at, resolved_at, closed_at,
    close_code, close_notes, resolution_code, resolution_notes, kb_candidate,
    created_at, updated_at, approval_status,
    catalog_symptom_id, catalog_item_id, catalog_subitem_id, catalog_service_id, symptom_id
  ) VALUES (
    COALESCE(NEW.id, uuid_generate_v4()), NEW.number, NEW.company_id,
    COALESCE(NEW.ticket_type, 'incident')::ticket_type_enum, NEW.short_description, NEW.description,
    NEW.priority, NEW.state, NEW.caller_id, NEW.caller_name, NEW.assigned_to_id, NEW.assigned_to_name,
    NEW.assigned_group_id, NEW.assigned_group_name, NEW.assignment_group_id, NEW.sla_breached,
    NEW.sla_response_deadline, NEW.sla_resolution_deadline, NEW.responded_at, NEW.resolved_at, NEW.closed_at,
    NEW.close_code, NEW.close_notes, NEW.resolution_code, NEW.resolution_notes, COALESCE(NEW.kb_candidate, false),
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()), COALESCE(NEW.approval_status, 'not_required'),
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

-- ─── Governança: Resolved/Closed exige resolution_code + resolution_notes ──
CREATE OR REPLACE FUNCTION public.tg_guard_resolution_governance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state IN ('Resolved', 'Closed') THEN
    IF NEW.resolution_code IS NULL OR btrim(NEW.resolution_code) = '' THEN
      RAISE EXCEPTION 'Nao e possivel resolver ou fechar o ticket sem um codigo de resolucao.' USING ERRCODE = '23514';
    END IF;
    IF NEW.resolution_notes IS NULL OR btrim(NEW.resolution_notes) = '' THEN
      RAISE EXCEPTION 'Nao e possivel resolver ou fechar o ticket sem notas de resolucao.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_guard_resolution_governance() IS 'Fase 18: exige resolution_code e resolution_notes preenchidos sempre que state entra/permanece em Resolved ou Closed. Dispara em qualquer UPDATE que toque state/resolution_code/resolution_notes — inclui o UPDATE aninhado que tg_incidents_view_update sempre executa, então também protege contra limpar as notas de um ticket já resolvido.';

DROP TRIGGER IF EXISTS trg_guard_resolution_governance ON public.tickets;
CREATE TRIGGER trg_guard_resolution_governance
  BEFORE UPDATE OF state, resolution_code, resolution_notes ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_guard_resolution_governance();
