-- ServiceFY — baseline operacional ITSM + prontidão do Service Desk Allied IT.
--
-- Objetivos:
--  1. completar, sem apagar nem duplicar por nome, os dados mínimos para o
--     agente abrir incidentes e requisições governadas no tenant Allied IT;
--  2. garantir roteamento, SLA, pausa e aprovação coerentes com a operação;
--  3. expor um diagnóstico administrativo objetivo de prontidão;
--  4. manter incidents.priority sincronizado com a matriz impacto × urgência.

DO $$
DECLARE
  v_company_id       uuid := '44444444-4444-4444-4444-444444444444';
  v_sd_group         uuid;
  v_infra_group      uuid;
  v_access_group     uuid;
  v_approval_group   uuid;
  v_business_cal     uuid;
  v_inc_category     uuid;
  v_network_service  uuid;
  v_m365_service     uuid;
  v_sym_down         uuid;
  v_sym_slow         uuid;
  v_sym_access       uuid;
  v_req_category     uuid;
  v_req_subcategory  uuid;
  v_req_item         uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) THEN
    RAISE EXCEPTION 'Tenant Allied IT não encontrado';
  END IF;

  UPDATE public.companies
     SET active = true,
         is_provider_tenant = true
   WHERE id = v_company_id;

  -- Módulos necessários ao Service Desk e ao agente.
  INSERT INTO public.company_module_entitlements(company_id, module_key, enabled, source)
  SELECT v_company_id, x.module_key, true, 'plan'
    FROM (VALUES ('core'), ('itsm'), ('virtual_agent'), ('knowledge')) AS x(module_key)
  ON CONFLICT (company_id, module_key) DO UPDATE
    SET enabled = true, updated_at = now();

  -- Equipes solucionadoras e aprovadora.
  SELECT id INTO v_sd_group FROM public.assignment_groups
   WHERE company_id = v_company_id AND lower(name) = lower('Service Desk N1') LIMIT 1;
  IF v_sd_group IS NULL THEN
    v_sd_group := 'a11e0000-0000-4000-8000-000000000001';
    INSERT INTO public.assignment_groups(id, company_id, name, description, is_active)
    VALUES (v_sd_group, v_company_id, 'Service Desk N1', 'Triagem, primeiro atendimento e restauração inicial.', true)
    ON CONFLICT (id) DO UPDATE SET is_active = true;
  END IF;

  SELECT id INTO v_infra_group FROM public.assignment_groups
   WHERE company_id = v_company_id AND lower(name) = lower('Infraestrutura e Redes') LIMIT 1;
  IF v_infra_group IS NULL THEN
    v_infra_group := 'a11e0000-0000-4000-8000-000000000002';
    INSERT INTO public.assignment_groups(id, company_id, name, description, is_active)
    VALUES (v_infra_group, v_company_id, 'Infraestrutura e Redes', 'Conectividade, redes, servidores e serviços de infraestrutura.', true)
    ON CONFLICT (id) DO UPDATE SET is_active = true;
  END IF;

  SELECT id INTO v_access_group FROM public.assignment_groups
   WHERE company_id = v_company_id AND lower(name) = lower('Acessos e Identidades') LIMIT 1;
  IF v_access_group IS NULL THEN
    v_access_group := 'a11e0000-0000-4000-8000-000000000003';
    INSERT INTO public.assignment_groups(id, company_id, name, description, is_active)
    VALUES (v_access_group, v_company_id, 'Acessos e Identidades', 'Contas, permissões, Microsoft 365 e ciclo de vida de acessos.', true)
    ON CONFLICT (id) DO UPDATE SET is_active = true;
  END IF;

  SELECT id INTO v_approval_group FROM public.assignment_groups
   WHERE company_id = v_company_id AND lower(name) = lower('Aprovadores de Serviço') LIMIT 1;
  IF v_approval_group IS NULL THEN
    v_approval_group := 'a11e0000-0000-4000-8000-000000000004';
    INSERT INTO public.assignment_groups(id, company_id, name, description, is_active)
    VALUES (v_approval_group, v_company_id, 'Aprovadores de Serviço', 'Aprovação de solicitações controladas e acessos.', true)
    ON CONFLICT (id) DO UPDATE SET is_active = true;
  END IF;

  -- Equipe técnica ativa participa da fila N1; agentes também nas filas especialistas.
  INSERT INTO public.user_groups(user_id, group_id)
  SELECT p.id, v_sd_group FROM public.profiles p
   WHERE p.company_id = v_company_id AND p.active = true AND p.role::text <> 'end_user'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_groups(user_id, group_id)
  SELECT p.id, v_infra_group FROM public.profiles p
   WHERE p.company_id = v_company_id AND p.active = true
     AND p.role::text IN ('sysadmin','company_admin','agent','technician','it_manager')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_groups(user_id, group_id)
  SELECT p.id, v_access_group FROM public.profiles p
   WHERE p.company_id = v_company_id AND p.active = true
     AND p.role::text IN ('sysadmin','company_admin','agent','technician','it_manager')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_groups(user_id, group_id)
  SELECT p.id, v_approval_group FROM public.profiles p
   WHERE p.company_id = v_company_id AND p.active = true
     AND p.role::text IN ('sysadmin','company_admin','area_manager','it_manager')
  ON CONFLICT DO NOTHING;

  -- Calendário e políticas. Preenche ausências sem substituir tempos customizados.
  SELECT id INTO v_business_cal FROM public.sla_calendars
   WHERE company_id = v_company_id AND lower(name) = lower('Comercial (08–18, Seg–Sex)') LIMIT 1;
  IF v_business_cal IS NULL THEN
    v_business_cal := 'a11eca1e-0000-4000-8000-000000000001';
    INSERT INTO public.sla_calendars(id, company_id, name, timezone, is_24x7, active)
    VALUES (v_business_cal, v_company_id, 'Comercial (08–18, Seg–Sex)', 'America/Sao_Paulo', false, true)
    ON CONFLICT (id) DO UPDATE SET active = true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sla_calendar_shifts WHERE calendar_id = v_business_cal) THEN
    INSERT INTO public.sla_calendar_shifts(calendar_id, weekday, start_time, end_time)
    SELECT v_business_cal, weekday, time '08:00', time '18:00'
      FROM generate_series(1, 5) AS weekday;
  END IF;

  UPDATE public.companies
     SET default_sla_calendar_id = COALESCE(default_sla_calendar_id, v_business_cal)
   WHERE id = v_company_id;

  INSERT INTO public.sla_policies(company_id, priority, response_time_minutes, resolution_time_minutes, active)
  VALUES
    (v_company_id, 1, 15, 240, true),
    (v_company_id, 2, 30, 480, true),
    (v_company_id, 3, 60, 1440, true),
    (v_company_id, 4, 240, 2880, true),
    (v_company_id, 5, 480, 5760, true)
  ON CONFLICT (company_id, priority) DO NOTHING;

  INSERT INTO public.pending_reasons(company_id, name, slug, requires_customer_action, active)
  VALUES
    (v_company_id, 'Aguardando Usuário', 'aguardando-usuario', true, true),
    (v_company_id, 'Aguardando Fornecedor', 'aguardando-fornecedor', false, true),
    (v_company_id, 'Aguardando Aprovação', 'aguardando-aprovacao', false, true)
  ON CONFLICT (company_id, slug) DO NOTHING;

  -- Catálogo de incidentes: categoria > serviço > sintoma, sempre com fila.
  SELECT id INTO v_inc_category FROM public.catalog_categories
   WHERE company_id = v_company_id AND lower(name) = lower('Infraestrutura') LIMIT 1;
  IF v_inc_category IS NULL THEN
    v_inc_category := 'a11ec001-0000-4000-8000-000000000001';
    INSERT INTO public.catalog_categories(id, company_id, name, description, icon, sort_order, is_active)
    VALUES (v_inc_category, v_company_id, 'Infraestrutura', 'Serviços essenciais de conectividade e produtividade.', 'Network', 10, true);
  END IF;

  SELECT id INTO v_network_service FROM public.catalog_services
   WHERE company_id = v_company_id AND category_id = v_inc_category
     AND lower(name) = lower('Rede e Conectividade') LIMIT 1;
  IF v_network_service IS NULL THEN
    v_network_service := 'a11e5001-0000-4000-8000-000000000001';
    INSERT INTO public.catalog_services(id, company_id, category_id, name, description, icon, sort_order, is_active)
    VALUES (v_network_service, v_company_id, v_inc_category, 'Rede e Conectividade', 'Internet, LAN, Wi-Fi e VPN.', 'Wifi', 10, true);
  END IF;

  SELECT id INTO v_m365_service FROM public.catalog_services
   WHERE company_id = v_company_id AND category_id = v_inc_category
     AND lower(name) = lower('Microsoft 365') LIMIT 1;
  IF v_m365_service IS NULL THEN
    v_m365_service := 'a11e5001-0000-4000-8000-000000000002';
    INSERT INTO public.catalog_services(id, company_id, category_id, name, description, icon, sort_order, is_active)
    VALUES (v_m365_service, v_company_id, v_inc_category, 'Microsoft 365', 'E-mail, Teams, OneDrive e identidade corporativa.', 'Cloud', 20, true);
  END IF;

  INSERT INTO public.system_symptoms(name, icon, sort_order) VALUES
    ('Indisponibilidade / Fora do Ar', 'Power', 3),
    ('Lentidão / Performance', 'Gauge', 2),
    ('Falha de Acesso / Permissão', 'KeyRound', 4)
  ON CONFLICT (name) DO NOTHING;
  SELECT id INTO v_sym_down FROM public.system_symptoms WHERE name = 'Indisponibilidade / Fora do Ar';
  SELECT id INTO v_sym_slow FROM public.system_symptoms WHERE name = 'Lentidão / Performance';
  SELECT id INTO v_sym_access FROM public.system_symptoms WHERE name = 'Falha de Acesso / Permissão';

  INSERT INTO public.catalog_service_symptoms(
    company_id, service_id, symptom_id, sla_hours, assignment_group_id, form_fields, ui_config, active
  ) VALUES
    (v_company_id, v_network_service, v_sym_down, 4, v_infra_group,
      '[{"id":"local","label":"Local ou unidade afetada","type":"text","required":true}]'::jsonb, '{}'::jsonb, true),
    (v_company_id, v_network_service, v_sym_slow, 8, v_infra_group,
      '[{"id":"alcance","label":"Quantas pessoas estão afetadas?","type":"text","required":true}]'::jsonb, '{}'::jsonb, true),
    (v_company_id, v_m365_service, v_sym_access, 8, v_access_group,
      '[{"id":"conta","label":"Conta ou e-mail afetado","type":"text","required":true}]'::jsonb, '{}'::jsonb, true)
  ON CONFLICT (service_id, symptom_id) DO NOTHING;

  -- Catálogo de solicitações com item simples e item controlado por aprovação.
  SELECT id INTO v_req_category FROM public.request_categories
   WHERE company_id = v_company_id AND lower(name) = lower('Acessos e Identidades') LIMIT 1;
  IF v_req_category IS NULL THEN
    v_req_category := 'a11e7001-0000-4000-8000-000000000001';
    INSERT INTO public.request_categories(id, company_id, name, description, icon, active, sort_order)
    VALUES (v_req_category, v_company_id, 'Acessos e Identidades', 'Solicitações padronizadas de conta e permissão.', 'KeyRound', true, 10);
  END IF;

  SELECT id INTO v_req_subcategory FROM public.request_subcategories
   WHERE company_id = v_company_id AND category_id = v_req_category
     AND lower(name) = lower('Contas e Permissões') LIMIT 1;
  IF v_req_subcategory IS NULL THEN
    v_req_subcategory := 'a11e8001-0000-4000-8000-000000000001';
    INSERT INTO public.request_subcategories(id, company_id, category_id, name, description, icon, active, sort_order)
    VALUES (v_req_subcategory, v_company_id, v_req_category, 'Contas e Permissões', 'Criação, alteração e recuperação de acessos.', 'Users', true, 10);
  END IF;

  SELECT id INTO v_req_item FROM public.request_items
   WHERE company_id = v_company_id AND lower(name) = lower('Desbloqueio de conta') LIMIT 1;
  IF v_req_item IS NULL THEN
    INSERT INTO public.request_items(
      id, company_id, request_category_id, request_subcategory_id, name, description, icon,
      form_fields, ui_config, assignment_group_id, active, sort_order, requires_approval
    ) VALUES (
      'a11e9001-0000-4000-8000-000000000001', v_company_id, v_req_category, v_req_subcategory,
      'Desbloqueio de conta', 'Recuperação de acesso a uma conta corporativa existente.', 'Unlock',
      '[{"id":"conta","label":"Conta ou e-mail","type":"text","required":true},{"id":"sistema","label":"Sistema","type":"select","required":true,"options":["Microsoft 365","VPN","Outro"]}]'::jsonb,
      '{}'::jsonb, v_access_group, true, 10, false
    );
  ELSE
    UPDATE public.request_items SET assignment_group_id = COALESCE(assignment_group_id, v_access_group)
     WHERE id = v_req_item;
  END IF;

  SELECT id INTO v_req_item FROM public.request_items
   WHERE company_id = v_company_id AND lower(name) = lower('Solicitar acesso ao Microsoft 365') LIMIT 1;
  IF v_req_item IS NULL THEN
    INSERT INTO public.request_items(
      id, company_id, request_category_id, request_subcategory_id, name, description, icon,
      form_fields, ui_config, assignment_group_id, active, sort_order,
      requires_approval, approval_group_id, approval_mode
    ) VALUES (
      'a11e9001-0000-4000-8000-000000000002', v_company_id, v_req_category, v_req_subcategory,
      'Solicitar acesso ao Microsoft 365', 'Concessão governada de licença ou permissão Microsoft 365.', 'BadgePlus',
      '[{"id":"beneficiario","label":"E-mail do beneficiário","type":"text","required":true},{"id":"acesso","label":"Acesso necessário","type":"select","required":true,"options":["Licença Microsoft 365","Caixa compartilhada","Grupo do Teams"]},{"id":"justificativa","label":"Justificativa de negócio","type":"textarea","required":true}]'::jsonb,
      '{}'::jsonb, v_access_group, true, 20, true, v_approval_group, 'any'
    );
  END IF;

  -- Ações obrigatórias do agente permanecem habilitadas.
  UPDATE public.virtual_agent_actions
     SET enabled = true
   WHERE company_id = v_company_id
     AND action_key IN ('check_tickets','handoff_to_human','triage_open');
