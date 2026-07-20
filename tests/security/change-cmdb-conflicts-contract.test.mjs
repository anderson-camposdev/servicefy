import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260720000500_155_change_cmdb_and_conflicts.sql')
const packageJson = read('package.json')

test('change_configuration_items so aceita escrita via RPC (INSERT/UPDATE/DELETE revogados de authenticated)', () => {
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.change_configuration_items FROM PUBLIC, authenticated;/)
  assert.match(sql, /GRANT SELECT ON public\.change_configuration_items TO authenticated;/)
})

test('set_change_ci_links valida tenant do CI e papel do ator antes de substituir os vinculos', () => {
  assert.match(sql, /v_profile\.role::text NOT IN \('sysadmin','company_admin','agent','ops_manager','governance_manager'\)/)
  assert.match(sql, /ci\.id IS NULL OR ci\.company_id IS DISTINCT FROM v_change\.company_id/)
  assert.match(sql, /DELETE FROM public\.change_configuration_items WHERE change_id = p_change_id;/)
})

test('get_change_window_conflicts exclui mudancas Cancelled\\/Failed e exige sobreposicao real de janela', () => {
  assert.match(sql, /other\.state NOT IN \('Cancelled', 'Failed'\)/)
  assert.match(sql, /other\.change_window_start < v_change\.change_window_end/)
  assert.match(sql, /other\.change_window_end > v_change\.change_window_start/)
})

test('ambas as RPCs sao SECURITY DEFINER, revogadas de anon\\/public e liberadas so para authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.set_change_ci_links\(UUID, UUID\[\]\) FROM PUBLIC, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_change_ci_links\(UUID, UUID\[\]\) TO authenticated;/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_change_window_conflicts\(UUID\) FROM PUBLIC, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_change_window_conflicts\(UUID\) TO authenticated;/)
})

test('contrato participa da suite de seguranca padrao', () => {
  assert.match(packageJson, /change-cmdb-conflicts-contract\.test\.mjs/)
})
