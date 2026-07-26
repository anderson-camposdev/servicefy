-- ============================================================
-- 175 — RLS de tickets: helpers de sessão viram InitPlan
--
-- Medido com 50.000 chamados no Postgres local (scripts/scale-bench.sql):
-- a fila do analista levava 18.678 ms com RLS contra 178 ms sem RLS.
-- A policy chamava can_read_ticket_row(...) por linha, e cada chamada
-- re-executava get_current_user_company_id(), is_current_user_msp_admin(),
-- get_current_profile_id() e get_current_user_role() — cada uma um JOIN
-- entre profiles e companies. ~4 consultas x 50.007 linhas.
--
-- Correção: os helpers não dependem da linha, só da sessão. Envolvidos em
-- (SELECT ...), o planner os promove a InitPlan e avalia UMA vez por
-- consulta em vez de uma por linha. É o padrão que o próprio linter do
-- Supabase aponta como `auth_rls_initplan`.
--
-- A LÓGICA DE AUTORIZAÇÃO É IDÊNTICA à de can_read_ticket_row() — só muda
-- onde as funções são avaliadas. A função é mantida intacta para os demais
-- chamadores; apenas a policy passa a usar a forma inline.
-- ============================================================

DROP POLICY IF EXISTS select_ticket_policy ON public.tickets;

CREATE POLICY select_ticket_policy ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    (
      company_id = (SELECT public.get_current_user_company_id())
      OR (SELECT public.is_current_user_msp_admin())
    )
    AND (
      (SELECT public.is_current_user_msp_admin())
      OR caller_id = (SELECT public.get_current_profile_id())
      OR assigned_to_id = (SELECT public.get_current_profile_id())
      OR (SELECT public.get_current_user_role()) IN
           ('sysadmin', 'company_admin', 'ops_manager', 'governance_manager')
      OR (
        (SELECT public.get_current_user_role()) <> 'end_user'
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.assignment_groups g
             WHERE g.id = tickets.assignment_group_id
               AND g.is_private = true
          )
          OR EXISTS (
            SELECT 1 FROM public.user_groups ug
             WHERE ug.group_id = tickets.assignment_group_id
               AND ug.user_id = (SELECT public.get_current_profile_id())
          )
        )
      )
    )
  );

-- Sustenta o EXISTS de grupo privado quando o usuário é agente comum
-- (único ramo que ainda toca outra tabela por linha).
CREATE INDEX IF NOT EXISTS idx_user_groups_group_user
  ON public.user_groups (group_id, user_id);
