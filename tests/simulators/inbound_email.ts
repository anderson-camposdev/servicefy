// ============================================================
// ServiceFY — Simulador manual da Edge Function inbound-email (Fase 24)
//
// Envia payloads mockados de Inbound Parse (estilo SendGrid) para a função
// rodando no stack local, cobrindo os cenários de segurança das 3 camadas
// (segredo compartilhado, SPF, resolução de destino).
//
// Pré-requisito: `supabase start` de pé (stack local + edge-runtime), com
// `supabase/functions/.env` contendo INBOUND_PARSE_WEBHOOK_KEY e
// OMNICHANNEL_INTERNAL_KEY (mesmos valores usados pela função).
//
// Uso: node tests/simulators/inbound_email.ts
//   ou: npm run test:simulate:inbound-email
// ============================================================

const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL ?? 'http://127.0.0.1:54321/functions/v1'
const WEBHOOK_KEY = process.env.INBOUND_PARSE_WEBHOOK_KEY ?? ''
const ENDPOINT = `${FUNCTIONS_URL}/inbound-email`

interface SimulatedPayload {
  to: string
  from: string
  subject: string
  text: string
  spf?: string
  envelope?: { to: string[]; from: string }
  headers?: string
}

interface Scenario {
  name: string
  expectedStatus: number
  keyOverride?: string
  payload: SimulatedPayload
}

function buildPayload(overrides: Partial<SimulatedPayload> = {}): SimulatedPayload {
  return {
    to: 'suporte@empresa-cliente.com.br',
    from: 'Maria Solicitante <maria@empresa-cliente.com.br>',
    subject: 'Sistema de vendas fora do ar',
    text: 'Não conseguimos acessar o sistema desde as 9h. Podem verificar?',
    spf: 'pass',
    envelope: { to: ['suporte@empresa-cliente.com.br'], from: 'maria@empresa-cliente.com.br' },
    headers: 'Message-ID: <sim-1@empresa-cliente.com.br>',
    ...overrides,
  }
}

const SCENARIOS: Scenario[] = [
  {
    name: 'e-mail legítimo (SPF pass, destino conhecido) — deve ser aceito e materializado como ticket',
    expectedStatus: 200,
    payload: buildPayload(),
  },
  {
    name: 'sem o segredo compartilhado — deve ser rejeitado com 401 (camada 1)',
    expectedStatus: 401,
    keyOverride: 'chave-errada-de-proposito',
    payload: buildPayload(),
  },
  {
    name: 'SPF falho (remetente forjado) — deve ser rejeitado com 403 (camada 2)',
    expectedStatus: 403,
    payload: buildPayload({ spf: 'fail', from: 'ceo@empresa-cliente.com.br' }),
  },
  {
    name: 'domínio de destino desconhecido (nenhuma channel_connection cadastrada) — deve ser rejeitado com 403 (camada 3)',
    expectedStatus: 403,
    payload: buildPayload({ to: 'ninguem@dominio-nao-cadastrado.com', envelope: { to: ['ninguem@dominio-nao-cadastrado.com'], from: 'maria@empresa-cliente.com.br' } }),
  },
  {
    name: 'resposta a um ticket existente (In-Reply-To presente) — deve virar comentário, não novo ticket',
    expectedStatus: 200,
    payload: buildPayload({
      subject: 'Re: Sistema de vendas fora do ar',
      text: 'Ainda sem resposta, por favor priorizem.',
      headers: 'Message-ID: <sim-2@empresa-cliente.com.br>\nIn-Reply-To: <sim-1@empresa-cliente.com.br>\nReferences: <sim-1@empresa-cliente.com.br>',
    }),
  },
]

async function runScenario(scenario: Scenario): Promise<boolean> {
  const key = scenario.keyOverride ?? WEBHOOK_KEY
  const url = `${ENDPOINT}?key=${encodeURIComponent(key)}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(scenario.payload),
    })
  } catch (err) {
    console.error(`  ✗ falha de rede: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }

  const body = await response.text()
  const ok = response.status === scenario.expectedStatus
  console.log(`  ${ok ? '✔' : '✗'} status ${response.status} (esperado ${scenario.expectedStatus}) — ${body.slice(0, 200)}`)
  return ok
}

async function main(): Promise<void> {
  if (!WEBHOOK_KEY) {
    console.error('INBOUND_PARSE_WEBHOOK_KEY não definido no ambiente — defina antes de rodar o simulador.')
    process.exit(1)
  }

  console.log(`Simulando payloads de Inbound Parse contra ${ENDPOINT}\n`)
  let failures = 0
  for (const scenario of SCENARIOS) {
    console.log(`▶ ${scenario.name}`)
    const passed = await runScenario(scenario)
    if (!passed) failures += 1
    console.log('')
  }

  if (failures > 0) {
    console.error(`${failures} cenário(s) não bateram o status esperado.`)
    process.exit(1)
  }
  console.log('Todos os cenários bateram o status esperado.')
}

void main()
