import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20260718000700_138_knowledge_catalog_relations.sql')
const service = read('src/lib/knowledge-service.ts')
const editor = read('src/pages/KnowledgeAdmin.tsx')
const authoring = read('src/lib/knowledge-authoring.ts')
const generated = read('src/lib/database.generated.ts')
const packageJson = read('package.json')

const fnBody = name => {
  const parts = migration.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts.at(-1).split('$$;')[0]
}

test('relações da KB usam FKs reais para os quatro objetos operacionais', () => {
  assert.match(migration, /CREATE TABLE public\.knowledge_article_relations/)
  assert.match(migration, /incident_catalog_symptom_id uuid REFERENCES public\.incident_catalog_symptoms\(id\) ON DELETE CASCADE/)
  assert.match(migration, /request_catalog_subitem_id uuid REFERENCES public\.request_catalog_subitems\(id\) ON DELETE CASCADE/)
  assert.match(migration, /problem_id uuid REFERENCES public\.problems\(id\) ON DELETE CASCADE/)
  assert.match(migration, /change_id uuid REFERENCES public\.changes\(id\) ON DELETE CASCADE/)
  assert.match(migration, /num_nonnulls\([\s\S]*incident_catalog_symptom_id[\s\S]*request_catalog_subitem_id[\s\S]*problem_id[\s\S]*change_id[\s\S]*\) = 1/)
  assert.match(migration, /UNIQUE \(article_id, target_type, target_id\)/)
})

test('leitura respeita can_read_knowledge_article e escrita direta é bloqueada', () => {
  assert.match(migration, /ALTER TABLE public\.knowledge_article_relations ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /CREATE POLICY kb_relations_read[\s\S]*public\.can_read_knowledge_article\(article_id\)/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.knowledge_article_relations FROM authenticated/)
  assert.match(migration, /GRANT SELECT ON public\.knowledge_article_relations TO authenticated/)
})

test('RPC substitui vínculos de forma transacional, limitada, auditada e isolada por tenant', () => {
  const body = fnBody('kb_replace_article_relations')
  assert.match(body, /SECURITY DEFINER/)
  assert.match(body, /SET search_path = public/)
  assert.match(body, /jsonb_typeof\(p_relations\) <> 'array'/)
  assert.match(body, /jsonb_array_length\(p_relations\) > 50/)
  assert.match(body, /public\.is_kb_reviewer\(p_company_id\)/)
  assert.match(body, /author_id = public\.get_current_profile_id\(\)/)
  for (const table of ['incident_catalog_symptoms', 'request_catalog_subitems', 'problems', 'changes']) {
    assert.match(body, new RegExp(`FROM public\\.${table}[\\s\\S]*company_id = p_company_id`), `${table} deve validar tenant`)
  }
  assert.match(body, /DELETE FROM public\.knowledge_article_relations/)
  assert.match(body, /INSERT INTO public\.knowledge_article_relations/)
  assert.match(body, /public\.write_kb_audit_event/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.kb_replace_article_relations\(uuid, uuid, jsonb\) FROM public, anon/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.kb_replace_article_relations\(uuid, uuid, jsonb\) TO authenticated/)
})

test('serviço tipado carrega opções e persiste vínculos pela RPC', () => {
  assert.doesNotMatch(service, /:\s*any\b|as any\b/)
  assert.match(service, /listRelationOptions/)
  assert.match(service, /\.from\('incident_catalog_items'\)[\s\S]*incident_catalog_subitems[\s\S]*incident_catalog_symptoms/)
  assert.match(service, /\.from\('request_catalog_items'\)[\s\S]*request_catalog_subitems/)
  assert.match(service, /\.from\('problems'\)/)
  assert.match(service, /\.from\('changes'\)/)
  assert.match(service, /listRelations/)
  assert.match(service, /replaceRelations/)
  assert.match(service, /rpc\('kb_replace_article_relations'/)
  assert.match(generated, /knowledge_article_relations: \{/)
  assert.match(generated, /kb_replace_article_relations: \{/)
})

test('editor oferece autoria guiada, qualidade e vínculos operacionais pesquisáveis', () => {
  for (const label of ['Procedimento', 'Diagnóstico', 'Erro conhecido', 'FAQ', 'Política', 'Runbook']) {
    assert.match(authoring, new RegExp(label))
  }
  assert.match(authoring, /calculateKnowledgeQuality/)
  assert.match(editor, /Vínculos operacionais/)
  assert.match(editor, /Qualidade para publicação/)
  assert.match(editor, /Incidentes/)
  assert.match(editor, /Solicitações/)
  assert.match(editor, /Problemas/)
  assert.match(editor, /Mudanças/)
  assert.match(editor, /Buscar no catálogo/)
  assert.match(editor, /knowledgeService\.replaceRelations/)
})

test('novo contrato participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/knowledge-catalog-relations-contract\.test\.mjs/)
})
