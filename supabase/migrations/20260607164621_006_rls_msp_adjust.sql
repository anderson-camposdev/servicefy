-- ============================================================
-- Flowfy ITSM — Migration 006
-- Ajuste Arquitetural: Políticas RLS Modelo MSP (Allied IT)
-- ============================================================

-- ─── 1. Cadastro da Empresa Administradora Allied IT ──────────
INSERT INTO public.companies (
  id, name, domain, bg_color, primary_color, accent_color,
  welcome_title, welcome_subtitle, concurrent_licenses, license_plan
)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  'Allied IT',
  'alliedit.com',
  '#f8fafc',
  '#0284c7',
  '#0ea5e9',
  'Allied IT Provider Portal',
  'Console centralizado de atendimento MSP',
  999,
  'enterprise'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  primary_color = EXCLUDED.primary_color,
  accent_color = EXCLUDED.accent_color;

-- ─── 2. Cadastro de Usuários (Analistas/Admins) da Allied IT ──
INSERT INTO public.profiles (id, auth_id, company_id, name, email, role, department, avatar_url, active)
VALUES (
  '44444444-4444-4444-4444-444444444445',
  '44444444-4444-4444-4444-444444444445',
  '44444444-4444-4444-4444-444444444444',
  'Felipe Allied',
  'felipe@alliedit.com',
  'sysadmin'::user_role,
  'MSP Management',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, auth_id, company_id, name, email, role, department, avatar_url, active)
VALUES (
  '44444444-4444-4444-4444-444444444446',
  '44444444-4444-4444-4444-444444444446',
  '44444444-4444-4444-4444-444444444444',
  'Clara Rocha',
  'clara.rocha@alliedit.com',
  'agent'::user_role,
  'Suporte MSP',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  true
) ON CONFLICT (id) DO NOTHING;

-- ─── 3. Função de Validação do Provedor MSP ──────────────────
CREATE OR REPLACE FUNCTION public.is_current_user_msp_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_company_id UUID;
  v_role TEXT;
BEGIN
  SELECT company_id, role::text INTO v_company_id, v_role
    FROM public.profiles
   WHERE id = auth.uid();

  -- Allied IT (ID '44444444-4444-4444-4444-444444444444') ou papel sysadmin têm acesso global
  IF v_company_id = '44444444-4444-4444-4444-444444444444' OR v_role = 'sysadmin' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── 4. Remoção de Políticas Antigas das Tabelas ──────────────

-- Catalog tables
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

-- Chatbot tables
DROP POLICY IF EXISTS select_tenant_policy ON public.chatbot_whitelist;
DROP POLICY IF EXISTS write_admin_policy ON public.chatbot_whitelist;
DROP POLICY IF EXISTS select_tenant_policy ON public.chatbot_messages;
DROP POLICY IF EXISTS write_admin_policy ON public.chatbot_messages;
DROP POLICY IF EXISTS select_tenant_policy ON public.chatbot_config;
DROP POLICY IF EXISTS write_admin_policy ON public.chatbot_config;
DROP POLICY IF EXISTS select_sysadmin_policy ON public.chatbot_blocked_attempts;
DROP POLICY IF EXISTS insert_any_policy ON public.chatbot_blocked_attempts;

-- Core tables
DROP POLICY IF EXISTS dev_open ON public.incidents;
DROP POLICY IF EXISTS dev_open ON public.service_requests;
DROP POLICY IF EXISTS dev_open ON public.problems;
DROP POLICY IF EXISTS dev_open ON public.changes;
DROP POLICY IF EXISTS dev_open ON public.companies;
DROP POLICY IF EXISTS dev_open ON public.profiles;
DROP POLICY IF EXISTS dev_open ON public.groups;
DROP POLICY IF EXISTS dev_open ON public.sla_policies;
DROP POLICY IF EXISTS dev_open ON public.notifications;

DROP POLICY IF EXISTS select_incident_policy ON public.incidents;
DROP POLICY IF EXISTS write_incident_policy ON public.incidents;

-- Active sessions
DROP POLICY IF EXISTS select_session_policy ON public.active_sessions;
DROP POLICY IF EXISTS insert_session_policy ON public.active_sessions;
DROP POLICY IF EXISTS update_session_policy ON public.active_sessions;
DROP POLICY IF EXISTS delete_session_policy ON public.active_sessions;

-- Approval tokens
DROP POLICY IF EXISTS select_tenant_policy ON public.approval_tokens;
DROP POLICY IF EXISTS write_admin_policy ON public.approval_tokens;

-- Relationships
DROP POLICY IF EXISTS select_profile_groups ON public.profile_groups;
DROP POLICY IF EXISTS write_profile_groups ON public.profile_groups;
DROP POLICY IF EXISTS select_problem_incidents ON public.problem_incidents;
DROP POLICY IF EXISTS write_problem_incidents ON public.problem_incidents;
DROP POLICY IF EXISTS select_change_incidents ON public.change_incidents;
DROP POLICY IF EXISTS write_change_incidents ON public.change_incidents;


