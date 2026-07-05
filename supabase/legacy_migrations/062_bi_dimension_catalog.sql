-- ============================================================
-- Flowfy ITSM — Migration 062
-- Flowfy BI v2 (2/4): CATÁLOGO de dimensões e medidas.
--
-- Estas tabelas são a WHITELIST do cubo (bi_cube, migration 063):
-- o cliente envia apenas a `key`; a expressão SQL (sql_expr) vive
-- aqui, seedada por migration — nada vindo do cliente vira
-- identificador SQL. Também servem de catálogo para a UI
-- (labels, tipos, a quais record_types cada campo se aplica).
--
-- form_data: as chaves do JSONB são o LABEL do campo (ver
-- buildLabeledFormData em src/lib/catalogFormFields.ts). A função
-- bi_form_dimensions() descobre os campos dimensionáveis do tenant
-- a partir de form_templates + form_fields dos catálogos.
-- ============================================================

-- ─── 1. Dimensões ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bi_dimensions (
  key          TEXT PRIMARY KEY,
  sql_expr     TEXT NOT NULL,
  label_pt     TEXT NOT NULL,
  record_types TEXT[] NOT NULL DEFAULT '{incident,request,problem,change}',
  data_type    TEXT NOT NULL DEFAULT 'text' CHECK (data_type IN ('text','date','number','boolean')),
  is_time_dim  BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 100
);

ALTER TABLE public.bi_dimensions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bi_dimensions TO authenticated;
DROP POLICY IF EXISTS select_bi_dimensions ON public.bi_dimensions;
CREATE POLICY select_bi_dimensions ON public.bi_dimensions
  FOR SELECT TO authenticated USING (true);
-- Escrita: apenas via migration (nenhuma policy de INSERT/UPDATE/DELETE).

-- ─── 2. Medidas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bi_measures (
  key        TEXT PRIMARY KEY,
  sql_expr   TEXT NOT NULL,
  label_pt   TEXT NOT NULL,
  format     TEXT NOT NULL DEFAULT 'number' CHECK (format IN ('number','minutes','percent')),
  sort_order INT NOT NULL DEFAULT 100
);

ALTER TABLE public.bi_measures ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bi_measures TO authenticated;
DROP POLICY IF EXISTS select_bi_measures ON public.bi_measures;
CREATE POLICY select_bi_measures ON public.bi_measures
  FOR SELECT TO authenticated USING (true);

