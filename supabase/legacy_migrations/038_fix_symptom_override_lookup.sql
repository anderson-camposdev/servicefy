-- ============================================================
-- Flowfy ITSM — Migration 038
-- Corrige o lookup do OVERRIDE de catálogo por SINTOMA de incidente
-- no trigger tg_calculate_ticket_sla.
--
-- Bug (033/036): o override era buscado com
--   FROM catalog_service_symptoms WHERE id = NEW.symptom_id
-- mas incidents.symptom_id referencia system_symptoms(id), NÃO a junção
-- catalog_service_symptoms(id). Resultado: override (fixed_priority /
-- sla_calendar_id) de INCIDENTES nunca era aplicado.
--
-- Correção: resolver a junção por (company_id, symptom_id [, service_id]).
-- Mantém o caminho de requisição (request_item_id) e o COALESCE da 036.
-- Idempotente (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_calculate_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_impact         TEXT;
  v_urgency        TEXT;
  v_level          INT;
  v_fixed          INT;
  v_calendar       UUID;
  v_resp_mins      INT;
  v_resol_mins     INT;
  v_anchor         TIMESTAMPTZ;
  v_assignee_scope TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.impact         IS NOT DISTINCT FROM OLD.impact
     AND NEW.urgency        IS NOT DISTINCT FROM OLD.urgency
     AND NEW.assigned_to_id IS NOT DISTINCT FROM OLD.assigned_to_id THEN
    RETURN NEW;
  END IF;

  -- (a) Override do nó-final do catálogo (prioridade fixa + calendário).
  --     INCIDENTE: junção catalog_service_symptoms por (company, symptom[, service]).
  IF NEW.symptom_id IS NOT NULL THEN
    SELECT css.fixed_priority, css.sla_calendar_id
      INTO v_fixed, v_calendar
      FROM public.catalog_service_symptoms css
     WHERE css.company_id = NEW.company_id
       AND css.symptom_id = NEW.symptom_id
       AND (NEW.catalog_service_id IS NULL OR css.service_id = NEW.catalog_service_id)
     ORDER BY (css.service_id = NEW.catalog_service_id) DESC NULLS LAST
     LIMIT 1;
  ELSIF NEW.request_item_id IS NOT NULL THEN
    SELECT fixed_priority, sla_calendar_id
      INTO v_fixed, v_calendar
      FROM public.request_items
     WHERE id = NEW.request_item_id;
  END IF;

  -- (b) Prioridade resultante: fixa OU cruzamento da matriz ITIL.
  IF v_fixed IS NOT NULL THEN
    v_level := v_fixed;
  ELSE
    v_impact  := lower(COALESCE(NEW.impact,  'Medium'));
    v_urgency := lower(COALESCE(NEW.urgency, 'Medium'));
    IF v_impact  = 'critical' THEN v_impact  := 'high'; END IF;
    IF v_urgency = 'critical' THEN v_urgency := 'high'; END IF;

    SELECT resulting_priority INTO v_level
      FROM public.sla_priority_matrix
     WHERE impact = v_impact AND urgency = v_urgency
     LIMIT 1;
    v_level := COALESCE(v_level, 3);
  END IF;
  NEW.priority_level := v_level;

  -- (c) Calendário: override do item → padrão da empresa.
  IF v_calendar IS NULL THEN
    SELECT default_sla_calendar_id INTO v_calendar
      FROM public.companies WHERE id = NEW.company_id;
  END IF;

  -- (d) REGRA DE OURO DA ALLIED: de quem é a responsabilidade atual?
  IF NEW.assigned_to_id IS NOT NULL THEN
    SELECT profile_role INTO v_assignee_scope
      FROM public.profiles WHERE id = NEW.assigned_to_id;
  END IF;
  NEW.sla_managed_by_client := COALESCE(v_assignee_scope = 'client_analyst', false);

  -- (e) Métricas da política de SLA do tenant para a prioridade.
  SELECT response_time_minutes, resolution_time_minutes
    INTO v_resp_mins, v_resol_mins
    FROM public.sla_policies
   WHERE company_id = NEW.company_id
     AND priority = v_level
     AND active = true
   LIMIT 1;

  -- (f) Ticket sob gestão do CLIENTE: congela o relógio da Allied.
  IF NEW.sla_managed_by_client THEN
    RETURN NEW;
  END IF;

  -- (g) Projeta os prazos consumindo minutos ÚTEIS (Migration 032).
  v_anchor := COALESCE(NEW.created_at, now());
  IF v_resp_mins IS NOT NULL THEN
    NEW.sla_response_deadline   := public.sla_add_business_minutes(v_calendar, v_anchor, v_resp_mins);
  END IF;
  IF v_resol_mins IS NOT NULL THEN
    NEW.sla_resolution_deadline := public.sla_add_business_minutes(v_calendar, v_anchor, v_resol_mins);
  END IF;

  RETURN NEW;
END;
$$;
