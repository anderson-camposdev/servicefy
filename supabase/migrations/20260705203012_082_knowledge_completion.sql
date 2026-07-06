-- ServiceFY — Base de Conhecimento: conclusão (versionamento, concessões,
-- vínculo com casos, métricas, busca e workflow atômico).
--
-- Não destrutiva sobre a 079. Reutiliza os padrões da plataforma:
--   is_settings_admin(company_id)  -> guard administrativo (076)
--   write_admin_audit(...)         -> auditoria com redação de segredos (076)
--   user_groups(user_id, group_id) -> pertencimento a grupo (020)
--   can_read_case(id)              -> leitura de caso (078, modelo espelhado)
-- Tenant e visibilidade permanecem aplicados por RLS — a UI nunca é a barreira.

-- ─── 1. Colunas novas em knowledge_articles ──────────────────────────────────
ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deflection_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags
  ON public.knowledge_articles USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status_vis
  ON public.knowledge_articles(company_id, status, visibility);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category
  ON public.knowledge_articles(company_id, category_id);

-- ─── 2. Versionamento (histórico) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  summary text,
  body text NOT NULL,
  status text NOT NULL,
  visibility text NOT NULL,
  snapshot_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_versions_article
  ON public.knowledge_article_versions(article_id, version DESC);

