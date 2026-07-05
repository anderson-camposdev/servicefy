-- ServiceFY — CMDB, conhecimento e agente virtual controlado
CREATE TABLE public.ci_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.ci_classes(id) ON DELETE SET NULL,
  key text NOT NULL,
  name text NOT NULL,
  attribute_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,key)
);

CREATE TABLE public.discovery_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('manual','csv','api','intune','entra','active_directory','google_directory','azure','aws','vmware','snmp')),
  name text NOT NULL,
  precedence integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  vault_secret_id uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','syncing','healthy','degraded','error')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.configuration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.ci_classes(id) ON DELETE RESTRICT,
  name text NOT NULL,
  asset_tag text,
  serial_number text,
  hostname text,
  lifecycle text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('planned','active','maintenance','retired','disposed')),
  criticality text NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low','medium','high','critical')),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_source_id uuid REFERENCES public.discovery_sources(id) ON DELETE SET NULL,
  last_discovered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX configuration_items_asset_tag
  ON public.configuration_items(company_id,asset_tag) WHERE asset_tag IS NOT NULL;
CREATE UNIQUE INDEX configuration_items_serial
  ON public.configuration_items(company_id,serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX configuration_items_hostname ON public.configuration_items(company_id,hostname);

CREATE TABLE public.ci_relationship_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  inverse_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(company_id,key)
);

CREATE TABLE public.ci_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_ci_id uuid NOT NULL REFERENCES public.configuration_items(id) ON DELETE CASCADE,
  target_ci_id uuid NOT NULL REFERENCES public.configuration_items(id) ON DELETE CASCADE,
  relationship_type_id uuid NOT NULL REFERENCES public.ci_relationship_types(id) ON DELETE RESTRICT,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source_ci_id <> target_ci_id),
  UNIQUE(source_ci_id,target_ci_id,relationship_type_id)
);

CREATE TABLE public.ci_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.discovery_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  configuration_item_id uuid NOT NULL REFERENCES public.configuration_items(id) ON DELETE CASCADE,
  fingerprint text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,external_id)
);

CREATE TABLE public.reconciliation_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.discovery_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  candidate_ci_ids uuid[] NOT NULL DEFAULT '{}',
  conflicting_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','ignored')),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.case_configuration_items (
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  configuration_item_id uuid NOT NULL REFERENCES public.configuration_items(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'affected',
  PRIMARY KEY(case_id,configuration_item_id)
);

CREATE TABLE public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  service_domain_id uuid REFERENCES public.service_domains(id) ON DELETE SET NULL,
  UNIQUE(company_id,slug)
);

CREATE TABLE public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  service_domain_id uuid REFERENCES public.service_domains(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  summary text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  visibility text NOT NULL DEFAULT 'tenant' CHECK (visibility IN ('public','tenant','internal','restricted')),
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(body,''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,slug)
);

CREATE INDEX knowledge_articles_search ON public.knowledge_articles USING gin(search_vector);

CREATE TABLE public.knowledge_article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  helpful boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.virtual_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_domain_id uuid REFERENCES public.service_domains(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  requires_confirmation boolean NOT NULL DEFAULT true,
  min_confidence numeric(4,3) NOT NULL DEFAULT 0.800,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(company_id,service_domain_id,action_key)
);

CREATE TABLE public.virtual_agent_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  action_id uuid REFERENCES public.virtual_agent_actions(id) ON DELETE SET NULL,
  identity_id uuid REFERENCES public.external_identities(id) ON DELETE SET NULL,
  intent text,
  confidence numeric(4,3),
  confirmation_status text NOT NULL DEFAULT 'not_required' CHECK (confirmation_status IN ('not_required','pending','confirmed','rejected')),
  result_status text NOT NULL CHECK (result_status IN ('success','failed','transferred','blocked')),
  source_article_ids uuid[] NOT NULL DEFAULT '{}',
  safe_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t regclass;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.ci_classes'::regclass,'public.discovery_sources'::regclass,
    'public.configuration_items'::regclass,'public.ci_relationship_types'::regclass,
    'public.ci_relationships'::regclass,'public.ci_source_records'::regclass,
    'public.reconciliation_conflicts'::regclass,'public.case_configuration_items'::regclass,
    'public.knowledge_categories'::regclass,'public.knowledge_articles'::regclass,
    'public.knowledge_article_feedback'::regclass,'public.virtual_agent_actions'::regclass,
    'public.virtual_agent_executions'::regclass
  ] LOOP EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t); END LOOP;
END $$;

CREATE POLICY ci_classes_admin ON public.ci_classes FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY discovery_sources_admin ON public.discovery_sources FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY ci_tenant_read ON public.configuration_items FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id=public.get_current_user_company_id() AND public.get_current_user_role()<>'end_user'));
CREATE POLICY ci_admin_write ON public.configuration_items FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY ci_rel_types_admin ON public.ci_relationship_types FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY ci_rel_admin ON public.ci_relationships FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY reconciliation_admin ON public.reconciliation_conflicts FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY knowledge_tenant_read ON public.knowledge_articles FOR SELECT TO authenticated
  USING (
    (company_id=public.get_current_user_company_id() OR public.is_current_user_msp_admin())
    AND (
      public.is_settings_admin(company_id)
      OR (status='published' AND visibility IN ('public','tenant'))
      OR (status='published' AND visibility='internal' AND public.get_current_user_role()<>'end_user')
    )
  );
CREATE POLICY knowledge_admin_write ON public.knowledge_articles FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY knowledge_categories_admin ON public.knowledge_categories FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY knowledge_categories_tenant_read ON public.knowledge_categories FOR SELECT TO authenticated
  USING (company_id=public.get_current_user_company_id() OR public.is_current_user_msp_admin());
CREATE POLICY knowledge_feedback_tenant ON public.knowledge_article_feedback FOR INSERT TO authenticated
  WITH CHECK (company_id=public.get_current_user_company_id() AND profile_id=public.get_current_profile_id());
CREATE POLICY agent_actions_admin ON public.virtual_agent_actions FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY agent_executions_admin ON public.virtual_agent_executions FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.ci_classes,public.discovery_sources,
  public.configuration_items,public.ci_relationship_types,public.ci_relationships,
  public.reconciliation_conflicts,public.knowledge_categories,public.knowledge_articles,
  public.virtual_agent_actions TO authenticated;
GRANT SELECT,INSERT ON public.knowledge_article_feedback TO authenticated;
GRANT SELECT ON public.virtual_agent_executions TO authenticated;

INSERT INTO public.ci_classes(company_id,key,name,attribute_schema)
SELECT c.id,v.key,v.name,v.schema::jsonb
FROM public.companies c CROSS JOIN (VALUES
  ('business_service','Serviço de Negócio','{"owner":"profile","criticality":"text"}'),
  ('application','Aplicação','{"vendor":"text","version":"text"}'),
  ('computer','Computador','{"os":"text","ip":"text"}'),
  ('network_device','Dispositivo de Rede','{"model":"text","ip":"text"}')
) v(key,name,schema)
ON CONFLICT(company_id,key) DO NOTHING;

INSERT INTO public.ci_relationship_types(company_id,key,name,inverse_name)
SELECT c.id,v.key,v.name,v.inverse_name
FROM public.companies c CROSS JOIN (VALUES
  ('depends_on','Depende de','É dependência de'),
  ('runs_on','Executa em','Hospeda'),
  ('connected_to','Conectado a','Conectado a'),
  ('used_by','Utilizado por','Utiliza')
) v(key,name,inverse_name)
ON CONFLICT(company_id,key) DO NOTHING;
