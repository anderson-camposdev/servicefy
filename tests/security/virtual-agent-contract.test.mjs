import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260707000000_085_virtual_agent_transactional.sql')
const service = read('src/lib/virtual-agent-service.ts')
const center = read('src/pages/SettingsCenter.tsx')
const admin = read('src/pages/VirtualAgentAdmin.tsx')
const widget = read('src/components/VirtualAgentWidget.tsx')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('As 4 tabelas legadas de chatbot passam a ter RLS + policy admin-only', () => {
  for (const t of ['chatbot_whitelist', 'chatbot_messages', 'chatbot_config']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
    assert.match(sql, new RegExp(`CREATE POLICY ${t}_admin ON public\\.${t} FOR ALL TO authenticated\\s+USING \\(public\\.is_settings_admin\\(company_id\\)\\)`))
  }
  // chatbot_blocked_attempts não tem company_id -> sysadmin-only
  assert.match(sql, /ALTER TABLE public\.chatbot_blocked_attempts ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /CREATE POLICY chatbot_blocked_sysadmin ON public\.chatbot_blocked_attempts FOR ALL TO authenticated\s+USING \(public\.get_current_user_role\(\) = 'sysadmin'\)/)
})

test('result_status ganha o valor "pending" para representar aguardando confirmação', () => {
  assert.match(sql, /DROP CONSTRAINT virtual_agent_executions_result_status_check/)
  assert.match(sql, /CHECK \(result_status IN \('success','failed','transferred','blocked','pending'\)\)/)
})

test('Usuário final só lê ações habilitadas do próprio tenant; execuções só as próprias', () => {
  assert.match(sql, /CREATE POLICY virtual_agent_actions_tenant_read ON public\.virtual_agent_actions FOR SELECT TO authenticated/)
  const actionsPolicy = sql.split('CREATE POLICY virtual_agent_actions_tenant_read')[1].split(';')[0]
  assert.match(actionsPolicy, /enabled = true/)
  assert.match(actionsPolicy, /company_id = public\.get_current_user_company_id\(\) OR public\.is_current_user_msp_admin\(\)/)

  assert.match(sql, /CREATE POLICY virtual_agent_executions_owner_read ON public\.virtual_agent_executions FOR SELECT TO authenticated/)
  const execPolicy = sql.split('CREATE POLICY virtual_agent_executions_owner_read')[1].split(';')[0]
  assert.match(execPolicy, /ei\.profile_id = public\.get_current_profile_id\(\)/)
})

test('Seed do assistente é idempotente por tenant (ON CONFLICT DO NOTHING)', () => {
  const ensure = fnBody('ensure_virtual_agent_connection')
  assert.match(ensure, /ON CONFLICT \(company_id, service_domain_id, action_key\) DO NOTHING/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.ensure_virtual_agent_connection\(uuid\) FROM public, anon, authenticated/)
  assert.match(sql, /FOR v_company IN SELECT id FROM public\.companies LOOP/)
})

test('Entitlement do módulo é liberado para tenants existentes', () => {
  assert.match(sql, /UPDATE public\.company_module_entitlements\s+SET enabled = true, updated_at = now\(\)\s+WHERE module_key = 'virtual_agent' AND enabled = false/)
})

test('Helper de execução de ação real nunca é exposto diretamente ao cliente', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.virtual_agent_run_action\(text, uuid, uuid, text, text\) FROM public, anon, authenticated/)
})

test('process_message resolve tenant/perfil do JWT (nunca confia em identidade vinda do browser)', () => {
  const body = fnBody('virtual_agent_process_message')
  assert.match(body, /v_company_id\s+uuid := public\.get_current_user_company_id\(\)/)
  assert.match(body, /v_profile_id\s+uuid := public\.get_current_profile_id\(\)/)
  assert.match(body, /IF v_company_id IS NULL OR v_profile_id IS NULL THEN\s+RAISE EXCEPTION/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.virtual_agent_process_message\(text, uuid\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.virtual_agent_process_message\(text, uuid\) TO authenticated/)
})

test('confirm_action valida que o chamador é dono da execução e bloqueia dupla resposta', () => {
  const body = fnBody('virtual_agent_confirm_action')
  assert.match(body, /v_row\.owner_profile_id IS DISTINCT FROM v_profile_id/)
  assert.match(body, /RAISE EXCEPTION 'Acesso negado a esta execução'/)
  assert.match(body, /v_row\.confirmation_status <> 'pending'/)
  assert.match(body, /RAISE EXCEPTION 'Esta ação já foi respondida'/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.virtual_agent_confirm_action\(uuid, boolean\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.virtual_agent_confirm_action\(uuid, boolean\) TO authenticated/)
})

test('handoff_to_human sempre qualifica como fallback (min_confidence = 0.000)', () => {
  assert.match(sql, /'handoff_to_human', 'Transferir para atendente humano', true, false, 0\.000/)
})

test('Serviço tipado sem any e UI conectada à seção virtual_agent', () => {
  assert.doesNotMatch(service, /:\s*any\b/)
  for (const m of ['listActions', 'saveAction', 'deleteAction', 'listExecutions', 'processMessage', 'confirmAction']) {
    assert.match(service, new RegExp(m))
  }
  assert.match(center, /selected\?\.key === 'virtual_agent'/)
  assert.match(center, /<VirtualAgentAdmin/)
  assert.match(admin, /virtualAgentService\.processMessage/)
  assert.match(admin, /virtualAgentService\.confirmAction/)
  assert.doesNotMatch(admin, /:\s*any\b/)
  assert.match(widget, /virtualAgentService\.processMessage/)
  assert.doesNotMatch(widget, /:\s*any\b/)
})
