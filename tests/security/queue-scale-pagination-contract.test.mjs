import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const services    = read('src/lib/services.ts')
const hook        = read('src/hooks/useIncidents.ts')
const mig175      = read('supabase/migrations/20260726000000_175_rls_tickets_initplan.sql')
const mig176      = read('supabase/migrations/20260726000100_176_fix_msp_admin_privilege_escalation.sql')
const mig177      = read('supabase/migrations/20260726000200_177_queue_server_side_ordering.sql')
const mig178      = read('supabase/migrations/20260726000300_178_ticket_queue_kpis_rpc.sql')

// Teste de carga de 2026-07-26 com 50.000 chamados (scripts/scale-bench.sql).
// O PostgREST corta respostas em 1.000 linhas devolvendo HTTP 200: sem limite
// explícito o app recebia um recorte arbitrário achando que tinha a fila
// inteira. Um chamado crítico fora do corte ficava invisível, e os cards de
// KPI — contados no cliente — mostravam 1.000 com 50.010 na base.
// A verificação viva roda em tests/integration/run-scale-regression.mjs; estes
// contratos travam as decisões estruturais que sustentam a correção.

test('a fila NUNCA consulta sem limite — o teto silencioso de 1.000 do PostgREST depende disso', () => {
  assert.match(services, /export const DEFAULT_TICKET_PAGE_SIZE\s*=\s*\d+/)
  const list = services.split('async list(filters: IncidentFilters)')[1].split('async ')[0]
  // O limite é aplicado incondicionalmente, não só quando o chamador informa.
  assert.match(list, /filters\.limit \?\? DEFAULT_TICKET_PAGE_SIZE/)
  assert.match(list, /q\.range\(offset, offset \+ limit - 1\)/)
  assert.doesNotMatch(list, /if \(filters\.limit\)\s+q = q\.limit/)
})

test('a ordenação por urgência acontece no SERVIDOR — ordenar por updated_at escondia o chamado crítico esquecido', () => {
  const list = services.split('async list(filters: IncidentFilters)')[1].split('async ')[0]
  assert.match(list, /\.order\('queue_rank'/)
  assert.match(list, /\.order\('queue_deadline'[^)]*nullsFirst: false/)
})

test('KPIs vêm de agregação no banco, não de contagem sobre as linhas baixadas', () => {
  assert.match(services, /async getQueueKpis\(/)
  assert.match(services, /rpc\('get_ticket_queue_kpis'/)
  // O hook não pode voltar a resumir a página para a fila do analista.
  const fetchData = hook.split('const fetchData')[1].split('// Trocar de filtro')[0]
  assert.match(fetchData, /callerId\s*\?\s*summarizeIncidents\(rows\)/)
  assert.match(fetchData, /getQueueKpis\(/)
})

test('o hook pagina no servidor e reinicia a página ao trocar de filtro', () => {
  assert.match(hook, /limit: pageSize/)
  assert.match(hook, /offset: page \* pageSize/)
  assert.match(hook, /useEffect\(\(\) => \{\s*setPage\(0\)/)
})

test('migration 175: helpers de sessão viram InitPlan em vez de rodar por linha', () => {
  assert.match(mig175, /company_id = \(SELECT public\.get_current_user_company_id\(\)\)/)
  assert.match(mig175, /\(SELECT public\.is_current_user_msp_admin\(\)\)/)
  assert.match(mig175, /\(SELECT public\.get_current_profile_id\(\)\)/)
  // Chamada nua (sem SELECT em volta) é justamente o que causava o custo por linha.
  assert.doesNotMatch(mig175, /USING \(\s*can_read_ticket_row\(/)
})

test('migration 176: privilégio de MSP exige papel operacional — pertencer ao provedor não basta', () => {
  assert.match(mig176, /CREATE OR REPLACE FUNCTION public\.is_current_user_msp_admin/)
  assert.match(mig176, /IN \('company_admin', 'agent', 'ops_manager', 'governance_manager'\)/)
  // end_user do tenant provedor lia chamados de todos os clientes.
  assert.doesNotMatch(mig176, /RETURN COALESCE\(v_is_provider, false\) OR COALESCE\(v_role, ''\) = 'sysadmin';/)
  assert.match(mig176, /p\.active = true/)
})

test('migration 177: colunas de ordenação são geradas (imutáveis) e indexadas', () => {
  assert.match(mig177, /queue_deadline timestamptz\s*\n\s*GENERATED ALWAYS AS/)
  assert.match(mig177, /queue_rank smallint\s*\n\s*GENERATED ALWAYS AS/)
  assert.match(mig177, /STORED/)
  assert.match(mig177, /CREATE INDEX IF NOT EXISTS idx_tickets_queue_order/)
  // A view é estendida com CREATE OR REPLACE (colunas ao final) para não
  // recriar os triggers INSTEAD OF — classe de regressão do commit b3b3a595.
  assert.match(mig177, /CREATE OR REPLACE VIEW public\.incidents/)
  assert.doesNotMatch(mig177, /DROP VIEW/)
})

test('migration 178: RPC de KPIs roda sob RLS do chamador (sem virar caminho paralelo de vazamento)', () => {
  assert.match(mig178, /CREATE OR REPLACE FUNCTION public\.get_ticket_queue_kpis/)
  assert.doesNotMatch(mig178, /SECURITY DEFINER/)
  assert.match(mig178, /GRANT EXECUTE ON FUNCTION public\.get_ticket_queue_kpis/)
})

test('migration 178: cobre TODAS as métricas do painel — card sem contagem do servidor volta a mostrar o tamanho da página', () => {
  for (const chave of ['total','critical','inProgress','slaBreached','unassigned','slaToExpire','myQueue','myGroupsQueue','resolvedToday']) {
    assert.match(mig178, new RegExp(`'${chave}'`), `métrica ausente na RPC: ${chave}`)
  }
})

test('migration 179: cron de SLA processa em lote — sem teto, um pico congelava a detecção', () => {
  const mig179 = read('supabase/migrations/20260726000400_179_sla_cron_batch_limit.sql')
  assert.match(mig179, /c_batch constant int := \d+/)
  // Dois laços (resposta e resolução) e ambos precisam do teto.
  assert.equal((mig179.match(/LIMIT c_batch/g) ?? []).length, 2)
  // Mais antigos primeiro: quem estourou há mais tempo é notificado antes.
  assert.match(mig179, /ORDER BY t\.sla_response_deadline\s*\n\s*LIMIT c_batch/)
  assert.match(mig179, /ORDER BY t\.sla_resolution_deadline\s*\n\s*LIMIT c_batch/)
  // O lock da 171 continua: lote sem lock traria de volta a duplicidade.
  assert.match(mig179, /pg_try_advisory_xact_lock\(87201001\)/)
  // Índices parciais que sustentam ORDER BY + LIMIT sem varrer a tabela.
  assert.match(mig179, /idx_tickets_sla_response_pending/)
  assert.match(mig179, /idx_tickets_sla_resolution_pending/)
})

test('Contrato de paginação e escala da fila participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/queue-scale-pagination-contract\.test\.mjs/)
})
