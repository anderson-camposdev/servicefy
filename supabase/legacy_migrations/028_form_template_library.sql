-- ============================================================
-- Flowfy ITSM - Migration 028
-- Reusable dynamic-form templates scoped by tenant.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  fields      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_templates_fields_array_chk CHECK (jsonb_typeof(fields) = 'array'),
  CONSTRAINT form_templates_tenant_name_key UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_form_templates_tenant
  ON public.form_templates(tenant_id);

ALTER TABLE public.catalog_service_symptoms
  ADD COLUMN IF NOT EXISTS form_template_id UUID
  REFERENCES public.form_templates(id) ON DELETE SET NULL;

ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS form_template_id UUID
  REFERENCES public.form_templates(id) ON DELETE SET NULL;

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_templates TO authenticated;

DROP POLICY IF EXISTS select_form_templates ON public.form_templates;
CREATE POLICY select_form_templates ON public.form_templates
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR tenant_id = public.get_current_user_company_id()
  );

DROP POLICY IF EXISTS write_form_templates ON public.form_templates;
CREATE POLICY write_form_templates ON public.form_templates
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (
      tenant_id = public.get_current_user_company_id()
      AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
    )
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (
      tenant_id = public.get_current_user_company_id()
      AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
    )
  );

