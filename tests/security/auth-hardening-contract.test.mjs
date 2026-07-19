import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const migration = await readFile(new URL('supabase/migrations/20260718001000_141_auth_context_hardening.sql', root), 'utf8')
const authService = await readFile(new URL('src/auth/authService.ts', root), 'utf8')
const nginx = await readFile(new URL('nginx.conf', root), 'utf8')
const dockerfile = await readFile(new URL('Dockerfile', root), 'utf8')
const baseline = await readFile(new URL('docs/SECURITY_AUTH_BASELINE.md', root), 'utf8')

test('helpers de identidade ignoram perfil ou tenant desativado', () => {
  for (const helper of ['get_current_profile_id', 'get_current_user_company_id', 'get_current_user_role']) {
    assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${helper}\\(\\)[\\s\\S]*?p\\.active\\s*=\\s*true`, 'i'))
  }
  assert.match(migration, /JOIN public\.companies AS c[\s\S]*c\.active\s*=\s*true/i)
  assert.match(migration, /SET search_path\s*=\s*''/i)
})

test('frontend não autentica profile desativado', () => {
  assert.match(authService, /\.eq\('active',\s*true\)/)
  assert.match(authService, /\.eq\('company\.active',\s*true\)/)
})

test('sessão persistida é validada no servidor antes de resolver o perfil', () => {
  assert.match(authService, /supabase\.auth\.getUser\(session\.access_token\)/)
  assert.match(authService, /data\.user\.id !== session\.user\.id/)
  assert.match(authService, /signOut\(\{\s*scope:\s*'local'\s*\}\)/)
})

test('container publica SPA com headers de segurança e sem CORS global', () => {
  assert.match(dockerfile, /FROM nginx:.*alpine/i)
  assert.match(dockerfile, /COPY nginx\.conf/)
  assert.doesNotMatch(dockerfile, /http-server/)
  assert.match(nginx, /Content-Security-Policy/i)
  assert.match(nginx, /frame-ancestors 'none'/i)
  assert.match(nginx, /X-Content-Type-Options\s+"nosniff"/i)
  assert.match(nginx, /Referrer-Policy/i)
  assert.match(nginx, /Permissions-Policy/i)
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/i)
  assert.doesNotMatch(nginx, /Access-Control-Allow-Origin\s+"\*"/i)
  assert.doesNotMatch(nginx, /^\s*location\b[\s\S]{0,180}add_header/im)
})

test('baseline preserva login por senha e deixa MFA gradual', () => {
  assert.match(baseline, /MFA opcional.*desenvolvimento/i)
  assert.match(baseline, /login por senha.*permitido/i)
  assert.match(baseline, /Supabase Cloud/i)
  assert.match(baseline, /homologa[cç][aã]o/i)
})
