import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260719040000_148_esm_workflow_engine.sql')

function fnBody(name, closer = '\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split(closer)[0]
}

test('enforce_case_workflow bloqueia estados não permitidos em allowed_states', () => {
  const body = fnBody('enforce_case_workflow()')
  assert.match(body, /IF NOT v_allowed_states @> to_jsonb\(NEW\.state\) THEN/)
  assert.match(body, /RAISE EXCEPTION 'Estado "%" não é permitido pelo fluxo deste tipo de caso\.', NEW\.state;/)
})

test('enforce_case_workflow bloqueia transições inválidas (formato object ou array)', () => {
  const body = fnBody('enforce_case_workflow()')
  assert.match(body, /IF NOT EXISTS \(/)
  assert.match(body, /WHERE tr->>'from' = OLD\.state AND tr->>'to' = NEW\.state/)
  assert.match(body, /RAISE EXCEPTION 'Transição de estado inválida: % -> %', OLD\.state, NEW\.state;/)
})

test('validate_case_form valida campos obrigatórios definidos no form_schema', () => {
  const body = fnBody('validate_case_form()')
  assert.match(body, /v_is_required := COALESCE\(\(v_field ->> 'required'\)::boolean, false\);/)
  assert.match(body, /IF v_val IS NULL OR v_val = 'null'::jsonb OR \(jsonb_typeof\(v_val\) = 'string' AND v_val->>0 = ''\) THEN/)
  assert.match(body, /RAISE EXCEPTION 'Campo obrigatório ausente: %', v_field_id;/)
})

test('As triggers são atreladas corretamente na tabela cases', () => {
  assert.match(sql, /CREATE TRIGGER trg_enforce_case_workflow/)
  assert.match(sql, /BEFORE UPDATE ON public\.cases/)
  assert.match(sql, /CREATE TRIGGER trg_validate_case_form/)
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.cases/)
})

test('funções de trigger não ficam expostas a chamada direta via RPC', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enforce_case_workflow\(\) FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.validate_case_form\(\) FROM PUBLIC, anon, authenticated;/)
})
