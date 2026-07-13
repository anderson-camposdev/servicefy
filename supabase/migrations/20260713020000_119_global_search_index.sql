-- ServiceFY — Fase 22: Busca Omnichannel Inteligente (Global Search).
--
-- Cruza incident_catalog_symptoms (catálogo de incidentes) e
-- knowledge_articles (KB publicada) numa única RPC. Ver análise: nenhuma das
-- duas tabelas fica no caminho de escrita de tickets — catálogo é curado por
-- admin, KB só muda por edição manual ou pelo motor da Fase 20. Um índice GIN
-- aqui tem custo zero sobre INSERT/UPDATE em tickets.
--
-- Restrição desta fase: não alterar estruturas de fases anteriores, só
-- adicionar a camada de leitura rápida. incident_catalog_symptoms.search_vector
-- é coluna nova (não existia antes) — puramente aditivo. knowledge_articles já
-- tinha um search_vector (migration 079); em vez de alterá-lo, adicionamos
-- search_vector_unaccent como coluna paralela só para esta RPC — o original
-- permanece intocado, servindo kb_search_articles/kb_suggest_for_case sem
-- qualquer mudança de comportamento.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- unaccent(text) é STABLE, não IMMUTABLE — colunas GENERATED ALWAYS AS (...)
-- STORED exigem expressão IMMUTABLE. Wrapper padrão da comunidade Postgres
-- para viabilizar unaccent em coluna gerada/índice.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

-- ─── 1) incident_catalog_symptoms: tsvector próprio (name + description) ──
-- subitem/item (outras tabelas) não podem entrar numa coluna gerada — casados
-- on-the-fly na RPC, aceitável porque o catálogo é pequeno por tenant e já
-- filtrado por company_id via índice btree antes de qualquer cálculo de
-- tsvector rodar.
ALTER TABLE public.incident_catalog_symptoms
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(name, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(description, ''))), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_incident_catalog_symptoms_search
  ON public.incident_catalog_symptoms USING GIN (search_vector);

-- ─── 2) knowledge_articles: coluna NOVA, aditiva — search_vector (migration
-- 079, fase anterior) permanece intocada e continua servindo
-- kb_search_articles/kb_suggest_for_case exatamente como antes. Em vez de
-- alterar essa estrutura pré-existente, adicionamos search_vector_unaccent
-- só para esta RPC: peso por campo (título=A > resumo=B > corpo=C) e
-- tolerância a acentuação, sem tocar em nada de fase anterior. ─────────────
ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS search_vector_unaccent tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(summary, ''))), 'B') ||
    setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(body, ''))), 'C')
  ) STORED;

COMMENT ON COLUMN public.knowledge_articles.search_vector_unaccent IS 'Fase 22: coluna aditiva para search_portal_omnichannel — peso por campo + tolerância a acentuação. Não substitui search_vector (migration 079), que continua servindo kb_search_articles/kb_suggest_for_case sem alteração.';

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_search_unaccent
  ON public.knowledge_articles USING GIN (search_vector_unaccent);

-- ─── 3) RPC unificada ───────────────────────────────────────────────────────
-- SECURITY DEFINER com company_id explícito (não repassa para RLS por trás —
-- mesmo padrão já estabelecido nas Fases 17/21 para RPCs novas: blindagem
-- multitenant testável estaticamente, não implícita).
CREATE OR REPLACE FUNCTION public.search_portal_omnichannel(p_query text, p_limit integer DEFAULT 10)
RETURNS TABLE(
  id uuid,
  type text,
  title text,
  snippet text,
  rank real,
  slug text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_current_user_company_id();
  v_is_msp_admin boolean := public.is_current_user_msp_admin();
  v_tsq tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  IF p_query IS NULL OR btrim(p_query) = '' THEN
    RETURN;
  END IF;
  IF v_company_id IS NULL AND NOT v_is_msp_admin THEN
    RETURN;
  END IF;

  v_tsq := websearch_to_tsquery('portuguese', public.immutable_unaccent(p_query));
  IF v_tsq IS NULL OR numnode(v_tsq) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM (
    (
      SELECT
        s.id,
        'catalog'::text AS type,
        s.name AS title,
        left(coalesce(s.description, it.name || ' · ' || sub.name, ''), 160) AS snippet,
        (
          ts_rank(s.search_vector, v_tsq)
            + ts_rank(
                to_tsvector('portuguese', public.immutable_unaccent(coalesce(sub.name, '') || ' ' || coalesce(it.name, ''))),
                v_tsq
              ) * 0.5
        )::real AS rank,
        NULL::text AS slug
      FROM public.incident_catalog_symptoms s
      JOIN public.incident_catalog_subitems sub ON sub.id = s.subitem_id
      JOIN public.incident_catalog_items it ON it.id = s.item_id
      WHERE (s.company_id = v_company_id OR v_is_msp_admin)
        AND s.active = true AND sub.active = true AND it.active = true
        AND (
          s.search_vector @@ v_tsq
          OR to_tsvector('portuguese', public.immutable_unaccent(coalesce(sub.name, '') || ' ' || coalesce(it.name, ''))) @@ v_tsq
        )
    )
    UNION ALL
    (
      SELECT
        a.id,
        'kb_article'::text AS type,
        a.title,
        left(coalesce(a.summary, a.body, ''), 160) AS snippet,
        ts_rank(a.search_vector_unaccent, v_tsq) AS rank,
        a.slug
      FROM public.knowledge_articles a
      WHERE (a.company_id = v_company_id OR v_is_msp_admin)
        AND a.status = 'published'
        AND public.can_read_knowledge_article(a.id)
        AND a.search_vector_unaccent @@ v_tsq
    )
  ) combined
  ORDER BY rank DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_portal_omnichannel(text, integer) IS 'Fase 22: busca unificada catálogo de incidentes + KB publicada, tolerante a acentuação (immutable_unaccent) e variações morfológicas (stemmer portuguese via websearch_to_tsquery). Título de KB tem peso A (setweight), catálogo pondera name(A)/description(B) + subitem/item casados on-the-fly. SECURITY DEFINER com company_id explícito — não depende de RLS por trás. LIMIT 10 por padrão, ordenado por ts_rank.';

REVOKE ALL ON FUNCTION public.search_portal_omnichannel(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_portal_omnichannel(text, integer) TO authenticated;
