// Executa a integracao de fallback de e-mail (tests/integration/ticket-email-fallback.integration.test.mjs)
// sem passos manuais: resolve a service_role key do stack local via `supabase status`,
// garante que o mock do provedor global esteja no ar, e roda o teste com o ambiente pronto.
//
// Pre-requisito: `supabase start` (stack local + edge runtime) precisa estar de pe.
// Uso: npm run test:integration:email-fallback

import { execFileSync, spawnSync } from 'node:child_process'

const MOCK_CONTAINER = 'servicefy-fallback-mock'
const MOCK_NETWORK = 'supabase_network_servicefy'
const MOCK_SCRIPT = `const http=require('http');http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{console.log(b);res.writeHead(200,{'content-type':'application/json'});res.end('{"id":"ok"}')})}).listen(8799)`

function run(command, args, { shell = false } = {}) {
  // shell:true resolve shims .cmd/.ps1 do Windows (ex.: `supabase` instalado via npm global).
  // docker.exe eh um executavel real e nao precisa disso — mantemos shell:false para preservar
  // o quoting exato do script inline do mock.
  return execFileSync(command, args, { encoding: 'utf8', shell })
}

function fail(message) {
  console.error(`[test:integration:email-fallback] ${message}`)
  process.exit(1)
}

function resolveServiceRoleKey() {
  let status
  try {
    status = JSON.parse(run('supabase', ['status', '--output', 'json'], { shell: true }))
  } catch {
    fail('Nao foi possivel ler `supabase status` — rode `supabase start` antes.')
  }
  if (!status.SERVICE_ROLE_KEY) fail('`supabase status` nao retornou SERVICE_ROLE_KEY.')
  return status.SERVICE_ROLE_KEY
}

function ensureMockRunning() {
  const containers = run('docker', ['ps', '-a', '--filter', `name=^${MOCK_CONTAINER}$`, '--format', '{{.Names}}\t{{.Status}}'])
  const line = containers.trim().split('\n').find(Boolean)

  if (!line) {
    run('docker', [
      'run', '-d', '--rm', '--network', MOCK_NETWORK, '--name', MOCK_CONTAINER,
      'node:24-alpine', 'node', '-e', MOCK_SCRIPT,
    ])
    return
  }
  if (!line.includes('Up')) {
    run('docker', ['start', MOCK_CONTAINER])
  }
}

const serviceRoleKey = resolveServiceRoleKey()
ensureMockRunning()

const result = spawnSync('node', ['--test', 'tests/integration/ticket-email-fallback.integration.test.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SERVICEFY_RUN_EMAIL_INTEGRATION: '1',
    SERVICEFY_LOCAL_SERVICE_ROLE_KEY: serviceRoleKey,
  },
})

process.exit(result.status ?? 1)
