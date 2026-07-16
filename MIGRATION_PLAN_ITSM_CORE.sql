-- ============================================================================
-- ServiceFY ITSM — PLANO DE MIGRAÇÃO: MODELAGEM POLIMÓRFICA DE TICKETS
-- ============================================================================
-- Objetivo: Unificar a estrutura de chamados (Incidentes e Requisições) sob
-- uma tabela base comum (tickets) e tabelas de extensão com relacionamento 1:1,
-- resolvendo o acoplamento excessivo e a subutilização de service_requests.
--
-- Padrão Arquitetural: Class Table Inheritance / Polymorphic Table Extension
-- ============================================================================

BEGIN;

-- ─── 1. EXTENSÕES E TIPOS PRÉ-REQUISITOS ────────────────────────────────────
-- Garante que os enums necessários existam no schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE ticket_priority AS ENUM ('P1 - Critical', 'P2 - High', 'P3 - Moderate', 'P4 - Low');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_type_enum') THEN
    CREATE TYPE ticket_type_enum AS ENUM ('incident', 'request');
  END IF;
END $$;


-- ─── 2. TABELA BASE: tickets ────────────────────────────────────────────────
-- Concentra todos os atributos comuns de auditoria, SLA, pessoas e estado geral.
CREATE TABLE IF NOT EXISTS public.tickets (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number                  TEXT NOT NULL UNIQUE, -- Formato unificado: TKT0010001
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  ticket_type             ticket_type_enum NOT NULL,
  
  -- Informações Gerais
  short_description       TEXT NOT NULL,
  description             TEXT,
  priority                ticket_priority NOT NULL DEFAULT 'P3 - Moderate',
  state                   TEXT NOT NULL DEFAULT 'New', -- Estado unificado para ciclo de vida polimórfico
  
  -- Envolvidos
  caller_id               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  caller_name             TEXT NOT NULL,
  assigned_to_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to_name        TEXT,
  assigned_group_id       UUID REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  assigned_group_name     TEXT,
  
  -- Governança de SLA
  sla_breached            BOOLEAN NOT NULL DEFAULT FALSE,
  sla_response_deadline   TIMESTAMPTZ,
  sla_resolution_deadline TIMESTAMPTZ,
  responded_at            TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,
  
  -- Auditoria
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── 3. TABELA DE EXTENSÃO: incident_attributes ─────────────────────────────
-- Armazena atributos exclusivos do processo de Gerência de Incidentes.
CREATE TABLE IF NOT EXISTS public.incident_attributes (
  ticket_id               UUID PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  
  -- Metadados de Incidente
  category                TEXT NOT NULL DEFAULT 'Software',
  impact                  TEXT CHECK (impact IN ('Low', 'Medium', 'High', 'Critical')),
  urgency                 TEXT CHECK (urgency IN ('Low', 'Medium', 'High', 'Critical')),
  
  -- Diagnóstico de Causa Raiz (ITIL Problem Management)
  root_cause              TEXT,
  workaround              TEXT,
  is_major_incident       BOOLEAN NOT NULL DEFAULT FALSE,
  related_problem_id      UUID REFERENCES public.problems(id) ON DELETE SET NULL,
  
  -- Auditoria
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── 4. TABELA DE EXTENSÃO: service_request_attributes ──────────────────────
-- Armazena atributos exclusivos do processo de Requisição de Serviços.
CREATE TABLE IF NOT EXISTS public.service_request_attributes (
  ticket_id               UUID PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  
  -- Parâmetros do Catálogo
  request_item_id         UUID REFERENCES public.request_items(id) ON DELETE SET NULL,
  form_data               JSONB NOT NULL DEFAULT '{}'::jsonb, -- Respostas dinâmicas do formulário
  
  -- Financeiro
  cost                    NUMERIC(12,2),
  currency                TEXT DEFAULT 'BRL',
  
  -- Fluxo de Aprovadores
  approval_status         TEXT NOT NULL CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')) DEFAULT 'not_required',
  
  -- Auditoria
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── 5. ESTRATÉGIA DE INDEXAÇÃO MULTITENANT (PERFORMANCE) ───────────────────
-- Os índices são construídos compostos, sempre liderados por company_id para
-- garantir a filtragem eficiente da RLS antes do scan de registros.

-- Índice composto na tabela principal para listagens ordenadas por data
CREATE INDEX IF NOT EXISTS idx_tickets_multitenant_listing
  ON public.tickets (company_id, ticket_type, created_at DESC);

-- Índice composto para filas de atendimento de grupos e analistas
CREATE INDEX IF NOT EXISTS idx_tickets_assignment
  ON public.tickets (company_id, assigned_to_id, assigned_group_id) 
  WHERE resolved_at IS NULL;

-- Índice para busca textual (OmniSearch)
CREATE INDEX IF NOT EXISTS idx_tickets_search_trgm 
  ON public.tickets USING gin (short_description gin_trgm_ops);

-- Índices de chaves estrangeiras com company_id (cobertura RLS)
CREATE INDEX IF NOT EXISTS idx_incident_attr_company ON public.incident_attributes (company_id);
CREATE INDEX IF NOT EXISTS idx_request_attr_company ON public.service_request_attributes (company_id);


-- ─── 6. MECANISMO DE CRIAÇÃO AUTOMÁTICA DE NÚMERO (TICKET SEQUENCE) ──────────
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 10001;

CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'TKT' || LPAD(nextval('ticket_seq')::text, 7, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_ticket_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION set_ticket_number();


-- ─── 7. SEGURANÇA E ISOLAMENTO: ROW LEVEL SECURITY (RLS) ───────────────────
-- Habilita RLS em todas as novas tabelas estruturadas
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_attributes ENABLE ROW LEVEL SECURITY;

-- Políticas para a tabela principal: tickets
DROP POLICY IF EXISTS select_ticket_policy ON public.tickets;
CREATE POLICY select_ticket_policy ON public.tickets
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_user_company_id() 
    OR public.is_current_user_msp_admin()
  );

DROP POLICY IF EXISTS insert_ticket_policy ON public.tickets;
CREATE POLICY insert_ticket_policy ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_user_company_id()
  );

DROP POLICY IF EXISTS update_ticket_policy ON public.tickets;
CREATE POLICY update_ticket_policy ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_user_company_id() 
    OR public.is_current_user_msp_admin()
  );

-- Políticas para incident_attributes (herdam o controle de isolamento)
DROP POLICY IF EXISTS select_incident_attr_policy ON public.incident_attributes;
CREATE POLICY select_incident_attr_policy ON public.incident_attributes
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_user_company_id() 
    OR public.is_current_user_msp_admin()
  );

