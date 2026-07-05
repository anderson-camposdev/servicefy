-- ServiceFY — Organização ESM, contratos, comunicação e Major Incident
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(company_id,name)
);

CREATE TABLE public.job_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(company_id,name)
);

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alternate_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title_id uuid REFERENCES public.job_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alternate_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','blocked')),
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  number text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','expired','cancelled')),
  starts_at date,
  ends_at date,
  value numeric(14,2),
  currency text NOT NULL DEFAULT 'BRL',
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,number)
);

CREATE TABLE public.contract_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_domain_id uuid REFERENCES public.service_domains(id) ON DELETE SET NULL,
  catalog_item_id uuid,
  sla_policy_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  monthly_limit integer,
  consumed integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.ola_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  assignment_group_id uuid NOT NULL REFERENCES public.assignment_groups(id) ON DELETE CASCADE,
  response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','teams','google_chat','whatsapp','portal')),
  locale text NOT NULL DEFAULT 'pt-BR',
  subject_template text,
  body_template text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,key,channel,locale)
);

CREATE TABLE public.attachment_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_domain_id uuid REFERENCES public.service_domains(id) ON DELETE CASCADE,
  allowed_extensions text[] NOT NULL DEFAULT ARRAY['pdf','png','jpg','jpeg','txt','docx','xlsx'],
  blocked_extensions text[] NOT NULL DEFAULT ARRAY['exe','dll','bat','cmd','ps1','js','vbs'],
  max_size_bytes bigint NOT NULL DEFAULT 26214400,
  malware_scan_required boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 365,
  UNIQUE(company_id,service_domain_id)
);

CREATE TABLE public.major_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  number text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','investigating','identified','monitoring','resolved','closed')),
  severity smallint NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 3),
  commander_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  bridge_url text,
  public_summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,number)
);

CREATE TABLE public.status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  major_incident_id uuid REFERENCES public.major_incidents(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('investigating','identified','monitoring','resolved','maintenance')),
  visibility text NOT NULL DEFAULT 'tenant' CHECK (visibility IN ('public','tenant','internal')),
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t regclass;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.locations'::regclass,'public.job_titles'::regclass,'public.suppliers'::regclass,
    'public.service_contracts'::regclass,'public.contract_entitlements'::regclass,
    'public.ola_policies'::regclass,'public.notification_templates'::regclass,
    'public.attachment_policies'::regclass,'public.major_incidents'::regclass,
    'public.status_updates'::regclass
  ] LOOP EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t); END LOOP;
END $$;

CREATE POLICY locations_admin ON public.locations FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY job_titles_admin ON public.job_titles FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY suppliers_admin ON public.suppliers FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY contracts_admin ON public.service_contracts FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY entitlements_admin ON public.contract_entitlements FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY ola_admin ON public.ola_policies FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY templates_admin ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY attachment_policies_admin ON public.attachment_policies FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY major_incident_staff ON public.major_incidents FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id=public.get_current_user_company_id() AND public.get_current_user_role()<>'end_user'));
CREATE POLICY major_incident_admin_write ON public.major_incidents FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY status_updates_tenant ON public.status_updates FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id=public.get_current_user_company_id());
CREATE POLICY status_updates_public ON public.status_updates FOR SELECT TO anon
  USING (visibility='public');
CREATE POLICY status_updates_admin_write ON public.status_updates FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.locations,public.job_titles,public.suppliers,
  public.service_contracts,public.contract_entitlements,public.ola_policies,
  public.notification_templates,public.attachment_policies,public.major_incidents,
  public.status_updates TO authenticated;

GRANT SELECT ON public.status_updates TO anon;
INSERT INTO public.attachment_policies(company_id)
SELECT id FROM public.companies
ON CONFLICT(company_id,service_domain_id) DO NOTHING;
