-- ============================================================
-- Flowfy ITSM — Migration 011
-- ETAPA 3 (Segurança) — Integração Supabase Auth + Blindagem RLS
--
-- 1) Helpers de contexto passam a resolver o usuário por auth_id
--    (Supabase Auth real) em vez de profiles.id.
-- 2) Provisionamento/linkagem automática de profile no signup.
-- 3) HABILITA RLS nas tabelas core (estavam com policy porém SEM
--    RLS ligado = inertes) e cria policies para as tabelas que
--    ainda não tinham (histórico, notifications, groups, catalog).
--
-- Modelo de isolamento (em TODAS as tabelas com company_id):
--   • Provedor MSP / sysadmin  → acesso total (is_current_user_msp_admin())
--   • Demais usuários          → somente company_id == o seu
-- ============================================================

-- ─── 1. Helpers de contexto via auth_id (Supabase Auth) ───────
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE auth_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE auth_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role::text FROM public.profiles WHERE auth_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── 2. Reconciliação dos profiles de seed ────────────────────
-- Os seeds usavam auth_id = id (placeholder, sem usuário real no
-- auth.users). Zeramos para que o primeiro login real via Supabase
-- Auth faça a linkagem por e-mail (trigger abaixo).
UPDATE public.profiles SET auth_id = NULL WHERE auth_id = id;

-- ─── 3. Provisionamento automático de profile no signup ───────
-- Ao criar um usuário no Supabase Auth:
--   a) Se já existe profile com o mesmo e-mail e sem auth_id → linka.
--   b) Senão, se o domínio do e-mail casa com uma empresa ativa →
--      cria profile end_user nesse tenant.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_domain     TEXT;
  v_linked     INT;
BEGIN
  UPDATE public.profiles
     SET auth_id = NEW.id, updated_at = now()
   WHERE auth_id IS NULL
     AND lower(email) = lower(NEW.email);
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  IF v_linked > 0 THEN
    RETURN NEW;
  END IF;

  v_domain := lower(split_part(NEW.email, '@', 2));
  SELECT id INTO v_company_id
    FROM public.companies
   WHERE lower(domain) = v_domain AND active = true
   LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, auth_id, company_id, name, email, role, active)
    VALUES (
      gen_random_uuid(),
      NEW.id,
      v_company_id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1)),
      NEW.email,
      'end_user'::public.user_role,
      true
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 4. HABILITA RLS nas tabelas core (idempotente e guardado) ─
-- Sem FORCE: os RPCs SECURITY DEFINER (sessões/licenças) seguem
-- operando; as roles anon/authenticated já ficam sujeitas ao RLS.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','profiles','groups',
    'incidents','incident_history',
    'service_requests','request_history',
    'problems','problem_history',
    'changes','change_history',
    'catalog_items','sla_policies','notifications'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END IF;
  END LOOP;
END $$;

-- ─── 5. Reverte leitura pública de profiles (migration 008) ───
-- Expor todos os perfis (e-mails/PII) ao anon era uma brecha que
-- existia só para a tela de login simulada. Com Supabase Auth real
-- isso não é necessário. (companies permanece com leitura pública,
-- pois o branding white-label é carregado ANTES do login.)
DROP POLICY IF EXISTS select_profile_policy ON public.profiles;
CREATE POLICY select_profile_policy ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS write_profile_policy ON public.profiles;
CREATE POLICY write_profile_policy ON public.profiles
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR auth_id = auth.uid()
    OR (company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR auth_id = auth.uid()
    OR (company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );

-- ─── 6. active_sessions: ownership por profile_id (não auth.uid) ─
-- user_id referencia profiles.id; com Auth real auth.uid() != profile.id.
DROP POLICY IF EXISTS select_session_policy ON public.active_sessions;
CREATE POLICY select_session_policy ON public.active_sessions
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id()
         OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

DROP POLICY IF EXISTS insert_session_policy ON public.active_sessions;
CREATE POLICY insert_session_policy ON public.active_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS update_session_policy ON public.active_sessions;
CREATE POLICY update_session_policy ON public.active_sessions
  FOR UPDATE TO authenticated
  USING (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id()
         OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id()
         OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

DROP POLICY IF EXISTS delete_session_policy ON public.active_sessions;
CREATE POLICY delete_session_policy ON public.active_sessions
  FOR DELETE TO authenticated
  USING (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id()
         OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- ─── 7. Policies para tabelas de histórico (via tabela-pai) ────
-- Isolamento herdado do company_id do ticket-pai.

-- incident_history → incidents
DROP POLICY IF EXISTS select_tenant_policy ON public.incident_history;
CREATE POLICY select_tenant_policy ON public.incident_history
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.incidents i
     WHERE i.id = incident_history.incident_id
       AND i.company_id = public.get_current_user_company_id()));
DROP POLICY IF EXISTS write_tenant_policy ON public.incident_history;
CREATE POLICY write_tenant_policy ON public.incident_history
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.incidents i
     WHERE i.id = incident_history.incident_id
       AND i.company_id = public.get_current_user_company_id()))
  WITH CHECK (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.incidents i
     WHERE i.id = incident_history.incident_id
       AND i.company_id = public.get_current_user_company_id()));

