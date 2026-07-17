-- ============================================================
-- ServiceFY — Migration 134
-- Privacidade de tickets por grupo solucionador. Hoje qualquer
-- staff (agent incluído) vê todo ticket da empresa
-- (select_ticket_policy, migration 096, é puramente por
-- company_id). Grupos marcados como privados (ex.: RH,
-- Financeiro) passam a só ser visíveis para membros do grupo,
-- o próprio solicitante/atribuído, e ops_manager/
-- governance_manager/admin (que continuam vendo tudo).
--
-- is_private nasce false em todo grupo existente: zero-regressão
-- no deploy, nada muda até um admin marcar um grupo como privado.
-- ============================================================

ALTER TABLE public.assignment_groups
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_read_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.id = p_ticket_id
      AND (t.company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin())
      AND (
        public.is_current_user_msp_admin()
        OR t.caller_id = public.get_current_profile_id()
        OR t.assigned_to_id = public.get_current_profile_id()
        OR public.get_current_user_role() IN ('sysadmin', 'company_admin', 'ops_manager', 'governance_manager')
        OR NOT EXISTS (
          SELECT 1 FROM public.assignment_groups g
          WHERE g.id = t.assignment_group_id AND g.is_private = true
        )
        OR EXISTS (
          SELECT 1 FROM public.user_groups ug
          WHERE ug.group_id = t.assignment_group_id AND ug.user_id = public.get_current_profile_id()
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_ticket(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_ticket(uuid) TO authenticated;

-- Achado crítico: select_incident_policy (migration 071) nunca foi
-- removida quando 096 renomeou incidents->tickets e criou select_ticket_policy
-- por cima. Como policies permissivas se combinam por OR, a 071 (company-wide,
-- sem checagem de grupo) continuaria valendo e anularia silenciosamente esta
-- restrição se não for derrubada aqui.
DROP POLICY IF EXISTS select_incident_policy ON public.tickets;

DROP POLICY IF EXISTS select_ticket_policy ON public.tickets;
CREATE POLICY select_ticket_policy ON public.tickets
  FOR SELECT TO authenticated
  USING (public.can_read_ticket(id));
