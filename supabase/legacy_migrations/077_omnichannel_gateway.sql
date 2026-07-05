-- ServiceFY — Gateway Omnichannel
CREATE TYPE public.channel_provider AS ENUM (
  'microsoft_graph','microsoft_teams','gmail','google_chat',
  'whatsapp_cloud','imap_smtp','portal','api'
);
CREATE TYPE public.channel_scope AS ENUM ('tenant','provider');
CREATE TYPE public.delivery_status AS ENUM ('pending','processing','sent','delivered','read','failed','dead_letter');

CREATE TABLE public.channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope public.channel_scope NOT NULL DEFAULT 'tenant',
  provider public.channel_provider NOT NULL,
  name text NOT NULL,
  external_account_id text,
  address text,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connecting','healthy','degraded','expired','error')),
  vault_secret_id uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  subscription_expires_at timestamptz,
  last_health_check_at timestamptz,
  last_error_code text,
  last_error_message text,
  rotation_required boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.channel_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  match_type text NOT NULL CHECK (match_type IN ('address','alias','domain','phone','external_identity','default')),
  match_value text,
  assignment_group_id uuid REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  service_domain_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider public.channel_provider NOT NULL,
  external_id text NOT NULL,
  email text,
  phone_e164 text,
  display_name text,
  verified boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider, external_id)
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE RESTRICT,
  external_conversation_id text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting','handed_off','closed')),
  requester_identity_id uuid REFERENCES public.external_identities(id) ON DELETE SET NULL,
  case_id uuid,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  assigned_group_id uuid REFERENCES public.assignment_groups(id) ON DELETE SET NULL,
  assigned_to_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_conversation_id)
);

CREATE TABLE public.channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE RESTRICT,
  external_event_id text,
  external_message_id text NOT NULL,
  reply_to_external_id text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  sender_identity_id uuid REFERENCES public.external_identities(id) ON DELETE SET NULL,
  sender_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject text,
  body_text text NOT NULL DEFAULT '',
  body_html text,
  references_header text[] NOT NULL DEFAULT '{}',
  delivery_status public.delivery_status NOT NULL DEFAULT 'pending',
  raw_payload jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_message_id)
);

CREATE TABLE public.channel_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  external_id text,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint,
  storage_path text,
  malware_status text NOT NULL DEFAULT 'pending' CHECK (malware_status IN ('pending','clean','blocked','error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.channel_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  status public.delivery_status NOT NULL,
  provider_event_id text,
  error_code text,
  error_message text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  UNIQUE (message_id, status, provider_event_id)
);

CREATE TABLE public.channel_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  correlation_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, correlation_id)
);

CREATE INDEX idx_channel_connections_company ON public.channel_connections(company_id, provider);
CREATE INDEX idx_channel_routes_match ON public.channel_routes(connection_id, match_type, match_value);
CREATE INDEX idx_conversations_company_recent ON public.conversations(company_id, last_message_at DESC);
CREATE INDEX idx_channel_messages_conversation ON public.channel_messages(conversation_id, occurred_at);
CREATE INDEX idx_channel_outbox_due ON public.channel_outbox(status, next_attempt_at);

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_connections_admin ON public.channel_connections FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id)) WITH CHECK (public.is_settings_admin(company_id));
CREATE POLICY channel_routes_admin ON public.channel_routes FOR ALL TO authenticated
  USING (public.is_settings_admin(target_company_id)) WITH CHECK (public.is_settings_admin(target_company_id));
CREATE POLICY external_identities_tenant ON public.external_identities FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY conversations_tenant ON public.conversations FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY channel_messages_tenant ON public.channel_messages FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY channel_attachments_tenant ON public.channel_message_attachments FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY channel_events_admin ON public.channel_delivery_events FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));
CREATE POLICY channel_outbox_admin ON public.channel_outbox FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.channel_connections, public.channel_routes TO authenticated;
GRANT SELECT ON public.external_identities, public.conversations, public.channel_messages,
  public.channel_message_attachments, public.channel_delivery_events, public.channel_outbox TO authenticated;

COMMENT ON COLUMN public.channel_connections.vault_secret_id IS 'Referência write-only ao Vault; nunca retornar o segredo.';
COMMENT ON TABLE public.channel_outbox IS 'Fila idempotente com retry e dead-letter para todos os canais.';
