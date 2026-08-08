/**
 * Runner para os testes de integração do motor de SLA.
 *
 * Verifica pré-requisitos (Supabase local rodando) e executa os testes.
 *
 * Pré-requisitos:
 *   supabase start
 *
 * Uso:
 *   npm run test:integration:sla
 */
import { execFileSync } from 'node:child_process'

function fail(msg) {
  console.error(`[test:integration:sla] ${msg}`)
  process.exit(1)
}

// 1. Verifica se o Supabase local está rodando
try {
  const status = execFileSync('docker', [
    'ps', '--filter', 'name=supabase_db_servicefy', '--format', '{{.Names}}\t{{.Status}}',
  ], { encoding: 'utf8' })

  if (!status.includes('supabase_db_servicefy')) {
    fail('Container supabase_db_servicefy não encontrado. Rode `supabase start` antes.')
  }
  if (!status.includes('Up')) {
    fail('Container supabase_db_servicefy não está rodando. Rode `supabase start` antes.')
  }
} catch {
  fail('Docker não está disponível ou supabase_db_servicefy não existe. Rode `supabase start`.')
}

// 2. Obtém a service_role key do stack local
let serviceRoleKey
try {
  const raw = execFileSync('supabase', ['status', '--output', 'json'], { encoding: 'utf8', shell: true })
  const parsed = JSON.parse(raw)
  serviceRoleKey = parsed.SERVICE_ROLE_KEY
} catch {
  // fallback: pode não ter supabase CLI — os testes usam docker psql direto
  console.log('[test:integration:sla] supabase CLI não encontrado, usando docker psql direto')
}

// 3. Roda os testes
console.log('[test:integration:sla] Executando testes de integração do motor de SLA...')

try {
  execFileSync('node', [
    '--test',
    'tests/integration/sla-engine.integration.test.mjs',
  ], {
    encoding: 'utf8',
    stdio: 'inherit',
    env: {
      ...process.env,
      SERVICEFY_RUN_SLA_INTEGRATION: '1',
      SERVICEFY_LOCAL_SERVICE_ROLE_KEY: serviceRoleKey || '',
    },
  })
  console.log('[test:integration:sla] Todos os testes passaram.')
} catch (err) {
  console.error('[test:integration:sla] Alguns testes falharam.')
  process.exit(1)
}
