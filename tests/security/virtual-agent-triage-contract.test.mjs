import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260707030000_088_virtual_agent_triage.sql')
const service = read('src/lib/virtual-agent-service.ts')
const chat = read('src/components/TriageChat.tsx')
const conductor = read('src/lib/triage-conductor.ts')
const packageJson = read('package.json')

const fnBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('triage_sync resolve tenant/perfil do JWT e valida posse da conversa', () => {
  const body = fnBody('virtual_agent_triage_sync')
  assert.match(body, /v_company_id\s+uuid := public\.get_current_user_company_id\(\)/)
  assert.match(body, /v_profile_id\s+uuid := public\.get_current_profile_id\(\)/)
  assert.match(body, /IF v_company_id IS NULL OR v_profile_id IS NULL THEN\s+RAISE EXCEPTION/)
  // conversa informada precisa pertencer ao chamador
  assert.match(body, /c\.id\s*=\s*p_conversation_id AND c\.requester_identity_id\s*=\s*v_identity_id/)
  assert.match(body, /RAISE EXCEPTION 'Conversa inexistente ou não pertence ao usuário'/)
  // estado do wizard vai para conversations.metadata->triage
  assert.match(body, /jsonb_set\(coalesce\(metadata, '\{\}'::jsonb\), '\{triage\}'/)
})

test('triage_complete valida dono da conversa E tenant do incidente', () => {
  const body = fnBody('virtual_agent_triage_complete')
  assert.match(body, /ei\.profile_id\s*=\s*v_profile_id/)
  assert.match(body, /RAISE EXCEPTION 'Conversa não pertence ao usuário'/)
  assert.match(body, /i\.id\s*=\s*p_incident_id AND i\.company_id\s*=\s*v_company_id/)
  assert.match(body, /RAISE EXCEPTION 'Chamado inválido para este tenant'/)
  // registra auditoria em virtual_agent_executions
  assert.match(body, /INSERT INTO public\.virtual_agent_executions/)
})

test('RPCs de triagem são revogadas de anon/public e concedidas a authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.virtual_agent_triage_sync\(uuid, jsonb, text, text\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.virtual_agent_triage_sync\(uuid, jsonb, text, text\) TO authenticated/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.virtual_agent_triage_complete\(uuid, uuid, jsonb\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.virtual_agent_triage_complete\(uuid, uuid, jsonb\) TO authenticated/)
})

test('Seed da ação triage_open é idempotente pelo índice único parcial (086)', () => {
  assert.match(sql, /ON CONFLICT \(company_id, action_key\) WHERE service_domain_id IS NULL DO NOTHING/)
  assert.match(sql, /FOR v_company IN SELECT id FROM public\.companies LOOP/)
})

test('Condutor é determinístico e não faz I/O (sem fetch/supabase/LLM)', () => {
  assert.doesNotMatch(conductor, /\bfetch\b|supabase|anthropic|openai|import .* from '\.\//)
  assert.doesNotMatch(conductor, /:\s*any\b/)
})

test('TriageChat cria pelos serviços governados e audita a conclusão', () => {
  assert.match(chat, /serviceCatalogService\.openRequest/)
  assert.match(chat, /serviceCatalogService\.openServiceRequest/)
  assert.match(chat, /virtualAgentService\.triageComplete/)
  assert.doesNotMatch(chat, /:\s*any\b/)
})

test('Serviço tipado expõe triageSync/triageComplete (sem any)', () => {
  assert.match(service, /triageSync/)
  assert.match(service, /triageComplete/)
  assert.doesNotMatch(service, /:\s*any\b/)
})

test('Contrato de triagem participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/virtual-agent-triage-contract\.test\.mjs/)
})
