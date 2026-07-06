import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260705203012_082_knowledge_completion.sql')
const service = read('src/lib/knowledge-service.ts')
const markdown = read('src/lib/markdown.ts')
const center = read('src/pages/SettingsCenter.tsx')
const portal = read('src/pages/UserPortalLayout.tsx')
const cockpit = read('src/pages/AnalystCockpit.tsx')
const packageJson = read('package.json')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('Leitura de artigo é centralizada e respeita status, visibilidade e tenant', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_read_knowledge_article/)
  const body = fnBody('can_read_knowledge_article')
  // Isolamento de tenant obrigatório
  assert.match(body, /a\.company_id = public\.get_current_user_company_id\(\) OR public\.is_current_user_msp_admin\(\)/)
  // Publicados por visibilidade
  assert.match(body, /status = 'published' AND a\.visibility IN \('public','tenant'\)/)
  // Interno bloqueado para end_user
  assert.match(body, /visibility = 'internal'[\s\S]*get_current_user_role\(\) <> 'end_user'/)
  // A política de SELECT usa o helper
  assert.match(sql, /CREATE POLICY knowledge_tenant_read ON public\.knowledge_articles FOR SELECT TO authenticated\s*\n?\s*USING \(public\.can_read_knowledge_article\(id\)\)/)
})

test('Artigo restrito exige concessão explícita a perfil ou grupo', () => {
  const body = fnBody('can_read_knowledge_article')
  assert.match(body, /visibility = 'restricted'/)
  assert.match(body, /knowledge_article_grants g/)
  assert.match(body, /subject_type = 'profile' AND g\.subject_id = public\.get_current_profile_id\(\)/)
  assert.match(body, /subject_type = 'group'[\s\S]*user_groups ug[\s\S]*ug\.user_id = public\.get_current_profile_id\(\)/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.knowledge_article_grants/)
})

test('Feedback só é aceito para artigo acessível e com identidade do servidor', () => {
  assert.match(sql, /CREATE POLICY knowledge_feedback_tenant ON public\.knowledge_article_feedback FOR INSERT/)
  const policy = sql.split('CREATE POLICY knowledge_feedback_tenant')[1].split(';')[0]
  assert.match(policy, /profile_id = public\.get_current_profile_id\(\)/)
  assert.match(policy, /public\.can_read_knowledge_article\(article_id\)/)
})

test('RPCs de escrita exigem admin do tenant e auditam a ação', () => {
  for (const fn of ['kb_set_article_status', 'kb_duplicate_article']) {
    const body = fnBody(fn)
    assert.match(body, /public\.is_settings_admin\(p_company_id\)/, `${fn} deve exigir admin`)
    assert.match(body, /public\.write_admin_audit/, `${fn} deve auditar`)
  }
})

test('Todas as RPCs de KB são revogadas de anon/public e concedidas a authenticated', () => {
  for (const fn of [
    'kb_search_articles', 'kb_set_article_status', 'kb_duplicate_article',
    'kb_suggest_for_case', 'kb_register_article_usage', 'kb_touch_article',
    'can_read_knowledge_article',
  ]) {
    assert.match(sql, new RegExp('REVOKE ALL ON FUNCTION public\\.' + fn + '\\([^)]*\\) FROM public, anon'), `${fn} deve revogar anon`)
    assert.match(sql, new RegExp('GRANT EXECUTE ON FUNCTION public\\.' + fn + '\\([^)]*\\) TO authenticated'), `${fn} deve conceder authenticated`)
  }
})

test('Busca respeita a RLS do chamador (SECURITY INVOKER) e o cockpit valida o caso', () => {
  assert.match(sql, /FUNCTION public\.kb_search_articles[\s\S]*?SECURITY INVOKER/)
  assert.match(sql, /FUNCTION public\.kb_suggest_for_case[\s\S]*?SECURITY INVOKER/)
  const suggest = fnBody('kb_suggest_for_case')
  assert.match(suggest, /NOT public\.can_read_case\(p_case_id\)/)
  const usage = fnBody('kb_register_article_usage')
  assert.match(usage, /NOT public\.can_read_case\(p_case_id\) OR NOT public\.can_read_knowledge_article\(p_article_id\)/)
})

