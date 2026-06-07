-- ============================================================
-- Flowfy ITSM — Migration 007
-- Remediação de RLS para Tabelas de Catálogo, Sessões e Incidentes
-- ============================================================

-- 1. Drop existing policies on catalog tables
DROP POLICY IF EXISTS select_tenant_policy ON public.incident_catalog_items;
DROP POLICY IF EXISTS write_admin_policy ON public.incident_catalog_items;

DROP POLICY IF EXISTS select_tenant_policy ON public.incident_catalog_subitems;
DROP POLICY IF EXISTS write_admin_policy ON public.incident_catalog_subitems;

DROP POLICY IF EXISTS select_tenant_policy ON public.incident_catalog_symptoms;
DROP POLICY IF EXISTS write_admin_policy ON public.incident_catalog_symptoms;

DROP POLICY IF EXISTS select_tenant_policy ON public.request_catalog_items;
DROP POLICY IF EXISTS write_admin_policy ON public.request_catalog_items;

DROP POLICY IF EXISTS select_tenant_policy ON public.request_catalog_subitems;
DROP POLICY IF EXISTS write_admin_policy ON public.request_catalog_subitems;

-- Drop existing policies on sessions
DROP POLICY IF EXISTS select_session_policy ON public.active_sessions;
DROP POLICY IF EXISTS insert_session_policy ON public.active_sessions;
DROP POLICY IF EXISTS update_session_policy ON public.active_sessions;
DROP POLICY IF EXISTS delete_session_policy ON public.active_sessions;

-- Drop existing policies on incidents
DROP POLICY IF EXISTS select_incident_policy ON public.incidents;
DROP POLICY IF EXISTS write_incident_policy ON public.incidents;

-- 2. Recriando políticas com regra de governança Allied IT / sysadmin

-- INCIDENT CATALOG ITEMS
CREATE POLICY select_tenant_policy ON public.incident_catalog_items FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY write_admin_policy ON public.incident_catalog_items FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- INCIDENT CATALOG SUBITEMS
CREATE POLICY select_tenant_policy ON public.incident_catalog_subitems FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY write_admin_policy ON public.incident_catalog_subitems FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- INCIDENT CATALOG SYMPTOMS
CREATE POLICY select_tenant_policy ON public.incident_catalog_symptoms FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY write_admin_policy ON public.incident_catalog_symptoms FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- REQUEST CATALOG ITEMS
CREATE POLICY select_tenant_policy ON public.request_catalog_items FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY write_admin_policy ON public.request_catalog_items FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- REQUEST CATALOG SUBITEMS
CREATE POLICY select_tenant_policy ON public.request_catalog_subitems FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY write_admin_policy ON public.request_catalog_subitems FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- ACTIVE SESSIONS
CREATE POLICY select_session_policy ON public.active_sessions FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY insert_session_policy ON public.active_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY update_session_policy ON public.active_sessions FOR UPDATE TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY delete_session_policy ON public.active_sessions FOR DELETE TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- INCIDENTS
CREATE POLICY select_incident_policy ON public.incidents FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY write_incident_policy ON public.incidents FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
