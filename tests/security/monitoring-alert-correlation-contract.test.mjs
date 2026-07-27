import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const shared      = read('supabase/functions/_shared/omnichannel.ts')
const gateway     = read('supabase/functions/omnichannel-gateway/index.ts')
const inboundMail = read('supabase/functions/inbound-email/index.ts')
const mig180      = read('supabase/migrations/20260726001000_180_monitoring_provider_enum.sql')
const mig181      = read('supabase/migrations/20260726001100_181_monitoring_alert_correlation.sql')
const mig182      = read('supabase/migrations/20260726001200_182_fix_channel_materialization_uuid.sql')

// Conexão de Monitoramento (26/07/2026). A chave de conversa para e-mail é
//   conversationId ?? threadId ?? references.at(-1) ?? messageId
// e alerta não tem nenhum dos três primeiros — cai em messageId, único por
// e-mail. Resultado medido: 40 oscilações do mesmo gatilho = 40 chamados, e o
// e-mail de recuperação abrindo um 41º. A correção é usar o identificador do
// GATILHO como chave da conversa.
//
// O comportamento em si é verificado ao vivo contra o Postgres
// (scripts/monitoring-behavior-check.sql, 6 cenários). Estes contratos travam
// as decisões estruturais.

test('migration 180 fica sozinha — Postgres proíbe usar valor de enum na transação que o criou', () => {
  const comandos = mig180.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'))
  assert.equal(comandos.length, 1, 'a migration do enum não pode conter outros comandos')
  assert.match(mig180, /ALTER TYPE public\.channel_provider ADD VALUE IF NOT EXISTS 'monitoring'/)
})

test('a conversa é chaveada pelo GATILHO, não pela mensagem — é o que impede a enxurrada', () => {
  const fn = shared.split('export const normalizeMonitoring')[1].split('export const normalizeInbound')[0]
  assert.match(fn, /externalConversationId: correlationKey/)
  // Campo explícito do webhook antes da regex: quem manda JSON estruturado
  // não deve depender de parsing de texto.
  assert.match(fn, /source\.correlation_key[\s\S]*?firstMatch\(config\.correlationPattern/)
})

test('regex inválida do tenant não derruba a ingestão', () => {
  const helper = shared.split('const firstMatch')[1].split('\n}')[0]
  assert.match(helper, /try \{/)
  assert.match(helper, /catch/)
  assert.match(helper, /return undefined/)
})

test('severidade e recuperação viajam em raw.servicefy_alert, de onde o SQL lê', () => {
  const fn = shared.split('export const normalizeMonitoring')[1].split('export const normalizeInbound')[0]
  assert.match(fn, /servicefy_alert:\s*\{/)
  assert.match(fn, /correlation_key:/)
  assert.match(fn, /severity:/)
  assert.match(fn, /is_recovery:/)
  assert.match(mig181, /m\.raw_payload -> 'servicefy_alert'/)
})

test('gateway carrega config da conexão e repassa à normalização', () => {
  assert.match(gateway, /\.select\('id,company_id,scope,provider,enabled,config'\)/)
  assert.match(gateway, /normalizeInbound\(provider, payload, connectionId,\s*\n\s*\(connection\.config \?\? \{\}\)/)
})

test('caixa de alerta é reconhecida no caminho de e-mail e mantém o provider real', () => {
  assert.match(inboundMail, /\.in\('provider', \['imap_smtp', 'monitoring'\]\)/)
  // Encaminhar como 'imap_smtp' faria o gateway normalizar sem correlação.
  assert.match(inboundMail, /'x-servicefy-provider': connection\.provider/)
  assert.doesNotMatch(inboundMail, /'x-servicefy-provider': 'imap_smtp'/)
})

test('severidade chega pela categoria — o motor de automação não lê tags nem descrição', () => {
  assert.match(mig181, /v_category\s*:=\s*'Monitoramento'/)
  assert.match(mig181, /COALESCE\(v_category, 'Other'\)/)
})

test('recuperação é configurável por conexão, com padrão conservador', () => {
  assert.match(mig181, /COALESCE\(cc\.config ->> 'on_recovery', 'notify'\)/)
  assert.match(mig181, /v_on_recovery = 'resolve'/)
})

test('fechamento automático fornece código E notas — a guarda de resolução exige os dois', () => {
  const bloco = mig181.split("v_on_recovery = 'resolve' THEN")[1]
  assert.match(bloco, /resolution_code\s*=/)
  assert.match(bloco, /resolution_notes\s*=/)
  // Não pode reabrir/re-resolver o que já está encerrado.
  assert.match(bloco, /v_state NOT IN \('Resolved', 'Closed'\)/)
})

test('recuperação órfã não abre chamado — anunciar que algo se resolveu é ruído', () => {
  assert.match(mig181, /IF v_is_recovery AND v_incident_id IS NULL THEN/)
  assert.match(mig181, /'recovery_without_open_incident'/)
})

test('migration 182: gatilhos da view fixam search_path próprio (causa raiz da classe)', () => {
  for (const fn of ['insert', 'update', 'delete']) {
    assert.match(mig182, new RegExp(`ALTER FUNCTION public\\.tg_incidents_view_${fn}\\(\\) SET search_path`))
  }
  // gen_random_uuid é do core: resolve com search_path vazio, sem depender
  // da extensão uuid-ossp. A prosa do comentário cita a função antiga de
  // propósito (explica o bug), então a checagem ignora linhas de comentário.
  assert.match(mig182, /gen_random_uuid\(\)/)
  const codigo = mig182.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(codigo, /[^.]uuid_generate_v4\(\)/)
})

test('migration 181 derruba a constraint pelo nome LEGADO — só o nome novo deixaria a antiga barrando', () => {
  assert.match(mig181, /DROP CONSTRAINT IF EXISTS incidents_opened_via_check/)
  assert.match(mig181, /'monitoring'::text/)
})

test('Contrato da conexão de Monitoramento participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/monitoring-alert-correlation-contract\.test\.mjs/)
})
