-- ServiceFY — correção preventiva da mesma classe de bug das migrations
-- 161 e 162, agora em `cases`, antes que algum fluxo do produto passe a
-- fazer INSERT direto com RETURNING nessa tabela (hoje só é escrita via
-- trigger sync_incident_to_case, sem RETURNING, então o bug ainda não
-- se manifestou na prática — mas o padrão é idêntico aos dois já
-- confirmados em produção).
--
-- can_read_case(uuid) resolve tanto cases_private_read (SELECT) quanto
-- cases_collaborate (UPDATE, USING e WITH CHECK) fazendo uma
-- sub-consulta por id na própria tabela cases — a mesma sub-consulta
-- que nunca enxerga a linha que o comando atual acabou de inserir
-- (MVCC). can_read_case(uuid) é mantida intacta para chamadores que
-- checam um case já existente em outro comando (ex.: RPCs que operam
-- sobre um case_id recebido como parâmetro).

BEGIN;

CREATE OR REPLACE FUNCTION public.can_read_case_row(
  p_case_id uuid,
  p_company_id uuid,
  p_requester_id uuid,
  p_assigned_to_id uuid,
  p_visibility service_domain_privacy,
  p_assignment_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_requester_id = public.get_current_profile_id()
    OR p_assigned_to_id = public.get_current_profile_id()
    OR (
      p_visibility = 'standard'
      AND p_company_id = public.get_current_user_company_id()
      AND public.get_current_user_role() <> 'end_user'
    )
    OR EXISTS (
      SELECT 1 FROM public.case_access_grants g
      WHERE g.case_id = p_case_id
        AND (g.expires_at IS NULL OR g.expires_at > now())
        AND (
          (g.subject_type = 'profile' AND g.subject_id = public.get_current_profile_id())
          OR (g.subject_type = 'group' AND EXISTS (
            SELECT 1 FROM public.user_groups ug
            WHERE ug.group_id = g.subject_id AND ug.user_id = public.get_current_profile_id()
          ))
        )
    )
    OR (
      p_assignment_group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_groups ug
        WHERE ug.group_id = p_assignment_group_id AND ug.user_id = public.get_current_profile_id()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_case_row(uuid, uuid, uuid, uuid, service_domain_privacy, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_case_row(uuid, uuid, uuid, uuid, service_domain_privacy, uuid) TO authenticated;

DROP POLICY IF EXISTS cases_private_read ON public.cases;
CREATE POLICY cases_private_read ON public.cases
  FOR SELECT TO authenticated
  USING (public.can_read_case_row(id, company_id, requester_id, assigned_to_id, visibility, assignment_group_id));

DROP POLICY IF EXISTS cases_collaborate ON public.cases;
CREATE POLICY cases_collaborate ON public.cases
  FOR UPDATE TO authenticated
  USING (public.can_read_case_row(id, company_id, requester_id, assigned_to_id, visibility, assignment_group_id))
  WITH CHECK (public.can_read_case_row(id, company_id, requester_id, assigned_to_id, visibility, assignment_group_id));

COMMIT;
