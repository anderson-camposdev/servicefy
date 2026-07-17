-- ============================================================
-- ServiceFY — Migration 135
-- ops_manager/governance_manager também consomem assento de
-- licença (LICENSE_CONSUMING_ROLES no frontend já os inclui —
-- sem este ajuste, tg_enforce_analyst_license_limit deixaria de
-- aplicar o limite contratado para esses dois papéis).
-- ============================================================

DROP INDEX IF EXISTS public.idx_profiles_licensed_seats;
CREATE INDEX idx_profiles_licensed_seats
  ON public.profiles (company_id)
  WHERE active = true AND role IN ('agent', 'company_admin', 'ops_manager', 'governance_manager');

CREATE OR REPLACE FUNCTION public.tg_enforce_analyst_license_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consuming_roles CONSTANT text[] := ARRAY['agent', 'company_admin', 'ops_manager', 'governance_manager'];
  v_is_consuming boolean;
  v_was_consuming boolean;
  v_limit integer;
  v_count integer;
BEGIN
  v_is_consuming := NEW.active AND NEW.role::text = ANY (v_consuming_roles);

  IF TG_OP = 'UPDATE' THEN
    v_was_consuming := OLD.active AND OLD.role::text = ANY (v_consuming_roles);
    IF v_was_consuming AND v_is_consuming THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT v_is_consuming THEN
    RETURN NEW;
  END IF;

  SELECT max_analysts_licenses INTO v_limit FROM public.companies WHERE id = NEW.company_id;

  SELECT count(*) INTO v_count
    FROM public.profiles
   WHERE company_id = NEW.company_id
     AND active = true
     AND role::text = ANY (v_consuming_roles)
     AND id IS DISTINCT FROM NEW.id;

  IF v_count + 1 > COALESCE(v_limit, 3) THEN
    RAISE EXCEPTION 'Limite de licenças de analistas atingido (%/%). Desative outro usuário ou entre em contato para ampliar seu plano.', v_count, COALESCE(v_limit, 3)
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_enforce_analyst_license_limit() IS 'Fase 27/132: impede que o total de perfis ativos com role agent/company_admin/ops_manager/governance_manager exceda companies.max_analysts_licenses. Nunca bloqueia end_user. COUNT delimitado por company_id, suportado por idx_profiles_licensed_seats.';

REVOKE ALL ON FUNCTION public.tg_enforce_analyst_license_limit() FROM public, anon, authenticated;
-- Trigger trg/tg_enforce_analyst_license_limit (124) já existe, sem mudança de definição.
