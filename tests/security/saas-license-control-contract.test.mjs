import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260716000000_124_saas_license_control.sql')
const pkg = JSON.parse(read('package.json'))

function fnBody(name, closer = '\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split(closer)[0]
}

test('companies ganha max_analysts_licenses (NOT NULL, default 3) — eixo distinto de concurrent_licenses (sessões simultâneas)', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS max_analysts_licenses integer NOT NULL DEFAULT 3/)
})

test('índice parcial suporta o COUNT do trigger restrito a "assentos ocupados por tenant" — nunca varre profiles inteira', () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_profiles_licensed_seats\s+ON public\.profiles \(company_id\)\s+WHERE active = true AND role IN \('agent', 'company_admin'\)/)
})

test('só sysadmin/MSP admin/service_role podem alterar max_analysts_licenses — company_admin não pode subir o próprio limite', () => {
  const body = fnBody('guard_max_analysts_licenses_change()')
  assert.match(body, /IF NEW\.max_analysts_licenses IS DISTINCT FROM OLD\.max_analysts_licenses THEN/)
  assert.match(body, /COALESCE\(auth\.role\(\), ''\) <> 'service_role'/)
  assert.match(body, /NOT public\.is_current_user_msp_admin\(\)/)
  assert.match(body, /public\.get_current_user_role\(\) <> 'sysadmin'/)
  assert.match(sql, /CREATE TRIGGER trg_guard_max_analysts_licenses\s+BEFORE UPDATE OF max_analysts_licenses ON public\.companies/)
})

test('trigger de aplicação do limite dispara só em INSERT ou UPDATE que toque role/active — não em qualquer edição de perfil', () => {
  assert.match(sql, /CREATE TRIGGER tg_enforce_analyst_license_limit\s+BEFORE INSERT OR UPDATE OF role, active ON public\.profiles/)
})

test('roles que consomem licença são agent/company_admin (valores reais do enum user_role — não existe "analyst")', () => {
  const body = fnBody('tg_enforce_analyst_license_limit()')
  assert.match(body, /v_consuming_roles CONSTANT text\[\] := ARRAY\['agent', 'company_admin'\]/)
})

test('end_user nunca é bloqueado — não está em v_consuming_roles, então v_is_consuming é sempre false para essa role', () => {
  const body = fnBody('tg_enforce_analyst_license_limit()')
  assert.doesNotMatch(body, /'end_user'/)
  assert.match(body, /v_is_consuming := NEW\.active AND NEW\.role::text = ANY \(v_consuming_roles\)/)
})

test('short-circuit: se já consumia um assento antes e continua consumindo depois, não reexecuta o COUNT', () => {
  const body = fnBody('tg_enforce_analyst_license_limit()')
  assert.match(body, /IF v_was_consuming AND v_is_consuming THEN\s*\n\s*RETURN NEW;/)
})

test('COUNT é delimitado por company_id e exclui a própria linha (evita contar em dobro numa reativação)', () => {
  const body = fnBody('tg_enforce_analyst_license_limit()')
  assert.match(body, /WHERE company_id = NEW\.company_id\s+AND active = true\s+AND role::text = ANY \(v_consuming_roles\)\s+AND id IS DISTINCT FROM NEW\.id/)
})

test('mensagem de exceção é amigável e inclui contagem atual/limite', () => {
  const body = fnBody('tg_enforce_analyst_license_limit()')
  assert.match(body, /RAISE EXCEPTION 'Limite de licenças de analistas atingido \(%\/%\)\. Desative outro usuário ou entre em contato para ampliar seu plano\.', v_count, COALESCE\(v_limit, 3\)/)
})

test('função de aplicação do limite revogada de anon/authenticated — só disparada pelo trigger', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.tg_enforce_analyst_license_limit\(\) FROM public, anon, authenticated/)
})

test('Contrato de controle de licenças participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /saas-license-control-contract\.test\.mjs/)
})
