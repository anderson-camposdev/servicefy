import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../../supabase/migrations/20260716050000_128_sso_jit_identity.sql', import.meta.url)
const sql = await readFile(migrationUrl, 'utf8')

const functionBody = (name) => {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b([\\s\\S]*?)\\$function\\$;`, 'i'))
  assert.ok(match, `função ${name} ausente`)
  return match[1]
}

test('domínios de login são globais, normalizados e isolados por RLS', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.company_login_domains/i)
  assert.match(sql, /UNIQUE\s*\(domain\)/i)
  assert.match(sql, /domain\s*=\s*lower\(btrim\(domain\)\)/i)
  assert.match(sql, /ALTER TABLE public\.company_login_domains ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /company_id\s*=\s*public\.get_current_user_company_id\(\)/i)
})

test('JIT usa somente domínio verificado e jamais aceita papel vindo de metadata', () => {
  const body = functionBody('handle_new_user')
  assert.match(body, /company_login_domains\s+AS\s+d/i)
  assert.match(body, /d\.verified_at\s+IS\s+NOT\s+NULL/i)
  assert.match(body, /'end_user'::public\.user_role/i)
  assert.doesNotMatch(body, /raw_user_meta_data\s*->>\s*'role'/i)
  assert.doesNotMatch(body, /raw_app_meta_data\s*->>\s*'role'/i)
  assert.match(body, /SET search_path = ''/i)
})

test('JIT reconhece Google e Azure e valida o provedor habilitado no tenant', () => {
  const body = functionBody('handle_new_user')
  assert.match(body, /raw_app_meta_data\s*->>\s*'provider'/i)
  assert.match(body, /IN \('google', 'azure'\)/i)
  assert.match(body, /sso_providers\s*\?\s*v_provider/i)
})

test('hook de senha rejeita autenticação local em tenant SSO-only', () => {
  const body = functionBody('hook_password_verification_attempt')
  assert.match(body, /event\s*->>\s*'valid'/i)
  assert.match(body, /allow_local_login/i)
  assert.match(body, /'decision',\s*'reject'/i)
  assert.match(body, /'decision',\s*'continue'/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.hook_password_verification_attempt\(jsonb\) TO supabase_auth_admin/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hook_password_verification_attempt\(jsonb\) FROM PUBLIC, anon, authenticated/i)
})

test('RPC de política aceita somente administradores do tenant e provedores conhecidos', () => {
  const body = functionBody('update_company_login_policy')
  assert.match(body, /public\.is_current_user_msp_admin\(\)/i)
  assert.match(body, /public\.get_current_user_role\(\)\s*=\s*'company_admin'/i)
  assert.match(body, /public\.get_current_user_company_id\(\)\s*=\s*p_company_id/i)
  assert.match(body, /value\s+NOT\s+IN\s*\('google',\s*'azure'\)/i)
  assert.match(body, /p_allow_local_login\s*=\s*false[\s\S]*jsonb_array_length/i)
})
