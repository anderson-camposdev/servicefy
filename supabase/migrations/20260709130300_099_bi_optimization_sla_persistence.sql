-- ServiceFY BI Optimization — Migration 099: SLA Columns Persistence & View Optimization
-- Adiciona colunas físicas de SLA na tabela tickets, executa backfill de dados e reestrutura a view bi_tickets_unified.

BEGIN;

-- 1. ADICIONAR COLUNAS FÍSICAS DE SLA NA TABELA BASE TICKETS
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS mtta_minutes INT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS mttr_minutes INT;

-- 2. CRIAR FUNÇÃO E TRIGGER DE ATUALIZAÇÃO AUTOMÁTICA
CREATE OR REPLACE FUNCTION public.tg_persist_bi_sla_minutes()
RETURNS TRIGGER AS $$
DECLARE
  v_calendar UUID;
BEGIN
  -- Resolve o calendário padrão do SLA para a empresa
  SELECT default_sla_calendar_id INTO v_calendar
    FROM public.companies WHERE id = NEW.company_id;

  -- 1. MTTA (Tempo de resposta)
  IF NEW.responded_at IS NOT NULL THEN
    NEW.mtta_minutes := GREATEST(0, public.sla_business_minutes_between(v_calendar, NEW.created_at, NEW.responded_at));
  ELSE
    NEW.mtta_minutes := NULL;
  END IF;

  -- 2. MTTR (Tempo de resolução)
  IF NEW.resolved_at IS NOT NULL THEN
    NEW.mttr_minutes := GREATEST(0, public.sla_business_minutes_between(v_calendar, NEW.created_at, NEW.resolved_at) 
      - COALESCE(NEW.accumulated_paused_time_minutes, 0));
  ELSE
    NEW.mttr_minutes := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tg_persist_bi_sla_minutes ON public.tickets;
CREATE TRIGGER tg_persist_bi_sla_minutes
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_persist_bi_sla_minutes();

-- 3. EXECUTAR BACKFILL DOS TICKETS EXISTENTES
ALTER TABLE public.tickets DISABLE TRIGGER set_incident_priority_trigger;

UPDATE public.tickets t
   SET mtta_minutes = CASE WHEN t.responded_at IS NOT NULL THEN
         GREATEST(0, public.sla_business_minutes_between(co.default_sla_calendar_id, t.created_at, t.responded_at))
       END,
       mttr_minutes = CASE WHEN t.resolved_at IS NOT NULL THEN
         GREATEST(0, public.sla_business_minutes_between(co.default_sla_calendar_id, t.created_at, t.resolved_at)
           - COALESCE(t.accumulated_paused_time_minutes, 0))
       END
  FROM public.companies co
 WHERE co.id = t.company_id;

ALTER TABLE public.tickets ENABLE TRIGGER set_incident_priority_trigger;

-- 4. REFORMULAR A VIEW DE BI PUBLIC.BI_TICKETS_UNIFIED COM OS CAMPOS FÍSICOS
DROP VIEW IF EXISTS public.bi_tickets_unified CASCADE;

CREATE VIEW public.bi_tickets_unified
WITH (security_invoker = on) AS

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
  NULL::text                                      AS impact,
  NULL::text                                      AS urgency,
  NULL::text                                      AS category,
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
  NULL::jsonb                                     AS form_data,
  NULL::text                                      AS change_type,
  NULL::text                                      AS risk,
  NULL::timestamptz                               AS change_window_start,
  NULL::timestamptz                               AS change_window_end,
  NULL::boolean                                   AS known_error,
  NULL::boolean                                   AS has_root_cause,
  i.created_at,
  i.responded_at,
  i.resolved_at,
  i.closed_at,
  i.updated_at,
  i.sla_breached,
  i.is_response_breached,
  i.is_resolution_breached,
  COALESCE(i.accumulated_paused_time_minutes, 0)  AS paused_minutes,
  COALESCE(i.accumulated_reopen_time_minutes, 0)  AS reopen_minutes,
  i.mtta_minutes,
  i.mttr_minutes,
  CASE WHEN i.resolved_at IS NULL AND i.closed_at IS NULL THEN
    public.sla_business_minutes_between(co.default_sla_calendar_id, i.created_at, now())
  END                                             AS age_minutes,
  public.bi_aging_bucket(i.created_at, i.resolved_at, i.closed_at) AS aging_bucket,
  (i.resolved_at IS NULL AND i.closed_at IS NULL) AS is_open,
  (COALESCE(i.accumulated_reopen_time_minutes, 0) > 0) AS was_reopened
FROM public.tickets i
JOIN public.companies co               ON co.id  = i.company_id
LEFT JOIN public.assignment_groups ag  ON ag.id  = i.assignment_group_id
LEFT JOIN public.catalog_services cs   ON cs.id  = i.catalog_service_id
LEFT JOIN public.catalog_categories cc ON cc.id  = cs.category_id
LEFT JOIN public.system_symptoms ss    ON ss.id  = i.symptom_id
LEFT JOIN public.request_items ri      ON false
LEFT JOIN public.request_categories rc ON rc.id  = ri.request_category_id
LEFT JOIN public.departments dep       ON dep.id = COALESCE(cc.department_id, rc.department_id)

UNION ALL

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

SELECT
  c.id,
  c.company_id,
  'change'                                        AS record_type,
  c.number,
  c.short_description,
  c.state::text,
  public.bi_normalize_state(c.state::text),
  c.risk::text                                    AS priority,
  NULL::int, NULL::text, NULL::text,
  NULL::text                                      AS category,
  c.requested_by_id                               AS caller_id,
  c.requested_by_name                             AS caller_name,
  c.implementer_id                                AS assigned_to_id,
  c.implementer_name                              AS assigned_to_name,
  NULL::uuid                                      AS group_id,
  NULL::text                                      AS group_name,
  NULL::uuid, NULL::text,
  NULL::uuid, NULL::text, NULL::text,
  NULL::text, NULL::text,
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
  NULL::boolean, NULL::boolean, NULL::boolean,
  0, 0,
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
  'Fato unificado do Flowfy BI: tickets (incidents + requests) + problems + changes num esquema comum, com tempos de SLA de resposta/resolução lidos de colunas persistidas e outros em minutos úteis calculados. security_invoker: herda a RLS das tabelas base.';

GRANT SELECT ON public.bi_tickets_unified TO authenticated;

COMMIT;
