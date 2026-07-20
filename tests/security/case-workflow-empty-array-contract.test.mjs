import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260720000700_157_case_workflow_empty_array_fix.sql')
const packageJson = read('package.json')

test('states vazio (mas presente) nao bloqueia mais todas as transicoes', () => {
  assert.match(sql, /v_allowed_states IS NOT NULL AND jsonb_typeof\(v_allowed_states\) = 'array'\s*\n\s*AND jsonb_array_length\(v_allowed_states\) > 0 THEN/)
})

test('transitions vazio (mas presente) nao bloqueia mais todas as mudancas de estado', () => {
  assert.match(sql, /v_transitions IS NOT NULL AND jsonb_typeof\(v_transitions\) = 'array'\s*\n\s*AND jsonb_array_length\(v_transitions\) > 0 THEN/)
})

test('workflow_config = {} continua sem nenhuma restricao (comportamento original preservado)', () => {
  assert.match(sql, /IF v_workflow IS NULL OR v_workflow = '\{\}'::jsonb THEN\s*\n\s*RETURN NEW;/)
})

test('funcao continua revogada de anon\\/public\\/authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enforce_case_workflow\(\) FROM PUBLIC, anon, authenticated;/)
})

test('contrato participa da suite de seguranca padrao', () => {
  assert.match(packageJson, /case-workflow-empty-array-contract\.test\.mjs/)
})