DROP POLICY IF EXISTS insert_incident_attr_policy ON public.incident_attributes;
CREATE POLICY insert_incident_attr_policy ON public.incident_attributes
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_user_company_id()
  );

DROP POLICY IF EXISTS update_incident_attr_policy ON public.incident_attributes;
CREATE POLICY update_incident_attr_policy ON public.incident_attributes
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_user_company_id() 
    OR public.is_current_user_msp_admin()
  );

-- Políticas para service_request_attributes
DROP POLICY IF EXISTS select_request_attr_policy ON public.service_request_attributes;
CREATE POLICY select_request_attr_policy ON public.service_request_attributes
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_user_company_id() 
    OR public.is_current_user_msp_admin()
  );

DROP POLICY IF EXISTS insert_request_attr_policy ON public.service_request_attributes;
CREATE POLICY insert_request_attr_policy ON public.service_request_attributes
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_user_company_id()
  );

DROP POLICY IF EXISTS update_request_attr_policy ON public.service_request_attributes;
CREATE POLICY update_request_attr_policy ON public.service_request_attributes
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_user_company_id() 
    OR public.is_current_user_msp_admin()
  );


-- ─── 8. ESTRATÉGIA DE MIGRAÇÃO DE DADOS EXISTENTES ──────────────────────────
-- Comentários técnicos demonstrando o script de backfill a ser executado
-- para carregar os dados de public.incidents históricos:
/*
-- 1. Backfill da tabela base 'tickets' a partir de 'incidents'
INSERT INTO public.tickets (
  id, number, company_id, ticket_type, short_description, description,
  priority, state, caller_id, caller_name, assigned_to_id, assigned_to_name,
  assigned_group_id, assigned_group_name, sla_breached,
  sla_response_deadline, sla_resolution_deadline, responded_at, resolved_at, closed_at,
  created_at, updated_at
)
SELECT 
  id, number, company_id, 
  COALESCE(ticket_type::text, 'incident')::ticket_type_enum AS ticket_type,
  short_description, description, priority, state::text, caller_id, caller_name,
  assigned_to_id, assigned_to_name, assigned_group_id, assigned_group_name,
  sla_breached, sla_response_deadline, sla_resolution_deadline, responded_at,
  resolved_at, closed_at, created_at, updated_at
FROM public.incidents;

-- 2. Backfill de atributos de incidentes
INSERT INTO public.incident_attributes (
  ticket_id, company_id, category, impact, urgency, related_problem_id, created_at
)
SELECT 
  id, company_id, category::text, impact, urgency, related_problem_id, created_at
FROM public.incidents
WHERE ticket_type = 'incident';

-- 3. Backfill de atributos de requisições
INSERT INTO public.service_request_attributes (
  ticket_id, company_id, request_item_id, created_at
)
SELECT 
  id, company_id, request_item_id, created_at
FROM public.incidents
WHERE ticket_type = 'request';
*/

COMMIT;
