-- Adicionar coluna default_assignment_group_id na tabela service_domains
ALTER TABLE public.service_domains ADD COLUMN IF NOT EXISTS default_assignment_group_id UUID REFERENCES public.assignment_groups(id) ON DELETE SET NULL;

-- Função e Trigger de Triagem para Incidentes
CREATE OR REPLACE FUNCTION public.tg_triage_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_group UUID;
BEGIN
  IF NEW.assignment_group_id IS NULL THEN
    SELECT default_assignment_group_id INTO v_default_group
      FROM public.service_domains
     WHERE company_id = NEW.company_id AND key = 'it';
     
    IF v_default_group IS NOT NULL THEN
      NEW.assignment_group_id := v_default_group;
      SELECT name INTO NEW.assigned_group_name 
        FROM public.assignment_groups 
       WHERE id = v_default_group;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_triage_incident ON public.incidents;
CREATE TRIGGER tg_triage_incident
  BEFORE INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_triage_incident();

-- Função e Trigger de Triagem para Cases
CREATE OR REPLACE FUNCTION public.tg_triage_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_group UUID;
BEGIN
  IF NEW.assignment_group_id IS NULL THEN
    SELECT default_assignment_group_id INTO v_default_group
      FROM public.service_domains
     WHERE id = NEW.service_domain_id;
     
    IF v_default_group IS NOT NULL THEN
      NEW.assignment_group_id := v_default_group;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_triage_case ON public.cases;
CREATE TRIGGER tg_triage_case
  BEFORE INSERT ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_triage_case();
