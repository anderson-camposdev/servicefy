-- ServiceFY — corrige uma armadilha do builder visual de Workflow (Tipos de
-- Caso): se o admin abrir o builder, adicionar um estado/regra e depois
-- remover, o formulário envia workflow_config = {"states":[],"transitions":[]}
-- em vez de voltar para {} — e o trigger enforce_case_workflow (migration
-- 148) tratava "states": [] como "nenhum estado é permitido", bloqueando
-- QUALQUER mudança de estado do tipo de caso. A intenção sempre foi: lista
-- vazia (ou ausente) = sem restrição, igual ao estado inicial "não mexi em
-- nada". Mesmo ajuste para transitions.

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
  IF v_allowed_states IS NOT NULL AND jsonb_typeof(v_allowed_states) = 'array'
     AND jsonb_array_length(v_allowed_states) > 0 THEN
    IF NOT v_allowed_states @> to_jsonb(NEW.state) THEN
      RAISE EXCEPTION 'Estado "%" não é permitido pelo fluxo deste tipo de caso.', NEW.state;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_transitions := v_workflow -> 'transitions';
    IF v_transitions IS NOT NULL AND jsonb_typeof(v_transitions) = 'array'
       AND jsonb_array_length(v_transitions) > 0 THEN
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_transitions) AS tr
        WHERE tr->>'from' = OLD.state AND tr->>'to' = NEW.state
      ) THEN
        RAISE EXCEPTION 'Transição de estado inválida: % -> %', OLD.state, NEW.state;
      END IF;
    ELSIF v_transitions IS NOT NULL AND jsonb_typeof(v_transitions) = 'object' THEN
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

REVOKE ALL ON FUNCTION public.enforce_case_workflow() FROM PUBLIC, anon, authenticated;
