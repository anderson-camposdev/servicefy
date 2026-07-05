-- ServiceFY — Núcleo ESM de casos e privacidade por domínio
CREATE TYPE public.service_domain_privacy AS ENUM ('standard','private','restricted');
CREATE TYPE public.case_specialization AS ENUM ('incident','request','general');

CREATE TABLE public.service_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  privacy public.service_domain_privacy NOT NULL DEFAULT 'standard',
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, key)
);

CREATE TABLE public.case_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_domain_id uuid NOT NULL REFERENCES public.service_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  specialization public.case_specialization NOT NULL DEFAULT 'general',
  initial_state text NOT NULL DEFAULT 'New',
  form_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, service_domain_id, key)
);

CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_domain_id uuid NOT NULL REFERENCES public.service_domains(id) ON DELETE RESTRICT,
  case_type_id uuid NOT NULL REFERENCES public.case_types(id) ON DELETE RESTRICT,
  number text NOT NULL,
  title text NOT NULL,
  description text,
  state text NOT NULL,
  priority smallint NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 5),
  requester_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignment_group_id uuid REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  visibility public.service_domain_privacy NOT NULL DEFAULT 'standard',
  source_channel text NOT NULL DEFAULT 'manual',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sla_response_deadline timestamptz,
  sla_resolution_deadline timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, number)
);

CREATE TABLE public.case_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('profile','group')),
  subject_id uuid NOT NULL,
  permission text NOT NULL DEFAULT 'read' CHECK (permission IN ('read','collaborate','manage')),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id, subject_type, subject_id)
);

CREATE INDEX idx_cases_company_state ON public.cases(company_id, state, updated_at DESC);
CREATE INDEX idx_cases_requester ON public.cases(requester_id, created_at DESC);
CREATE INDEX idx_case_grants_subject ON public.case_access_grants(subject_type, subject_id);

ALTER TABLE public.service_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY domains_tenant_read ON public.service_domains FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY domains_admin_write ON public.service_domains FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY case_types_tenant_read ON public.case_types FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY case_types_admin_write ON public.case_types FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));

