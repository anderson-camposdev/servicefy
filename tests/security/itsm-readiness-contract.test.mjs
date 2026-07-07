import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260707040000_089_allied_it_itsm_readiness.sql')
const service = read('src/lib/virtual-agent-service.ts')
const admin = read('src/pages/VirtualAgentAdmin.tsx')
const center = read('src/pages/SettingsCenter.tsx')
const operational = read('src/pages/PlatformModuleSettings.tsx')
const packageJson = read('package.json')

test('baseline Allied IT cobre filas, catálogos, SLA, pausa, aprovação e agente', () => {
  assert.match(sql, /Service Desk N1/)
  assert.match(sql, /Infraestrutura e Redes/)
  assert.match(sql, /Acessos e Identidades/)
  assert.match(sql, /INSERT INTO public\.catalog_service_symptoms/)
  assert.match(sql, /INSERT INTO public\.request_items/)
  assert.match(sql, /INSERT INTO public\.sla_policies/)
  assert.match(sql, /INSERT INTO public\.pending_reasons/)
  assert.match(sql, /requires_approval, approval_group_id, approval_mode/)
  assert.match(sql, /action_key IN \('check_tickets','handoff_to_human','triage_open'\)/)
  assert.doesNotMatch(sql, /DELETE FROM public\.(incidents|catalog_|request_|assignment_groups)/)
})

test('prioridade textual acompanha a matriz impacto por urgência', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sync_ticket_priority_label/)
  for (const priority of ['P1 - Critical', 'P2 - High', 'P3 - Moderate', 'P4 - Low', 'P5 - Planning']) {
    assert.match(sql, new RegExp(priority.replaceAll(' ', '\\s')))
  }
  assert.match(sql, /BEFORE INSERT OR UPDATE OF impact, urgency, priority_level, symptom_id, request_item_id/)
})

test('diagnóstico de prontidão é administrativo e não é exposto a anon', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.itsm_service_desk_readiness\(p_company_id uuid\)/)
  assert.match(sql, /IF NOT public\.is_settings_admin\(p_company_id\) THEN/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.itsm_service_desk_readiness\(uuid\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.itsm_service_desk_readiness\(uuid\) TO authenticated/)
})

test('console administrativo exibe prontidão antes de testar a conversa', () => {
  assert.match(service, /getReadiness/)
  assert.match(service, /itsm_service_desk_readiness/)
  assert.match(admin, /Prontidão do Service Desk/)
  assert.match(admin, /Configuração apta para abrir e consultar chamados/)
})

test('módulos licenciados da Central abrem telas operacionais em vez de placeholder', () => {
  for (const key of ['domains', 'macros', 'templates', 'ci', 'compliance', 'licensing']) {
    assert.match(center, new RegExp(`'${key}'`))
    assert.match(operational, new RegExp(`${key}:|moduleKey === '${key}'`))
  }
  assert.match(center, /<PlatformModuleSettings/)
  assert.match(operational, /service_domains/)
  assert.match(operational, /response_macros/)
  assert.match(operational, /notification_templates/)
  assert.match(operational, /configuration_items/)
  assert.match(operational, /attachment_policies/)
  assert.match(operational, /company_module_entitlements/)
})

test('contrato participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/itsm-readiness-contract\.test\.mjs/)
})
