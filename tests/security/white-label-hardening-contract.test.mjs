import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationPath = 'supabase/migrations/20260716030000_126_white_label_hardening.sql'

test('white-label remove policies amplas e limita update direto a MSP', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /DROP POLICY IF EXISTS write_company_policy ON public\.companies/i)
  assert.match(sql, /DROP POLICY IF EXISTS update_own_company ON public\.companies/i)
  assert.match(sql, /CREATE POLICY companies_msp_update[\s\S]*is_current_user_msp_admin\(\)/i)
})

test('RPC de branding valida autorização e atualiza somente colunas visuais', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_company_branding/i)
  assert.match(sql, /SECURITY DEFINER/i)
  assert.match(sql, /p_company_id = public\.get_current_user_company_id\(\)/i)
  assert.match(sql, /company_admin/i)
  assert.doesNotMatch(sql, /UPDATE public\.companies[\s\S]*SET[\s\S]*is_provider_tenant\s*=/i)
})

test('bucket público restringe tamanho, MIME e escrita ao caminho do tenant', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /branding_assets/i)
  assert.match(sql, /file_size_limit[\s\S]*2097152/i)
  assert.match(sql, /image\/png/i)
  assert.match(sql, /image\/jpeg/i)
  assert.match(sql, /image\/webp/i)
  assert.doesNotMatch(sql, /image\/svg\+xml/i)
  assert.match(sql, /\(storage\.foldername\(name\)\)\[2\]/i)
  assert.match(sql, /get_current_user_company_id\(\)::text/i)
})
