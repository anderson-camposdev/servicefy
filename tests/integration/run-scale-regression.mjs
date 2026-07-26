/**
 * run-scale-regression.mjs
 *
 * Guarda contra a classe de bug encontrada em 2026-07-26: o PostgREST corta
 * respostas em 1.000 linhas e devolve HTTP 200 — sem limite explícito, o app
 * recebia um recorte arbitrário achando que tinha a fila inteira. Efeitos:
 *   • um chamado crítico fora do corte ficava INVISÍVEL para o analista;
 *   • os cards de KPI, contados no cliente, mostravam 1.000 com 50.010 na base.
 *
 * Nenhum teste existente pegava isso porque todos rodam com dezenas de linhas.
 * Este exercita o caminho REST REAL do app acima do teto de 1.000.
 *
 *   npm run test:integration:scale
 *
 * Pula com aviso (sem falhar) se o Supabase local não estiver acessível.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ROWS = 2_500 // acima do teto de 1.000 do PostgREST
const TAG = 'scaleregression'
const DB = 'supabase_db_servicefy'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const URL_BASE = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY

const psql = sql =>
  execFileSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  }).trim()

let failures = 0
const check = (nome, ok, detalhe) => {
  console.log(`  ${ok ? '✓' : '✗'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!ok) failures++
}

async function main() {
  try {
    psql('SELECT 1')
  } catch {
    console.log('⚠  Supabase local indisponível — teste de escala pulado.')
    console.log('   Suba com `npx supabase start` para executá-lo.')
    return
  }
  if (!URL_BASE || !ANON) {
    console.log('⚠  VITE_SUPABASE_URL/ANON_KEY ausentes em .env.local — teste pulado.')
    return
  }

  const company = psql(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)
  const email = psql(`SELECT email FROM profiles WHERE role='sysadmin' AND active LIMIT 1`)

  console.log(`\nCarregando ${ROWS.toLocaleString('pt-BR')} chamados de teste…`)
  psql(`
    SET session_replication_role = replica;
    INSERT INTO tickets (number, company_id, short_description, priority, state, caller_name,
                         ticket_type, created_at, updated_at, tags,
                         sla_response_deadline, sla_resolution_deadline, sla_breached, responded_at)
    SELECT 'SCALE' || lpad(g::text,7,'0'), '${company}', 'Carga de regressão ' || g,
           'P3 - Moderate'::ticket_priority, 'New'::incident_state, 'QA Escala', 'incident',
           now() - ((g % 400) || ' days')::interval, now() - ((g % 400) || ' days')::interval,
           ARRAY['${TAG}'],
           now() + interval '10 days', now() + interval '20 days', false, NULL
    FROM generate_series(1, ${ROWS}) g;

    -- O caso que o bug escondia: crítico, SLA estourado, sem atualização
    -- recente. Ordenado por updated_at ele cai fora do corte; ordenado por
    -- urgência tem de vir na primeira página.
    INSERT INTO tickets (number, company_id, short_description, priority, state, caller_name,
                         ticket_type, created_at, updated_at, tags,
                         sla_response_deadline, sla_resolution_deadline, sla_breached)
    VALUES ('SCALE-CRITICO', '${company}', 'CRITICO esquecido — datacenter fora do ar',
            'P1 - Critical'::ticket_priority, 'New'::incident_state, 'Diretoria', 'incident',
            now() - interval '400 days', now() - interval '400 days', ARRAY['${TAG}'],
            now() - interval '399 days', now() - interval '398 days', true);
    SET session_replication_role = DEFAULT;
    ANALYZE tickets;
  `)

  const totalReal = Number(psql(`SELECT count(*) FROM tickets`))
  console.log(`Base: ${totalReal.toLocaleString('pt-BR')} chamados\n`)

  const senha = process.env.SCALE_TEST_PASSWORD || 'ServiceFY!Local2026'
  const auth = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  }).then(r => r.json())

  if (!auth.access_token) {
    console.log(`⚠  Não foi possível autenticar como ${email} — teste pulado.`)
    console.log('   Defina SCALE_TEST_PASSWORD com a senha local desse usuário.')
    await limpar()
    return
  }
  const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` }

  console.log('Verificações:')

  // 1) A fila pagina no servidor em vez de bater no teto silencioso de 1.000.
  const ordem = 'queue_rank.asc,queue_deadline.asc.nullslast,priority.asc,updated_at.desc'
  const pagina = await fetch(
    `${URL_BASE}/rest/v1/incidents?select=*&order=${ordem}&limit=50&offset=0`, { headers: H },
  ).then(r => r.json())
  check('fila devolve uma página (50), não o corte de 1.000', pagina.length === 50, `${pagina.length} linhas`)

  // 2) O chamado crítico esquecido chega ao analista na primeira página.
  const criticoNaPagina1 = pagina.some(t => t.number === 'SCALE-CRITICO')
  check('chamado crítico com SLA estourado aparece na página 1', criticoNaPagina1,
    criticoNaPagina1 ? 'visível' : 'INVISÍVEL — regressão do bug original')

  // 3) Sem limite explícito o teto continua existindo: é exatamente por isso
  //    que services.ts precisa impor DEFAULT_TICKET_PAGE_SIZE.
  const semLimite = await fetch(`${URL_BASE}/rest/v1/incidents?select=id`, { headers: H }).then(r => r.json())
  check('teto do PostgREST segue ativo (justifica o limite padrão no serviço)',
    semLimite.length === 1000, `${semLimite.length} linhas sem limite`)

  // 4) KPIs vêm de agregação no banco e batem com a realidade.
  const kpis = await fetch(`${URL_BASE}/rest/v1/rpc/get_ticket_queue_kpis`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}',
  }).then(r => r.json())
  check('KPI "total" é a contagem real, não o tamanho da página',
    kpis.total === totalReal, `RPC=${kpis.total} banco=${totalReal}`)
  check('KPI "total" não ficou preso no teto de 1.000', kpis.total > 1000, `${kpis.total}`)

  const breachedReal = Number(psql(`SELECT count(*) FROM tickets WHERE sla_breached`))
  check('KPI "SLA violado" bate com o banco', kpis.slaBreached === breachedReal,
    `RPC=${kpis.slaBreached} banco=${breachedReal}`)

  await limpar()

  console.log(
    failures === 0
      ? '\n✅ Escala: todas as verificações passaram.\n'
      : `\n❌ Escala: ${failures} verificação(ões) falharam.\n`,
  )
  if (failures > 0) process.exitCode = 1
}

async function limpar() {
  psql(`
    SET session_replication_role = replica;
    DELETE FROM cases WHERE title LIKE 'Carga de regressão%' OR title LIKE 'CRITICO esquecido%';
    DELETE FROM tickets WHERE tags @> ARRAY['${TAG}'];
    SET session_replication_role = DEFAULT;
    ANALYZE tickets;
  `)
}

main().catch(async err => {
  console.error(err)
  try { await limpar() } catch { /* limpeza best-effort */ }
  process.exitCode = 1
})