-- ─── 5. Criação das Novas Políticas com Regra MSP ──────────────

-- Catálogos e Chatbot (Allied IT/sysadmin lê/edita tudo; Clientes isolados)
CREATE POLICY select_tenant_policy ON public.incident_catalog_items FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.incident_catalog_items FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.incident_catalog_subitems FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.incident_catalog_subitems FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.incident_catalog_symptoms FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.incident_catalog_symptoms FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.request_catalog_items FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.request_catalog_items FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.request_catalog_subitems FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.request_catalog_subitems FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.chatbot_whitelist FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.chatbot_whitelist FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.chatbot_messages FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.chatbot_messages FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.chatbot_config FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.chatbot_config FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_tenant_policy ON public.approval_tokens FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_admin_policy ON public.approval_tokens FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- Core ITSM Tables
CREATE POLICY select_incident_policy ON public.incidents FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_incident_policy ON public.incidents FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id()) WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY select_request_policy ON public.service_requests FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_request_policy ON public.service_requests FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id()) WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY select_problem_policy ON public.problems FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_problem_policy ON public.problems FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id()) WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY select_change_policy ON public.changes FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_change_policy ON public.changes FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id()) WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

CREATE POLICY select_sla_policy ON public.sla_policies FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_sla_policy ON public.sla_policies FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- Companies (lida por todos os autenticados, editada apenas por admins Allied IT)
CREATE POLICY select_company_policy ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY write_company_policy ON public.companies FOR ALL TO authenticated USING (public.is_current_user_msp_admin());

-- Profiles (Allied IT lê/edita tudo; Clientes lêem/editam seu próprio tenant)
CREATE POLICY select_profile_policy ON public.profiles FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
CREATE POLICY write_profile_policy ON public.profiles FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))) WITH CHECK (public.is_current_user_msp_admin() OR (id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))));

-- Active Sessions (heartbeats)
CREATE POLICY select_session_policy ON public.active_sessions FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));
CREATE POLICY insert_session_policy ON public.active_sessions FOR INSERT TO authenticated WITH CHECK (public.is_current_user_msp_admin() OR user_id = auth.uid());
CREATE POLICY update_session_policy ON public.active_sessions FOR UPDATE TO authenticated USING (public.is_current_user_msp_admin() OR user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));
CREATE POLICY delete_session_policy ON public.active_sessions FOR DELETE TO authenticated USING (public.is_current_user_msp_admin() OR user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- Chatbot Blocked Attempts (Global Audit)
CREATE POLICY select_sysadmin_policy ON public.chatbot_blocked_attempts FOR SELECT TO authenticated USING (public.is_current_user_msp_admin());
CREATE POLICY insert_any_policy ON public.chatbot_blocked_attempts FOR INSERT TO public WITH CHECK (true);

-- Junction tables (profile_groups, problem_incidents, change_incidents)
CREATE POLICY select_profile_groups ON public.profile_groups FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = profile_id AND profiles.company_id = public.get_current_user_company_id()));
CREATE POLICY write_profile_groups ON public.profile_groups FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = profile_id AND profiles.company_id = public.get_current_user_company_id()) AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))) WITH CHECK (public.is_current_user_msp_admin() OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = profile_id AND profiles.company_id = public.get_current_user_company_id()) AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

CREATE POLICY select_problem_incidents ON public.problem_incidents FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR EXISTS (SELECT 1 FROM public.problems WHERE problems.id = problem_id AND problems.company_id = public.get_current_user_company_id()));
CREATE POLICY write_problem_incidents ON public.problem_incidents FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (EXISTS (SELECT 1 FROM public.problems WHERE problems.id = problem_id AND problems.company_id = public.get_current_user_company_id()) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent'))) WITH CHECK (public.is_current_user_msp_admin() OR (EXISTS (SELECT 1 FROM public.problems WHERE problems.id = problem_id AND problems.company_id = public.get_current_user_company_id()) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent')));

CREATE POLICY select_change_incidents ON public.change_incidents FOR SELECT TO authenticated USING (public.is_current_user_msp_admin() OR EXISTS (SELECT 1 FROM public.changes WHERE changes.id = change_id AND changes.company_id = public.get_current_user_company_id()));
CREATE POLICY write_change_incidents ON public.change_incidents FOR ALL TO authenticated USING (public.is_current_user_msp_admin() OR (EXISTS (SELECT 1 FROM public.changes WHERE changes.id = change_id AND changes.company_id = public.get_current_user_company_id()) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent'))) WITH CHECK (public.is_current_user_msp_admin() OR (EXISTS (SELECT 1 FROM public.changes WHERE changes.id = change_id AND changes.company_id = public.get_current_user_company_id()) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent')));;