test('Versionamento é imutável para o cliente e escrito só pelo trigger', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.knowledge_article_versions/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.knowledge_article_versions FROM authenticated/)
  assert.match(sql, /CREATE TRIGGER trg_knowledge_article_version\s+BEFORE UPDATE ON public\.knowledge_articles/)
})

test('Renderizador Markdown é seguro por construção (escapa HTML, bloqueia javascript:)', () => {
  assert.match(markdown, /function escapeHtml/)
  assert.match(markdown, /replace\(\/&\/g, '&amp;'\)/)
  // Allowlist de esquemas seguros e rejeição do restante (return null).
  const safeHref = markdown.split('function safeHref')[1].split('}')[0]
  assert.match(safeHref, /\/\^\(https\?:\|mailto:\)\/i\.test/)
  assert.match(safeHref, /return null/)
})

test('Serviço não usa any e chama as RPCs tipadas', () => {
  assert.doesNotMatch(service, /:\s*any\b/)
  assert.doesNotMatch(service, /as any\b/)
  for (const rpc of ['kb_search_articles', 'kb_set_article_status', 'kb_duplicate_article', 'kb_suggest_for_case', 'kb_register_article_usage', 'kb_touch_article']) {
    assert.match(service, new RegExp("rpc\\('" + rpc + "'"))
  }
})

test('UI foi conectada em admin, portal e cockpit (sem placeholders)', () => {
  assert.match(center, /selected\?\.key === 'knowledge'/)
  assert.match(center, /<KnowledgeAdmin/)
  assert.match(portal, /setScreen\('knowledge'\)/)
  assert.match(portal, /<KnowledgePortal/)
  assert.match(cockpit, /setKbOpen\(true\)/)
  assert.match(cockpit, /<KnowledgeCockpitPanel/)
  // O botão do cockpit não é mais um no-op vazio
  assert.doesNotMatch(cockpit, /onClick=\{\(\) => \{\}\}[\s\S]{0,120}Base de Conhecimento/)
})
test('Feedback pode retornar a própria linha sem expor respostas de terceiros', () => {
  assert.match(sql, /CREATE POLICY knowledge_feedback_self_read/)
  assert.match(sql, /profile_id = public.get_current_profile_id()/)
})

test('Guards impedem referências cross-tenant e carimbam autoria no servidor', () => {
  assert.match(sql, /CREATE TRIGGER trg_kb_article_guard/)
  assert.match(sql, /Categoria de outro tenant/)
  assert.match(sql, /CREATE TRIGGER trg_kb_grant_guard/)
  assert.match(sql, /Perfil de outro tenant/)
  assert.match(sql, /Grupo de outro tenant/)
  assert.match(sql, /CREATE TRIGGER trg_kb_case_link_guard/)
  assert.match(sql, /Caso e artigo devem pertencer ao mesmo tenant/)
  assert.ok(sql.includes('NEW.author_id := COALESCE(NEW.author_id, public.get_current_profile_id())'))
  assert.ok(sql.includes('NEW.granted_by := public.get_current_profile_id()'))
})

test('CRUD administrativo da KB é auditado sem armazenar o corpo do artigo', () => {
  assert.match(sql, /CREATE TRIGGER trg_kb_article_audit/)
  assert.match(sql, /CREATE TRIGGER trg_kb_category_audit/)
  assert.match(sql, /CREATE TRIGGER trg_kb_grant_audit/)
  assert.match(sql, /public.write_admin_audit/)
  assert.ok(sql.includes("to_jsonb(OLD) - ARRAY['body','search_vector']"))
})

test('Contrato da KB participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/knowledge-contract\.test\.mjs/)
})
