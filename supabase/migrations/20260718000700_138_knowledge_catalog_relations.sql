-- ============================================================
-- ServiceFY — KB operacional vinculada ao catálogo e ao ITSM
-- Migration 138
--
-- Um artigo pode servir a vários sintomas de incidente, itens de
-- solicitação, problemas e mudanças. As quatro referências usam FKs
-- reais; a escrita é exclusivamente transacional via RPC.
-- ============================================================

CREATE TABLE public.knowledge_article_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (
    target_type IN ('incident', 'request', 'problem', 'change')
  ),
  incident_catalog_symptom_id uuid REFERENCES public.incident_catalog_symptoms(id) ON DELETE CASCADE,
  request_catalog_subitem_id uuid REFERENCES public.request_catalog_subitems(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES public.problems(id) ON DELETE CASCADE,
  change_id uuid REFERENCES public.changes(id) ON DELETE CASCADE,
  target_id uuid GENERATED ALWAYS AS (
    COALESCE(incident_catalog_symptom_id, request_catalog_subitem_id, problem_id, change_id)
  ) STORED,
  relationship text NOT NULL DEFAULT 'applies_to' CHECK (
    relationship IN ('applies_to', 'resolves', 'workaround', 'reference')
  ),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_article_relations_single_target CHECK (
    num_nonnulls(
      incident_catalog_symptom_id,
      request_catalog_subitem_id,
      problem_id,
      change_id
    ) = 1
  ),
  CONSTRAINT knowledge_article_relations_type_matches_target CHECK (
    (target_type = 'incident' AND incident_catalog_symptom_id IS NOT NULL)
    OR (target_type = 'request' AND request_catalog_subitem_id IS NOT NULL)
    OR (target_type = 'problem' AND problem_id IS NOT NULL)
    OR (target_type = 'change' AND change_id IS NOT NULL)
  ),
  UNIQUE (article_id, target_type, target_id)
);

CREATE INDEX idx_kb_relations_article
  ON public.knowledge_article_relations(article_id);
CREATE INDEX idx_kb_relations_company_target
  ON public.knowledge_article_relations(company_id, target_type, target_id);

COMMENT ON TABLE public.knowledge_article_relations IS
  'Vínculos operacionais entre artigos da KB e folhas do catálogo de incidentes/solicitações ou registros de problemas/mudanças.';

ALTER TABLE public.knowledge_article_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_relations_read
  ON public.knowledge_article_relations
  FOR SELECT TO authenticated
  USING (public.can_read_knowledge_article(article_id));

GRANT SELECT ON public.knowledge_article_relations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_article_relations FROM authenticated;

CREATE OR REPLACE FUNCTION public.kb_replace_article_relations(
  p_article_id uuid,
  p_company_id uuid,
  p_relations jsonb DEFAULT '[]'::jsonb
) RETURNS SETOF public.knowledge_article_relations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article public.knowledge_articles;
  v_relation jsonb;
  v_type text;
  v_target uuid;
  v_relationship text;
BEGIN
  IF jsonb_typeof(p_relations) <> 'array' THEN
    RAISE EXCEPTION 'Vínculos devem ser enviados como uma lista' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_relations) > 50 THEN
    RAISE EXCEPTION 'Um artigo pode ter no máximo 50 vínculos operacionais' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_article
    FROM public.knowledge_articles
   WHERE id = p_article_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF v_article.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado neste tenant' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_kb_reviewer(p_company_id)
    OR (
      v_article.author_id = public.get_current_profile_id()
      AND v_article.status IN ('draft', 'review')
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar os vínculos deste artigo' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.knowledge_article_relations
   WHERE article_id = p_article_id
     AND company_id = p_company_id;

  FOR v_relation IN SELECT value FROM jsonb_array_elements(p_relations)
  LOOP
    v_type := v_relation->>'targetType';
    v_target := (v_relation->>'targetId')::uuid;
    v_relationship := COALESCE(NULLIF(v_relation->>'relationship', ''), 'applies_to');

    IF v_relationship NOT IN ('applies_to', 'resolves', 'workaround', 'reference') THEN
      RAISE EXCEPTION 'Tipo de vínculo inválido' USING ERRCODE = '22023';
    END IF;

    IF v_type = 'incident' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.incident_catalog_symptoms
         WHERE id = v_target AND company_id = p_company_id
      ) THEN
        RAISE EXCEPTION 'Sintoma de incidente não pertence ao tenant' USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.knowledge_article_relations(
        company_id, article_id, target_type, incident_catalog_symptom_id,
        relationship, created_by
      ) VALUES (
        p_company_id, p_article_id, v_type, v_target,
        v_relationship, public.get_current_profile_id()
      );
    ELSIF v_type = 'request' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.request_catalog_subitems
         WHERE id = v_target AND company_id = p_company_id
      ) THEN
        RAISE EXCEPTION 'Item de solicitação não pertence ao tenant' USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.knowledge_article_relations(
        company_id, article_id, target_type, request_catalog_subitem_id,
        relationship, created_by
      ) VALUES (
        p_company_id, p_article_id, v_type, v_target,
        v_relationship, public.get_current_profile_id()
      );
    ELSIF v_type = 'problem' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.problems
         WHERE id = v_target AND company_id = p_company_id
      ) THEN
        RAISE EXCEPTION 'Problema não pertence ao tenant' USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.knowledge_article_relations(
        company_id, article_id, target_type, problem_id,
        relationship, created_by
      ) VALUES (
        p_company_id, p_article_id, v_type, v_target,
        v_relationship, public.get_current_profile_id()
      );
    ELSIF v_type = 'change' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.changes
         WHERE id = v_target AND company_id = p_company_id
      ) THEN
        RAISE EXCEPTION 'Mudança não pertence ao tenant' USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.knowledge_article_relations(
        company_id, article_id, target_type, change_id,
        relationship, created_by
      ) VALUES (
        p_company_id, p_article_id, v_type, v_target,
        v_relationship, public.get_current_profile_id()
      );
    ELSE
      RAISE EXCEPTION 'Objeto de vínculo inválido' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  PERFORM public.write_kb_audit_event(
    p_company_id,
    'kb.relations.replace',
    'knowledge_article',
    p_article_id::text,
    jsonb_build_object('relation_count', jsonb_array_length(p_relations))
  );

  RETURN QUERY
    SELECT *
      FROM public.knowledge_article_relations
     WHERE article_id = p_article_id
     ORDER BY created_at, id;
END;
$$;

REVOKE ALL ON FUNCTION public.kb_replace_article_relations(uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kb_replace_article_relations(uuid, uuid, jsonb) TO authenticated;
