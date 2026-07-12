import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260712230000_114_ticket_ownership_claim.sql')

function fnBody() {
  return sql.split('CREATE OR REPLACE FUNCTION public.claim_ticket_secure(p_ticket_id uuid)')[1].split('\n$$;')[0]
}

test('claim_ticket_secure é SECURITY DEFINER com search_path fixo', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.claim_ticket_secure\(p_ticket_id uuid\)[\s\S]*?SECURITY DEFINER/)
  assert.match(sql, /SET search_path = public/)
})

test('resolve tenant/perfil via get_current_profile_id/get_current_user_company_id, nunca auth.uid() puro', () => {
  const body = fnBody()
  assert.match(body, /v_profile_id uuid := public\.get_current_profile_id\(\)/)
  assert.match(body, /v_company_id uuid := public\.get_current_user_company_id\(\)/)
  assert.doesNotMatch(body, /auth\.uid\(\)/)
})

test('busca o ticket sempre filtrando company_id (blindagem multitenant, função roda com bypass de RLS)', () => {
  const body = fnBody()
  assert.match(body, /FROM public\.tickets\s+WHERE id = p_ticket_id\s+AND company_id = v_company_id/)
})

test('valida pertencimento ao grupo via user_groups, cruzando company_id em profiles', () => {
  const body = fnBody()
  assert.match(body, /FROM public\.user_groups ug\s+JOIN public\.profiles p ON p\.id = ug\.user_id\s+WHERE ug\.user_id = v_profile_id\s+AND ug\.group_id = v_ticket\.assignment_group_id\s+AND p\.company_id = v_company_id\s+AND p\.active = true/)
})

test('guarda de concorrência: UPDATE carrega assigned_to_id IS NULL no próprio WHERE (sem SELECT prévio condicional)', () => {
  const body = fnBody()
  assert.match(body, /UPDATE public\.tickets\s+SET assigned_to_id = v_profile_id,\s+assigned_to_name = v_profile_name,\s+state = 'In Progress'\s+WHERE id = p_ticket_id\s+AND company_id = v_company_id\s+AND assigned_to_id IS NULL/)
})

test('ROW_COUNT=0 do UPDATE (via NOT FOUND do RETURNING INTO) gera erro de conflito distinto do erro de autorização', () => {
  const body = fnBody()
  assert.match(body, /RETURNING \* INTO v_ticket;\s*\n\s*IF NOT FOUND THEN\s*\n\s*RAISE EXCEPTION 'Este ticket ja foi assumido por outro analista\.' USING ERRCODE = '40001'/)
  assert.match(body, /RAISE EXCEPTION 'Voce nao pertence ao grupo de atendimento deste ticket\.' USING ERRCODE = '42501'/)
})

test('sem pertencimento ao grupo, a função levanta exceção antes de qualquer UPDATE (não escreve nada)', () => {
  const body = fnBody()
  const authCheckIdx = body.indexOf("RAISE EXCEPTION 'Voce nao pertence")
  const updateIdx = body.indexOf('UPDATE public.tickets')
  assert.ok(authCheckIdx > -1 && updateIdx > -1 && authCheckIdx < updateIdx)
})

test('apenas authenticated pode executar; anon/public revogados', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_ticket_secure\(uuid\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_ticket_secure\(uuid\) TO authenticated/)
})

test('Contrato de captura de tickets participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /ticket-ownership-claim-contract\.test\.mjs/)
})
