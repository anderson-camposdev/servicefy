import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260710140000_104_smtp_worker_vault_access.sql')
const worker = read('supabase/functions/dispatch-ticket-email-outbox/index.ts')

const functionBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('Somente service_role pode resolver a credencial SMTP do Vault', () => {
  const body = functionBody('get_tenant_smtp_delivery_credential')
  assert.match(body, /auth\.role\(\), ''\) <> 'service_role'/)
  assert.match(body, /vault\.decrypted_secrets/)
  assert.match(body, /smtp_vault_secret_id/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_tenant_smtp_delivery_credential\(uuid\) FROM public, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_tenant_smtp_delivery_credential\(uuid\) TO service_role/)
})

test('Worker obtém credencial pela RPC interna, sem expor o schema Vault via PostgREST', () => {
  assert.match(worker, /rpc\('get_tenant_smtp_delivery_credential'/)
  assert.doesNotMatch(worker, /\.schema\('vault'\)/)
  assert.doesNotMatch(worker, /\.from\('decrypted_secrets'\)/)
})
