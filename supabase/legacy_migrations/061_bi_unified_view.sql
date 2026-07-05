-- ============================================================
-- Flowfy ITSM — Migration 061
-- Flowfy BI v2 (1/4): VIEW UNIFICADA de tickets.
--
-- Normaliza incidents (incidentes + solicitações), problems e
-- changes num esquema comum para o motor analítico (bi_cube).
-- A view roda com security_invoker: a RLS das tabelas base
-- (incidents/problems/changes) continua valendo para quem consulta.
--
-- Entrega:
--   1. bi_normalize_state(text)  — mapeia os 3 vocabulários de
--      estado para grupos canônicos.
--   2. bi_aging_bucket(...)      — bucket de envelhecimento.
--   3. VIEW bi_tickets_unified   — fato unificado com métricas de
--      tempo em minutos ÚTEIS (calendário do tenant, migration 032).
--   4. Índice composto (company_id, created_at) em incidents.
--
-- TODO (fase 3 / escala): se EXPLAIN ANALYZE do bi_cube passar de
-- ~2s em tenant grande, materializar mtta_minutes/mttr_minutes como
-- colunas físicas em incidents preenchidas por trigger no
-- responded_at/resolved_at, e trocar as expressões da view.
-- ============================================================

-- ─── 1. Normalização de estado ───────────────────────────────
-- Grupos canônicos: open | in_progress | pending | resolved | closed | cancelled
CREATE OR REPLACE FUNCTION public.bi_normalize_state(p_state TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_state
    -- incidents / requests (IncidentState)
    WHEN 'New'                    THEN 'open'
    WHEN 'In Progress'            THEN 'in_progress'
    WHEN 'On Hold'                THEN 'pending'
    WHEN 'Pending User'           THEN 'pending'
    WHEN 'Resolved'               THEN 'resolved'
    WHEN 'Closed'                 THEN 'closed'
    -- problems (ProblemState; New/Resolved/Closed já cobertos)
    WHEN 'Under Investigation'    THEN 'in_progress'
    WHEN 'Root Cause Identified'  THEN 'in_progress'
    WHEN 'Known Error'            THEN 'pending'
    -- changes (ChangeState)
    WHEN 'Draft'                  THEN 'open'
    WHEN 'Awaiting CAB Approval'  THEN 'pending'
    WHEN 'CAB Approved'           THEN 'in_progress'
    WHEN 'CAB Rejected'           THEN 'cancelled'
    WHEN 'Scheduled'              THEN 'in_progress'
    WHEN 'In Implementation'      THEN 'in_progress'
    WHEN 'Completed'              THEN 'closed'
    WHEN 'Failed'                 THEN 'closed'
    WHEN 'Cancelled'              THEN 'cancelled'
    ELSE 'open'
  END;
$$;

COMMENT ON FUNCTION public.bi_normalize_state(TEXT) IS
  'Mapeia estados de incidents/problems/changes para grupos canônicos do BI (open|in_progress|pending|resolved|closed|cancelled).';

-- ─── 2. Bucket de envelhecimento ─────────────────────────────
-- Para tickets fechados usa created→resolved/closed; para abertos usa created→now().
CREATE OR REPLACE FUNCTION public.bi_aging_bucket(
  p_created  TIMESTAMPTZ,
  p_resolved TIMESTAMPTZ,
  p_closed   TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_created IS NULL THEN NULL
    ELSE (
      SELECT CASE
        WHEN d < 1  THEN '0-1d'
        WHEN d < 3  THEN '1-3d'
        WHEN d < 7  THEN '3-7d'
        WHEN d < 15 THEN '7-15d'
        WHEN d < 30 THEN '15-30d'
        ELSE '30d+'
      END
      FROM (SELECT EXTRACT(EPOCH FROM (COALESCE(p_resolved, p_closed, now()) - p_created)) / 86400 AS d) t
    )
  END;
$$;

COMMENT ON FUNCTION public.bi_aging_bucket(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Bucket de envelhecimento do ticket (0-1d, 1-3d, 3-7d, 7-15d, 15-30d, 30d+).';

-- ─── 3. Índice para o padrão de acesso do cubo ───────────────
CREATE INDEX IF NOT EXISTS idx_incidents_company_created
  ON public.incidents(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_problems_company_created
  ON public.problems(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_changes_company_created
  ON public.changes(company_id, created_at);

-- ─── 4. View unificada ───────────────────────────────────────
DROP VIEW IF EXISTS public.bi_tickets_unified;

CREATE VIEW public.bi_tickets_unified
WITH (security_invoker = on) AS

-- ── Incidentes + Solicitações (tabela incidents) ─────────────
SELECT
  i.id,
  i.company_id,
  CASE WHEN i.ticket_type = 'request' THEN 'request' ELSE 'incident' END AS record_type,
  i.number,
  i.short_description,
  i.state::text                                   AS state,
  public.bi_normalize_state(i.state::text)        AS state_group,
  i.priority::text                                AS priority,
  i.priority_level,
  i.impact::text                                  AS impact,
  i.urgency::text                                 AS urgency,
  i.category::text                                AS category,
  i.caller_id,
  i.caller_name,
  i.assigned_to_id,
  i.assigned_to_name,
  i.assignment_group_id                           AS group_id,
  COALESCE(ag.name, i.assigned_group_name)        AS group_name,
  dep.id                                          AS department_id,
  dep.name                                        AS department_name,
  cs.id                                           AS service_id,
  cs.name                                         AS service_name,
  cc.name                                         AS service_category_name,
  ss.name                                         AS symptom_name,
  ri.name                                         AS request_item_name,
  i.opened_via::text                              AS opened_via,
  i.close_code,
  i.tags,
  i.form_data,
  -- change-only (NULL aqui)
  NULL::text                                      AS change_type,
  NULL::text                                      AS risk,
  NULL::timestamptz                               AS change_window_start,
  NULL::timestamptz                               AS change_window_end,
  NULL::boolean                                   AS known_error,
  NULL::boolean                                   AS has_root_cause,
  -- datas
  i.created_at,
  i.responded_at,
  i.resolved_at,
  i.closed_at,
  i.updated_at,
  -- SLA
  i.sla_breached,
  i.is_response_breached,
  i.is_resolution_breached,
  COALESCE(i.accumulated_paused_time_minutes, 0)  AS paused_minutes,
  COALESCE(i.accumulated_reopen_time_minutes, 0)  AS reopen_minutes,
  -- Tempos em minutos ÚTEIS (calendário padrão do tenant), líquidos de pausa
  CASE WHEN i.responded_at IS NOT NULL THEN
    GREATEST(0, public.sla_business_minutes_between(co.default_sla_calendar_id, i.created_at, i.responded_at))
  END                                             AS mtta_minutes,
  CASE WHEN i.resolved_at IS NOT NULL THEN
    GREATEST(0, public.sla_business_minutes_between(co.default_sla_calendar_id, i.created_at, i.resolved_at)
      - COALESCE(i.accumulated_paused_time_minutes, 0))
  END                                             AS mttr_minutes,
  CASE WHEN i.resolved_at IS NULL AND i.closed_at IS NULL THEN
    public.sla_business_minutes_between(co.default_sla_calendar_id, i.created_at, now())
  END                                             AS age_minutes,
  public.bi_aging_bucket(i.created_at, i.resolved_at, i.closed_at) AS aging_bucket,
  (i.resolved_at IS NULL AND i.closed_at IS NULL) AS is_open,
  (COALESCE(i.accumulated_reopen_time_minutes, 0) > 0) AS was_reopened
FROM public.incidents i
JOIN public.companies co               ON co.id  = i.company_id
LEFT JOIN public.assignment_groups ag  ON ag.id  = i.assignment_group_id
LEFT JOIN public.catalog_services cs   ON cs.id  = i.catalog_service_id
LEFT JOIN public.catalog_categories cc ON cc.id  = cs.category_id
LEFT JOIN public.system_symptoms ss    ON ss.id  = i.symptom_id
LEFT JOIN public.request_items ri      ON ri.id  = i.request_item_id
LEFT JOIN public.request_categories rc ON rc.id  = ri.request_category_id
-- Departamento: via catálogo de incidente OU via catálogo de requisição
LEFT JOIN public.departments dep       ON dep.id = COALESCE(cc.department_id, rc.department_id)

UNION ALL

-- ── Problemas ────────────────────────────────────────────────
SELECT
  p.id,
  p.company_id,
  'problem'                                       AS record_type,
  p.number,
  p.short_description,
  p.state::text,
  public.bi_normalize_state(p.state::text),
  p.priority::text,
  NULL::int                                       AS priority_level,
  NULL::text                                      AS impact,
  NULL::text                                      AS urgency,
  p.category::text,
  NULL::uuid                                      AS caller_id,
  NULL::text                                      AS caller_name,
  p.assigned_to_id,
  p.assigned_to_name,
  p.assigned_group_id                             AS group_id,
  COALESCE(ag.name, p.assigned_group_name)        AS group_name,
  NULL::uuid                                      AS department_id,
  NULL::text                                      AS department_name,
  NULL::uuid                                      AS service_id,
  NULL::text                                      AS service_name,
  NULL::text                                      AS service_category_name,
  NULL::text                                      AS symptom_name,
  NULL::text                                      AS request_item_name,
  NULL::text                                      AS opened_via,
  NULL::text                                      AS close_code,
  NULL::text[]                                    AS tags,
  NULL::jsonb                                     AS form_data,
  NULL::text                                      AS change_type,
  NULL::text                                      AS risk,
  NULL::timestamptz                               AS change_window_start,
  NULL::timestamptz                               AS change_window_end,
  p.known_error,
  (p.root_cause IS NOT NULL AND btrim(p.root_cause) <> '') AS has_root_cause,
  p.created_at,
  NULL::timestamptz                               AS responded_at,
  p.resolved_at,
  NULL::timestamptz                               AS closed_at,
  p.updated_at,
  NULL::boolean                                   AS sla_breached,
  NULL::boolean                                   AS is_response_breached,
  NULL::boolean                                   AS is_resolution_breached,
  0                                               AS paused_minutes,
  0                                               AS reopen_minutes,
  NULL::int                                       AS mtta_minutes,
  CASE WHEN p.resolved_at IS NOT NULL THEN
    GREATEST(0, public.sla_business_minutes_between(co.default_sla_calendar_id, p.created_at, p.resolved_at))
  END                                             AS mttr_minutes,
  CASE WHEN p.resolved_at IS NULL THEN
    public.sla_business_minutes_between(co.default_sla_calendar_id, p.created_at, now())
  END                                             AS age_minutes,
  public.bi_aging_bucket(p.created_at, p.resolved_at, NULL),
  (p.resolved_at IS NULL AND p.state::text NOT IN ('Resolved', 'Closed')) AS is_open,
  false                                           AS was_reopened
FROM public.problems p
JOIN public.companies co              ON co.id = p.company_id
LEFT JOIN public.assignment_groups ag ON ag.id = p.assigned_group_id

UNION ALL

-- ── Mudanças ─────────────────────────────────────────────────
SELECT
  c.id,
  c.company_id,
  'change'                                        AS record_type,
  c.number,
  c.short_description,
  c.state::text,
  public.bi_normalize_state(c.state::text),
  c.risk::text                                    AS priority,   -- proxy de criticidade
  NULL::int, NULL::text, NULL::text,
  NULL::text                                      AS category,
  c.requested_by_id                               AS caller_id,
  c.requested_by_name                             AS caller_name,
  c.implementer_id                                AS assigned_to_id,
  c.implementer_name                              AS assigned_to_name,
  NULL::uuid                                      AS group_id,
  NULL::text                                      AS group_name,
  NULL::uuid, NULL::text,                         -- department
  NULL::uuid, NULL::text, NULL::text,             -- service
  NULL::text, NULL::text,                         -- symptom / request_item
  NULL::text                                      AS opened_via,
  NULL::text                                      AS close_code,
  NULL::text[]                                    AS tags,
  NULL::jsonb                                     AS form_data,
  c.type::text                                    AS change_type,
  c.risk::text                                    AS risk,
  c.change_window_start,
  c.change_window_end,
  NULL::boolean                                   AS known_error,
  NULL::boolean                                   AS has_root_cause,
  c.created_at,
  NULL::timestamptz                               AS responded_at,
  c.completed_at                                  AS resolved_at,
  NULL::timestamptz                               AS closed_at,
  c.updated_at,
  NULL::boolean, NULL::boolean, NULL::boolean,    -- flags SLA
  0, 0,                                           -- paused/reopen
  NULL::int                                       AS mtta_minutes,
  CASE WHEN c.completed_at IS NOT NULL THEN
    GREATEST(0, public.sla_business_minutes_between(co.default_sla_calendar_id, c.created_at, c.completed_at))
  END                                             AS mttr_minutes,
  CASE WHEN c.completed_at IS NULL
        AND c.state::text NOT IN ('Completed', 'Failed', 'Cancelled', 'CAB Rejected') THEN
    public.sla_business_minutes_between(co.default_sla_calendar_id, c.created_at, now())
  END                                             AS age_minutes,
  public.bi_aging_bucket(c.created_at, c.completed_at, NULL),
  (c.completed_at IS NULL
    AND c.state::text NOT IN ('Completed', 'Failed', 'Cancelled', 'CAB Rejected')) AS is_open,
  false                                           AS was_reopened
FROM public.changes c
JOIN public.companies co ON co.id = c.company_id;

COMMENT ON VIEW public.bi_tickets_unified IS
  'Fato unificado do Flowfy BI: incidents + requests + problems + changes num esquema comum, com tempos em minutos úteis. security_invoker: herda a RLS das tabelas base.';

GRANT SELECT ON public.bi_tickets_unified TO authenticated;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT record_type, count(*) FROM public.bi_tickets_unified GROUP BY 1;
--   SELECT state, state_group FROM public.bi_tickets_unified GROUP BY 1,2 ORDER BY 2;
--   SELECT number, mtta_minutes, mttr_minutes, aging_bucket
--     FROM public.bi_tickets_unified WHERE resolved_at IS NOT NULL LIMIT 10;
-- ────────────────────────────────────────────────────────────
