import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260715020000_123_macro_engine.sql')
const pkg = JSON.parse(read('package.json'))

function fnBody(name, closer = '\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split(closer)[0]
}

test('ticket_macros isolado por tenant: leitura exige equipe interna do mesmo company_id, escrita restrita a admins', () => {
  assert.match(sql, /CREATE POLICY select_ticket_macros ON public\.ticket_macros\s+FOR SELECT TO authenticated\s+USING \(\s*\n\s*public\.is_current_user_msp_admin\(\)\s*\n\s*OR \(company_id = public\.get_current_user_company_id\(\) AND public\.is_current_user_ticket_staff\(\)\)/)
  assert.match(sql, /CREATE POLICY write_ticket_macros ON public\.ticket_macros\s+FOR ALL TO authenticated/)
  assert.match(sql, /get_current_user_role\(\) = ANY \(ARRAY\['sysadmin','company_admin','it_manager'\]\)/)
})

test('operations é validado como objeto JSONB (CHECK) — não aceita array/escalar', () => {
  assert.match(sql, /CONSTRAINT ticket_macros_operations_is_object CHECK \(jsonb_typeof\(operations\) = 'object'\)/)
})

test('apply_ticket_macro é SECURITY DEFINER, bloqueia end_user e resolve company_id explicitamente', () => {
  const body = fnBody('apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.apply_ticket_macro\(p_ticket_id uuid, p_macro_id uuid\)[\s\S]*?SECURITY DEFINER/)
  assert.match(body, /v_company_id uuid := public\.get_current_user_company_id\(\)/)
  assert.match(body, /IF NOT public\.is_current_user_ticket_staff\(\) THEN/)
})

test('valida macro E ticket contra o mesmo company_id antes de qualquer mutação (nenhuma escrita acontece antes das duas checagens)', () => {
  const body = fnBody('apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)')
  const macroCheckIdx = body.indexOf("RAISE EXCEPTION 'Macro não encontrada")
  const ticketCheckIdx = body.indexOf("RAISE EXCEPTION 'Ticket não encontrado")
  const updateIdx = body.indexOf('UPDATE public.incidents SET')
  const insertIdx = body.indexOf('INSERT INTO public.ticket_messages')
  assert.ok(macroCheckIdx > -1 && ticketCheckIdx > -1 && updateIdx > -1 && insertIdx > -1)
  assert.ok(macroCheckIdx < updateIdx && ticketCheckIdx < updateIdx)
  assert.ok(macroCheckIdx < insertIdx && ticketCheckIdx < insertIdx)
  assert.match(body, /WHERE id = p_macro_id AND company_id = v_company_id AND is_active = true/)
  assert.match(body, /WHERE id = p_ticket_id AND company_id = v_company_id/)
})

test('nenhum SQL dinâmico (EXECUTE/format) — set_fields usa lista fixa e explícita de campos, cada um extraído e tipado individualmente', () => {
  const body = fnBody('apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)')
  assert.doesNotMatch(body, /EXECUTE format/i)
  assert.doesNotMatch(body, /EXECUTE '/i)
  assert.match(body, /state = COALESCE\(\(v_set_fields->>'state'\)::incident_state, state\)/)
  assert.match(body, /priority = COALESCE\(\(v_set_fields->>'priority'\)::ticket_priority, priority\)/)
})

test('assignment_group_id da macro é revalidado contra o company_id do ticket antes de aplicar (não confia no valor do JSONB)', () => {
  const body = fnBody('apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)')
  assert.match(body, /FROM public\.assignment_groups\s+WHERE id = \(v_set_fields->>'assignment_group_id'\)::uuid AND company_id = v_company_id/)
  assert.match(body, /RAISE EXCEPTION 'Grupo de atendimento da macro não pertence a este tenant\.'/)
})

test('escreve através da view incidents (não tickets diretamente) para disparar a cascata de triggers já embutidos', () => {
  const body = fnBody('apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)')
  assert.match(body, /UPDATE public\.incidents SET/)
  assert.doesNotMatch(body, /UPDATE public\.tickets SET/)
})

test('add_comment insere via ticket_messages normal (não SQL bruto) para disparar as triggers dessa tabela também, e exige corpo não vazio', () => {
  const body = fnBody('apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)')
  assert.match(body, /INSERT INTO public\.ticket_messages \(incident_id, company_id, case_id, sender_id, sender_name, actor_type, body, is_internal\)/)
  assert.match(body, /IF NULLIF\(trim\(v_body\), ''\) IS NULL THEN\s*\n\s*RAISE EXCEPTION 'Macro com add_comment sem corpo de texto\.'/)
})

test('macro sem set_fields nem add_comment é rejeitada explicitamente', () => {
  const body = fnBody('apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)')
  assert.match(body, /IF v_set_fields IS NULL AND v_comment IS NULL THEN\s*\n\s*RAISE EXCEPTION 'Macro sem operações configuradas\.'/)
})

test('função revogada de anon/public, concedida a authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_ticket_macro\(uuid, uuid\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.apply_ticket_macro\(uuid, uuid\) TO authenticated/)
})

test('Contrato do motor de macros participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /macro-engine-contract\.test\.mjs/)
})
