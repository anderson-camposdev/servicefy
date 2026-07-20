-- Migration: 148_esm_workflow_engine
-- Adiciona triggers em `cases` para validar `workflow_config` e `form_schema` de `case_types`.

CREATE OR REPLACE FUNCTION public.enforce_case_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow jsonb;
  v_allowed_states jsonb;
  v_transitions jsonb;
  v_allowed_next jsonb;
BEGIN
  -- Se o estado não mudou, ignorar validações de transição
  IF TG_OP = 'UPDATE' AND OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;

  SELECT workflow_config INTO v_workflow
  FROM public.case_types
  WHERE id = NEW.case_type_id;

  IF v_workflow IS NULL OR v_workflow = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_allowed_states := v_workflow -> 'states';
  IF v_allowed_states IS NOT NULL AND jsonb_typeof(v_allowed_states) = 'array' THEN
    IF NOT v_allowed_states @> to_jsonb(NEW.state) THEN
      RAISE EXCEPTION 'Estado "%" não é permitido pelo fluxo deste tipo de caso.', NEW.state;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_transitions := v_workflow -> 'transitions';
    IF v_transitions IS NOT NULL AND jsonb_typeof(v_transitions) = 'array' THEN
      -- Estrutura: [{ "from": "A", "to": "B" }, ...]
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_transitions) AS tr
        WHERE tr->>'from' = OLD.state AND tr->>'to' = NEW.state
      ) THEN
        RAISE EXCEPTION 'Transição de estado inválida: % -> %', OLD.state, NEW.state;
      END IF;
    ELSIF v_transitions IS NOT NULL AND jsonb_typeof(v_transitions) = 'object' THEN
      -- Estrutura alternativa: { "A": ["B", "C"] }
      v_allowed_next := v_transitions -> OLD.state;
      IF v_allowed_next IS NOT NULL AND jsonb_typeof(v_allowed_next) = 'array' THEN
        IF NOT v_allowed_next @> to_jsonb(NEW.state) THEN
          RAISE EXCEPTION 'Transição de estado inválida: % -> %', OLD.state, NEW.state;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_case_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema jsonb;
  v_fields jsonb;
  v_field jsonb;
  v_field_id text;
  v_is_required boolean;
  v_val jsonb;
BEGIN
  SELECT form_schema INTO v_schema
  FROM public.case_types
  WHERE id = NEW.case_type_id;

  IF v_schema IS NULL OR v_schema = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_fields := v_schema -> 'fields';
  IF v_fields IS NOT NULL AND jsonb_typeof(v_fields) = 'array' THEN
    FOR v_field IN SELECT * FROM jsonb_array_elements(v_fields)
    LOOP
      v_field_id := v_field ->> 'id';
      v_is_required := COALESCE((v_field ->> 'required')::boolean, false);
      
      IF v_is_required AND v_field_id IS NOT NULL THEN
        v_val := NEW.form_data -> v_field_id;
        IF v_val IS NULL OR v_val = 'null'::jsonb OR (jsonb_typeof(v_val) = 'string' AND v_val->>0 = '') THEN
          RAISE EXCEPTION 'Campo obrigatório ausente: %', v_field_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_case_workflow ON public.cases;
CREATE TRIGGER trg_enforce_case_workflow
BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.enforce_case_workflow();

DROP TRIGGER IF EXISTS trg_validate_case_form ON public.cases;
CREATE TRIGGER trg_validate_case_form
BEFORE INSERT OR UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.validate_case_form();

REVOKE ALL ON FUNCTION public.enforce_case_workflow() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_case_form() FROM PUBLIC, anon, authenticated;
