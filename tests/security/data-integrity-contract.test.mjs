import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260719000000_144_data_integrity_foundation.sql')
const pkg = JSON.parse(read('package.json'))

test('interrompe a migration com diagnóstico antes de criar unicidades sobre dados duplicados', () => {
  assert.match(sql, /Duplicidade de e-mail no tenant/)
  assert.match(sql, /GROUP BY company_id,\s*lower\(btrim\(email\)\)\s+HAVING count\(\*\) > 1/)
  assert.match(sql, /Duplicidade de departamento ativo no tenant/)
  assert.match(sql, /Duplicidade de grupo solucionador ativo no tenant/)
})

test('normaliza e torna e-mail único sem diferenciar caixa ou espaços dentro do tenant', () => {
  assert.match(sql, /UPDATE public\.profiles\s+SET email = lower\(btrim\(email\)\)/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_company_email_normalized/)
  assert.match(sql, /ON public\.profiles \(company_id, lower\(btrim\(email\)\)\)/)
})

test('nomes ativos de departamentos e grupos são únicos por tenant', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_company_active_name/)
  assert.match(sql, /ON public\.departments \(company_id, lower\(btrim\(name\)\)\)\s+WHERE is_active/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_groups_company_active_name/)
})

test('vínculo usuário-grupo rejeita referências de tenants diferentes no banco', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.validate_user_group_tenant\(\)/)
  assert.match(sql, /Usuário e grupo solucionador devem pertencer ao mesmo tenant/)
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.user_groups/)
})

test('gestores de perfil e departamento devem pertencer ao mesmo tenant e não podem apontar para si', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.validate_profile_hierarchy_tenant\(\)/)
  assert.match(sql, /Perfil não pode ser seu próprio gestor/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.validate_department_manager_tenant\(\)/)
  assert.match(sql, /Gestor do departamento deve pertencer ao mesmo tenant/)
})

test('validadores têm search_path fixo e não ficam executáveis pelas roles da API', () => {
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = public/g)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.validate_user_group_tenant\(\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.validate_profile_hierarchy_tenant\(\) FROM PUBLIC, anon, authenticated/)
})

test('contrato participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /data-integrity-contract\.test\.mjs/)
})
