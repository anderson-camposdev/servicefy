import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260712180000_110_fix_tickets_triggers_recursion.sql')

const fnBody = name => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('\n$$;')[0]
}

test('sync_incident_to_case usa uma flag de reentrância por transação, não pg_trigger_depth()', () => {
  const body = fnBody('sync_incident_to_case()')
  assert.match(body, /current_setting\('servicefy\.sync_incident_to_case_active', true\) = 'on'/)
  assert.match(body, /set_config\('servicefy\.sync_incident_to_case_active', 'on', true\)/)
  assert.match(body, /set_config\('servicefy\.sync_incident_to_case_active', 'off', true\)/)
  // pg_trigger_depth() foi tentado e descartado (o nível varia entre INSERT
  // via view — profundidade 2 — e INSERT direto em tickets — profundidade 1;
  // um limiar fixo silenciava a sincronização de caso por completo).
  assert.doesNotMatch(body, /pg_trigger_depth/)
})

test('sync_incident_to_case grava case_id direto em tickets, não via a view incidents', () => {
  const body = fnBody('sync_incident_to_case()')
  assert.match(body, /UPDATE public\.tickets SET case_id = v_case_id WHERE id = NEW\.id AND case_id IS NULL/)
  assert.doesNotMatch(body, /UPDATE public\.incidents SET case_id/)
})

test('tg_incidents_view_update encaminha case_id para o UPDATE em tickets (a causa raiz da recursão)', () => {
  const body = fnBody('tg_incidents_view_update()')
  assert.match(body, /case_id = NEW\.case_id/)
})

test('prioridade por impact/urgency e approval_status de requisição são calculados nas funções da view, não em triggers de tickets', () => {
  const insertBody = fnBody('tg_incidents_view_insert()')
  const updateBody = fnBody('tg_incidents_view_update()')
  assert.match(insertBody, /calculate_incident_priority\(NEW\.impact, NEW\.urgency\)/)
  assert.match(updateBody, /calculate_incident_priority\(NEW\.impact, NEW\.urgency\)/)
  assert.match(insertBody, /v_approval_status := 'pending'/)
})

test('triggers quebradas por referenciar colunas movidas para as tabelas polimórficas foram removidas de tickets', () => {
  assert.match(sql, /DROP TRIGGER IF EXISTS set_incident_priority_trigger ON public\.tickets/)
  assert.match(sql, /DROP TRIGGER IF EXISTS tg_prepare_request_approval ON public\.tickets/)
  assert.match(sql, /DROP TRIGGER IF EXISTS tg_create_request_approvals ON public\.tickets/)
})

test('tg_create_request_approvals foi retargetada para service_request_attributes, onde request_item_id é coluna nativa', () => {
  assert.match(sql, /CREATE TRIGGER tg_create_request_approvals\s+AFTER INSERT ON public\.service_request_attributes/)
  const body = fnBody('tg_create_request_approvals()')
  assert.match(body, /SELECT \* INTO v_ticket FROM public\.tickets WHERE id = NEW\.ticket_id/)
  // request_item_id agora é lido nativamente de NEW (a linha de
  // service_request_attributes que disparou a trigger), não mais buscado num
  // tickets.NEW inexistente.
  assert.match(body, /WHERE id = NEW\.request_item_id/)
  assert.match(body, /NEW\.company_id/)
})

test('tg_handle_sla_pause resolve request_item_id via subquery em vez de NEW.request_item_id inexistente', () => {
  const body = fnBody('tg_handle_sla_pause()')
  assert.match(body, /SELECT request_item_id INTO v_request_item_id\s+FROM public\.service_request_attributes\s+WHERE ticket_id = NEW\.id/)
  assert.doesNotMatch(body, /NEW\.request_item_id/)
})

test('Contrato de saneamento de triggers participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /tickets-triggers-recursion-contract\.test\.mjs/)
})
