-- ============================================================================
-- ServiceFY ITSM — Migration 096: Tickets Polymorphic Schema
-- ============================================================================

BEGIN;

-- ─── 0. DELETAR VIEWS DEPENDENTES TEMPORARIAMENTE ───────────────────────────
DROP VIEW IF EXISTS public.bi_tickets_unified CASCADE;


-- ─── 1. EXTENSÕES E TIPOS PRÉ-REQUISITOS ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE ticket_priority AS ENUM ('P1 - Critical', 'P2 - High', 'P3 - Moderate', 'P4 - Low');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_type_enum') THEN
    CREATE TYPE ticket_type_enum AS ENUM ('incident', 'request');
  END IF;
END $$;


-- ─── 2. RENOMEAR TABELA E AJUSTAR ESTRUTURA BASE ────────────────────────────
-- Renomeamos a tabela incidents para tickets para preservar FKs históricas de outras tabelas
ALTER TABLE public.incidents RENAME TO tickets;

-- Adiciona a coluna ticket_type
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ticket_type ticket_type_enum NOT NULL DEFAULT 'incident';


-- ─── 3. CRIAR TABELAS DE EXTENSÃO POLIMÓRFICAS (1:1) ────────────────────────
CREATE TABLE IF NOT EXISTS public.incident_attributes (
  ticket_id               UUID PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  category                TEXT NOT NULL DEFAULT 'Software',
  impact                  TEXT CHECK (impact IN ('Low', 'Medium', 'High', 'Critical')),
  urgency                 TEXT CHECK (urgency IN ('Low', 'Medium', 'High', 'Critical')),
  root_cause              TEXT,
  workaround              TEXT,
  is_major_incident       BOOLEAN NOT NULL DEFAULT FALSE,
  related_problem_id      UUID REFERENCES public.problems(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_request_attributes (
  ticket_id               UUID PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  request_item_id         UUID REFERENCES public.request_items(id) ON DELETE SET NULL,
  form_data               JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost                    NUMERIC(12,2),
  currency                TEXT DEFAULT 'BRL',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── 4. MIGRAÇÃO DE DADOS (BACKFILL) E ATUALIZAÇÃO DE TICKET_TYPE ──────────
-- 4.1 Identifica requisições com base em request_item_id
UPDATE public.tickets
   SET ticket_type = 'request'
 WHERE request_item_id IS NOT NULL;

-- 4.2 Move atributos de incidente para incident_attributes
INSERT INTO public.incident_attributes (
  ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id, created_at
)
SELECT 
  id, company_id, category::text, impact, urgency, NULL, NULL, false, related_problem_id, created_at
FROM public.tickets;

-- 4.3 Move atributos de requisição para service_request_attributes
INSERT INTO public.service_request_attributes (
  ticket_id, company_id, request_item_id, form_data, cost, currency, created_at
)
SELECT 
  id, company_id, request_item_id, COALESCE(form_data, '{}'::jsonb), NULL, 'BRL', created_at
FROM public.tickets
WHERE ticket_type = 'request';


-- ─── 5. REMOVER TRIGGERS QUE DEPENDEM DAS COLUNAS A SEREM REMOVIDAS ─────────
DROP TRIGGER IF EXISTS tg_calculate_ticket_sla ON public.tickets;
DROP TRIGGER IF EXISTS zz_sync_ticket_priority_label ON public.tickets;
DROP TRIGGER IF EXISTS trg_calculate_incident_priority ON public.tickets;


-- ─── 6. REMOVER COLUNAS LEGADAS DA TABELA BASE ──────────────────────────────
ALTER TABLE public.tickets DROP COLUMN IF EXISTS category;
ALTER TABLE public.tickets DROP COLUMN IF EXISTS impact;
ALTER TABLE public.tickets DROP COLUMN IF EXISTS urgency;
ALTER TABLE public.tickets DROP COLUMN IF EXISTS related_problem_id;
ALTER TABLE public.tickets DROP COLUMN IF EXISTS request_item_id;
ALTER TABLE public.tickets DROP COLUMN IF EXISTS form_data;


-- ─── 7. CRIAR INDICES DE DESEMPENHO MULTITENANT ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_multitenant_listing
  ON public.tickets (company_id, ticket_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_assignment
  ON public.tickets (company_id, assigned_to_id, assigned_group_id) 
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_incident_attr_company ON public.incident_attributes (company_id);
CREATE INDEX IF NOT EXISTS idx_request_attr_company ON public.service_request_attributes (company_id);


-- ─── 8. AJUSTAR FUNÇÃO E TRIGGER DE NÚMERO DE TICKET (INC/REQ PREFIX) ───────
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_prefix text := 'INC';
BEGIN
  IF NEW.ticket_type = 'request' THEN
    v_prefix := 'REQ';
  END IF;
  
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := v_prefix || LPAD(nextval('public.incident_seq')::text, 7, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_number ON public.tickets;
DROP TRIGGER IF EXISTS trg_ticket_number ON public.tickets;

CREATE TRIGGER trg_ticket_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();


-- ─── 9. ATUALIZAR FUNÇÕES E GATILHOS DE PRIORIDADE E SLA ────────────────────
-- 9.1 Função de sincronização de prioridade na tabela incident_attributes
CREATE OR REPLACE FUNCTION public.tg_sync_ticket_priority()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- Dispara atualização no ticket base para forçar recálculo de SLA e prioridade
  UPDATE public.tickets
     SET updated_at = clock_timestamp()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ticket_priority ON public.incident_attributes;
CREATE TRIGGER trg_sync_ticket_priority
  AFTER INSERT OR UPDATE OF impact, urgency ON public.incident_attributes
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_ticket_priority();

-- 9.2 Função de sincronização de requisição na tabela service_request_attributes
CREATE OR REPLACE FUNCTION public.tg_sync_request_ticket()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.tickets
     SET updated_at = clock_timestamp()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_request_ticket ON public.service_request_attributes;
CREATE TRIGGER trg_sync_request_ticket
  AFTER INSERT OR UPDATE OF request_item_id ON public.service_request_attributes
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_request_ticket();


-- ─── 9.3 REESCREVER tg_calculate_ticket_sla LENDO AS EXTENSÕES ──────────────
CREATE OR REPLACE FUNCTION public.tg_calculate_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_impact         TEXT;
  v_urgency        TEXT;
  v_req_item       UUID;
  v_level          INT;
  v_fixed          INT;
  v_calendar       UUID;
  v_resp_mins      INT;
  v_resol_mins     INT;
  v_anchor         TIMESTAMPTZ;
  v_assignee_scope TEXT;
BEGIN
  -- Query polymorphic attributes
  IF NEW.ticket_type = 'incident' THEN
    SELECT impact, urgency INTO v_impact, v_urgency
      FROM public.incident_attributes
     WHERE ticket_id = NEW.id;
  ELSIF NEW.ticket_type = 'request' THEN
    SELECT request_item_id INTO v_req_item
      FROM public.service_request_attributes
     WHERE ticket_id = NEW.id;
  END IF;

  -- (a) Override do nó-final do catálogo (prioridade fixa + calendário).
  IF NEW.symptom_id IS NOT NULL THEN
    SELECT css.fixed_priority, css.sla_calendar_id
      INTO v_fixed, v_calendar
      FROM public.catalog_service_symptoms css
     WHERE css.company_id = NEW.company_id
       AND css.symptom_id = NEW.symptom_id
       AND (NEW.catalog_service_id IS NULL OR css.service_id = NEW.catalog_service_id)
     ORDER BY (css.service_id = NEW.catalog_service_id) DESC NULLS LAST
     LIMIT 1;
  ELSIF v_req_item IS NOT NULL THEN
    SELECT fixed_priority, sla_calendar_id
      INTO v_fixed, v_calendar
      FROM public.request_items
     WHERE id = v_req_item;
  END IF;

  -- (b) Prioridade resultante: fixa OU cruzamento da matriz.
  IF v_fixed IS NOT NULL THEN
    v_level := v_fixed;
  ELSE
    v_impact  := lower(COALESCE(v_impact,  'Medium'));
    v_urgency := lower(COALESCE(v_urgency, 'Medium'));
    IF v_urgency = 'critical' THEN v_urgency := 'high'; END IF;

    SELECT resulting_priority INTO v_level
      FROM public.sla_priority_matrix
     WHERE impact = v_impact AND urgency = v_urgency
     LIMIT 1;
    v_level := COALESCE(v_level, 3);
  END IF;
  NEW.priority_level := v_level;

  -- (c) Calendário: override do item → padrão da empresa.
  IF v_calendar IS NULL THEN
    SELECT default_sla_calendar_id INTO v_calendar
      FROM public.companies WHERE id = NEW.company_id;
  END IF;

  -- (d) Responsabilidade atual:
  IF NEW.assigned_to_id IS NOT NULL THEN
    SELECT profile_role INTO v_assignee_scope
      FROM public.profiles WHERE id = NEW.assigned_to_id;
  END IF;
  NEW.sla_managed_by_client := COALESCE(v_assignee_scope = 'client_analyst', false);

  -- (e) Métricas da política de SLA do tenant.
  SELECT response_time_minutes, resolution_time_minutes
    INTO v_resp_mins, v_resol_mins
    FROM public.sla_policies
   WHERE company_id = NEW.company_id
     AND priority = v_level
     AND active = true
   LIMIT 1;

  -- (f) Ticket sob gestão do CLIENTE: congela o relógio.
  IF NEW.sla_managed_by_client THEN
    RETURN NEW;
  END IF;

  -- (g) Projeta os prazos consumindo minutos ÚTEIS.
  v_anchor := COALESCE(NEW.created_at, now());
  IF v_resp_mins IS NOT NULL THEN
    NEW.sla_response_deadline   := public.sla_add_business_minutes(v_calendar, v_anchor, v_resp_mins);
  END IF;
  IF v_resol_mins IS NOT NULL THEN
    NEW.sla_resolution_deadline := public.sla_add_business_minutes(v_calendar, v_anchor, v_resol_mins);
  END IF;

  RETURN NEW;
END;
$$;

-- Criar o trigger de SLA cálculo na tabela tickets
CREATE TRIGGER tg_calculate_ticket_sla
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_calculate_ticket_sla();

-- 9.4 Recriar o trigger de Rótulo de Prioridade
CREATE TRIGGER zz_sync_ticket_priority_label
  BEFORE INSERT OR UPDATE OF priority_level, symptom_id
  ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ticket_priority_label();


-- ─── 10. RECONSTRUIR GATILHOS DE SEGURANÇA E SLA NA TABELA TICKETS ──────────
-- Redefine o trigger de SLA Events on Update
DROP TRIGGER IF EXISTS tg_sla_events_on_update ON public.tickets;
CREATE TRIGGER tg_sla_events_on_update
  AFTER UPDATE OF state, responded_at, resolved_at ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sla_events_on_update();

-- Redefine o trigger de SLA Pause on Update
DROP TRIGGER IF EXISTS tg_handle_sla_pause ON public.tickets;
CREATE TRIGGER tg_handle_sla_pause
  BEFORE UPDATE OF state, pending_reason_id ON public.tickets
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state OR OLD.pending_reason_id IS DISTINCT FROM NEW.pending_reason_id)
  EXECUTE FUNCTION public.tg_handle_sla_pause();

-- Redefine o trigger de First Response on Update
DROP TRIGGER IF EXISTS tg_stamp_first_response ON public.tickets;
CREATE TRIGGER tg_stamp_first_response
  BEFORE UPDATE OF state ON public.tickets
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.tg_stamp_first_response();

-- Redefine o trigger de Triage on Insert
DROP TRIGGER IF EXISTS tg_triage_incident ON public.tickets;
CREATE TRIGGER tg_triage_incident
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_triage_incident();


-- ─── 11. AJUSTAR FUNÇÃO DE TICKET_MESSAGES PARA TICKETS ─────────────────────
CREATE OR REPLACE FUNCTION public.tg_ticket_message_stamps_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actor_type = 'analyst'
     AND NOT COALESCE(NEW.is_internal, false)
     AND NEW.incident_id IS NOT NULL THEN
    UPDATE public.tickets
       SET responded_at = clock_timestamp()
     WHERE id = NEW.incident_id
       AND responded_at IS NULL
       AND state::text NOT IN ('Resolved', 'Closed');
  END IF;
  RETURN NEW;
END;
$$;


-- ─── 12. HABILITAR E ATUALIZAR POLÍTICAS DE RLS ────────────────────────────
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_ticket_policy ON public.tickets;
CREATE POLICY select_ticket_policy ON public.tickets
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin());

DROP POLICY IF EXISTS insert_ticket_policy ON public.tickets;
CREATE POLICY insert_ticket_policy ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS update_ticket_policy ON public.tickets;
CREATE POLICY update_ticket_policy ON public.tickets
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin());

-- Políticas incident_attributes
DROP POLICY IF EXISTS select_incident_attr_policy ON public.incident_attributes;
CREATE POLICY select_incident_attr_policy ON public.incident_attributes
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin());

DROP POLICY IF EXISTS insert_incident_attr_policy ON public.incident_attributes;
CREATE POLICY insert_incident_attr_policy ON public.incident_attributes
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS update_incident_attr_policy ON public.incident_attributes;
CREATE POLICY update_incident_attr_policy ON public.incident_attributes
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin());

