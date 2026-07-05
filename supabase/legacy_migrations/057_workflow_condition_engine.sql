-- ============================================================
-- Flowfy ITSM — Migration 057
-- Motor de Automação (3/5): AVALIADOR DE CONDIÇÕES (puro).
--
-- Funções sem efeito colateral (STABLE), reaproveitadas tanto
-- pelo dispatcher síncrono quanto por qualquer testador de regra
-- futuro na UI. O fold AND/OR é da esquerda para a direita, sem
-- parênteses — casa exatamente com o array plano ConditionRow[]
-- já modelado em WorkflowBuilder.tsx (sem gap semântico UI↔motor).
--
-- NOTA: incidents.state/priority/category são enums nativos
-- (incident_state/ticket_priority/incident_category), não TEXT —
-- todo valor extraído é convertido para ::text antes de comparar,
-- para evitar o mesmo erro de "operador inexistente" corrigido
-- na Migration 054.
--
-- Idempotente.
-- ============================================================

-- ─── 1. Departamento efetivo do chamado (para a condição 'department') ─
CREATE OR REPLACE FUNCTION public.workflow_incident_department_id(p_incident public.incidents)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_incident.ticket_type = 'incident' THEN
      (SELECT cc.department_id
         FROM public.catalog_services cs
         JOIN public.catalog_categories cc ON cc.id = cs.category_id
        WHERE cs.id = p_incident.catalog_service_id)
    ELSE
      (SELECT rc.department_id
         FROM public.request_items ri
         JOIN public.request_categories rc ON rc.id = ri.request_category_id
        WHERE ri.id = p_incident.request_item_id)
  END;
$$;

-- ─── 2. Uma condição isolada → boolean ────────────────────────
CREATE OR REPLACE FUNCTION public.workflow_eval_condition(p_condition JSONB, p_incident public.incidents)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_field  TEXT := p_condition->>'field';
  v_op     TEXT := p_condition->>'operator';
  v_value  TEXT := p_condition->>'value';
  v_actual TEXT;
BEGIN
  v_actual := CASE v_field
    WHEN 'priority'   THEN p_incident.priority::text
    WHEN 'category'   THEN p_incident.category::text
    WHEN 'state'      THEN p_incident.state::text
    WHEN 'group'      THEN p_incident.assigned_group_name
    WHEN 'department' THEN (SELECT d.name FROM public.departments d WHERE d.id = public.workflow_incident_department_id(p_incident))
    WHEN 'idle_hours' THEN (EXTRACT(EPOCH FROM (now() - p_incident.updated_at)) / 3600)::text
    ELSE NULL
  END;

  RETURN CASE v_op
    WHEN 'equals'       THEN v_actual = v_value
    WHEN 'not_equals'   THEN v_actual IS DISTINCT FROM v_value
    WHEN 'contains'     THEN v_actual ILIKE '%' || v_value || '%'
    WHEN 'greater_than' THEN v_actual::NUMERIC > v_value::NUMERIC
    WHEN 'less_than'    THEN v_actual::NUMERIC < v_value::NUMERIC
    ELSE false
  END;
EXCEPTION WHEN OTHERS THEN
  -- Regra malformada (campo removido, valor não-numérico em comparação
  -- numérica, etc.) nunca aborta a transação do chamado que a disparou.
  RETURN false;
END;
$$;

-- ─── 3. Lista de condições (AND/OR, fold esquerda→direita) ────
CREATE OR REPLACE FUNCTION public.workflow_eval_conditions(p_conditions JSONB, p_incident public.incidents)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_item    JSONB;
  v_result  BOOLEAN;
  v_first   BOOLEAN := true;
BEGIN
  IF p_conditions IS NULL OR jsonb_typeof(p_conditions) <> 'array' OR jsonb_array_length(p_conditions) = 0 THEN
    RETURN true; -- sem condições = sempre casa
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    IF v_first THEN
      v_result := public.workflow_eval_condition(v_item, p_incident);
      v_first := false;
    ELSIF (v_item->>'logicOp') = 'OR' THEN
      v_result := v_result OR public.workflow_eval_condition(v_item, p_incident);
    ELSE
      v_result := v_result AND public.workflow_eval_condition(v_item, p_incident);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT public.workflow_eval_conditions(
--     '[{"field":"priority","operator":"equals","value":"P1 - Critical","logicOp":"AND"}]'::jsonb,
--     i.*
--   ) FROM incidents i LIMIT 1;
-- ────────────────────────────────────────────────────────────
