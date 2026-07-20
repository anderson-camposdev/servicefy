-- ServiceFY — decisão de produto: ops_manager e governance_manager passam a
-- gerenciar as áreas OPERACIONAIS de Configurações (departamentos, equipes
-- solucionadoras, domínios/tipos de caso, catálogos de incidente/requisição,
-- macros, templates de notificação, CMDB, políticas de SLA, motivos de
-- pausa, biblioteca de formulários) no próprio tenant — o mesmo nível que
-- company_admin já tinha nessas tabelas específicas.
--
-- Deliberadamente NÃO estendido a: segurança/LGPD, licenciamento/módulos
-- contratados, identidade visual/branding, conexões e credenciais
-- omnichannel/SMTP, webhooks, planos/assinaturas — essas continuam
-- exclusivas de sysadmin/company_admin via is_settings_admin (inalterada).
--
-- Implementação: função nova is_operational_admin() + políticas ADICIONAIS
-- (não substitui nem remove nenhuma policy existente) — permissivas se
-- combinam por OR, então isto só amplia quem pode escrever, nunca restringe
-- o que já funcionava para sysadmin/company_admin.

CREATE OR REPLACE FUNCTION public.is_operational_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_current_user_msp_admin()
    OR (
      p_company_id = public.get_current_user_company_id()
      AND public.get_current_user_role() = ANY (
        ARRAY['sysadmin', 'company_admin', 'ops_manager', 'governance_manager']
      )
    );
$$;

REVOKE ALL ON FUNCTION public.is_operational_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_operational_admin(uuid) TO authenticated;

-- Tabelas hoje gated por is_settings_admin diretamente
CREATE POLICY case_types_ops_write ON public.case_types FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY ci_classes_ops_write ON public.ci_classes FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY ci_rel_types_ops_write ON public.ci_relationship_types FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY configuration_items_ops_write ON public.configuration_items FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY notification_templates_ops_write ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY service_domains_ops_write ON public.service_domains FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));

-- Tabelas hoje gated por checagem inline de role (sysadmin/company_admin)
CREATE POLICY assignment_groups_ops_write ON public.assignment_groups FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY catalog_categories_ops_write ON public.catalog_categories FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY catalog_service_symptoms_ops_write ON public.catalog_service_symptoms FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY catalog_services_ops_write ON public.catalog_services FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY departments_ops_write ON public.departments FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY form_templates_ops_write ON public.form_templates FOR ALL TO authenticated
  USING (public.is_operational_admin(tenant_id)) WITH CHECK (public.is_operational_admin(tenant_id));
CREATE POLICY pending_reasons_ops_write ON public.pending_reasons FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY request_categories_ops_write ON public.request_categories FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY request_items_ops_write ON public.request_items FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY request_subcategories_ops_write ON public.request_subcategories FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY response_macros_ops_write ON public.response_macros FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));
CREATE POLICY sla_policies_ops_write ON public.sla_policies FOR ALL TO authenticated
  USING (public.is_operational_admin(company_id)) WITH CHECK (public.is_operational_admin(company_id));

-- Leitura de entitlements (so leitura - sem isto, a tela de Configuracoes
-- mostraria modulos travados como "disponiveis" para ops_manager/
-- governance_manager, pois a tela nao consegue distinguir undefined de
-- false quando a consulta falha por RLS).
CREATE POLICY entitlement_ops_select ON public.company_module_entitlements FOR SELECT TO authenticated
  USING (public.is_operational_admin(company_id));

COMMENT ON FUNCTION public.is_operational_admin(uuid) IS
  'Gate operacional (departamentos, catálogos, CMDB, SLA, grupos) para sysadmin/company_admin/ops_manager/governance_manager. Não substitui is_settings_admin, que continua exclusiva para segurança/licenciamento/branding/integrações.';
