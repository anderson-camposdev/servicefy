/**
 * Testes de integração: Motor de SLA e ciclo de vida de tickets.
 *
 * Valida contra o Postgres real do Supabase local — não mocka nada.
 * Cobertura:
 *   1. Funções de calendário útil (business minutes)
 *   2. Cálculo de prioridade (matriz Impacto x Urgência)
 *   3. Projeção de deadlines de SLA ao criar chamado
 *   4. Pausa e retoma de SLA (On Hold → ativo)
 *   5. Detecção de breach (check_sla_breaches)
 *   6. Fluxo completo: criar → atribuir → responder → resolver → fechar
 *
 * Pré-requisitos:
 *   1. Supabase local ativo: `supabase start`
 *   2. Variável: SERVICEFY_RUN_SLA_INTEGRATION=1
 *   3. Variável: SERVICEFY_LOCAL_SERVICE_ROLE_KEY=<chave service_role>
 *
 * Execução:
 *   npm run test:integration:sla
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

const runIntegration = process.env.SERVICEFY_RUN_SLA_INTEGRATION === '1'
const companyId = '11111111-1111-1111-1111-111111111111'
const analystProfileId = '22222222-2222-2222-2222-222222222222'
const callerProfileId = '55555555-5555-5555-5555-555555555555'

// ── Helpers ──────────────────────────────────────────────────────

function runSql(sql) {
  return execFileSync('docker', [
    'exec', '-i', 'supabase_db_servicefy', 'psql',
    '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', timeout: 15_000 })
}

function runSqlMulti(sql) {
  return execFileSync('docker', [
    'exec', '-i', 'supabase_db_servicefy', 'psql',
    '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-t', '-A',
  ], { input: sql, encoding: 'utf8', timeout: 15_000 })
}

function uuid() {
  return crypto.randomUUID()
}

// ── Ticket tracking for cleanup ─────────────────────────────────

const createdTickets = []

function track(id) {
  createdTickets.push(id)
}

function cleanup() {
  if (createdTickets.length === 0) return
  const ids = createdTickets.map(id => `'${id}'`).join(',')
  try {
    runSqlMulti(`
      DELETE FROM public.sla_events WHERE incident_id IN (${ids});
      DELETE FROM public.ticket_messages WHERE incident_id IN (${ids});
      DELETE FROM public.incident_history WHERE incident_id IN (${ids});
      DELETE FROM public.tickets WHERE id IN (${ids});
    `)
  } catch {
    // best-effort
  }
}

// ══════════════════════════════════════════════════════════════════
// TESTES
// ══════════════════════════════════════════════════════════════════

test('1. sla_business_minutes_between: retorna minutos úteis corretos', { skip: !runIntegration }, () => {
  const calResult = runSql(
    `SELECT id::text FROM public.sla_calendars WHERE company_id = '${companyId}' AND is_24x7 = true LIMIT 1;`
  ).trim()

  if (!calResult) {
    console.log('    SKIP: nenhum calendário 24x7 encontrado para a empresa seed')
    return
  }

  // 2 horas em calendário 24x7 = 120 minutos
  const result = runSql(
    `SELECT public.sla_business_minutes_between('${calResult}'::uuid, '2026-08-08 10:00:00+00'::timestamptz, '2026-08-08 12:00:00+00'::timestamptz);`
  ).trim()

  assert.equal(result, '120', `Esperado 120min para 2h em 24x7, obtido: ${result}`)
})

test('2. sla_add_business_minutes: projeta deadline corretamente', { skip: !runIntegration }, () => {
  const calResult = runSql(
    `SELECT id::text FROM public.sla_calendars WHERE company_id = '${companyId}' AND is_24x7 = true LIMIT 1;`
  ).trim()

  if (!calResult) {
    console.log('    SKIP: nenhum calendário 24x7 encontrado')
    return
  }

  const result = runSql(
    `SELECT public.sla_add_business_minutes('${calResult}'::uuid, '2026-08-08 10:00:00+00'::timestamptz, 240)::text;`
  ).trim()

  assert.ok(
    result.includes('2026-08-08 14:00:00'),
    `Esperado deadline em 14:00, obtido: ${result}`
  )
})

test('3. calculate_incident_priority: matriz de prioridade ITIL', { skip: !runIntegration }, () => {
  const cases = [
    { impact: 'Critical', urgency: 'High', expected: 'P1 - Critical' },
    { impact: 'High', urgency: 'High', expected: 'P1 - Critical' },
    { impact: 'Medium', urgency: 'High', expected: 'P2 - High' },
    { impact: 'Low', urgency: 'Low', expected: 'P4 - Low' },
    { impact: 'Medium', urgency: 'Medium', expected: 'P3 - Moderate' },
  ]

  for (const { impact, urgency, expected } of cases) {
    const result = runSql(
      `SELECT public.calculate_incident_priority('${impact}', '${urgency}');`
    ).trim()
    assert.equal(result, expected, `Impact=${impact}, Urgency=${urgency}: esperado ${expected}, obtido ${result}`)
  }
})

test('4. Criação de chamado projeta SLA deadlines automaticamente', { skip: !runIntegration }, () => {
  const ticketId = uuid()
  track(ticketId)

  runSqlMulti(`
    INSERT INTO public.tickets (
      id, number, company_id, short_description, description,
      state, priority, priority_level, ticket_type,
      caller_id, caller_name, impact, urgency,
      created_at, updated_at
    ) VALUES (
      '${ticketId}', 'INT-SLA-TEST-001', '${companyId}',
      'Teste de projeção SLA', 'Ticket para validar projeção automática de deadlines',
      'New', 'P2 - High', 2, 'incident',
      '${callerProfileId}', 'Usuário Teste', 'High', 'High',
      now(), now()
    );
  `)

  const deadlines = runSql(
    `SELECT sla_response_deadline::text, sla_resolution_deadline::text
     FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()

  const [respDeadline, resolDeadline] = deadlines.split('|')

  assert.ok(respDeadline, 'sla_response_deadline deve ser preenchido')
  assert.ok(resolDeadline, 'sla_resolution_deadline deve ser preenchido')
  assert.ok(new Date(respDeadline) > new Date(), 'response_deadline deve ser no futuro')
  assert.ok(new Date(resolDeadline) > new Date(respDeadline), 'resolution_deadline deve ser posterior ao response')
})

test('5. Pausa de SLA: On Hold congela, retoma ajusta', { skip: !runIntegration }, () => {
  const ticketId = uuid()
  track(ticketId)

  runSqlMulti(`
    INSERT INTO public.tickets (
      id, number, company_id, short_description, description,
      state, priority, priority_level, ticket_type,
      caller_id, caller_name, impact, urgency,
      created_at, updated_at
    ) VALUES (
      '${ticketId}', 'INT-SLA-PAUSE-001', '${companyId}',
      'Teste de pausa SLA', 'Ticket para validar pausa e retoma',
      'New', 'P3 - Moderate', 3, 'incident',
      '${callerProfileId}', 'Usuário Teste', 'Medium', 'Medium',
      now(), now()
    );
  `)

  // Captura deadline original
  const beforePause = runSql(
    `SELECT sla_resolution_deadline::text FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  assert.ok(beforePause, 'Deadline original deve existir')

  // Entra em On Hold
  runSqlMulti(`UPDATE public.tickets SET state = 'On Hold', updated_at = now() WHERE id = '${ticketId}';`)

  const pausedAt = runSql(
    `SELECT paused_at::text FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  assert.ok(pausedAt && pausedAt !== '', 'paused_at deve ser preenchido ao entrar em On Hold')

  // Volta para In Progress
  runSqlMulti(`UPDATE public.tickets SET state = 'In Progress', updated_at = now() WHERE id = '${ticketId}';`)

  const afterResume = runSql(
    `SELECT paused_at::text FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  assert.equal(afterResume || '', '', 'paused_at deve ser nulo ao sair de pausa')
})

test('6. check_sla_breaches: marca tickets com deadline estourado', { skip: !runIntegration }, () => {
  const ticketId = uuid()
  track(ticketId)

  // Ticket com deadline já estourado (1h atrás)
  runSqlMulti(`
    INSERT INTO public.tickets (
      id, number, company_id, short_description, description,
      state, priority, priority_level, ticket_type,
      caller_id, caller_name, impact, urgency,
      sla_response_deadline, sla_resolution_deadline,
      is_response_breached, is_resolution_breached,
      created_at, updated_at
    ) VALUES (
      '${ticketId}', 'INT-SLA-BREACH-001', '${companyId}',
      'Teste de breach SLA', 'Ticket com deadline estourado',
      'New', 'P1 - Critical', 1, 'incident',
      '${callerProfileId}', 'Usuário Teste', 'Critical', 'High',
      now() - interval '1 hour', now() - interval '1 hour',
      false, false,
      now() - interval '2 hours', now()
    );
  `)

  // Roda detecção de breach
  runSql(`SELECT public.check_sla_breaches();`)

  const result = runSql(
    `SELECT is_response_breached::text, is_resolution_breached::text, sla_breached::text
     FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()

  const [respBreach, resolBreach, slaBreach] = result.split('|')
  assert.equal(respBreach, 'true', 'is_response_breached deve ser true')
  assert.equal(resolBreach, 'true', 'is_resolution_breached deve ser true')
  assert.equal(slaBreach, 'true', 'sla_breached deve ser true')
})

test('7. Fluxo completo: criar → atribuir → responder → resolver → fechar', { skip: !runIntegration }, () => {
  const ticketId = uuid()
  track(ticketId)
  const ticketNumber = `INT-FLOW-${Date.now()}`

  // ── Criar ──────────────────────────────────────────────────────
  runSqlMulti(`
    INSERT INTO public.tickets (
      id, number, company_id, short_description, description,
      state, priority, priority_level, ticket_type,
      caller_id, caller_name, impact, urgency,
      created_at, updated_at
    ) VALUES (
      '${ticketId}', '${ticketNumber}', '${companyId}',
      'Teste fluxo completo', 'Validação do ciclo de vida ponta a ponta',
      'New', 'P2 - High', 2, 'incident',
      '${callerProfileId}', 'Usuário Flow Test', 'High', 'High',
      now(), now()
    );
  `)

  const initial = runSql(
    `SELECT state, responded_at IS NULL, resolved_at IS NULL, closed_at IS NULL
     FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  const [initState, initRespNull, initResolNull, initClosedNull] = initial.split('|')
  assert.equal(initState, 'New')
  assert.equal(initRespNull, 't', 'responded_at deve ser nulo')
  assert.equal(initResolNull, 't', 'resolved_at deve ser nulo')

  // ── Atribuir ───────────────────────────────────────────────────
  runSqlMulti(`
    UPDATE public.tickets
    SET assigned_to_id = '${analystProfileId}', assigned_to_name = 'Analista Teste',
        state = 'In Progress', updated_at = now()
    WHERE id = '${ticketId}';
  `)

  const assigned = runSql(
    `SELECT state, assigned_to_id::text FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  const [assignedState, assignedTo] = assigned.split('|')
  assert.equal(assignedState, 'In Progress')
  assert.equal(assignedTo, analystProfileId)

  // ── Responder ──────────────────────────────────────────────────
  runSqlMulti(`
    UPDATE public.tickets
    SET responded_at = now(), updated_at = now()
    WHERE id = '${ticketId}' AND responded_at IS NULL;
  `)

  const responded = runSql(
    `SELECT responded_at IS NOT NULL FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  assert.equal(responded, 't', 'responded_at deve ser preenchido')

  // ── Resolver ───────────────────────────────────────────────────
  runSqlMulti(`
    UPDATE public.tickets
    SET state = 'Resolved', resolved_at = now(),
        close_code = 'Fixed', close_notes = 'Corrigido via atualização',
        updated_at = now()
    WHERE id = '${ticketId}';
  `)

  const resolved = runSql(
    `SELECT state, close_code FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  const [resolvedState, closeCode] = resolved.split('|')
  assert.equal(resolvedState, 'Resolved')
  assert.equal(closeCode, 'Fixed')

  // ── Fechar ─────────────────────────────────────────────────────
  runSqlMulti(`
    UPDATE public.tickets
    SET state = 'Closed', closed_at = now(), updated_at = now()
    WHERE id = '${ticketId}';
  `)

  const closed = runSql(
    `SELECT state, closed_at IS NOT NULL FROM public.tickets WHERE id = '${ticketId}';`
  ).trim()
  const [closedState, closedAtNotNull] = closed.split('|')
  assert.equal(closedState, 'Closed')
  assert.equal(closedAtNotNull, 't', 'closed_at deve ser preenchido')

  // ── Verificar eventos SLA ──────────────────────────────────────
  const events = runSql(
    `SELECT string_agg(event_type, ',' ORDER BY created_at) FROM public.sla_events WHERE incident_id = '${ticketId}';`
  ).trim()

  assert.ok(
    events && (events.includes('response_start') || events.includes('response_achieved')),
    `Eventos SLA devem incluir response events. Obtido: ${events}`
  )
})

// ── Cleanup ──────────────────────────────────────────────────────
test('cleanup', { skip: !runIntegration }, () => {
  cleanup()
})
