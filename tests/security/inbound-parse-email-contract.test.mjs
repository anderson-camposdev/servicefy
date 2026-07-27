import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const fn = read('supabase/functions/inbound-email/index.ts')
const pkg = JSON.parse(read('package.json'))

test('camada 1 — segredo compartilhado (URL ou header), comparação timing-safe, rejeita sem ele', () => {
  assert.match(fn, /INBOUND_PARSE_WEBHOOK_KEY/)
  assert.match(fn, /url\.searchParams\.get\('key'\) \?\? req\.headers\.get\('x-servicefy-webhook-key'\)/)
  assert.match(fn, /timingSafeEqual/)
  assert.match(fn, /if \(!INBOUND_PARSE_WEBHOOK_KEY \|\| !timingSafeEqual\(suppliedKey, INBOUND_PARSE_WEBHOOK_KEY\)\) \{\s*\n\s*return new Response\(JSON\.stringify\(\{ error: 'unauthorized' \}\), \{ status: 401 \}\)/)
})

test('camada 2 — exige SPF=pass do remetente real (envelope), rejeita com 403 caso contrário (fail-closed)', () => {
  assert.match(fn, /payload\.spf\?\.toLowerCase\(\) !== 'pass'/)
  assert.match(fn, /status: 403/)
  assert.match(fn, /spf_verification_failed/)
  // usa o remetente do envelope SMTP (autenticado pelo SPF), não o header From: exibido (falsificável)
  assert.match(fn, /domainOf\(payload\.envelopeFrom \?\? fromEmail\)/)
})

test('camada 3 — resolve o destino (to) contra channel_connections real e habilitada antes de delegar ao gateway', () => {
  assert.match(fn, /\.from\('channel_connections'\)/)
  // Passou a aceitar também 'monitoring' (migration 180): a caixa que recebe
  // alerta de Zabbix/PRTG é uma conexão de Monitoramento, não de e-mail de
  // cliente. O transporte é o mesmo; o que muda é a normalização.
  assert.match(fn, /\.in\('provider', \['imap_smtp', 'monitoring'\]\)/)
  assert.match(fn, /\.eq\('enabled', true\)/)
  assert.match(fn, /unknown_destination_mailbox/)
})

test('escapa \'%\'/\'_\' do e-mail de destino antes do ILIKE (evitar over-match por wildcard)', () => {
  assert.match(fn, /toEmail\.replace\(\/\[%_\]\/g, char => `\\\\\$\{char\}`\)/)
})

test('não reimplementa a criação de tickets — delega ao omnichannel-gateway existente via x-servicefy-internal-key', () => {
  assert.match(fn, /OMNICHANNEL_INTERNAL_KEY/)
  assert.match(fn, /x-servicefy-internal-key/)
  // Repassa o provider REAL da conexão. Fixar 'imap_smtp' faria o gateway
  // normalizar alerta como e-mail comum — sem correlação por gatilho, cada
  // repetição do mesmo alerta voltaria a abrir um chamado novo.
  assert.match(fn, /'x-servicefy-provider': connection\.provider/)
  assert.match(fn, /x-servicefy-connection-id/)
  assert.doesNotMatch(fn, /INSERT INTO/i)
  assert.doesNotMatch(fn, /\.from\('incidents'\)\.insert/)
  assert.doesNotMatch(fn, /\.from\('tickets'\)\.insert/)
})

test('aceita multipart/form-data (SendGrid real) e application/json (testes), não só um formato', () => {
  assert.match(fn, /multipart\/form-data/)
  assert.match(fn, /req\.formData\(\)/)
  assert.match(fn, /req\.json\(\)/)
})

test('extrai Message-ID/In-Reply-To/References dos headers brutos para preservar o threading da conversa', () => {
  assert.match(fn, /headerValue\(payload\.headers, 'Message-ID'\)/)
  assert.match(fn, /headerValue\(payload\.headers, 'In-Reply-To'\)/)
  assert.match(fn, /headerValue\(payload\.headers, 'References'\)/)
})

test('rejeita quando gateway interno não está configurado, em vez de falhar silenciosamente', () => {
  assert.match(fn, /if \(!OMNICHANNEL_INTERNAL_KEY\) \{\s*\n\s*return new Response\(JSON\.stringify\(\{ error: 'gateway_not_configured' \}\), \{ status: 503 \}\)/)
})

test('Contrato do motor inbound de e-mail participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /inbound-parse-email-contract\.test\.mjs/)
})