-- request_history → service_requests
DROP POLICY IF EXISTS select_tenant_policy ON public.request_history;
CREATE POLICY select_tenant_policy ON public.request_history
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.service_requests r
     WHERE r.id = request_history.request_id
       AND r.company_id = public.get_current_user_company_id()));
DROP POLICY IF EXISTS write_tenant_policy ON public.request_history;
CREATE POLICY write_tenant_policy ON public.request_history
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.service_requests r
     WHERE r.id = request_history.request_id
       AND r.company_id = public.get_current_user_company_id()))
  WITH CHECK (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.service_requests r
     WHERE r.id = request_history.request_id
       AND r.company_id = public.get_current_user_company_id()));

-- problem_history → problems
DROP POLICY IF EXISTS select_tenant_policy ON public.problem_history;
CREATE POLICY select_tenant_policy ON public.problem_history
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.problems p
     WHERE p.id = problem_history.problem_id
       AND p.company_id = public.get_current_user_company_id()));
DROP POLICY IF EXISTS write_tenant_policy ON public.problem_history;
CREATE POLICY write_tenant_policy ON public.problem_history
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.problems p
     WHERE p.id = problem_history.problem_id
       AND p.company_id = public.get_current_user_company_id()))
  WITH CHECK (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.problems p
     WHERE p.id = problem_history.problem_id
       AND p.company_id = public.get_current_user_company_id()));

-- change_history → changes
DROP POLICY IF EXISTS select_tenant_policy ON public.change_history;
CREATE POLICY select_tenant_policy ON public.change_history
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.changes c
     WHERE c.id = change_history.change_id
       AND c.company_id = public.get_current_user_company_id()));
DROP POLICY IF EXISTS write_tenant_policy ON public.change_history;
CREATE POLICY write_tenant_policy ON public.change_history
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.changes c
     WHERE c.id = change_history.change_id
       AND c.company_id = public.get_current_user_company_id()))
  WITH CHECK (public.is_current_user_msp_admin() OR EXISTS (
    SELECT 1 FROM public.changes c
     WHERE c.id = change_history.change_id
       AND c.company_id = public.get_current_user_company_id()));

-- ─── 8. Policies para catalog_items (catálogo flat) ───────────
DROP POLICY IF EXISTS select_tenant_policy ON public.catalog_items;
CREATE POLICY select_tenant_policy ON public.catalog_items
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_admin_policy ON public.catalog_items;
CREATE POLICY write_admin_policy ON public.catalog_items
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- ─── 9. Policies para groups ──────────────────────────────────
DROP POLICY IF EXISTS select_tenant_policy ON public.groups;
CREATE POLICY select_tenant_policy ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_admin_policy ON public.groups;
CREATE POLICY write_admin_policy ON public.groups
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- ─── 10. Policies para notifications (por dono ou provedor) ────
DROP POLICY IF EXISTS select_owner_policy ON public.notifications;
CREATE POLICY select_owner_policy ON public.notifications
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id());
DROP POLICY IF EXISTS write_owner_policy ON public.notifications;
CREATE POLICY write_owner_policy ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id())
  WITH CHECK (public.is_current_user_msp_admin() OR user_id = public.get_current_profile_id());
