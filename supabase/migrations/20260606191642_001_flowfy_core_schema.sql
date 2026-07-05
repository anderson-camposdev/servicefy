-- ============================================================
-- FLOWFY ITSM — Core Database Schema
-- ITIL v4 | Multi-Tenant | RBAC | Workflow Engine
-- Migration: 001_flowfy_core_schema
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Full-text search

-- ─── ENUMS ─────────────────────────────────────────────────────

CREATE TYPE ticket_priority AS ENUM ('P1 - Critical','P2 - High','P3 - Moderate','P4 - Low');
CREATE TYPE user_role AS ENUM ('sysadmin','company_admin','agent','end_user');
CREATE TYPE sso_provider_type AS ENUM ('microsoft','google','active_directory');

-- Incident
CREATE TYPE incident_state AS ENUM ('New','In Progress','On Hold','Pending User','Resolved','Closed');
CREATE TYPE incident_category AS ENUM ('Hardware','Software','Network','Database','Security','Inquiry','Other');

-- Service Request
CREATE TYPE request_state AS ENUM ('Draft','Awaiting Approval','Approved','In Fulfillment','Fulfilled','Rejected','Cancelled');

-- Problem
CREATE TYPE problem_state AS ENUM ('New','Under Investigation','Root Cause Identified','Known Error','Resolved','Closed');

-- Change
CREATE TYPE change_type AS ENUM ('Standard','Normal','Emergency');
CREATE TYPE change_risk AS ENUM ('Low','Medium','High','Critical');
CREATE TYPE change_state AS ENUM ('Draft','Awaiting CAB Approval','CAB Approved','CAB Rejected','Scheduled','In Implementation','Completed','Failed','Cancelled');

-- ─── COMPANIES (Multi-Tenant) ───────────────────────────────────

CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  domain          TEXT NOT NULL UNIQUE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Branding
  logo_url        TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#059669',
  accent_color    TEXT NOT NULL DEFAULT '#10B981',
  bg_color        TEXT NOT NULL DEFAULT '#ECFDF5',
  welcome_title   TEXT NOT NULL DEFAULT 'Central de Serviços',
  welcome_subtitle TEXT NOT NULL DEFAULT 'Sua solicitação é nossa prioridade.',
  -- Auth config (JSON blob for SSO providers array)
  allow_local_login BOOLEAN NOT NULL DEFAULT TRUE,
  sso_providers   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── GROUPS ────────────────────────────────────────────────────

CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USERS ─────────────────────────────────────────────────────
-- Note: integrates with Supabase Auth (auth.users) via user_id FK

CREATE TABLE profiles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id     UUID UNIQUE,           -- links to auth.users.id (nullable for mock/seeded users)
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'end_user',
  department  TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profile_groups (
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, group_id)
);

-- ─── CATALOG (Service Request Catalog) ─────────────────────────

CREATE TABLE catalog_items (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  description             TEXT,
  category                TEXT NOT NULL,
  icon                    TEXT NOT NULL DEFAULT '📦',
  estimated_delivery_days INTEGER NOT NULL DEFAULT 3,
  cost                    NUMERIC(12,2),
  currency                TEXT DEFAULT 'BRL',
  requires_approval       BOOLEAN NOT NULL DEFAULT FALSE,
  visible_to_roles        user_role[] NOT NULL DEFAULT ARRAY['end_user','agent']::user_role[],
  form_fields             JSONB NOT NULL DEFAULT '[]'::jsonb,
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INCIDENTS ──────────────────────────────────────────────────

CREATE TABLE incidents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number              TEXT NOT NULL UNIQUE,   -- INC0010001
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  short_description   TEXT NOT NULL,
  description         TEXT,
  priority            ticket_priority NOT NULL DEFAULT 'P3 - Moderate',
  state               incident_state NOT NULL DEFAULT 'New',
  category            incident_category NOT NULL DEFAULT 'Software',
  -- People
  caller_id           UUID REFERENCES profiles(id),
  caller_name         TEXT NOT NULL,           -- denormalized for history
  assigned_to_id      UUID REFERENCES profiles(id),
  assigned_to_name    TEXT,
  assigned_group_id   UUID REFERENCES groups(id),
  assigned_group_name TEXT,
  -- SLA
  sla_breached        BOOLEAN NOT NULL DEFAULT FALSE,
  sla_deadline        TIMESTAMPTZ,
  -- Relations
  related_problem_id  UUID,                   -- forward ref to problems
  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ
);

