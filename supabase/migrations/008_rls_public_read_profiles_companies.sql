-- ============================================================
-- Flowfy ITSM — Migration 008
-- Ajuste de RLS: Permitir leitura pública de empresas e perfis
-- para viabilizar a tela de login e simulação RBAC no frontend
-- ============================================================

DROP POLICY IF EXISTS select_company_policy ON public.companies;
CREATE POLICY select_company_policy ON public.companies
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS select_profile_policy ON public.profiles;
CREATE POLICY select_profile_policy ON public.profiles
  FOR SELECT TO public
  USING (true);
