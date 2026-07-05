-- ============================================================
-- Flowfy ITSM — Migration 005
-- Ativação de RLS e Políticas de Controle Multi-Tenant
-- ============================================================

-- ─── 1. Ativação do RLS nas 14 Tabelas ───────────────────────
ALTER TABLE public.profile_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_catalog_subitems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_catalog_symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_catalog_subitems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_blocked_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_config ENABLE ROW LEVEL SECURITY;

-- ─── 2. Funções Auxiliares de Contexto (Otimizadas com auth.uid()) ───
CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── 3. Ajuste de Funções Existentes para SECURITY DEFINER ───
-- Isso garante que as funções executadas em segundo plano/sistema ignorem RLS de forma segura
ALTER FUNCTION public.create_approval_token(UUID, UUID, TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.process_approval_token(UUID, TEXT, TEXT, TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.register_session(UUID, UUID, TEXT, TEXT, TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.session_heartbeat(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.release_session(TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.expire_stale_sessions() SECURITY DEFINER;

-- ─── 4. Políticas para Tabelas de Catálogos e Chatbot ─────────
-- Tabelas com company_id onde usuários autenticados da mesma empresa lêem,
-- e apenas administradores (sysadmin / company_admin) da mesma empresa editam.

-- incident_catalog_items
DROP POLICY IF EXISTS select_tenant_policy ON public.incident_catalog_items;
CREATE POLICY select_tenant_policy ON public.incident_catalog_items
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.incident_catalog_items;
CREATE POLICY write_admin_policy ON public.incident_catalog_items
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- incident_catalog_subitems
DROP POLICY IF EXISTS select_tenant_policy ON public.incident_catalog_subitems;
CREATE POLICY select_tenant_policy ON public.incident_catalog_subitems
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.incident_catalog_subitems;
CREATE POLICY write_admin_policy ON public.incident_catalog_subitems
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- incident_catalog_symptoms
DROP POLICY IF EXISTS select_tenant_policy ON public.incident_catalog_symptoms;
CREATE POLICY select_tenant_policy ON public.incident_catalog_symptoms
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.incident_catalog_symptoms;
CREATE POLICY write_admin_policy ON public.incident_catalog_symptoms
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- request_catalog_items
DROP POLICY IF EXISTS select_tenant_policy ON public.request_catalog_items;
CREATE POLICY select_tenant_policy ON public.request_catalog_items
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.request_catalog_items;
CREATE POLICY write_admin_policy ON public.request_catalog_items
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- request_catalog_subitems
DROP POLICY IF EXISTS select_tenant_policy ON public.request_catalog_subitems;
CREATE POLICY select_tenant_policy ON public.request_catalog_subitems
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.request_catalog_subitems;
CREATE POLICY write_admin_policy ON public.request_catalog_subitems
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- chatbot_whitelist
DROP POLICY IF EXISTS select_tenant_policy ON public.chatbot_whitelist;
CREATE POLICY select_tenant_policy ON public.chatbot_whitelist
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.chatbot_whitelist;
CREATE POLICY write_admin_policy ON public.chatbot_whitelist
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- chatbot_messages
DROP POLICY IF EXISTS select_tenant_policy ON public.chatbot_messages;
CREATE POLICY select_tenant_policy ON public.chatbot_messages
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.chatbot_messages;
CREATE POLICY write_admin_policy ON public.chatbot_messages
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- chatbot_config
DROP POLICY IF EXISTS select_tenant_policy ON public.chatbot_config;
CREATE POLICY select_tenant_policy ON public.chatbot_config
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.chatbot_config;
CREATE POLICY write_admin_policy ON public.chatbot_config
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));

-- approval_tokens
DROP POLICY IF EXISTS select_tenant_policy ON public.approval_tokens;
CREATE POLICY select_tenant_policy ON public.approval_tokens
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_admin_policy ON public.approval_tokens;
CREATE POLICY write_admin_policy ON public.approval_tokens
  FOR ALL TO authenticated
  USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'));


-- ─── 5. Políticas para active_sessions (Licenças) ─────────────
-- Usuário insere, atualiza e deleta apenas sua própria sessão. Admins podem consultar ou remover sessões da mesma empresa.

DROP POLICY IF EXISTS select_session_policy ON public.active_sessions;
CREATE POLICY select_session_policy ON public.active_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

DROP POLICY IF EXISTS insert_session_policy ON public.active_sessions;
CREATE POLICY insert_session_policy ON public.active_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS update_session_policy ON public.active_sessions;
CREATE POLICY update_session_policy ON public.active_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

DROP POLICY IF EXISTS delete_session_policy ON public.active_sessions;
CREATE POLICY delete_session_policy ON public.active_sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));


-- ─── 6. Políticas para chatbot_blocked_attempts ────────────────
-- Tabela global de auditoria sem company_id. Visível apenas para sysadmin global, mas inserível por qualquer um (incluindo anônimo para registrar bloqueios).

DROP POLICY IF EXISTS select_sysadmin_policy ON public.chatbot_blocked_attempts;
CREATE POLICY select_sysadmin_policy ON public.chatbot_blocked_attempts
  FOR SELECT TO authenticated
  USING (public.get_current_user_role() = 'sysadmin');

DROP POLICY IF EXISTS insert_any_policy ON public.chatbot_blocked_attempts;
CREATE POLICY insert_any_policy ON public.chatbot_blocked_attempts
  FOR INSERT TO public
  WITH CHECK (true);


-- ─── 7. Políticas para Tabelas de Relacionamento (Junction Tables) ───

-- profile_groups
DROP POLICY IF EXISTS select_profile_groups ON public.profile_groups;
CREATE POLICY select_profile_groups ON public.profile_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = profile_id
        AND profiles.company_id = public.get_current_user_company_id()
    )
  );

DROP POLICY IF EXISTS write_profile_groups ON public.profile_groups;
CREATE POLICY write_profile_groups ON public.profile_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = profile_id
        AND profiles.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = profile_id
        AND profiles.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin')
  );

-- problem_incidents
DROP POLICY IF EXISTS select_problem_incidents ON public.problem_incidents;
CREATE POLICY select_problem_incidents ON public.problem_incidents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.problems
      WHERE problems.id = problem_id
        AND problems.company_id = public.get_current_user_company_id()
    )
  );

DROP POLICY IF EXISTS write_problem_incidents ON public.problem_incidents;
CREATE POLICY write_problem_incidents ON public.problem_incidents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.problems
      WHERE problems.id = problem_id
        AND problems.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.problems
      WHERE problems.id = problem_id
        AND problems.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent')
  );

-- change_incidents
DROP POLICY IF EXISTS select_change_incidents ON public.change_incidents;
CREATE POLICY select_change_incidents ON public.change_incidents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.changes
      WHERE changes.id = change_id
        AND changes.company_id = public.get_current_user_company_id()
    )
  );

DROP POLICY IF EXISTS write_change_incidents ON public.change_incidents;
CREATE POLICY write_change_incidents ON public.change_incidents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.changes
      WHERE changes.id = change_id
        AND changes.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.changes
      WHERE changes.id = change_id
        AND changes.company_id = public.get_current_user_company_id()
    ) AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'agent')
  );;
