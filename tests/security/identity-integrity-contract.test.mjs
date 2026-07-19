import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260719010000_145_identity_integrity.sql')
const preflight = read('scripts/preflight-data-integrity.sql')
const pkg = JSON.parse(read('package.json'))

const functionBody = name => {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b([\\s\\S]*?)\\$function\\$;`, 'i'))
  assert.ok(match, `função ${name} ausente`)
  return match[1]
}

test('JIT nunca escolhe arbitrariamente o primeiro perfil global por e-mail', () => {
  const body = functionBody('handle_new_user')
  assert.doesNotMatch(body, /ORDER BY p\.created_at,\s*p\.id[\s\S]*LIMIT 1/i)
  assert.match(body, /count\(\*\)[\s\S]*FROM public\.profiles AS p[\s\S]*p\.auth_id IS NULL/i)
})

test('um convite globalmente inequívoco continua sendo vinculado sem exigir domínio SSO', () => {
  const body = functionBody('handle_new_user')
  assert.match(body, /IF v_candidate_count = 1 THEN/i)
  assert.match(body, /UPDATE public\.profiles AS p[\s\S]*p\.auth_id IS NULL/i)
  assert.match(body, /GET DIAGNOSTICS v_linked_count = ROW_COUNT/i)
})

test('e-mail ambíguo só pode ser vinculado depois de resolver domínio verificado e tenant', () => {
  const body = functionBody('handle_new_user')
  assert.match(body, /company_login_domains AS d[\s\S]*d\.verified_at IS NOT NULL/i)
  assert.match(body, /p\.company_id = v_company\.id[\s\S]*lower\(btrim\(p\.email\)\) = v_email/i)
  assert.match(body, /IF v_candidate_count > 1 AND v_company\.id IS NULL THEN[\s\S]*RETURN NEW/i)
})

test('criação JIT usa e-mail normalizado e trata conflito de unicidade de forma idempotente', () => {
  const body = functionBody('handle_new_user')
  assert.match(body, /v_email := lower\(btrim\(NEW\.email\)\)/i)
  assert.match(body, /EXCEPTION[\s\S]*WHEN unique_violation THEN[\s\S]*UPDATE public\.profiles AS p[\s\S]*p\.company_id = v_company\.id[\s\S]*p\.auth_id IS NULL/i)
})

test('convite concorrente vira skipped sem expor SQLERRM', () => {
  const body = functionBody('batch_invite_users')
  assert.match(body, /WHEN unique_violation THEN[\s\S]*v_skipped := v_skipped \+ 1/i)
  assert.match(body, /'usuário já existe nesta empresa'/i)
  assert.doesNotMatch(body, /'reason',\s*SQLERRM/i)
})

test('department_id inválido é rejeitado por item sem abortar o lote', () => {
  const body = functionBody('batch_invite_users')
  assert.match(body, /v_dept_raw := NULLIF\(v_invite->>'department_id', ''\)/i)
  assert.match(body, /IF v_dept_raw IS NOT NULL AND v_dept_raw !~\*\s+/i)
  assert.match(body, /'department_id inválido'/i)
})

test('preflight remoto retorna somente contagens agregadas e cobre todas as invariantes da migration 144', () => {
  assert.match(preflight, /duplicate_profile_email_keys/i)
  assert.match(preflight, /duplicate_active_department_keys/i)
  assert.match(preflight, /duplicate_active_assignment_group_keys/i)
  assert.match(preflight, /cross_tenant_user_group_links/i)
  assert.match(preflight, /invalid_profile_manager_links/i)
  assert.doesNotMatch(preflight, /SELECT\s+(?:p\.)?email\b/i)
})

test('novo contrato participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /identity-integrity-contract\.test\.mjs/)
})
