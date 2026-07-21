-- ServiceFY — corrige regressão CRÍTICA introduzida pela própria migration 134
-- (privacidade de tickets por grupo, desta mesma sessão de trabalho).
--
-- select_ticket_policy usa `USING (can_read_ticket(id))`, e can_read_ticket(uuid)
-- resolve a visibilidade fazendo `SELECT 1 FROM public.tickets t WHERE t.id =
-- p_ticket_id ...`. Isso funciona para checar um ticket JÁ COMMITADO (ex.: upload
-- de anexo em um chamado existente, via can_upload_service_attachment), mas quebra
-- de forma sistêmica para QUALQUER `INSERT ... RETURNING` — o padrão que o
-- PostgREST/Supabase-js usa por padrão em toda escrita (`.insert().select()`).
--
-- Motivo: dentro do mesmo comando SQL, uma linha que o próprio comando acabou de
-- inserir não é visível para uma nova varredura por igualdade de id (regra de
-- MVCC do Postgres — cada comando enxerga apenas o snapshot de antes de si
-- mesmo, exceto a própria tupla que o RETURNING referencia diretamente). Como
-- can_read_ticket() faz uma sub-consulta nova por id em vez de usar as colunas
-- da linha que já estão disponíveis no contexto da RLS, o EXISTS nunca encontra
-- a linha recém-inserida e a policy de SELECT nega a visibilidade — o Postgres
-- reporta isso como "new row violates row-level security policy for table
-- tickets" (o mesmo código de erro do WITH CHECK, mas na verdade é a checagem
-- de RETURNING/visibilidade que falha).
--
-- Efeito real: TODA criação de incidente ou solicitação por QUALQUER papel
-- (end_user, agent, admin) que passe por `public.incidents`/`public.tickets`
-- com retorno de linha (o padrão do frontend) passou a falhar com 42501 desde
-- que a 134 foi aplicada — não é um bug isolado do portal do usuário final,
-- é a via de escrita inteira. Detectado nesta mesma sessão de QA E2E, ao
-- tentar confirmar (equivocadamente) que a correção da migration 160 já havia
-- resolvido o problema — na verdade a 160 corrigiu um bug real e diferente
-- (default de `state`), mas mascarava esta segunda quebra, introduzida por
-- mim mesmo horas antes na mesma sessão.
--
-- Correção: mover a lógica de can_read_ticket() para uma variante que recebe
-- as colunas da própria linha (company_id/caller_id/assigned_to_id/
-- assignment_group_id) em vez de re-consultar a tabela por id. RLS avalia o
-- USING/WITH CHECK diretamente contra a linha em questão — não precisa (e não
-- deve) re-buscar a linha por chave primária. can_read_ticket(uuid) é mantida
-- intacta para os chamadores que checam um ticket JÁ EXISTENTE em outro
-- comando (can_upload_service_attachment).

BEGIN;

CREATE OR REPLACE FUNCTION public.can_read_ticket_row(
  p_company_id uuid,
  p_caller_id uuid,
  p_assigned_to_id uuid,
  p_assignment_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (p_company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin())
    AND (
      public.is_current_user_msp_admin()
      OR p_caller_id = public.get_current_profile_id()
      OR p_assigned_to_id = public.get_current_profile_id()
      OR public.get_current_user_role() IN ('sysadmin', 'company_admin', 'ops_manager', 'governance_manager')
      OR (
        public.get_current_user_role() <> 'end_user'
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.assignment_groups g
            WHERE g.id = p_assignment_group_id AND g.is_private = true
          )
          OR EXISTS (
            SELECT 1 FROM public.user_groups ug
            WHERE ug.group_id = p_assignment_group_id AND ug.user_id = public.get_current_profile_id()
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_ticket_row(uuid, uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_ticket_row(uuid, uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS select_ticket_policy ON public.tickets;
CREATE POLICY select_ticket_policy ON public.tickets
  FOR SELECT TO authenticated
  USING (public.can_read_ticket_row(company_id, caller_id, assigned_to_id, assignment_group_id));

COMMIT;
