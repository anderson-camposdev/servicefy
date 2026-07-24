-- ServiceFY — problems.known_error (boolean) e state='Known Error' (enum)
-- eram campos independentes, editáveis sem sincronia pela UI, sem trigger
-- de coerência. O card "Erros Conhecidos (KEDB)" conta só o boolean
-- (services.ts getKPIs: knownError = rows.filter(r => r.known_error).length)
-- — um problema com state='Known Error' mas known_error=false (checkbox
-- esquecido) não aparecia no KEDB.
--
-- Fix mínimo e unidirecional: sempre que state entra (ou já está) em
-- 'Known Error', known_error é forçado para true no banco — fonte única
-- de verdade, independente do que o frontend mandar. Não força o inverso:
-- known_error=true com outro state continua permitido (ex.: problema já
-- Resolved mas mantido documentado como erro conhecido para referência).

CREATE OR REPLACE FUNCTION public.sync_problem_known_error()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.state = 'Known Error' THEN
    NEW.known_error := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_problem_known_error ON public.problems;
CREATE TRIGGER trg_sync_problem_known_error
  BEFORE INSERT OR UPDATE OF state ON public.problems
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_problem_known_error();

-- Corrige o dado já existente que estava fora de sincronia.
UPDATE public.problems SET known_error = true WHERE state = 'Known Error' AND known_error = false;

REVOKE ALL ON FUNCTION public.sync_problem_known_error() FROM PUBLIC, anon, authenticated;
