import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260713020000_119_global_search_index.sql')

function fnBody(name, closer = '\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split(closer)[0]
}

test('unaccent instalada e wrapper immutable_unaccent existe (unaccent() é STABLE, coluna gerada exige IMMUTABLE)', () => {
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.immutable_unaccent\(text\)[\s\S]*?IMMUTABLE/)
})

test('incident_catalog_symptoms ganha search_vector gerado com peso (name=A, description=B) e índice GIN', () => {
  assert.match(sql, /ALTER TABLE public\.incident_catalog_symptoms\s+ADD COLUMN IF NOT EXISTS search_vector tsvector/)
  assert.match(sql, /setweight\(to_tsvector\('portuguese', public\.immutable_unaccent\(coalesce\(name, ''\)\)\), 'A'\)/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_incident_catalog_symptoms_search\s+ON public\.incident_catalog_symptoms USING GIN \(search_vector\)/)
})

test('knowledge_articles.search_vector é retrofitado com peso por campo (title=A, summary=B, body=C) e tolerância a acentuação', () => {
  assert.match(sql, /ALTER TABLE public\.knowledge_articles DROP COLUMN IF EXISTS search_vector/)
  assert.match(sql, /setweight\(to_tsvector\('portuguese', public\.immutable_unaccent\(coalesce\(title, ''\)\)\), 'A'\)/)
  assert.match(sql, /setweight\(to_tsvector\('portuguese', public\.immutable_unaccent\(coalesce\(summary, ''\)\)\), 'B'\)/)
  assert.match(sql, /setweight\(to_tsvector\('portuguese', public\.immutable_unaccent\(coalesce\(body, ''\)\)\), 'C'\)/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS knowledge_articles_search\s+ON public\.knowledge_articles USING GIN \(search_vector\)/)
})

test('search_portal_omnichannel é SECURITY DEFINER com company_id explícito (não depende de RLS por trás)', () => {
  const body = fnBody('search_portal_omnichannel(p_query text, p_limit integer DEFAULT 10)', '\nEND;\n$$;')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.search_portal_omnichannel\(p_query text, p_limit integer DEFAULT 10\)[\s\S]*?SECURITY DEFINER/)
  assert.match(body, /v_company_id uuid := public\.get_current_user_company_id\(\)/)
  assert.match(body, /WHERE \(s\.company_id = v_company_id OR v_is_msp_admin\)/)
  assert.match(body, /WHERE \(a\.company_id = v_company_id OR v_is_msp_admin\)/)
})

test('branch de KB exige status=published e reusa can_read_knowledge_article (mesma regra de visibilidade do resto do app, não uma cópia divergente)', () => {
  const body = fnBody('search_portal_omnichannel(p_query text, p_limit integer DEFAULT 10)', '\nEND;\n$$;')
  assert.match(body, /AND a\.status = 'published'/)
  assert.match(body, /AND public\.can_read_knowledge_article\(a\.id\)/)
})

test('branch de catálogo filtra active=true nos três níveis (symptom, subitem, item)', () => {
  const body = fnBody('search_portal_omnichannel(p_query text, p_limit integer DEFAULT 10)', '\nEND;\n$$;')
  assert.match(body, /AND s\.active = true AND sub\.active = true AND it\.active = true/)
})

test('query usa websearch_to_tsquery + immutable_unaccent (tolerante a acentuação e sintaxe de busca natural)', () => {
  const body = fnBody('search_portal_omnichannel(p_query text, p_limit integer DEFAULT 10)', '\nEND;\n$$;')
  assert.match(body, /v_tsq := websearch_to_tsquery\('portuguese', public\.immutable_unaccent\(p_query\)\)/)
})

test('resultado unificado tem coluna type distinguindo catalog/kb_article, ordenado por rank, com LIMIT (default 10, capado em 50)', () => {
  const body = fnBody('search_portal_omnichannel(p_query text, p_limit integer DEFAULT 10)', '\nEND;\n$$;')
  assert.match(body, /'catalog'::text AS type/)
  assert.match(body, /'kb_article'::text AS type/)
  assert.match(body, /ORDER BY rank DESC/)
  assert.match(body, /v_limit integer := LEAST\(GREATEST\(COALESCE\(p_limit, 10\), 1\), 50\)/)
})

test('query vazia ou sem lexemas retorna vazio sem erro (não gera tsquery inválida)', () => {
  const body = fnBody('search_portal_omnichannel(p_query text, p_limit integer DEFAULT 10)', '\nEND;\n$$;')
  assert.match(body, /IF p_query IS NULL OR btrim\(p_query\) = '' THEN\s*\n\s*RETURN;/)
  assert.match(body, /IF v_tsq IS NULL OR numnode\(v_tsq\) = 0 THEN\s*\n\s*RETURN;/)
})

test('função revogada de anon/public, concedida a authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.search_portal_omnichannel\(text, integer\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.search_portal_omnichannel\(text, integer\) TO authenticated/)
})

test('Contrato de busca global participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /global-search-contract\.test\.mjs/)
})
