import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
// Concatenados na ordem de aplicação: 082 define a base; 131 expande o
// enum; 132/133 reescrevem helpers/RPCs/triggers via CREATE OR REPLACE.
// fnBody() sempre pega a ÚLTIMA ocorrência de cada função, então a versão
// vigente (132/133) vence sobre a original (082).
const sql = [
  '20260705203012_082_knowledge_completion.sql',
  '20260718000000_131_kb_role_enum_expansion.sql',
  '20260718000100_132_kb_role_governance.sql',
  '20260718000200_133_kb_workflow_state_machine.sql',
].map(f => read('supabase/migrations/' + f)).join('\n')
const service = read('src/lib/knowledge-service.ts')
const markdown = read('src/lib/markdown.ts')
const kbAccess = read('src/lib/kb-access.ts')
const center = read('src/pages/SettingsCenter.tsx')
const knowledgeCenter = read('src/pages/KnowledgeCenter.tsx')
const admin = read('src/pages/KnowledgeAdmin.tsx')
const app = read('src/App.tsx')
const portal = read('src/pages/UserPortalLayout.tsx')
const portalQuickView = read('src/components/portal/KnowledgeQuickView.tsx')
const cockpit = read('src/pages/AnalystCockpit.tsx')
const packageJson = read('package.json')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  // Última ocorrência = definição vigente após todas as migrations aplicadas.
  return parts[parts.length - 1].split('$$;')[0]
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

