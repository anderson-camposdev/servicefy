-- ServiceFY — corrige a MESMA classe de bug da migration 161, agora em
-- knowledge_articles: descoberta ao continuar a varredura de QA E2E,
-- testando a Base de Conhecimento como analista (papel `agent`).
--
-- can_read_knowledge_article(uuid) resolve a visibilidade fazendo
-- `SELECT 1 FROM public.knowledge_articles a WHERE a.id = p_article_id ...`
-- — a mesma sub-consulta por chave primária na própria tabela, que nunca
-- enxerga a linha que o comando atual acabou de inserir (MVCC). Como
-- knowledge_tenant_read (policy de SELECT) usa essa função, qualquer
-- `INSERT ... RETURNING` em knowledge_articles falhava com "new row
-- violates row-level security policy for table knowledge_articles" —
-- reproduzido ao vivo tentando salvar um rascunho de artigo como
-- analista pelo editor real (Base de Conhecimento → Novo artigo →
-- Salvar rascunho).
--
-- Correção: variante que recebe as colunas da própria linha
-- (company_id/author_id/status/visibility) em vez de re-consultar por
-- id. A sub-consulta em knowledge_article_grants (por article_id) é
-- preservada — não sofre do mesmo problema porque é uma tabela
-- diferente, sem relação de "linha que o comando atual inseriu".
-- can_read_knowledge_article(uuid) é mantida intacta para chamadores
-- que checam um artigo já existente em outro comando (ex.:
-- kb_register_article_usage, kb_suggest_for_case).

BEGIN;

CREATE OR REPLACE FUNCTION public.can_read_knowledge_article_row(
  p_article_id uuid,
  p_company_id uuid,
  p_author_id uuid,
  p_status text,
  p_visibility text
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
      public.is_settings_admin(p_company_id)
      OR p_author_id = public.get_current_profile_id()
      OR (p_status IN ('draft', 'review', 'archived') AND public.is_kb_reviewer(p_company_id))
      OR (p_status = 'published' AND p_visibility IN ('public', 'tenant'))
      OR (p_status = 'published' AND p_visibility = 'internal'
          AND public.get_current_user_role() <> 'end_user')
      OR (p_status = 'published' AND p_visibility = 'restricted' AND EXISTS (
        SELECT 1 FROM public.knowledge_article_grants g
        WHERE g.article_id = p_article_id
          AND (g.expires_at IS NULL OR g.expires_at > now())
          AND (
            (g.subject_type = 'profile' AND g.subject_id = public.get_current_profile_id())
            OR (g.subject_type = 'group' AND EXISTS (
              SELECT 1 FROM public.user_groups ug
              WHERE ug.group_id = g.subject_id AND ug.user_id = public.get_current_profile_id()
            ))
          )
      ))
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_knowledge_article_row(uuid, uuid, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_knowledge_article_row(uuid, uuid, uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS knowledge_tenant_read ON public.knowledge_articles;
CREATE POLICY knowledge_tenant_read ON public.knowledge_articles
  FOR SELECT TO authenticated
  USING (public.can_read_knowledge_article_row(id, company_id, author_id, status, visibility));

COMMIT;
