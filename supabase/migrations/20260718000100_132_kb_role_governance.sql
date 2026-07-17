-- ============================================================
-- ServiceFY — Migration 132
-- Abertura da Base de Conhecimento para agent/ops_manager/
-- governance_manager. Helpers de capacidade, leitura ampliada
-- (autor próprio + fila de revisão), RLS de escrita granular e
-- trava de status fora da RPC dedicada.
--
-- Não altera is_settings_admin nem write_admin_audit — helpers
-- novos convivem ao lado deles.
-- ============================================================

-- ─── 1. Helpers de capacidade de KB (compõem sobre is_settings_admin) ───────
CREATE OR REPLACE FUNCTION public.is_kb_contributor(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_settings_admin(p_company_id)
    OR (
      public.get_current_user_role() IN ('agent', 'ops_manager', 'governance_manager')
      AND p_company_id = public.get_current_user_company_id()
    );
$$;
REVOKE ALL ON FUNCTION public.is_kb_contributor(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_kb_contributor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_kb_reviewer(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_settings_admin(p_company_id)
    OR (
      public.get_current_user_role() IN ('ops_manager', 'governance_manager')
      AND p_company_id = public.get_current_user_company_id()
    );
$$;
REVOKE ALL ON FUNCTION public.is_kb_reviewer(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_kb_reviewer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_kb_governance(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_settings_admin(p_company_id)
    OR (
      public.get_current_user_role() = 'governance_manager'
      AND p_company_id = public.get_current_user_company_id()
    );
$$;
REVOKE ALL ON FUNCTION public.is_kb_governance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_kb_governance(uuid) TO authenticated;

-- ─── 2. Auditoria de KB sem reexigir is_settings_admin ──────────────────────
-- write_admin_audit (076) exige is_settings_admin internamente — chamá-la a
-- partir de uma RPC de KB já aberta para agent/ops_manager/governance_manager
-- abortaria a transação para esses papéis. write_kb_audit_event faz a mesma
-- redação de segredos, mas a autorização já foi decidida por quem chama (só
-- outra função SECURITY DEFINER de KB pode chamá-la — revogada até de
-- authenticated).
CREATE OR REPLACE FUNCTION public.write_kb_audit_event(
  p_company_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  v_before := COALESCE(p_before, '{}'::jsonb)
    - ARRAY['token','secret','password','credential','client_secret','private_key','webhook_secret'];
  v_after := COALESCE(p_after, '{}'::jsonb)
    - ARRAY['token','secret','password','credential','client_secret','private_key','webhook_secret'];

  INSERT INTO public.admin_audit_events(
    company_id, actor_profile_id, actor_role, action, resource_type, resource_id, before_data, after_data
  ) VALUES (
    p_company_id, public.get_current_profile_id(), public.get_current_user_role(),
    p_action, p_resource_type, p_resource_id, v_before, v_after
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.write_kb_audit_event(uuid, text, text, text, jsonb, jsonb) FROM public, anon, authenticated;

-- ─── 3. can_read_knowledge_article: + autor próprio + fila do revisor ───────
-- Preserva 100% das regras de 082 (isolamento por tenant, published+
-- public/tenant, published+internal-não-end_user, published+restricted via
-- grant) e adiciona: o autor sempre lê o próprio artigo (qualquer status), e
-- ops_manager/governance_manager leem toda a fila draft/review/archived do
-- tenant (necessário para a fila de revisão).
CREATE OR REPLACE FUNCTION public.can_read_knowledge_article(p_article_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_articles a
    WHERE a.id = p_article_id
      AND (a.company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin())
      AND (
        public.is_settings_admin(a.company_id)
        OR a.author_id = public.get_current_profile_id()
        OR (a.status IN ('draft','review','archived') AND public.is_kb_reviewer(a.company_id))
        OR (a.status = 'published' AND a.visibility IN ('public','tenant'))
        OR (a.status = 'published' AND a.visibility = 'internal'
            AND public.get_current_user_role() <> 'end_user')
        OR (a.status = 'published' AND a.visibility = 'restricted' AND EXISTS (
          SELECT 1 FROM public.knowledge_article_grants g
          WHERE g.article_id = a.id
            AND (g.expires_at IS NULL OR g.expires_at > now())
            AND (
              (g.subject_type = 'profile' AND g.subject_id = public.get_current_profile_id())
              OR (g.subject_type = 'group' AND EXISTS (
                SELECT 1 FROM public.user_groups ug
                WHERE ug.group_id = g.subject_id AND ug.user_id = public.get_current_profile_id()
              ))
            )
        ))
      )
  );
$$;
-- REVOKE/GRANT já aplicados em 082 e preservados por CREATE OR REPLACE.

-- ─── 4. RLS de escrita em knowledge_articles: admin-only vira granular ──────
-- knowledge_admin_write (079, FOR ALL is_settings_admin) cobria INSERT/
-- UPDATE/DELETE. DELETE fica só-admin (sem policy nova); INSERT/UPDATE
-- ganham policies próprias que abrem para agent/ops_manager/governance_manager
-- respeitando a máquina de estados.
DROP POLICY IF EXISTS knowledge_admin_write ON public.knowledge_articles;

CREATE POLICY knowledge_admin_delete ON public.knowledge_articles FOR DELETE TO authenticated
  USING (public.is_settings_admin(company_id));

DROP POLICY IF EXISTS knowledge_author_insert ON public.knowledge_articles;
CREATE POLICY knowledge_author_insert ON public.knowledge_articles FOR INSERT TO authenticated
  WITH CHECK (public.is_kb_contributor(company_id) AND status = 'draft');

DROP POLICY IF EXISTS knowledge_author_update ON public.knowledge_articles;
CREATE POLICY knowledge_author_update ON public.knowledge_articles FOR UPDATE TO authenticated
  USING (
    public.is_kb_reviewer(company_id)
    OR (author_id = public.get_current_profile_id() AND status IN ('draft','review'))
  )
  WITH CHECK (
    public.is_kb_reviewer(company_id)
    OR (author_id = public.get_current_profile_id() AND status IN ('draft','review'))
  );

-- ─── 5. Concessões restritas: governança gerencia (antes: admin only) ──────
DROP POLICY IF EXISTS kb_grants_admin_write ON public.knowledge_article_grants;
CREATE POLICY kb_grants_governance_write ON public.knowledge_article_grants FOR ALL TO authenticated
  USING (public.is_kb_governance(company_id)) WITH CHECK (public.is_kb_governance(company_id));
-- kb_grants_self_read (082) inalterada.

-- ─── 6. Versões: visíveis a quem pode ler o artigo vivo ────────────────────
DROP POLICY IF EXISTS kb_versions_admin_read ON public.knowledge_article_versions;
CREATE POLICY kb_versions_reader ON public.knowledge_article_versions FOR SELECT TO authenticated
  USING (public.can_read_knowledge_article(article_id));

-- ─── 7. Auditoria de KB: governança também lê (hoje é admin-only) ──────────
-- admin_audit_events (076) só é lida por is_settings_admin. Sem isso,
-- governance_manager nunca veria a trilha de auditoria da própria KB que
-- governa.
DROP POLICY IF EXISTS audit_kb_governance_select ON public.admin_audit_events;
CREATE POLICY audit_kb_governance_select ON public.admin_audit_events FOR SELECT TO authenticated
  USING (
    public.is_kb_governance(company_id)
    AND resource_type IN ('knowledge_article', 'knowledge_articles', 'knowledge_categories', 'knowledge_article_grants')
  );

-- ─── 8. tg_kb_article_guard: trava mudança de status fora da RPC dedicada ──
-- Sem isso, qualquer papel com UPDATE em knowledge_articles (agora inclui
-- ops_manager/governance_manager) poderia pular a máquina de estados via
-- PATCH direto (ex.: review -> published sem passar pela checagem de
-- "quatro olhos" de kb_set_article_status). A flag transacional
-- servicefy.kb_status_rpc só é setada dentro da própria RPC.
CREATE OR REPLACE FUNCTION public.tg_kb_article_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.company_id := OLD.company_id;
    NEW.author_id := OLD.author_id;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND coalesce(current_setting('servicefy.kb_status_rpc', true), 'false') <> 'true' THEN
      RAISE EXCEPTION 'Alteração de status deve usar kb_set_article_status()' USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW.author_id := COALESCE(NEW.author_id, public.get_current_profile_id());
  END IF;

  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.knowledge_categories c
    WHERE c.id = NEW.category_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Categoria de outro tenant' USING ERRCODE = '23514';
  END IF;

  IF NEW.service_domain_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_domains d
    WHERE d.id = NEW.service_domain_id AND d.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Domínio de outro tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- Trigger trg_kb_article_guard (082) já existe, sem mudança de definição.