test('Leitura de artigo abrange autoria própria e fila de revisão (agent/ops_manager/governance_manager)', () => {
  const body = fnBody('can_read_knowledge_article')
  assert.match(body, /a\.author_id = public\.get_current_profile_id\(\)/)
  assert.match(body, /status IN \('draft','review','archived'\) AND public\.is_kb_reviewer\(a\.company_id\)/)
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

test('Enum user_role foi expandido com ops_manager e governance_manager', () => {
  assert.match(sql, /ALTER TYPE public\.user_role ADD VALUE IF NOT EXISTS 'ops_manager'/)
  assert.match(sql, /ALTER TYPE public\.user_role ADD VALUE IF NOT EXISTS 'governance_manager'/)
})

test('Helpers de capacidade de KB existem, compõem sobre is_settings_admin e são revogados de anon', () => {
  for (const fn of ['is_kb_contributor', 'is_kb_reviewer', 'is_kb_governance']) {
    const body = fnBody(fn)
    assert.match(body, /public\.is_settings_admin\(p_company_id\)/, `${fn} deve compor sobre is_settings_admin`)
    assert.match(sql, new RegExp('REVOKE ALL ON FUNCTION public\\.' + fn + '\\(uuid\\) FROM public, anon'))
    assert.match(sql, new RegExp('GRANT EXECUTE ON FUNCTION public\\.' + fn + '\\(uuid\\) TO authenticated'))
  }
  assert.match(fnBody('is_kb_contributor'), /'agent', 'ops_manager', 'governance_manager'/)
  assert.match(fnBody('is_kb_reviewer'), /'ops_manager', 'governance_manager'/)
  assert.match(fnBody('is_kb_governance'), /role\(\) = 'governance_manager'/)
})

test('write_kb_audit_event não reexige is_settings_admin e é revogada até de authenticated', () => {
  const body = fnBody('write_kb_audit_event')
  assert.doesNotMatch(body, /is_settings_admin/)
  assert.match(body, /INSERT INTO public\.admin_audit_events/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.write_kb_audit_event\([^)]*\) FROM public, anon, authenticated/)
})

test('RPCs de escrita de KB usam checagem de capacidade (não mais is_settings_admin isolado) e auditam via write_kb_audit_event', () => {
  const setStatus = fnBody('kb_set_article_status')
  assert.match(setStatus, /public\.is_kb_reviewer\(p_company_id\)/)
  assert.match(setStatus, /public\.write_kb_audit_event/)
  // Regra dos quatro olhos: aprovar review->published exige revisor E não-autor.
  assert.match(setStatus, /v_is_reviewer AND NOT v_is_own/)
  // Reinstaurar arquivado é exclusivo de governança.
  assert.match(setStatus, /v_old_status = 'archived' AND p_status = 'draft'[\s\S]{0,20}v_allowed := v_is_governance/)

  const duplicate = fnBody('kb_duplicate_article')
  assert.match(duplicate, /public\.is_kb_contributor\(p_company_id\)/)
  assert.match(duplicate, /public\.write_kb_audit_event/)
  assert.match(duplicate, /public\.can_read_knowledge_article\(v_src\.id\)/)
})

test('tg_kb_article_guard trava mudança de status fora de kb_set_article_status', () => {
  const body = fnBody('tg_kb_article_guard')
  assert.match(body, /NEW\.status IS DISTINCT FROM OLD\.status/)
  assert.match(body, /servicefy\.kb_status_rpc/)
  assert.match(body, /Alteração de status deve usar kb_set_article_status\(\)/)
  // kb_set_article_status é quem seta a flag que autoriza a própria mudança.
  assert.match(fnBody('kb_set_article_status'), /set_config\('servicefy\.kb_status_rpc', 'true', true\)/)
})

test('RLS de escrita em knowledge_articles é granular por papel (não mais um único FOR ALL admin)', () => {
  // knowledge_admin_write (FOR ALL, criada na 079 — não concatenada aqui) é
  // derrubada pela 132; nenhuma migration concatenada volta a recriá-la.
  assert.match(sql, /DROP POLICY IF EXISTS knowledge_admin_write ON public\.knowledge_articles/)
  assert.doesNotMatch(sql, /CREATE POLICY knowledge_admin_write /)
  assert.match(sql, /CREATE POLICY knowledge_author_insert ON public\.knowledge_articles FOR INSERT TO authenticated\s*\n?\s*WITH CHECK \(public\.is_kb_contributor\(company_id\) AND status = 'draft'\)/)
  assert.match(sql, /CREATE POLICY knowledge_author_update ON public\.knowledge_articles FOR UPDATE/)
  const updatePolicy = sql.split('CREATE POLICY knowledge_author_update')[1].split(';')[0]
  assert.match(updatePolicy, /public\.is_kb_reviewer\(company_id\)/)
  assert.match(updatePolicy, /author_id = public\.get_current_profile_id\(\) AND status IN \('draft','review'\)/)
  assert.match(sql, /CREATE POLICY knowledge_admin_delete ON public\.knowledge_articles FOR DELETE TO authenticated\s*\n?\s*USING \(public\.is_settings_admin\(company_id\)\)/)
})

test('Concessões de acesso restrito passam a ser gerenciadas por governança (não mais admin-only)', () => {
  assert.match(sql, /CREATE POLICY kb_grants_governance_write ON public\.knowledge_article_grants FOR ALL TO authenticated\s*\n?\s*USING \(public\.is_kb_governance\(company_id\)\)/)
})

test('Versões ficam visíveis a quem pode ler o artigo vivo (não mais admin-only)', () => {
  assert.match(sql, /CREATE POLICY kb_versions_reader ON public\.knowledge_article_versions FOR SELECT TO authenticated\s*\n?\s*USING \(public\.can_read_knowledge_article\(article_id\)\)/)
})

test('Governança lê a trilha de auditoria da própria KB', () => {
  assert.match(sql, /CREATE POLICY audit_kb_governance_select ON public\.admin_audit_events FOR SELECT TO authenticated/)
  const policy = sql.split('CREATE POLICY audit_kb_governance_select')[1].split(';')[0]
  assert.match(policy, /public\.is_kb_governance\(company_id\)/)
  assert.match(policy, /resource_type IN/)
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

test('kb-access.ts define o mapa de capacidades de UI espelhando a máquina de estados', () => {
  assert.match(kbAccess, /export const KB_CAPABLE_ROLES/)
  assert.match(kbAccess, /'sysadmin'.*'company_admin'.*'agent'.*'ops_manager'.*'governance_manager'/s)
  assert.match(kbAccess, /export const kbCapabilitiesFor/)
  assert.match(kbAccess, /export const hasKbCapability/)
})

test('UI foi conectada em admin, Central de Conhecimento, portal e cockpit (sem placeholders)', () => {
  assert.match(center, /selected\?\.key === 'knowledge'/)
  assert.match(center, /<KnowledgeAdmin/)
  // Central de Conhecimento: entrada fora de Configurações para
  // agent/ops_manager/governance_manager, checagem real de capacidade.
  assert.match(knowledgeCenter, /isKbCapableRole/)
  assert.match(knowledgeCenter, /<KnowledgeAdmin/)
  assert.match(app, /KnowledgeCenter/)
  assert.match(app, /'knowledge_center'/)
  // KnowledgeAdmin não ignora mais a prop activeRole (bug original corrigido).
  assert.match(admin, /hasKbCapability\(activeRole/)
  assert.match(portal, /setScreen\('knowledge'\)/)
  // A tela 'knowledge' renderiza <KnowledgeQuickView>, um wrapper fino que por
  // sua vez renderiza <KnowledgePortal> (a UI de busca/leitura/feedback) — ver
  // src/components/portal/KnowledgeQuickView.tsx. Checamos a cadeia completa
  // em vez de exigir o JSX de KnowledgePortal diretamente em UserPortalLayout.
  assert.match(portal, /<KnowledgeQuickView/)
  assert.match(portalQuickView, /<KnowledgePortal/)
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

test('CRUD administrativo da KB é auditado (via write_kb_audit_event) sem armazenar o corpo do artigo', () => {
  assert.match(sql, /CREATE TRIGGER trg_kb_article_audit/)
  assert.match(sql, /CREATE TRIGGER trg_kb_category_audit/)
  assert.match(sql, /CREATE TRIGGER trg_kb_grant_audit/)
  const auditBody = fnBody('tg_kb_admin_audit')
  assert.match(auditBody, /public\.is_kb_contributor\(v_company\)/)
  assert.match(auditBody, /public\.write_kb_audit_event/)
  assert.ok(auditBody.includes("to_jsonb(OLD) - ARRAY['body','search_vector']"))
})

test('Contrato da KB participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/knowledge-contract\.test\.mjs/)
})