CREATE OR REPLACE FUNCTION public.can_read_case(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = p_case_id
      AND (
        c.requester_id = public.get_current_profile_id()
        OR c.assigned_to_id = public.get_current_profile_id()
        OR (
          c.visibility = 'standard'
          AND c.company_id = public.get_current_user_company_id()
          AND public.get_current_user_role() <> 'end_user'
        )
        OR EXISTS (
          SELECT 1 FROM public.case_access_grants g
          WHERE g.case_id = c.id
            AND (g.expires_at IS NULL OR g.expires_at > now())
            AND (
              (g.subject_type = 'profile' AND g.subject_id = public.get_current_profile_id())
              OR (g.subject_type = 'group' AND EXISTS (
                SELECT 1 FROM public.user_groups ug
                WHERE ug.group_id = g.subject_id AND ug.user_id = public.get_current_profile_id()
              ))
            )
        )
        OR (
          c.assignment_group_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.user_groups ug
            WHERE ug.group_id = c.assignment_group_id AND ug.user_id = public.get_current_profile_id()
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_case(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_case(uuid) TO authenticated;

CREATE POLICY cases_private_read ON public.cases FOR SELECT TO authenticated
  USING (public.can_read_case(id));
CREATE POLICY cases_create ON public.cases FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_user_company_id()
    AND requester_id = public.get_current_profile_id()
  );
CREATE POLICY cases_collaborate ON public.cases FOR UPDATE TO authenticated
  USING (public.can_read_case(id)) WITH CHECK (public.can_read_case(id));
CREATE POLICY case_grants_visible ON public.case_access_grants FOR SELECT TO authenticated
  USING (public.can_read_case(case_id));

GRANT SELECT,INSERT,UPDATE ON public.cases TO authenticated;
GRANT SELECT ON public.case_access_grants TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.service_domains, public.case_types TO authenticated;

INSERT INTO public.service_domains(company_id,key,name,description,privacy)
SELECT id,'it','Tecnologia da Informação','Domínio ITSM padrão','standard'
FROM public.companies ON CONFLICT(company_id,key) DO NOTHING;

INSERT INTO public.case_types(company_id,service_domain_id,key,name,specialization,initial_state)
SELECT d.company_id,d.id,v.key,v.name,v.specialization::public.case_specialization,v.initial_state
FROM public.service_domains d
CROSS JOIN (VALUES
  ('incident','Incidente','incident','New'),
  ('request','Requisição','request','Draft'),
  ('general','Caso geral','general','New')
) v(key,name,specialization,initial_state)
WHERE d.key='it'
ON CONFLICT(company_id,service_domain_id,key) DO NOTHING;

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE;

INSERT INTO public.cases(
  company_id,service_domain_id,case_type_id,number,title,description,state,priority,
  requester_id,assigned_to_id,assignment_group_id,visibility,source_channel,created_at,updated_at
)
SELECT i.company_id,d.id,ct.id,i.number,i.short_description,i.description,i.state::text,
  CASE
    WHEN i.priority::text LIKE 'P1%' THEN 1 WHEN i.priority::text LIKE 'P2%' THEN 2
    WHEN i.priority::text LIKE 'P3%' THEN 3 WHEN i.priority::text LIKE 'P5%' THEN 5
    ELSE 4
  END,
  i.caller_id,i.assigned_to_id,i.assignment_group_id,
  d.privacy,COALESCE(i.opened_via,'manual'),i.created_at,i.updated_at
FROM public.incidents i
JOIN public.service_domains d ON d.company_id=i.company_id AND d.key='it'
JOIN public.case_types ct ON ct.service_domain_id=d.id AND ct.key='incident'
WHERE i.case_id IS NULL
ON CONFLICT(company_id,number) DO NOTHING;

UPDATE public.incidents i
SET case_id=c.id
FROM public.cases c
WHERE i.case_id IS NULL AND c.company_id=i.company_id AND c.number=i.number;

UPDATE public.ticket_messages tm SET case_id=i.case_id
FROM public.incidents i WHERE tm.incident_id=i.id AND tm.case_id IS NULL;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_case_fk FOREIGN KEY(case_id) REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.channel_routes
  ADD CONSTRAINT channel_routes_domain_fk FOREIGN KEY(service_domain_id) REFERENCES public.service_domains(id) ON DELETE SET NULL;


CREATE OR REPLACE FUNCTION public.sync_incident_to_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain_id uuid;
  v_type_id uuid;
  v_case_id uuid;
  v_priority smallint;
BEGIN
  SELECT d.id,ct.id INTO v_domain_id,v_type_id
  FROM public.service_domains d
  JOIN public.case_types ct ON ct.service_domain_id=d.id AND ct.key='incident'
  WHERE d.company_id=NEW.company_id AND d.key='it';

  v_priority := CASE
    WHEN NEW.priority::text LIKE 'P1%' THEN 1 WHEN NEW.priority::text LIKE 'P2%' THEN 2
    WHEN NEW.priority::text LIKE 'P3%' THEN 3 WHEN NEW.priority::text LIKE 'P5%' THEN 5
    ELSE 4
  END;

  IF NEW.case_id IS NULL THEN
    INSERT INTO public.cases(
      company_id,service_domain_id,case_type_id,number,title,description,state,priority,
      requester_id,assigned_to_id,assignment_group_id,visibility,source_channel,created_at,updated_at
    ) VALUES (
      NEW.company_id,v_domain_id,v_type_id,NEW.number,NEW.short_description,NEW.description,
      NEW.state::text,v_priority,NEW.caller_id,NEW.assigned_to_id,NEW.assignment_group_id,
      'standard',COALESCE(NEW.opened_via,'manual'),NEW.created_at,NEW.updated_at
    )
    ON CONFLICT(company_id,number) DO UPDATE SET
      title=EXCLUDED.title,description=EXCLUDED.description,state=EXCLUDED.state,
      priority=EXCLUDED.priority,updated_at=EXCLUDED.updated_at
    RETURNING id INTO v_case_id;
    UPDATE public.incidents SET case_id=v_case_id WHERE id=NEW.id AND case_id IS NULL;
  ELSE
    UPDATE public.cases SET
      title=NEW.short_description,description=NEW.description,state=NEW.state::text,
      priority=v_priority,requester_id=NEW.caller_id,assigned_to_id=NEW.assigned_to_id,
      assignment_group_id=NEW.assignment_group_id,updated_at=NEW.updated_at
    WHERE id=NEW.case_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_incident_to_case ON public.incidents;
CREATE TRIGGER trg_sync_incident_to_case
AFTER INSERT OR UPDATE ON public.incidents
FOR EACH ROW EXECUTE FUNCTION public.sync_incident_to_case();

DO $$
BEGIN
  IF to_regclass('public.service_requests') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL';
  END IF;
END $$;
