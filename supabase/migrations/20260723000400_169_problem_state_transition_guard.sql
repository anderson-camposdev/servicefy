-- ServiceFY — problems.state aceitava qualquer salto via UPDATE direto
-- (New -> Closed sem passar por nada, por exemplo). Diferente de
-- Incidentes e Mudanças, não existia nenhum trigger de governança.
--
-- Achado no pente fino de 2026-07-23. Decisão do usuário: máquina de
-- estados completa estilo ITIL, com reabertura explícita permitida
-- (sempre volta pra 'Under Investigation', nunca pula direto pra um
-- estado avançado).
--
-- Grafo de transições válidas:
--   New                    -> Under Investigation
--   Under Investigation    -> Root Cause Identified | Known Error
--   Root Cause Identified  -> Known Error | Resolved
--   Known Error            -> Resolved
--   Resolved               -> Closed
--   Known Error|Resolved|Closed -> Under Investigation  (reabertura)

CREATE OR REPLACE FUNCTION public.guard_problem_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state IS DISTINCT FROM 'New' THEN
      RAISE EXCEPTION 'Problema deve ser criado no estado New (recebido: %)', NEW.state
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'New' AND NEW.state = 'Under Investigation')
    OR (OLD.state = 'Under Investigation' AND NEW.state IN ('Root Cause Identified', 'Known Error'))
    OR (OLD.state = 'Root Cause Identified' AND NEW.state IN ('Known Error', 'Resolved'))
    OR (OLD.state = 'Known Error' AND NEW.state = 'Resolved')
    OR (OLD.state = 'Resolved' AND NEW.state = 'Closed')
    OR (OLD.state IN ('Known Error', 'Resolved', 'Closed') AND NEW.state = 'Under Investigation')
  ) THEN
    RAISE EXCEPTION 'Transição de estado inválida em Problema: % -> %', OLD.state, NEW.state
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_problem_state_transition ON public.problems;
CREATE TRIGGER trg_guard_problem_state_transition
  BEFORE INSERT OR UPDATE OF state ON public.problems
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_problem_state_transition();

REVOKE ALL ON FUNCTION public.guard_problem_state_transition() FROM PUBLIC, anon, authenticated;
