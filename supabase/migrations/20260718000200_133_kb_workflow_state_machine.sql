-- ============================================================
-- ServiceFY — Migration 133
-- Máquina de estados de KB por papel (agent/ops_manager/
-- governance_manager/admin) e correção da auditoria para cobrir
-- qualquer papel de KB, não só admin.
-- ============================================================

-- ─── 1. tg_kb_admin_audit: audita qualquer contribuidor de KB, não só admin ─
-- Antes: "IF NOT is_settings_admin THEN RETURN" descartava silenciosamente a
-- auditoria de qualquer escrita não-admin. Como este trabalho abre escrita
-- para agent/ops_manager/governance_manager, isso viraria um buraco de
-- compliance real. Troca write_admin_audit -> write_kb_audit_event (132),
-- que não reexige is_settings_admin.
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
  IF NOT public.is_kb_contributor(v_company) THEN
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

  PERFORM public.write_kb_audit_event(
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
-- Triggers trg_kb_article_audit / trg_kb_category_audit / trg_kb_grant_audit
-- (082) já existem, sem mudança de definição.

-- ─── 2. kb_set_article_status: máquina de estados por papel ────────────────
-- Regra dos quatro olhos: quem revisa/aprova nunca pode ser quem escreveu.
-- admin sempre pode (inclusive pular direto para published). agent só
-- movimenta o próprio artigo entre draft/review/archived. ops_manager
-- aprova/arquiva/despublica qualquer artigo (menos o próprio em
-- review->published). governance_manager tem tudo isso + reinstaurar
-- arquivado (archived->draft).
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
  v_old_status text;
  v_author uuid;
  v_is_admin boolean;
  v_is_reviewer boolean;
  v_is_governance boolean;
  v_is_own boolean;
  v_allowed boolean := false;
BEGIN
  IF p_status NOT IN ('draft','review','published','archived') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT status, author_id INTO v_old_status, v_author
    FROM public.knowledge_articles
   WHERE id = p_article_id AND company_id = p_company_id
   FOR UPDATE;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin      := public.is_settings_admin(p_company_id);
  v_is_reviewer   := public.is_kb_reviewer(p_company_id);
  v_is_governance := public.is_kb_governance(p_company_id);
  v_is_own        := v_author = public.get_current_profile_id();

  IF v_is_admin THEN
    v_allowed := true;
  ELSIF v_old_status = 'draft' AND p_status = 'review' THEN
    v_allowed := v_is_own OR v_is_reviewer;
  ELSIF v_old_status = 'review' AND p_status = 'draft' THEN
    v_allowed := v_is_own OR v_is_reviewer;
  ELSIF v_old_status = 'review' AND p_status = 'published' THEN
    v_allowed := v_is_reviewer AND NOT v_is_own;
  ELSIF v_old_status = 'published' AND p_status = 'archived' THEN
    v_allowed := v_is_reviewer;
  ELSIF v_old_status = 'published' AND p_status = 'draft' THEN
    v_allowed := v_is_reviewer;
  ELSIF v_old_status = 'archived' AND p_status = 'draft' THEN
    v_allowed := v_is_governance;
  ELSIF v_old_status = 'draft' AND p_status = 'archived' THEN
    v_allowed := v_is_own OR v_is_reviewer;
  ELSIF v_old_status = p_status THEN
    v_allowed := v_is_reviewer OR v_is_own;
  ELSE
    v_allowed := false;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Transição de status não permitida: % → %', v_old_status, p_status USING ERRCODE = '42501';
  END IF;

  -- Autoriza a mudança de status perante o guard de tg_kb_article_guard (132),
  -- que bloqueia qualquer UPDATE de status fora desta RPC. Flag local à
  -- transação (terceiro argumento true) — não vaza para outras sessões.
  PERFORM set_config('servicefy.kb_status_rpc', 'true', true);

  UPDATE public.knowledge_articles
     SET status = p_status,
         reviewer_id = CASE WHEN p_status = 'published' THEN public.get_current_profile_id() ELSE reviewer_id END,
         published_at = CASE WHEN p_status = 'published' THEN COALESCE(published_at, now())
                             WHEN p_status IN ('draft','archived') THEN NULL
                             ELSE published_at END
   WHERE id = p_article_id AND company_id = p_company_id
   RETURNING * INTO v_row;

  PERFORM public.write_kb_audit_event(
    p_company_id, 'kb.status.' || p_status, 'knowledge_article', p_article_id::text,
    jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_status));
  RETURN v_row;
END;
$$;
-- REVOKE/GRANT já aplicados em 082 e preservados por CREATE OR REPLACE.

-- ─── 3. kb_duplicate_article: qualquer contribuidor, com checagem de leitura
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
  IF NOT public.is_kb_contributor(p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.knowledge_articles
   WHERE id = p_article_id AND company_id = p_company_id;
  IF v_src.id IS NULL OR NOT public.can_read_knowledge_article(v_src.id) THEN
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

  PERFORM public.write_kb_audit_event(
    p_company_id, 'kb.duplicate', 'knowledge_article', v_new.id::text,
    jsonb_build_object('source', p_article_id), jsonb_build_object('slug', v_slug));
  RETURN v_new;
END;
$$;
-- REVOKE/GRANT já aplicados em 082 e preservados por CREATE OR REPLACE.