-- Auto-generate incident number: INC + 7-digit zero-padded sequence
CREATE SEQUENCE incident_seq START 10001;
CREATE OR REPLACE FUNCTION set_incident_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'INC' || LPAD(nextval('incident_seq')::text, 7, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_incident_number
  BEFORE INSERT ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_incident_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_incidents_updated
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── INCIDENT WORKFLOW LOG ──────────────────────────────────────
-- Every state/priority/assignment change is recorded here

CREATE TABLE incident_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  changed_by_id   UUID REFERENCES profiles(id),
  changed_by_name TEXT NOT NULL,
  field_name      TEXT NOT NULL,   -- 'state', 'priority', 'assigned_to', etc.
  old_value       TEXT,
  new_value       TEXT,
  comment         TEXT,            -- optional note attached to the change
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SERVICE REQUESTS ───────────────────────────────────────────

CREATE TABLE service_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number            TEXT NOT NULL UNIQUE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  catalog_item_id   UUID REFERENCES catalog_items(id),
  catalog_item_name TEXT NOT NULL,
  requester_id      UUID REFERENCES profiles(id),
  requester_name    TEXT NOT NULL,
  approver_id       UUID REFERENCES profiles(id),
  approver_name     TEXT,
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  state             request_state NOT NULL DEFAULT 'Draft',
  priority          ticket_priority NOT NULL DEFAULT 'P3 - Moderate',
  form_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost              NUMERIC(12,2),
  currency          TEXT DEFAULT 'BRL',
  assigned_to_id    UUID REFERENCES profiles(id),
  assigned_to_name  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at      TIMESTAMPTZ
);

