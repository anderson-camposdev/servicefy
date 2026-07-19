-- Fase 34 — hardening não disruptivo do contexto de autenticação.
--
-- Mantém login por senha e MFA opcionais. O objetivo desta migration é impedir
-- que um JWT ainda válido continue resolvendo tenant/papel depois que o perfil
-- ou a empresa forem desativados. Como estes helpers alimentam as policies RLS,
-- retornar NULL remove o acesso no banco imediatamente.

CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id
    FROM public.profiles AS p
    JOIN public.companies AS c ON c.id = p.company_id
   WHERE p.auth_id = auth.uid()
     AND p.active = true
     AND c.active = true
   LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.company_id
    FROM public.profiles AS p
    JOIN public.companies AS c ON c.id = p.company_id
   WHERE p.auth_id = auth.uid()
     AND p.active = true
     AND c.active = true
   LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.role::text
    FROM public.profiles AS p
    JOIN public.companies AS c ON c.id = p.company_id
   WHERE p.auth_id = auth.uid()
     AND p.active = true
     AND c.active = true
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.get_current_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_user_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