-- Políticas service_request_attributes
DROP POLICY IF EXISTS select_request_attr_policy ON public.service_request_attributes;
CREATE POLICY select_request_attr_policy ON public.service_request_attributes
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin());

DROP POLICY IF EXISTS insert_request_attr_policy ON public.service_request_attributes;
CREATE POLICY insert_request_attr_policy ON public.service_request_attributes
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS update_request_attr_policy ON public.service_request_attributes;
CREATE POLICY update_request_attr_policy ON public.service_request_attributes
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_user_company_id() OR public.is_current_user_msp_admin());


-- ─── 13. CRIAR VIEW RETROCOMPATÍVEL public.incidents (TOTALMENTE GRAVÁVEL) ─
CREATE OR REPLACE VIEW public.incidents AS
SELECT 
  t.*,
  ia.category,
  ia.impact,
  ia.urgency,
  ia.root_cause,
  ia.workaround,
  ia.is_major_incident,
  ia.related_problem_id,
  sra.request_item_id,
  sra.form_data,
  sra.cost,
  sra.currency
FROM public.tickets t
LEFT JOIN public.incident_attributes ia ON t.id = ia.ticket_id
LEFT JOIN public.service_request_attributes sra ON t.id = sra.ticket_id;

-- 13.1 Trigger de inserção na View
CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tickets (
    id, number, company_id, ticket_type, short_description, description,
    priority, state, caller_id, caller_name, assigned_to_id, assigned_to_name,
    assigned_group_id, assigned_group_name, sla_breached,
    sla_response_deadline, sla_resolution_deadline, responded_at, resolved_at, closed_at,
    created_at, updated_at, approval_status
  ) VALUES (
    COALESCE(NEW.id, uuid_generate_v4()), NEW.number, NEW.company_id, 
    COALESCE(NEW.ticket_type, 'incident')::ticket_type_enum, NEW.short_description, NEW.description,
    NEW.priority, NEW.state, NEW.caller_id, NEW.caller_name, NEW.assigned_to_id, NEW.assigned_to_name,
    NEW.assigned_group_id, NEW.assigned_group_name, NEW.sla_breached,
    NEW.sla_response_deadline, NEW.sla_resolution_deadline, NEW.responded_at, NEW.resolved_at, NEW.closed_at,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()), COALESCE(NEW.approval_status, 'not_required')
  ) RETURNING id INTO NEW.id;

  IF COALESCE(NEW.ticket_type, 'incident') = 'incident' THEN
    INSERT INTO public.incident_attributes (
      ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id
    ) VALUES (
      NEW.id, NEW.company_id, COALESCE(NEW.category, 'Software'), NEW.impact, NEW.urgency, NEW.root_cause, NEW.workaround, COALESCE(NEW.is_major_incident, false), NEW.related_problem_id
    );
  ELSIF NEW.ticket_type = 'request' THEN
    INSERT INTO public.service_request_attributes (
      ticket_id, company_id, request_item_id, form_data, cost, currency
    ) VALUES (
      NEW.id, NEW.company_id, NEW.request_item_id, COALESCE(NEW.form_data, '{}'::jsonb), NEW.cost, NEW.currency
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_incidents_view_insert ON public.incidents;
CREATE TRIGGER tg_incidents_view_insert
  INSTEAD OF INSERT ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_incidents_view_insert();

-- 13.2 Trigger de atualização na View
CREATE OR REPLACE FUNCTION public.tg_incidents_view_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tickets SET
    number = NEW.number,
    company_id = NEW.company_id,
    ticket_type = NEW.ticket_type::ticket_type_enum,
    short_description = NEW.short_description,
    description = NEW.description,
    priority = NEW.priority,
    state = NEW.state,
    caller_id = NEW.caller_id,
    caller_name = NEW.caller_name,
    assigned_to_id = NEW.assigned_to_id,
    assigned_to_name = NEW.assigned_to_name,
    assigned_group_id = NEW.assigned_group_id,
    assigned_group_name = NEW.assigned_group_name,
    sla_breached = NEW.sla_breached,
    sla_response_deadline = NEW.sla_response_deadline,
    sla_resolution_deadline = NEW.sla_resolution_deadline,
    responded_at = NEW.responded_at,
    resolved_at = NEW.resolved_at,
    closed_at = NEW.closed_at,
    updated_at = COALESCE(NEW.updated_at, NOW()),
    approval_status = NEW.approval_status
  WHERE id = OLD.id;

  IF NEW.ticket_type = 'incident' THEN
    INSERT INTO public.incident_attributes (
      ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id
    ) VALUES (
      OLD.id, NEW.company_id, COALESCE(NEW.category, 'Software'), NEW.impact, NEW.urgency, NEW.root_cause, NEW.workaround, COALESCE(NEW.is_major_incident, false), NEW.related_problem_id
    ) ON CONFLICT (ticket_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      category = EXCLUDED.category,
      impact = EXCLUDED.impact,
      urgency = EXCLUDED.urgency,
      root_cause = EXCLUDED.root_cause,
      workaround = EXCLUDED.workaround,
      is_major_incident = EXCLUDED.is_major_incident,
      related_problem_id = EXCLUDED.related_problem_id;
  ELSIF NEW.ticket_type = 'request' THEN
    INSERT INTO public.service_request_attributes (
      ticket_id, company_id, request_item_id, form_data, cost, currency
    ) VALUES (
      OLD.id, NEW.company_id, NEW.request_item_id, COALESCE(NEW.form_data, '{}'::jsonb), NEW.cost, NEW.currency
    ) ON CONFLICT (ticket_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      request_item_id = EXCLUDED.request_item_id,
      form_data = EXCLUDED.form_data,
      cost = EXCLUDED.cost,
      currency = EXCLUDED.currency;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_incidents_view_update ON public.incidents;
CREATE TRIGGER tg_incidents_view_update
  INSTEAD OF UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_incidents_view_update();

-- 13.3 Trigger de remoção na View
CREATE OR REPLACE FUNCTION public.tg_incidents_view_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.tickets WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_incidents_view_delete ON public.incidents;
CREATE TRIGGER tg_incidents_view_delete
  INSTEAD OF DELETE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_incidents_view_delete();


-- ─── 14. RECRIAR A VIEW DO BI public.bi_tickets_unified ────────────────────
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
  'Fato unificado do Flowfy BI: incidents + requests + problems + changes num esquema comum, com tempos em minutos úteis. security_invoker: herda a RLS das tabelas base.';

GRANT SELECT ON public.bi_tickets_unified TO authenticated;

COMMIT;