-- ─── 3. Concessões para artigos restritos (perfis e grupos) ──────────────────
-- Espelha public.case_access_grants (078): subject_type profile|group + expiração.
CREATE TABLE IF NOT EXISTS public.knowledge_article_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('profile','group')),
  subject_id uuid NOT NULL,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(article_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_kb_grants_subject
  ON public.knowledge_article_grants(subject_type, subject_id);

-- ─── 4. Vínculo artigo ↔ caso (deflexão / efetividade) ───────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_article_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  usage text NOT NULL DEFAULT 'linked' CHECK (usage IN ('suggested','linked','sent_to_user')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_cases_case ON public.knowledge_article_cases(case_id);
CREATE INDEX IF NOT EXISTS idx_kb_cases_article ON public.knowledge_article_cases(article_id, created_at DESC);

-- ─── 5. Leitura de artigo (encapsula toda a visibilidade) ────────────────────
-- Admin do tenant vê tudo; publicados seguem visibilidade; restrito exige grant
-- por perfil OU por grupo do usuário. Isolamento de tenant preservado.
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
REVOKE ALL ON FUNCTION public.can_read_knowledge_article(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_knowledge_article(uuid) TO authenticated;

-- Recria a política de leitura usando o helper (substitui a de 079).
DROP POLICY IF EXISTS knowledge_tenant_read ON public.knowledge_articles;
CREATE POLICY knowledge_tenant_read ON public.knowledge_articles FOR SELECT TO authenticated
  USING (public.can_read_knowledge_article(id));

-- Feedback só para artigo acessível (substitui a de 079).
DROP POLICY IF EXISTS knowledge_feedback_tenant ON public.knowledge_article_feedback;
CREATE POLICY knowledge_feedback_tenant ON public.knowledge_article_feedback FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_user_company_id()
    AND profile_id = public.get_current_profile_id()
    AND public.can_read_knowledge_article(article_id)
  );

-- ─── 6. RLS das tabelas novas ────────────────────────────────────────────────
ALTER TABLE public.knowledge_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_article_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_article_cases ENABLE ROW LEVEL SECURITY;

-- Versões: só admin lê; escrita apenas via trigger (SECURITY DEFINER).
CREATE POLICY kb_versions_admin_read ON public.knowledge_article_versions FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

-- Concessões: admin gerencia; o destinatário pode ver a própria concessão.
CREATE POLICY kb_grants_admin_write ON public.knowledge_article_grants FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY kb_grants_self_read ON public.knowledge_article_grants FOR SELECT TO authenticated
  USING (
    public.is_settings_admin(company_id)
    OR (subject_type = 'profile' AND subject_id = public.get_current_profile_id())
    OR (subject_type = 'group' AND EXISTS (
      SELECT 1 FROM public.user_groups ug
      WHERE ug.group_id = subject_id AND ug.user_id = public.get_current_profile_id()
    ))
  );

-- Vínculo com caso: staff do tenant lê/escreve o que puder ler do caso.
CREATE POLICY kb_cases_staff_read ON public.knowledge_article_cases FOR SELECT TO authenticated
  USING (
    (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin())
    AND public.can_read_case(case_id)
  );

REVOKE INSERT, UPDATE, DELETE ON public.knowledge_article_versions FROM authenticated;
GRANT SELECT ON public.knowledge_article_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_article_grants TO authenticated;
GRANT SELECT ON public.knowledge_article_cases TO authenticated;

-- ─── 7. Trigger de versionamento + updated_at ────────────────────────────────
-- BEFORE UPDATE: quando conteúdo/estado/visibilidade muda, arquiva o registro
-- ANTERIOR em knowledge_article_versions e incrementa a versão. Sempre toca updated_at.
CREATE OR REPLACE FUNCTION public.tg_knowledge_article_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF (NEW.title, NEW.summary, NEW.body, NEW.status, NEW.visibility)
     IS DISTINCT FROM (OLD.title, OLD.summary, OLD.body, OLD.status, OLD.visibility) THEN
    INSERT INTO public.knowledge_article_versions(
      company_id, article_id, version, title, summary, body, status, visibility, snapshot_by
    ) VALUES (
      OLD.company_id, OLD.id, OLD.version, OLD.title, OLD.summary, OLD.body,
      OLD.status, OLD.visibility, public.get_current_profile_id()
    );
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_article_version ON public.knowledge_articles;
CREATE TRIGGER trg_knowledge_article_version
  BEFORE UPDATE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_knowledge_article_version();

-- ─── 8. RPC de busca (respeita RLS do chamador) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.kb_search_articles(
  p_company_id uuid,
  p_query text DEFAULT NULL,
  p_domain_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, title text, summary text, slug text, category_id uuid,
  service_domain_id uuid, visibility text, status text, tags text[],
  view_count integer, updated_at timestamptz, rank real, total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT CASE WHEN p_query IS NULL OR btrim(p_query) = '' THEN NULL
                ELSE websearch_to_tsquery('portuguese', p_query) END AS tsq
  )
  SELECT a.id, a.title, a.summary, a.slug, a.category_id, a.service_domain_id,
         a.visibility, a.status, a.tags, a.view_count, a.updated_at,
         CASE WHEN (SELECT tsq FROM q) IS NULL THEN 0
              ELSE ts_rank(a.search_vector, (SELECT tsq FROM q)) END AS rank,
         count(*) OVER () AS total_count
  FROM public.knowledge_articles a
  WHERE a.company_id = COALESCE(p_company_id, a.company_id)
    AND ((SELECT tsq FROM q) IS NULL OR a.search_vector @@ (SELECT tsq FROM q))
    AND (p_domain_id IS NULL OR a.service_domain_id = p_domain_id)
    AND (p_category_id IS NULL OR a.category_id = p_category_id)
  ORDER BY rank DESC, a.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION public.kb_search_articles(uuid,text,uuid,uuid,integer,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kb_search_articles(uuid,text,uuid,uuid,integer,integer) TO authenticated;

-- ─── 9. Transições de workflow (atômicas, auditadas, admin-only) ─────────────
CREATE OR REPLACE FUNCTION public.kb_set_article_status(
  p_article_id uuid,
  p_company_id uuid,
  p_status text
) RETURNS public.knowledge_articles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.knowledge_articles;
BEGIN
  IF p_status NOT IN ('draft','review','published','archived') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.knowledge_articles
     SET status = p_status,
         reviewer_id = CASE WHEN p_status IN ('published','review')
                            THEN public.get_current_profile_id() ELSE reviewer_id END,
         published_at = CASE WHEN p_status = 'published' THEN COALESCE(published_at, now())
                             WHEN p_status IN ('draft','archived') THEN NULL
                             ELSE published_at END
   WHERE id = p_article_id AND company_id = p_company_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_admin_audit(
    p_company_id, 'kb.status.' || p_status, 'knowledge_article', p_article_id::text,
    NULL, jsonb_build_object('status', p_status));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.kb_set_article_status(uuid,uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kb_set_article_status(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.kb_duplicate_article(
  p_article_id uuid,
  p_company_id uuid
) RETURNS public.knowledge_articles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src public.knowledge_articles;
  v_new public.knowledge_articles;
  v_slug text;
BEGIN
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_src FROM public.knowledge_articles
   WHERE id = p_article_id AND company_id = p_company_id;
  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_slug := left(v_src.slug, 200) || '-copia-' || substr(gen_random_uuid()::text, 1, 8);

  INSERT INTO public.knowledge_articles(
    company_id, category_id, service_domain_id, title, slug, summary, body,
    status, visibility, author_id, tags
  ) VALUES (
    v_src.company_id, v_src.category_id, v_src.service_domain_id,
    v_src.title || ' (cópia)', v_slug, v_src.summary, v_src.body,
    'draft', v_src.visibility, public.get_current_profile_id(), v_src.tags
  ) RETURNING * INTO v_new;

  PERFORM public.write_admin_audit(
    p_company_id, 'kb.duplicate', 'knowledge_article', v_new.id::text,
    jsonb_build_object('source', p_article_id), jsonb_build_object('slug', v_slug));
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.kb_duplicate_article(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kb_duplicate_article(uuid,uuid) TO authenticated;

-- ─── 10. Uso pelo agente: sugestão, registro e deflexão ──────────────────────
-- Sugere artigos visíveis ao analista a partir do texto do caso. Respeita a RLS
-- de artigos (INVOKER) e exige leitura do caso.
CREATE OR REPLACE FUNCTION public.kb_suggest_for_case(
  p_case_id uuid,
  p_limit integer DEFAULT 8
) RETURNS TABLE (
  id uuid, title text, summary text, slug text, visibility text, rank real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_domain uuid;
  v_text text;
BEGIN
  IF NOT public.can_read_case(p_case_id) THEN
    RAISE EXCEPTION 'Caso inacessível' USING ERRCODE = '42501';
  END IF;
  SELECT c.service_domain_id, coalesce(c.title,'') || ' ' || coalesce(c.description,'')
    INTO v_domain, v_text
    FROM public.cases c WHERE c.id = p_case_id;

  RETURN QUERY
  SELECT a.id, a.title, a.summary, a.slug, a.visibility,
         ts_rank(a.search_vector, websearch_to_tsquery('portuguese', coalesce(v_text,''))) AS rank
    FROM public.knowledge_articles a
   WHERE a.status = 'published'
     AND (a.service_domain_id = v_domain OR a.service_domain_id IS NULL)
     AND (v_text IS NULL OR btrim(v_text) = ''
          OR a.search_vector @@ websearch_to_tsquery('portuguese', v_text))
   ORDER BY rank DESC, a.view_count DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25);
END;
$$;
REVOKE ALL ON FUNCTION public.kb_suggest_for_case(uuid,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kb_suggest_for_case(uuid,integer) TO authenticated;

-- Registra uso do artigo num caso e contabiliza deflexão/efetividade.
CREATE OR REPLACE FUNCTION public.kb_register_article_usage(
  p_article_id uuid,
  p_case_id uuid,
  p_usage text DEFAULT 'linked'
) RETURNS public.knowledge_article_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.knowledge_article_cases;
  v_company uuid;
BEGIN
  IF p_usage NOT IN ('suggested','linked','sent_to_user') THEN
    RAISE EXCEPTION 'Uso inválido: %', p_usage USING ERRCODE = '22023';
  END IF;
  -- Autorização: precisa poder ler o caso E o artigo.
  IF NOT public.can_read_case(p_case_id) OR NOT public.can_read_knowledge_article(p_article_id) THEN
    RAISE EXCEPTION 'Acesso negado ao caso ou artigo' USING ERRCODE = '42501';
  END IF;
  SELECT company_id INTO v_company FROM public.cases WHERE id = p_case_id;

  INSERT INTO public.knowledge_article_cases(company_id, article_id, case_id, linked_by, usage)
  VALUES (v_company, p_article_id, p_case_id, public.get_current_profile_id(), p_usage)
  RETURNING * INTO v_row;

  UPDATE public.knowledge_articles
     SET view_count = view_count + 1,
         deflection_count = deflection_count + CASE WHEN p_usage = 'sent_to_user' THEN 1 ELSE 0 END
   WHERE id = p_article_id;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.kb_register_article_usage(uuid,uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kb_register_article_usage(uuid,uuid,text) TO authenticated;

-- Registro leve de uso/deflexão sem exigir um caso ESM (usado pelo cockpit de
-- incidentes): contabiliza visualização e, quando enviado ao usuário, deflexão.
-- Só contabiliza para artigo que o chamador pode ler.
CREATE OR REPLACE FUNCTION public.kb_touch_article(
  p_article_id uuid,
  p_deflected boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_read_knowledge_article(p_article_id) THEN
    RAISE EXCEPTION 'Artigo inacessível' USING ERRCODE = '42501';
  END IF;
  UPDATE public.knowledge_articles
     SET view_count = view_count + 1,
         deflection_count = deflection_count + CASE WHEN p_deflected THEN 1 ELSE 0 END
   WHERE id = p_article_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kb_touch_article(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kb_touch_article(uuid,boolean) TO authenticated;

-- ─── 11. Integridade, autoria e auditoria completa ───────────────────────────
-- As escritas administrativas continuam protegidas por RLS. Estes guards
-- impedem referências cross-tenant inclusive para sysadmin e carimbam o ator.

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

DROP TRIGGER IF EXISTS trg_kb_article_guard ON public.knowledge_articles;
CREATE TRIGGER trg_kb_article_guard
  BEFORE INSERT OR UPDATE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_kb_article_guard();

CREATE OR REPLACE FUNCTION public.tg_kb_category_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.company_id := OLD.company_id; END IF;
  IF NEW.service_domain_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_domains d
    WHERE d.id = NEW.service_domain_id AND d.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Domínio de outro tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_category_guard ON public.knowledge_categories;
CREATE TRIGGER trg_kb_category_guard
  BEFORE INSERT OR UPDATE ON public.knowledge_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_kb_category_guard();

CREATE OR REPLACE FUNCTION public.tg_kb_grant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.company_id := OLD.company_id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_articles a
    WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Artigo de outro tenant' USING ERRCODE = '23514';
  END IF;

  IF NEW.subject_type = 'profile' AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = NEW.subject_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Perfil de outro tenant' USING ERRCODE = '23514';
  ELSIF NEW.subject_type = 'group' AND NOT EXISTS (
    SELECT 1 FROM public.assignment_groups g
    WHERE g.id = NEW.subject_id AND g.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Grupo de outro tenant' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.granted_by := public.get_current_profile_id();
  ELSE
    NEW.granted_by := OLD.granted_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_grant_guard ON public.knowledge_article_grants;
CREATE TRIGGER trg_kb_grant_guard
  BEFORE INSERT OR UPDATE ON public.knowledge_article_grants
  FOR EACH ROW EXECUTE FUNCTION public.tg_kb_grant_guard();

CREATE OR REPLACE FUNCTION public.tg_kb_case_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_articles a
    WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = NEW.case_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Caso e artigo devem pertencer ao mesmo tenant' USING ERRCODE = '23514';
  END IF;
  NEW.linked_by := public.get_current_profile_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_case_link_guard ON public.knowledge_article_cases;
CREATE TRIGGER trg_kb_case_link_guard
  BEFORE INSERT OR UPDATE ON public.knowledge_article_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_kb_case_link_guard();

-- Auditoria de CRUD. Atualizações exclusivas de métricas não geram ruído.
CREATE OR REPLACE FUNCTION public.tg_kb_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  v_id text := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_settings_admin(v_company) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME = 'knowledge_articles' AND TG_OP = 'UPDATE'
     AND (NEW.title, NEW.summary, NEW.body, NEW.category_id, NEW.service_domain_id,
          NEW.status, NEW.visibility, NEW.tags, NEW.scheduled_at)
         IS NOT DISTINCT FROM
         (OLD.title, OLD.summary, OLD.body, OLD.category_id, OLD.service_domain_id,
          OLD.status, OLD.visibility, OLD.tags, OLD.scheduled_at) THEN
    RETURN NEW;
  END IF;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL
    ELSE to_jsonb(OLD) - ARRAY['body','search_vector'] END;
  v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL
    ELSE to_jsonb(NEW) - ARRAY['body','search_vector'] END;

  PERFORM public.write_admin_audit(
    v_company,
    'kb.' || replace(TG_TABLE_NAME, 'knowledge_', '') || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_id,
    v_before,
    v_after
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_article_audit ON public.knowledge_articles;
CREATE TRIGGER trg_kb_article_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_kb_admin_audit();

DROP TRIGGER IF EXISTS trg_kb_category_audit ON public.knowledge_categories;
CREATE TRIGGER trg_kb_category_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_kb_admin_audit();

DROP TRIGGER IF EXISTS trg_kb_grant_audit ON public.knowledge_article_grants;
CREATE TRIGGER trg_kb_grant_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_article_grants
  FOR EACH ROW EXECUTE FUNCTION public.tg_kb_admin_audit();

REVOKE ALL ON FUNCTION public.tg_kb_article_guard() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_kb_category_guard() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_kb_grant_guard() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_kb_case_link_guard() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_kb_admin_audit() FROM public, anon, authenticated;

-- O INSERT ... RETURNING do portal precisa ler o próprio feedback.
DROP POLICY IF EXISTS knowledge_feedback_self_read ON public.knowledge_article_feedback;
CREATE POLICY knowledge_feedback_self_read
  ON public.knowledge_article_feedback FOR SELECT TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR public.is_settings_admin(company_id)
  );
-- ─── Verificação (comentada) ─────────────────────────────────────────────────
--   SELECT * FROM public.kb_search_articles('<company>', 'senha vpn');
--   SELECT * FROM public.kb_suggest_for_case('<case>');
--   SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'kb\_%';
