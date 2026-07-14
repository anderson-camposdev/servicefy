-- ServiceFY — Fase 27: Controle de Licenças de Analistas.
--
-- Distinto de concurrent_licenses/check_license_available (sessões
-- simultâneas logadas, active_sessions) — max_analysts_licenses governa o
-- número TOTAL de contas ativas com role que consome assento (seat-based
-- licensing), independente de quem está logado no momento.
--
-- Roles que consomem licença: agent, company_admin (não existe 'analyst' no
-- enum user_role — só {sysadmin, company_admin, agent, end_user}, confirmado
-- via SELECT 'technician'::user_role, que falha). sysadmin fica de fora
-- (papel de plataforma, não um assento por tenant); end_user fica de fora
-- por definição (restrição explícita desta fase).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_analysts_licenses integer NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.companies.max_analysts_licenses IS 'Fase 27: limite total de perfis ativos com role agent/company_admin (seat licensing) — eixo distinto de concurrent_licenses (sessões simultâneas). Só sysadmin/MSP admin ou service_role podem alterar (trg_guard_max_analysts_licenses).';

-- ─── Índice parcial: o COUNT do trigger abaixo escaneia só "assentos
-- ocupados por tenant", nunca a tabela profiles inteira (que cresce com
-- end_users, não com analistas). ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_licensed_seats
  ON public.profiles (company_id)
  WHERE active = true AND role IN ('agent', 'company_admin');

-- ─── Blindagem de escrita: só sysadmin/MSP admin/service_role alteram o
-- limite — as políticas de UPDATE existentes em companies já permitem
-- company_admin escrever OUTRAS colunas da própria empresa (branding etc.),
-- então uma trava a nível de COLUNA via trigger é o mecanismo certo aqui
-- (RLS é por linha, não por coluna; GRANT/REVOKE por coluna não distingue
-- sysadmin de company_admin, já que ambos conectam como o mesmo papel
-- Postgres "authenticated"). ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_max_analysts_licenses_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.max_analysts_licenses IS DISTINCT FROM OLD.max_analysts_licenses THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.is_current_user_msp_admin()
       AND public.get_current_user_role() <> 'sysadmin' THEN
      RAISE EXCEPTION 'Somente o administrador da plataforma pode alterar o limite de licenças de analistas.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_max_analysts_licenses ON public.companies;
CREATE TRIGGER trg_guard_max_analysts_licenses
  BEFORE UPDATE OF max_analysts_licenses ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_max_analysts_licenses_change();

-- ─── Trigger de aplicação do limite em profiles ────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_enforce_analyst_license_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consuming_roles CONSTANT text[] := ARRAY['agent', 'company_admin'];
  v_is_consuming boolean;
  v_was_consuming boolean;
  v_limit integer;
  v_count integer;
BEGIN
  v_is_consuming := NEW.active AND NEW.role::text = ANY (v_consuming_roles);

  -- Short-circuit: já consumia um assento antes desta escrita e continua
  -- consumindo depois — sem aumento líquido de ocupação, não precisa
  -- recontar (evita reexecutar o COUNT em updates que tocam role/active no
  -- SET mas não mudam o veredito de consumo).
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

  -- Delimitado por company_id + suportado pelo índice parcial acima — nunca
  -- varre profiles inteira. NEW.id excluído para não contar a própria linha
  -- em dobro no caso de UPDATE (ela já existe na tabela).
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

COMMENT ON FUNCTION public.tg_enforce_analyst_license_limit() IS 'Fase 27: impede que o total de perfis ativos com role agent/company_admin exceda companies.max_analysts_licenses. Nunca bloqueia end_user (fora de v_consuming_roles por definição). COUNT delimitado por company_id, suportado por idx_profiles_licensed_seats.';

REVOKE ALL ON FUNCTION public.tg_enforce_analyst_license_limit() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS tg_enforce_analyst_license_limit ON public.profiles;
CREATE TRIGGER tg_enforce_analyst_license_limit
  BEFORE INSERT OR UPDATE OF role, active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enforce_analyst_license_limit();