END $$;

-- O motor calcula priority_level pela matriz. Esta projeção mantém o rótulo
-- legado incidents.priority coerente para filas, relatórios e automações.
CREATE OR REPLACE FUNCTION public.sync_ticket_priority_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.priority_level BETWEEN 1 AND 5 THEN
    NEW.priority := CASE NEW.priority_level
      WHEN 1 THEN 'P1 - Critical'
      WHEN 2 THEN 'P2 - High'
      WHEN 3 THEN 'P3 - Moderate'
      WHEN 4 THEN 'P4 - Low'
      WHEN 5 THEN 'P5 - Planning'
    END::public.ticket_priority;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_sync_ticket_priority_label ON public.incidents;
CREATE TRIGGER zz_sync_ticket_priority_label
  BEFORE INSERT OR UPDATE OF impact, urgency, priority_level, symptom_id, request_item_id
  ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ticket_priority_label();

REVOKE ALL ON FUNCTION public.sync_ticket_priority_label() FROM public, anon, authenticated;

-- Diagnóstico administrativo consumido pela tela do Agente Virtual.
CREATE OR REPLACE FUNCTION public.itsm_service_desk_readiness(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_name text;
  v_staff integer;
  v_groups integer;
  v_groups_with_members integer;
  v_incident_routes integer;
  v_request_routes integer;
  v_approval_items integer;
  v_invalid_approvals integer;
  v_sla_policies integer;
  v_calendar_ready boolean;
  v_pending integer;
  v_agent_ready boolean;
  v_checks jsonb;
  v_ready boolean;
BEGIN
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_company_name FROM public.companies WHERE id = p_company_id AND active = true;
  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Tenant ativo não encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_staff FROM public.profiles
   WHERE company_id = p_company_id AND active = true AND role::text <> 'end_user';
  SELECT count(*) INTO v_groups FROM public.assignment_groups
   WHERE company_id = p_company_id AND is_active = true;
  SELECT count(DISTINCT g.id) INTO v_groups_with_members
    FROM public.assignment_groups g JOIN public.user_groups ug ON ug.group_id = g.id
   WHERE g.company_id = p_company_id AND g.is_active = true;
  SELECT count(*) INTO v_incident_routes
    FROM public.catalog_service_symptoms css
    JOIN public.catalog_services s ON s.id = css.service_id AND s.company_id = css.company_id AND s.is_active = true
    JOIN public.catalog_categories c ON c.id = s.category_id AND c.company_id = css.company_id AND c.is_active = true
    JOIN public.assignment_groups g ON g.id = css.assignment_group_id AND g.company_id = css.company_id AND g.is_active = true
   WHERE css.company_id = p_company_id AND css.active = true;
  SELECT count(*) INTO v_request_routes
    FROM public.request_items ri
    JOIN public.assignment_groups g ON g.id = ri.assignment_group_id AND g.company_id = ri.company_id AND g.is_active = true
   WHERE ri.company_id = p_company_id AND ri.active = true
     AND (ri.request_category_id IS NOT NULL OR ri.request_subcategory_id IS NOT NULL);
  SELECT count(*) INTO v_approval_items FROM public.request_items
   WHERE company_id = p_company_id AND active = true AND requires_approval = true;
  SELECT count(*) INTO v_invalid_approvals
    FROM public.request_items ri
   WHERE ri.company_id = p_company_id AND ri.active = true AND ri.requires_approval = true
     AND (ri.approval_group_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.user_groups ug
       JOIN public.profiles p ON p.id = ug.user_id AND p.active = true
       WHERE ug.group_id = ri.approval_group_id
     ));
  SELECT count(*) INTO v_sla_policies FROM public.sla_policies
   WHERE company_id = p_company_id AND active = true AND priority BETWEEN 1 AND 5;
  SELECT EXISTS (
    SELECT 1 FROM public.companies co
    JOIN public.sla_calendars cal ON cal.id = co.default_sla_calendar_id
     AND cal.company_id = co.id AND cal.active = true
    WHERE co.id = p_company_id
      AND (cal.is_24x7 OR EXISTS (SELECT 1 FROM public.sla_calendar_shifts sh WHERE sh.calendar_id = cal.id))
  ) INTO v_calendar_ready;
  SELECT count(*) INTO v_pending FROM public.pending_reasons
   WHERE company_id = p_company_id AND active = true;
  SELECT
    EXISTS (SELECT 1 FROM public.company_module_entitlements
      WHERE company_id = p_company_id AND module_key = 'virtual_agent' AND enabled = true)
    AND NOT EXISTS (
      SELECT required.action_key FROM (VALUES ('check_tickets'),('handoff_to_human'),('triage_open')) required(action_key)
      WHERE NOT EXISTS (SELECT 1 FROM public.virtual_agent_actions a
        WHERE a.company_id = p_company_id AND a.action_key = required.action_key AND a.enabled = true)
    ) INTO v_agent_ready;

  v_checks := jsonb_build_array(
    jsonb_build_object('key','staff','label','Equipe técnica ativa','ready',v_staff > 0,'details',v_staff || ' perfil(is)'),
    jsonb_build_object('key','groups','label','Filas com membros','ready',v_groups >= 3 AND v_groups_with_members >= 3,'details',v_groups_with_members || '/' || v_groups || ' com membros'),
    jsonb_build_object('key','incident_catalog','label','Rotas de incidente','ready',v_incident_routes > 0,'details',v_incident_routes || ' rota(s)'),
    jsonb_build_object('key','request_catalog','label','Rotas de solicitação','ready',v_request_routes > 0,'details',v_request_routes || ' item(ns)'),
    jsonb_build_object('key','approvals','label','Aprovação governada','ready',v_approval_items > 0 AND v_invalid_approvals = 0,'details',v_approval_items || ' item(ns); ' || v_invalid_approvals || ' inválido(s)'),
    jsonb_build_object('key','sla','label','SLA P1–P5 e calendário','ready',v_sla_policies = 5 AND v_calendar_ready,'details',v_sla_policies || '/5 políticas'),
    jsonb_build_object('key','pending','label','Motivos de pausa','ready',v_pending >= 3,'details',v_pending || ' motivo(s)'),
    jsonb_build_object('key','virtual_agent','label','Agente: abrir, consultar e transferir','ready',v_agent_ready,'details',CASE WHEN v_agent_ready THEN 'ações habilitadas' ELSE 'configuração incompleta' END)
  );
  SELECT bool_and((item->>'ready')::boolean) INTO v_ready FROM jsonb_array_elements(v_checks) item;

  RETURN jsonb_build_object('companyId',p_company_id,'companyName',v_company_name,'ready',v_ready,'checks',v_checks,'checkedAt',now());
END;
$$;

REVOKE ALL ON FUNCTION public.itsm_service_desk_readiness(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.itsm_service_desk_readiness(uuid) TO authenticated;
