import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260717010000_130_batch_invite_users.sql')
const pkg = JSON.parse(read('package.json'))

function fnBody(name, closer = '\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split(closer)[0]
}

test('batch_invite_users é SECURITY DEFINER com search_path fixo', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.batch_invite_users\(p_payload jsonb\)/)
  assert.match(sql, /RETURNS jsonb\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/)
})

test('exige company_id válido no payload antes de qualquer outra checagem', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /v_company_id := NULLIF\(p_payload->>'company_id', ''\)::uuid;/)
  assert.match(body, /IF v_company_id IS NULL THEN\s*\n\s*RAISE EXCEPTION 'company_id é obrigatório' USING ERRCODE = '22023';/)
})

test('só admin da empresa (is_settings_admin) pode disparar o convite em lote — bloqueia cross-tenant', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /IF NOT public\.is_settings_admin\(v_company_id\) THEN\s*\n\s*RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';/)
})

test('rejeita payload sem lista de convites não vazia', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /jsonb_typeof\(p_payload->'invites'\) IS DISTINCT FROM 'array'/)
  assert.match(body, /OR jsonb_array_length\(p_payload->'invites'\) = 0 THEN/)
})

test('cada convite exige email, name e role — vazios são reportados como erro, não travam o lote', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /IF v_email IS NULL OR v_name IS NULL OR v_role IS NULL THEN/)
  assert.match(body, /'reason', 'email, name e role são obrigatórios'/)
})

test('valida formato básico de e-mail antes de tentar o INSERT', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /v_email !~ '\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$'/)
})

test('e-mail já existente no tenant é ignorado como "skipped", não como falha do lote', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /WHERE company_id = v_company_id AND lower\(email\) = v_email/)
  assert.match(body, /v_skipped := v_skipped \+ 1;/)
})

test('department_id é resolvido para o nome do departamento escopado pelo próprio tenant — nunca vaza nome de outra empresa', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /SELECT name INTO v_dept_name FROM public\.departments\s+WHERE id = v_dept_id AND company_id = v_company_id;/)
})

test('cada INSERT roda em subtransação própria — role inválida ou limite de licença não abortam o lote inteiro', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /INSERT INTO public\.profiles \(company_id, name, email, role, department, active\)/)
  assert.match(body, /VALUES \(v_company_id, v_name, v_email, v_role::public\.user_role, v_dept_name, true\);/)
  assert.match(body, /EXCEPTION\s*\n\s*WHEN invalid_text_representation THEN/)
  assert.match(body, /WHEN OTHERS THEN/)
})

test('registra evento de auditoria com o resumo do lote (created/skipped/errors)', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /PERFORM public\.write_admin_audit\(\s*\n\s*v_company_id, 'profile\.batch_invited', 'profile', NULL, NULL,/)
})

test('retorna resumo estruturado {created, skipped, errors}', () => {
  const body = fnBody('batch_invite_users(p_payload jsonb)')
  assert.match(body, /RETURN jsonb_build_object\('created', v_created, 'skipped', v_skipped, 'errors', v_errors\);/)
})

test('função revogada de PUBLIC/anon — só authenticated pode executar (checado pela RLS/admin check interna)', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.batch_invite_users\(jsonb\) FROM PUBLIC, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.batch_invite_users\(jsonb\) TO authenticated;/)
})

test('src/lib/services.ts chama a RPC com a mesma assinatura de parâmetro (p_payload)', () => {
  const services = read('src/lib/services.ts')
  // O cast `as unknown as Json` é exigido pela tipagem estrita de
  // createClient<Database> (database.generated.ts) — BatchInvitePayload não
  // satisfaz a assinatura de índice de Json estruturalmente.
  assert.match(services, /supabase\.rpc\('batch_invite_users', \{ p_payload: payload as unknown as Json \}\)/)
})

test('Contrato de convite em lote participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /batch-invite-users-contract\.test\.mjs/)
})
