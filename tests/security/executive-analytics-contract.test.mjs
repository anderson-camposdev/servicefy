import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = [
  read('supabase/migrations/20260713040000_120_executive_analytics_rpc.sql'),
  read('supabase/migrations/20260718000900_140_executive_metrics_v2_and_measure_drilldown.sql'),
].join('\n')

function fnBody(name, closer = '\nEND;\n$$;') {
  return sql.split(`CREATE OR REPLACE FUNCTION public.${name}`).at(-1).split(closer)[0]
}

test('get_executive_metrics é SECURITY DEFINER com search_path fixo', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_executive_metrics\(p_start_date date, p_end_date date\)[\s\S]*?SECURITY DEFINER/)
  assert.match(sql, /SET search_path = public/)
})

test('resolve company_id via get_current_user_company_id() — get_current_profile_company_id() não existe no schema', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(body, /v_company_id uuid := public\.get_current_user_company_id\(\)/)
  assert.doesNotMatch(sql, /get_current_profile_company_id/)
})

test('bloqueia end_user — blindagem além de company_id, já que agrega dados da empresa inteira', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(body, /IF NOT public\.is_current_user_ticket_staff\(\) THEN/)
  assert.match(body, /RAISE EXCEPTION 'Acesso restrito à equipe interna\.' USING ERRCODE = '42501'/)
})

test('valida sessão resolvida e período coerente antes de agregar', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(body, /IF v_company_id IS NULL THEN/)
  assert.match(body, /IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN/)
})

test('CTE "scoped" filtra explicitamente por company_id (isolamento multitenant, função roda com bypass de RLS)', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(body, /WITH scoped AS \(\s*\n\s*SELECT \*\s+FROM public\.bi_tickets_unified\s+WHERE company_id = v_company_id/)
})

test('MTTR reaproveita tickets.mttr_minutes (já persistido em minutos úteis por tg_persist_bi_sla_minutes), não recalcula business-hours na mão', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(body, /avg\(mttr_minutes\) FILTER \(WHERE resolved_at::date BETWEEN p_start_date AND p_end_date\)/)
  assert.match(body, /percentile_cont\(0\.5\) WITHIN GROUP \(ORDER BY mttr_minutes\)/)
  assert.doesNotMatch(body, /sla_business_minutes_between/)
})

test('taxa de conformidade de SLA usa is_resolution_breached, dividido só sobre os resolvidos no período (NULLIF evita divisão por zero)', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(body, /NOT COALESCE\(is_resolution_breached, false\)/)
  assert.match(body, /NULLIF\(count\(\*\) FILTER \(WHERE resolved_at::date BETWEEN p_start_date AND p_end_date\), 0\)/)
})

test('by_status v2 representa somente o estoque no fechamento e não duplica aprovação com state', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(body, /'by_status', COALESCE/)
  assert.doesNotMatch(body, /Pending Approval/)
})

test('v2 compara período anterior e retorna backlog, criticidade, aging e prioridade', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  for (const key of ['previous_total_opened', 'backlog_at_end', 'critical_backlog', 'aging_buckets', 'by_priority']) {
    assert.match(body, new RegExp(`'${key}'`))
  }
})

test('mediana do MTTR converte percentile_cont para numeric antes do round com precisão', () => {
  const body = fnBody('get_executive_metrics(p_start_date date, p_end_date date)')
  assert.match(
    body,
    /round\s*\(\s*\(\s*percentile_cont\s*\(\s*0\.5\s*\)[\s\S]*?\)\s*::numeric\s*,\s*1\s*\)\s+AS\s+mttr_median/i,
  )
})

test('drill-down preserva medidas temporais e filtra a população usada pelo MTTR', () => {
  assert.match(sql, /p_measure_key text DEFAULT NULL/)
  assert.match(sql, /p_measure_key IN \('mttr_avg', 'mttr_median'\) THEN v_measure_filter := 'mttr_minutes IS NOT NULL'/)
  assert.match(sql, /resolved_at timestamptz, mttr_minutes integer, mtta_minutes integer/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.bi_drilldown\([\s\S]*?text\) TO authenticated/)
})

test('índice de suporte para resolved_at é aditivo (parcial, IF NOT EXISTS) — não altera nenhuma estrutura existente', () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_tickets_company_resolved\s+ON public\.tickets \(company_id, resolved_at\)\s+WHERE resolved_at IS NOT NULL/)
})

test('achado corrigido nesta fase: tg_create_csat_on_resolution agora preenche company_id/link em notifications (NOT NULL desde a Fase 16, bloqueava toda resolução de ticket)', () => {
  const body = fnBody('tg_create_csat_on_resolution()')
  assert.match(body, /INSERT INTO public\.notifications\s*\n\s*\(company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link\)/)
  assert.match(body, /VALUES\s*\n\s*\(NEW\.company_id, NEW\.caller_id,/)
})

test('função revogada de anon/public, concedida a authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_executive_metrics\(date, date\) FROM public, anon/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_executive_metrics\(date, date\) TO authenticated/)
})

test('Contrato de analytics executivo participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /executive-analytics-contract\.test\.mjs/)
})