CREATE SEQUENCE request_seq START 10001;
CREATE OR REPLACE FUNCTION set_request_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'REQ' || LPAD(nextval('request_seq')::text, 7, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_request_number
  BEFORE INSERT ON service_requests
  FOR EACH ROW EXECUTE FUNCTION set_request_number();
CREATE TRIGGER trg_requests_updated
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE request_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id      UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  changed_by_id   UUID REFERENCES profiles(id),
  changed_by_name TEXT NOT NULL,
  field_name      TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  comment         TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROBLEMS ───────────────────────────────────────────────────

CREATE TABLE problems (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number              TEXT NOT NULL UNIQUE,
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  short_description   TEXT NOT NULL,
  description         TEXT,
  priority            ticket_priority NOT NULL DEFAULT 'P3 - Moderate',
  state               problem_state NOT NULL DEFAULT 'New',
  category            incident_category NOT NULL DEFAULT 'Software',
  root_cause          TEXT,
  workaround          TEXT,
  known_error         BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_to_id      UUID REFERENCES profiles(id),
  assigned_to_name    TEXT,
  assigned_group_id   UUID REFERENCES groups(id),
  assigned_group_name TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

CREATE SEQUENCE problem_seq START 10001;
CREATE OR REPLACE FUNCTION set_problem_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'PRB' || LPAD(nextval('problem_seq')::text, 7, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_problem_number
  BEFORE INSERT ON problems
  FOR EACH ROW EXECUTE FUNCTION set_problem_number();
CREATE TRIGGER trg_problems_updated
  BEFORE UPDATE ON problems
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Link table: which incidents are related to a problem
CREATE TABLE problem_incidents (
  problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, incident_id)
);

CREATE TABLE problem_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  problem_id      UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  changed_by_id   UUID REFERENCES profiles(id),
  changed_by_name TEXT NOT NULL,
  field_name      TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  comment         TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CHANGES ────────────────────────────────────────────────────

CREATE TABLE changes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number                TEXT NOT NULL UNIQUE,
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  short_description     TEXT NOT NULL,
  description           TEXT,
  justification         TEXT,
  type                  change_type NOT NULL DEFAULT 'Normal',
  risk                  change_risk NOT NULL DEFAULT 'Low',
  state                 change_state NOT NULL DEFAULT 'Draft',
  implementation_plan   TEXT,
  test_plan             TEXT,
  backout_plan          TEXT,
  change_window_start   TIMESTAMPTZ,
  change_window_end     TIMESTAMPTZ,
  requested_by_id       UUID REFERENCES profiles(id),
  requested_by_name     TEXT NOT NULL,
  implementer_id        UUID REFERENCES profiles(id),
  implementer_name      TEXT,
  related_problem_id    UUID REFERENCES problems(id),
  cab_approvers         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of profile UUIDs
  cab_approvals         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {profile_id: bool}
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE SEQUENCE change_seq START 10001;
CREATE OR REPLACE FUNCTION set_change_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'CHG' || LPAD(nextval('change_seq')::text, 7, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_change_number
  BEFORE INSERT ON changes
  FOR EACH ROW EXECUTE FUNCTION set_change_number();
CREATE TRIGGER trg_changes_updated
  BEFORE UPDATE ON changes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE change_incidents (
  change_id   UUID NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  PRIMARY KEY (change_id, incident_id)
);

CREATE TABLE change_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  change_id       UUID NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  changed_by_id   UUID REFERENCES profiles(id),
  changed_by_name TEXT NOT NULL,
  field_name      TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  comment         TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WORKFLOW AUTOMATION RULES ───────────────────────────────────
-- Defines automatic state transitions and SLA rules per company

CREATE TABLE workflow_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_type     TEXT NOT NULL CHECK (ticket_type IN ('incident','request','problem','change')),
  name            TEXT NOT NULL,
  description     TEXT,
  trigger_event   TEXT NOT NULL,   -- e.g. 'on_create', 'on_state_change', 'on_sla_breach'
  conditions      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- e.g. {"priority": "P1 - Critical"}
  actions         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- e.g. [{"type": "assign_group", "group_id": "..."}, {"type": "notify"}]
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  priority_order  INTEGER NOT NULL DEFAULT 100,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SLA POLICIES ────────────────────────────────────────────────

CREATE TABLE sla_policies (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_type         TEXT NOT NULL CHECK (ticket_type IN ('incident','request')),
  priority            ticket_priority NOT NULL,
  response_time_mins  INTEGER NOT NULL,   -- minutes to first response
  resolution_time_mins INTEGER NOT NULL,  -- minutes to resolution
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NOTIFICATIONS ───────────────────────────────────────────────

CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  message             TEXT NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('info','warning','success','error')),
  read                BOOLEAN NOT NULL DEFAULT FALSE,
  linked_ticket_id    UUID,
  linked_ticket_type  TEXT CHECK (linked_ticket_type IN ('incident','request','problem','change')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────

CREATE INDEX idx_incidents_company    ON incidents(company_id);
CREATE INDEX idx_incidents_state      ON incidents(state);
CREATE INDEX idx_incidents_priority   ON incidents(priority);
CREATE INDEX idx_incidents_caller     ON incidents(caller_id);
CREATE INDEX idx_incidents_assigned   ON incidents(assigned_to_id);
CREATE INDEX idx_incidents_updated    ON incidents(updated_at DESC);
CREATE INDEX idx_incidents_search     ON incidents USING gin(to_tsvector('portuguese', short_description || ' ' || COALESCE(description, '')));

CREATE INDEX idx_requests_company     ON service_requests(company_id);
CREATE INDEX idx_requests_state       ON service_requests(state);
CREATE INDEX idx_requests_requester   ON service_requests(requester_id);

CREATE INDEX idx_problems_company     ON problems(company_id);
CREATE INDEX idx_problems_state       ON problems(state);

CREATE INDEX idx_changes_company      ON changes(company_id);
CREATE INDEX idx_changes_state        ON changes(state);
CREATE INDEX idx_changes_type         ON changes(type);

CREATE INDEX idx_notifications_user   ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_incident_history     ON incident_history(incident_id, created_at DESC);
CREATE INDEX idx_profiles_company     ON profiles(company_id);
CREATE INDEX idx_profiles_email       ON profiles(email);

-- ─── ROW LEVEL SECURITY (RLS) ────────────────────────────────────
-- Enable RLS on all tables (policies will be added in migration 002)

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Temporary open policies for development (will be restricted in 002_rls_policies)
CREATE POLICY "dev_open" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON incidents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON incident_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON service_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON request_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON problems FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON problem_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON changes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON change_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON catalog_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON workflow_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON sla_policies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_open" ON notifications FOR ALL USING (true) WITH CHECK (true);;
