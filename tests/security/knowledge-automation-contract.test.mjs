import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260713000000_117_knowledge_automation.sql')

function fnBody() {
  return sql.split('CREATE OR REPLACE FUNCTION public.tg_generate_kb_draft_on_resolution()')[1].split('\n$$;')[0]
}

test('knowledge_articles ganha source_ticket_id (FK nullable para tickets, ON DELETE SET NULL)', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS source_ticket_id uuid REFERENCES public\.tickets\(id\) ON DELETE SET NULL/)
})

test('tg_generate_kb_draft_on_resolution é SECURITY DEFINER com search_path fixo', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tg_generate_kb_draft_on_resolution\(\)[\s\S]*?SECURITY DEFINER/)
  assert.match(sql, /SET search_path = public/)
})

test('só gera rascunho na PRIMEIRA transição para estado terminal (mesma condição da Fase 19)', () => {
  const body = fnBody()
  assert.match(body, /IF NOT \(NEW\.state::text IN \('Resolved', 'Closed'\) AND OLD\.state::text NOT IN \('Resolved', 'Closed'\)\) THEN\s*\n\s*RETURN NEW;/)
})

test('só gera rascunho quando kb_candidate=true', () => {
  const body = fnBody()
  assert.match(body, /IF NOT COALESCE\(NEW\.kb_candidate, false\) THEN\s*\n\s*RETURN NEW;/)
})

test('dedupe: não gera um segundo rascunho para o mesmo ticket (reabertura + nova resolução)', () => {
  const body = fnBody()
  assert.match(body, /IF EXISTS \(SELECT 1 FROM public\.knowledge_articles WHERE source_ticket_id = NEW\.id\) THEN\s*\n\s*RETURN NEW;/)
})

test('blindagem multitenant: company_id do artigo vem explicitamente de NEW.company_id (função SECURITY DEFINER bypassa RLS)', () => {
  const body = fnBody()
  assert.match(body, /INSERT INTO public\.knowledge_articles \(\s*company_id, title, slug, summary, body, status, visibility, author_id, source_ticket_id\s*\) VALUES \(\s*NEW\.company_id,/)
})

test('rascunho nasce status=draft e visibility=internal (nunca público sem curadoria de admin)', () => {
  const body = fnBody()
  assert.match(body, /'draft',\s*\n\s*'internal',/)
})

test('slug combina o título normalizado com o número do ticket (unicidade determinística, sem retry-on-conflict)', () => {
  const body = fnBody()
  assert.match(body, /v_slug := v_base_slug \|\| '-' \|\| lower\(NEW\.number\)/)
})

test('corpo do artigo estrutura Problema e Solução Aplicada combinando description e resolution_notes/resolution_code', () => {
  const body = fnBody()
  assert.match(body, /'## Problema'/)
  assert.match(body, /'## Solução Aplicada \(' \|\| COALESCE\(NEW\.resolution_code, 'Não especificado'\) \|\| '\)'/)
  assert.match(body, /COALESCE\(NEW\.resolution_notes, ''\)/)
})

test('trigger dispara AFTER UPDATE OF state com WHEN replicando a condição de primeira-transição (defesa em profundidade)', () => {
  assert.match(sql, /CREATE TRIGGER trg_generate_kb_draft_on_resolution\s+AFTER UPDATE OF state ON public\.tickets/)
  assert.match(sql, /WHEN \(NEW\.state::text IN \('Resolved', 'Closed'\) AND OLD\.state::text NOT IN \('Resolved', 'Closed'\)\)/)
})

test('função revogada de anon/authenticated — só disparada pelo trigger, nunca chamável diretamente', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.tg_generate_kb_draft_on_resolution\(\) FROM public, anon, authenticated/)
})

test('Contrato de automação de KEDB participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /knowledge-automation-contract\.test\.mjs/)
})
