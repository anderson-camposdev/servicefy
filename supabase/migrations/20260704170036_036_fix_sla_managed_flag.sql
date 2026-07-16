-- ============================================================
-- Flowfy ITSM — Migration 036
-- HOTFIX do trigger tg_calculate_ticket_sla (migration 033).
--
-- Bug: quando o chamado NÃO tem responsável (assigned_to_id NULL),
-- v_assignee_scope fica NULL e a expressão
--   NEW.sla_managed_by_client := (v_assignee_scope = 'client_analyst')
-- resulta em NULL, violando o NOT NULL da coluna sla_managed_by_client.
-- Isso quebrava QUALQUER inserção de chamado sem assignee (ex.: abertura
-- via Portal de Autoatendimento).
--
-- Correção: COALESCE(... , false). Mantém todo o resto idêntico à 033.
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
  -- Recalcula apenas na criação ou quando impacto/urgência/assignee mudam.
  IF TG_OP = 'UPDATE'
     AND NEW.impact         IS NOT DISTINCT FROM OLD.impact
     AND NEW.urgency        IS NOT DISTINCT FROM OLD.urgency
     AND NEW.assigned_to_id IS NOT DISTINCT FROM OLD.assigned_to_id THEN
    RETURN NEW;
  END IF;

  -- (a) Override do nó-final do catálogo (prioridade fixa + calendário).
  IF NEW.symptom_id IS NOT NULL THEN
    SELECT fixed_priority, sla_calendar_id
      INTO v_fixed, v_calendar
      FROM public.catalog_service_symptoms
     WHERE id = NEW.symptom_id;
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
    -- 'critical' não existe na matriz 3x3 → tratado como 'high'.
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
  -- HOTFIX 036: COALESCE evita NULL quando não há assignee/escopo.
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

-- O trigger (tg_calculate_ticket_sla) já aponta para esta função; o
-- CREATE OR REPLACE acima basta. Sem necessidade de recriar o trigger.
