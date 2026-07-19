-- ServiceFY — Integridade de dados multi-tenant
-- Impede duplicidades operacionais e relações entre tenants no nível do banco.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    GROUP BY company_id, lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicidade de e-mail no tenant. Corrija os perfis antes de aplicar a migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.departments
    WHERE is_active
    GROUP BY company_id, lower(btrim(name))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicidade de departamento ativo no tenant. Corrija os departamentos antes de aplicar a migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assignment_groups
    WHERE is_active
    GROUP BY company_id, lower(btrim(name))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicidade de grupo solucionador ativo no tenant. Corrija os grupos antes de aplicar a migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_groups ug
    JOIN public.profiles p ON p.id = ug.user_id
    JOIN public.assignment_groups ag ON ag.id = ug.group_id
    WHERE p.company_id IS DISTINCT FROM ag.company_id
  ) THEN
    RAISE EXCEPTION 'Existem vínculos usuário-grupo entre tenants diferentes.';
  END IF;
END;
$$;

UPDATE public.profiles
SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_company_email_normalized
  ON public.profiles (company_id, lower(btrim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_company_active_name
  ON public.departments (company_id, lower(btrim(name)))
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_groups_company_active_name
  ON public.assignment_groups (company_id, lower(btrim(name)))
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.validate_user_group_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_company uuid;
  v_group_company uuid;
BEGIN
  SELECT company_id INTO v_user_company
  FROM public.profiles
  WHERE id = NEW.user_id;

  SELECT company_id INTO v_group_company
  FROM public.assignment_groups
  WHERE id = NEW.group_id;

  IF v_user_company IS NULL OR v_group_company IS NULL THEN
    RAISE EXCEPTION 'Usuário ou grupo solucionador inexistente.';
  END IF;

  IF v_user_company IS DISTINCT FROM v_group_company THEN
    RAISE EXCEPTION 'Usuário e grupo solucionador devem pertencer ao mesmo tenant.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_user_group_tenant ON public.user_groups;
CREATE TRIGGER trg_validate_user_group_tenant
  BEFORE INSERT OR UPDATE ON public.user_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_group_tenant();

CREATE OR REPLACE FUNCTION public.validate_profile_hierarchy_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_company uuid;
BEGIN
  IF NEW.manager_id = NEW.id OR NEW.alternate_manager_id = NEW.id THEN
    RAISE EXCEPTION 'Perfil não pode ser seu próprio gestor.';
  END IF;

  IF NEW.manager_id IS NOT NULL AND NEW.manager_id = NEW.alternate_manager_id THEN
    RAISE EXCEPTION 'Gestor principal e alternativo devem ser pessoas diferentes.';
  END IF;

  IF NEW.manager_id IS NOT NULL THEN
    SELECT company_id INTO v_manager_company
    FROM public.profiles
    WHERE id = NEW.manager_id;

    IF v_manager_company IS NULL OR v_manager_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Gestor do perfil deve pertencer ao mesmo tenant.';
    END IF;
  END IF;

  IF NEW.alternate_manager_id IS NOT NULL THEN
    SELECT company_id INTO v_manager_company
    FROM public.profiles
    WHERE id = NEW.alternate_manager_id;

    IF v_manager_company IS NULL OR v_manager_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Gestor alternativo do perfil deve pertencer ao mesmo tenant.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_profile_hierarchy_tenant ON public.profiles;
CREATE TRIGGER trg_validate_profile_hierarchy_tenant
  BEFORE INSERT OR UPDATE OF company_id, manager_id, alternate_manager_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_hierarchy_tenant();

CREATE OR REPLACE FUNCTION public.validate_department_manager_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_company uuid;
BEGIN
  IF NEW.manager_id IS NOT NULL AND NEW.manager_id = NEW.alternate_manager_id THEN
    RAISE EXCEPTION 'Gestor principal e alternativo do departamento devem ser pessoas diferentes.';
  END IF;

  IF NEW.manager_id IS NOT NULL THEN
    SELECT company_id INTO v_manager_company
    FROM public.profiles
    WHERE id = NEW.manager_id;

    IF v_manager_company IS NULL OR v_manager_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Gestor do departamento deve pertencer ao mesmo tenant.';
    END IF;
  END IF;

  IF NEW.alternate_manager_id IS NOT NULL THEN
    SELECT company_id INTO v_manager_company
    FROM public.profiles
    WHERE id = NEW.alternate_manager_id;

    IF v_manager_company IS NULL OR v_manager_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Gestor alternativo do departamento deve pertencer ao mesmo tenant.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_department_manager_tenant ON public.departments;
CREATE TRIGGER trg_validate_department_manager_tenant
  BEFORE INSERT OR UPDATE OF company_id, manager_id, alternate_manager_id ON public.departments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_department_manager_tenant();

REVOKE ALL ON FUNCTION public.validate_user_group_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_profile_hierarchy_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_department_manager_tenant() FROM PUBLIC, anon, authenticated;

COMMENT ON INDEX public.uq_profiles_company_email_normalized
  IS 'Um e-mail normalizado identifica no máximo um perfil dentro do tenant.';
COMMENT ON INDEX public.uq_departments_company_active_name
  IS 'Evita departamentos ativos com o mesmo nome normalizado no tenant.';
COMMENT ON INDEX public.uq_assignment_groups_company_active_name
  IS 'Evita grupos solucionadores ativos com o mesmo nome normalizado no tenant.';
