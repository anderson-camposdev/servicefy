CREATE TABLE public.tenant_smtp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL,
  smtp_user text NOT NULL,
  smtp_password_encrypted bytea NOT NULL,
  from_email text NOT NULL,
  from_name text NOT NULL,
  encryption_type text NOT NULL CHECK (encryption_type IN ('tls', 'ssl', 'none')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_smtp_settings_company_id_key UNIQUE (company_id)
);

ALTER TABLE public.tenant_smtp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_smtp_settings_tenant_isolation
  ON public.tenant_smtp_settings
  FOR ALL
  TO authenticated
  USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.tenant_smtp_settings
  TO authenticated;