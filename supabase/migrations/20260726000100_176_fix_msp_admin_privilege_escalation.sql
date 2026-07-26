-- ============================================================
-- 176 — P0: end_user do tenant provedor lia chamados de TODOS os clientes
--
-- Descoberto em 2026-07-26 ao provar o isolamento da migration 175
-- (scripts/rls-isolation-check.sql). is_current_user_msp_admin() decidia
-- privilégio global apenas por TENANCY:
--
--     RETURN COALESCE(v_is_provider, false) OR COALESCE(v_role,'') = 'sysadmin';
--
-- Ou seja: qualquer perfil cuja empresa tenha is_provider_tenant = true
-- recebia acesso irrestrito — incluindo `end_user`. Num MSP, isso
-- significa que um funcionário comum do provedor (alguém que só abre
-- chamados para si) conseguia LER os chamados de todos os clientes.
-- Reproduzido: end_user do provedor enxergava 400 chamados, 100 deles de
-- outro tenant. O próprio nome da função ("msp_ADMIN") mostra que a
-- intenção nunca foi conceder isso a end_user.
--
-- A função é usada por 129 policies em 71 tabelas, então a correção na
-- origem fecha todas de uma vez.
--
-- Correção: exigir, além de pertencer ao provedor, um papel operacional.
-- `end_user` é o único papel definido como "solicitante" — os demais
-- (agent, ops_manager, governance_manager, company_admin) são equipe do
-- MSP e precisam legitimamente atender chamados de clientes; é o modelo
-- de negócio. `sysadmin` continua global por definição, independente do
-- tenant.
--
-- Um end_user do provedor NÃO perde nada do uso normal: continua vendo a
-- própria empresa pelo ramo `company_id = get_current_user_company_id()`
-- das policies e os próprios chamados por `caller_id`.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_current_user_msp_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_provider BOOLEAN;
  v_role        TEXT;
BEGIN
  SELECT c.is_provider_tenant, p.role::text
    INTO v_is_provider, v_role
    FROM public.profiles p
    JOIN public.companies c ON c.id = p.company_id
   WHERE p.auth_id = auth.uid()
     AND p.active = true;

  -- sysadmin é global por definição.
  IF COALESCE(v_role, '') = 'sysadmin' THEN
    RETURN true;
  END IF;

  -- Demais: precisa ser equipe operacional DO provedor.
  RETURN COALESCE(v_is_provider, false)
     AND COALESCE(v_role, '') IN ('company_admin', 'agent', 'ops_manager', 'governance_manager');
END;
$function$;
