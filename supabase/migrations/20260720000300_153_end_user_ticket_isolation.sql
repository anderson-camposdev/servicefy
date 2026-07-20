-- ServiceFY — achado durante o smoke test da migration 152 (anexos): a regra
-- "grupo não-privado é visível para todo mundo do tenant" (can_read_ticket,
-- migration 134) foi desenhada para a visão AMPLA de analista ("hoje
-- qualquer analista já vê todos os tickets da empresa" — decisão aceita na
-- época). Mas a mesma função também é usada pelo Portal do Usuário — e para
-- end_user isso significa que qualquer cliente final consegue ler o chamado
-- de QUALQUER outro cliente final do mesmo tenant, bastando o grupo
-- solucionador não estar marcado como privado (que é o padrão). Não existe
-- hoje nenhum isolamento "end_user só vê o próprio chamado".
--
-- Corrigido: o bypass "grupo não é privado" e "sou membro do grupo" agora só
-- vale para quem NÃO é end_user (mantém 100% do comportamento de
-- analista/gestor). end_user continua vendo o que já via antes (chamado
-- próprio via caller_id) e nada além disso.

CREATE OR REPLACE FUNCTION public.can_read_ticket(p_ticket_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = p_ticket_id
      AND (t.company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin())
      AND (
        public.is_current_user_msp_admin()
        OR t.caller_id = public.get_current_profile_id()
        OR t.assigned_to_id = public.get_current_profile_id()
        OR public.get_current_user_role() IN ('sysadmin','company_admin','ops_manager','governance_manager')
        OR (
          public.get_current_user_role() <> 'end_user'
          AND (
            NOT EXISTS (
              SELECT 1 FROM public.assignment_groups g
              WHERE g.id = t.assignment_group_id AND g.is_private = true
            )
            OR EXISTS (
              SELECT 1 FROM public.user_groups ug
              WHERE ug.group_id = t.assignment_group_id AND ug.user_id = public.get_current_profile_id()
            )
          )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_ticket(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_ticket(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_read_ticket(uuid) IS
  'Analista/gestor: todo ticket não-privado do tenant (ou membro do grupo privado). end_user: somente onde é caller_id ou assigned_to_id — nunca vê chamados de outros usuários finais.';