-- ─── 3. Seed de dimensões ────────────────────────────────────
INSERT INTO public.bi_dimensions (key, sql_expr, label_pt, record_types, data_type, is_time_dim, sort_order) VALUES
  -- Identidade / classificação
  ('record_type',           'record_type',           'Tipo de Registro',        '{incident,request,problem,change}', 'text', false, 10),
  ('state',                 'state',                 'Status',                  '{incident,request,problem,change}', 'text', false, 20),
  ('state_group',           'state_group',           'Grupo de Status',         '{incident,request,problem,change}', 'text', false, 21),
  ('priority',              'priority',              'Prioridade',              '{incident,request,problem,change}', 'text', false, 30),
  ('impact',                'impact',                'Impacto',                 '{incident,request}',                'text', false, 31),
  ('urgency',               'urgency',               'Urgência',                '{incident,request}',                'text', false, 32),
  ('category',              'category',              'Categoria',               '{incident,request,problem}',        'text', false, 40),
  -- Pessoas / grupos
  ('group_name',            'group_name',            'Grupo Solucionador',      '{incident,request,problem}',        'text', false, 50),
  ('department_name',       'department_name',       'Departamento',            '{incident,request}',                'text', false, 51),
  ('assigned_to_name',      'assigned_to_name',      'Analista Responsável',    '{incident,request,problem,change}', 'text', false, 52),
  ('caller_name',           'caller_name',           'Solicitante',             '{incident,request,change}',         'text', false, 53),
  -- Catálogo
  ('service_category_name', 'service_category_name', 'Categoria de Serviço',    '{incident}',                        'text', false, 60),
  ('service_name',          'service_name',          'Serviço',                 '{incident}',                        'text', false, 61),
  ('symptom_name',          'symptom_name',          'Sintoma',                 '{incident}',                        'text', false, 62),
  ('request_item_name',     'request_item_name',     'Item de Requisição',      '{request}',                         'text', false, 63),
  -- Origem / encerramento
  ('opened_via',            'opened_via',            'Canal de Abertura',       '{incident,request}',                'text', false, 70),
  ('close_code',            'close_code',            'Código de Encerramento',  '{incident,request}',                'text', false, 71),
  -- SLA / envelhecimento
  ('sla_breached',          'COALESCE(sla_breached,false)::text',           'SLA Violado',          '{incident,request}', 'boolean', false, 80),
  ('is_response_breached',  'COALESCE(is_response_breached,false)::text',  'Resposta Violada',      '{incident,request}', 'boolean', false, 81),
  ('is_resolution_breached','COALESCE(is_resolution_breached,false)::text','Resolução Violada',     '{incident,request}', 'boolean', false, 82),
  ('aging_bucket',          'aging_bucket',          'Faixa de Envelhecimento', '{incident,request,problem,change}', 'text', false, 83),
  ('was_reopened',          'was_reopened::text',    'Foi Reaberto',            '{incident,request}',                'boolean', false, 84),
  -- Change / Problem específicas
  ('change_type',           'change_type',           'Tipo de Mudança',         '{change}',                          'text', false, 90),
  ('risk',                  'risk',                  'Risco',                   '{change}',                          'text', false, 91),
  ('known_error',           'known_error::text',     'Erro Conhecido',          '{problem}',                         'boolean', false, 92),
  ('has_root_cause',        'has_root_cause::text',  'Causa Raiz Registrada',   '{problem}',                         'boolean', false, 93),
  -- Tempo
  ('created_date',          'to_char(created_at, ''YYYY-MM-DD'')',          'Data de Criação',      '{incident,request,problem,change}', 'date', true, 200),
  ('created_week',          'to_char(date_trunc(''week'', created_at), ''YYYY-MM-DD'')', 'Semana de Criação', '{incident,request,problem,change}', 'date', true, 201),
  ('created_month',         'to_char(created_at, ''YYYY-MM'')',             'Mês de Criação',       '{incident,request,problem,change}', 'date', true, 202),
  ('resolved_date',         'to_char(resolved_at, ''YYYY-MM-DD'')',         'Data de Resolução',    '{incident,request,problem,change}', 'date', true, 203),
  ('resolved_month',        'to_char(resolved_at, ''YYYY-MM'')',            'Mês de Resolução',     '{incident,request,problem,change}', 'date', true, 204),
  ('created_weekday',       'to_char(created_at, ''ID'')',                  'Dia da Semana (1=Seg)','{incident,request,problem,change}', 'number', true, 205),
  ('created_hour',          'to_char(created_at, ''HH24'')',                'Hora de Criação',      '{incident,request,problem,change}', 'number', true, 206)
ON CONFLICT (key) DO UPDATE
  SET sql_expr = EXCLUDED.sql_expr,
      label_pt = EXCLUDED.label_pt,
      record_types = EXCLUDED.record_types,
      data_type = EXCLUDED.data_type,
      is_time_dim = EXCLUDED.is_time_dim,
      sort_order = EXCLUDED.sort_order;

