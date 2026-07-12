import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260712160000_109_assignment_engine.sql')

test('is_default_triage existe e permite no máximo um grupo padrão por tenant', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_default_triage boolean NOT NULL DEFAULT false/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_groups_default_triage[\s\S]*?ON public\.assignment_groups\(company_id\)[\s\S]*?WHERE is_default_triage = true/)
})

test('FKs de roteamento apontam para assignment_groups, não para a tabela órfã "groups"', () => {
  assert.match(sql, /ADD CONSTRAINT incident_catalog_symptoms_auto_assign_group_id_fkey[\s\S]*?REFERENCES public\.assignment_groups\(id\) ON DELETE SET NULL/)
  assert.match(sql, /ADD CONSTRAINT tickets_assigned_group_id_fkey[\s\S]*?REFERENCES public\.assignment_groups\(id\) ON DELETE SET NULL/)
})

test('tg_triage_incident segue a cascata: sintoma -> domínio de serviço -> grupo padrão de triagem', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_triage_incident()')[1].split('\n$$;')[0]
  assert.match(fnBody, /FROM public\.incident_catalog_symptoms/)
  assert.match(fnBody, /FROM public\.service_domains/)
  assert.match(fnBody, /is_default_triage = true/)
})

test('cascata de grupo filtra company_id em toda subquery (blindagem multitenant)', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_triage_incident()')[1].split('\n$$;')[0]
  assert.match(fnBody, /FROM public\.incident_catalog_symptoms\s+WHERE id = NEW\.catalog_symptom_id\s+AND company_id = NEW\.company_id/)
  assert.match(fnBody, /FROM public\.service_domains\s+WHERE company_id = NEW\.company_id AND key = 'it'/)
  assert.match(fnBody, /FROM public\.assignment_groups\s+WHERE company_id = NEW\.company_id\s+AND is_default_triage = true/)
})

test('grupo resolvido sincroniza assignment_group_id e assigned_group_id (compatibilidade legada)', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_triage_incident()')[1].split('\n$$;')[0]
  assert.match(fnBody, /NEW\.assignment_group_id := v_group_id/)
  assert.match(fnBody, /NEW\.assigned_group_id := v_group_id/)
})

test('distribuição por menor carga filtra profiles ativos, tickets em aberto e company_id em ambos os lados do join', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_triage_incident()')[1].split('\n$$;')[0]
  assert.match(fnBody, /FROM public\.user_groups ug\s+JOIN public\.profiles p\s+ON p\.id = ug\.user_id\s+AND p\.active = true\s+AND p\.company_id = NEW\.company_id/)
  assert.match(fnBody, /LEFT JOIN public\.tickets t\s+ON t\.assigned_to_id = p\.id\s+AND t\.resolved_at IS NULL\s+AND t\.company_id = NEW\.company_id/)
  assert.match(fnBody, /ORDER BY COUNT\(t\.id\) ASC, p\.id ASC/)
  // Só distribui se ainda não houver analista definido — não sobrescreve escolha manual.
  assert.match(fnBody, /IF NEW\.assignment_group_id IS NOT NULL AND NEW\.assigned_to_id IS NULL THEN/)
})

test('tg_triage_incident é SECURITY DEFINER (roda com bypass de RLS, por isso os filtros explícitos de company_id são obrigatórios)', () => {
  const fnDef = sql.split('CREATE OR REPLACE FUNCTION public.tg_triage_incident()')[1].split('AS $$')[0]
  assert.match(fnDef, /SECURITY DEFINER/)
})

test('tg_incidents_view_insert agora encaminha assignment_group_id e catalog_symptom_id para tickets', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()')[1].split('\n$$;')[0]
  assert.match(fnBody, /assignment_group_id/)
  assert.match(fnBody, /catalog_symptom_id/)
  assert.match(fnBody, /NEW\.assignment_group_id/)
  assert.match(fnBody, /NEW\.catalog_symptom_id/)
})

test('Contrato do Assignment Engine participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /assignment-engine-contract\.test\.mjs/)
})