-- ─── 4. Seed de medidas ──────────────────────────────────────
INSERT INTO public.bi_measures (key, sql_expr, label_pt, format, sort_order) VALUES
  ('count',              'count(*)',                                                             'Total de Registros',        'number',  10),
  ('backlog',            'count(*) FILTER (WHERE is_open)',                                      'Backlog (Abertos)',         'number',  20),
  ('resolved_count',     'count(*) FILTER (WHERE resolved_at IS NOT NULL)',                      'Resolvidos',                'number',  21),
  ('mtta_avg',           'round(avg(mtta_minutes))',                                             'MTTA Médio (min úteis)',    'minutes', 30),
  ('mtta_median',        'round(percentile_cont(0.5) WITHIN GROUP (ORDER BY mtta_minutes))',     'MTTA Mediano (min úteis)',  'minutes', 31),
  ('mttr_avg',           'round(avg(mttr_minutes))',                                             'MTTR Médio (min úteis)',    'minutes', 32),
  ('mttr_median',        'round(percentile_cont(0.5) WITHIN GROUP (ORDER BY mttr_minutes))',     'MTTR Mediano (min úteis)',  'minutes', 33),
  ('avg_age_minutes',    'round(avg(age_minutes))',                                              'Idade Média Abertos (min)', 'minutes', 34),
  ('sla_response_pct',
   'round(100.0 * count(*) FILTER (WHERE responded_at IS NOT NULL AND NOT COALESCE(is_response_breached,false)) / NULLIF(count(*) FILTER (WHERE responded_at IS NOT NULL), 0), 1)',
   '% SLA Resposta', 'percent', 40),
  ('sla_resolution_pct',
   'round(100.0 * count(*) FILTER (WHERE resolved_at IS NOT NULL AND NOT COALESCE(is_resolution_breached,false)) / NULLIF(count(*) FILTER (WHERE resolved_at IS NOT NULL), 0), 1)',
   '% SLA Resolução', 'percent', 41),
  ('breached_count',     'count(*) FILTER (WHERE COALESCE(sla_breached,false))',                 'SLAs Violados',             'number',  42),
  ('reopened_count',     'count(*) FILTER (WHERE was_reopened)',                                 'Reabertos',                 'number',  50),
  ('reopen_rate',
   'round(100.0 * count(*) FILTER (WHERE was_reopened) / NULLIF(count(*) FILTER (WHERE resolved_at IS NOT NULL), 0), 1)',
   '% Reabertura', 'percent', 51),
  ('avg_paused_minutes', 'round(avg(paused_minutes) FILTER (WHERE paused_minutes > 0))',         'Tempo Médio em Pausa (min)','minutes', 60)
ON CONFLICT (key) DO UPDATE
  SET sql_expr = EXCLUDED.sql_expr,
      label_pt = EXCLUDED.label_pt,
      format = EXCLUDED.format,
      sort_order = EXCLUDED.sort_order;

-- ─── 5. Dimensões dinâmicas de form_data ─────────────────────
-- Descobre os campos de formulário do tenant que podem virar dimensão.
-- Fontes: form_templates.fields, catalog_service_symptoms.form_fields,
-- request_items.form_fields (todos arrays JSONB de {id,label,type,options}).
-- A chave no incidents.form_data é o LABEL (trim) do campo.
CREATE OR REPLACE FUNCTION public.bi_form_dimensions(p_company_id UUID)
RETURNS TABLE (key TEXT, label TEXT, data_type TEXT, source TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH all_fields AS (
    SELECT f->>'label' AS label, f->>'type' AS ftype, 'form_template' AS source
      FROM public.form_templates t, jsonb_array_elements(t.fields) f
     WHERE t.tenant_id = p_company_id
       AND jsonb_typeof(t.fields) = 'array'
    UNION
    SELECT f->>'label', f->>'type', 'incident_catalog'
      FROM public.catalog_service_symptoms s, jsonb_array_elements(s.form_fields) f
     WHERE s.company_id = p_company_id
       AND jsonb_typeof(s.form_fields) = 'array'
    UNION
    SELECT f->>'label', f->>'type', 'request_catalog'
      FROM public.request_items r, jsonb_array_elements(r.form_fields) f
     WHERE r.company_id = p_company_id
       AND jsonb_typeof(r.form_fields) = 'array'
  )
  SELECT DISTINCT ON (btrim(label))
         'form.' || btrim(label)                          AS key,
         btrim(label)                                     AS label,
         CASE WHEN ftype IN ('number') THEN 'number'
              WHEN ftype IN ('date','datetime') THEN 'date'
              ELSE 'text' END                             AS data_type,
         source
    FROM all_fields
   WHERE label IS NOT NULL
     AND btrim(label) <> ''
     -- Dimensionáveis: escolha fechada, booleanos e curtos; textarea fica de fora
     AND ftype IN ('select', 'checkbox', 'text', 'number', 'date', 'datetime')
   ORDER BY btrim(label), source;
$$;

COMMENT ON FUNCTION public.bi_form_dimensions(UUID) IS
  'Catálogo de dimensões dinâmicas do tenant vindas dos formulários (form_data). key = form.<label>; no cubo vira form_data->>label (literal, nunca identificador).';

GRANT EXECUTE ON FUNCTION public.bi_form_dimensions(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT key, label_pt FROM public.bi_dimensions ORDER BY sort_order;
--   SELECT key, label_pt FROM public.bi_measures ORDER BY sort_order;
--   SELECT * FROM public.bi_form_dimensions('<company_id>');
-- ────────────────────────────────────────────────────────────
