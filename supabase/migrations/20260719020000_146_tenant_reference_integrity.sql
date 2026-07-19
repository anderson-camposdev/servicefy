-- ServiceFY — integridade referencial multi-tenant do núcleo operacional.
-- RLS limita quem enxerga/escreve; estes gatilhos garantem que IDs válidos de
-- outro tenant nunca possam ser combinados, inclusive por service_role.

CREATE OR REPLACE FUNCTION public.assert_existing_tenant_references()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_relation record;
  v_has_mismatch boolean;
BEGIN
  FOR v_relation IN
    SELECT *
    FROM (VALUES
      ('catalog_categories', 'department_id', 'departments'),
      ('catalog_items', 'category_id', 'catalog_categories'),
      ('catalog_services', 'category_id', 'catalog_categories'),
      ('catalog_service_symptoms', 'service_id', 'catalog_services'),
      ('catalog_service_symptoms', 'assignment_group_id', 'assignment_groups'),
      ('catalog_service_symptoms', 'sla_calendar_id', 'sla_calendars'),
      ('request_categories', 'department_id', 'departments'),
      ('request_subcategories', 'category_id', 'request_categories'),
      ('request_items', 'request_category_id', 'request_categories'),
      ('request_items', 'request_subcategory_id', 'request_subcategories'),
      ('request_items', 'assignment_group_id', 'assignment_groups'),
      ('request_items', 'approval_group_id', 'assignment_groups'),
      ('request_items', 'sla_calendar_id', 'sla_calendars'),
      ('tickets', 'caller_id', 'profiles'),
      ('tickets', 'assigned_to_id', 'profiles'),
      ('tickets', 'assigned_group_id', 'assignment_groups'),
      ('tickets', 'assignment_group_id', 'assignment_groups'),
      ('tickets', 'catalog_item_id', 'incident_catalog_items'),
      ('tickets', 'catalog_subitem_id', 'incident_catalog_subitems'),
      ('tickets', 'catalog_symptom_id', 'incident_catalog_symptoms'),
      ('tickets', 'catalog_service_id', 'catalog_services'),
      ('tickets', 'pending_reason_id', 'pending_reasons'),
      ('tickets', 'request_subcategory_id', 'request_subcategories'),
      ('tickets', 'case_id', 'cases'),
      ('request_approvals', 'incident_id', 'tickets'),
      ('request_approvals', 'approver_id', 'profiles'),
      ('ticket_tasks', 'incident_id', 'tickets'),
      ('ticket_tasks', 'request_id', 'service_requests'),
      ('ticket_tasks', 'parent_task_id', 'ticket_tasks'),
      ('ticket_tasks', 'assigned_group_id', 'assignment_groups'),
      ('ticket_tasks', 'assigned_to_id', 'profiles'),
      ('cases', 'service_domain_id', 'service_domains'),
      ('cases', 'case_type_id', 'case_types'),
      ('cases', 'requester_id', 'profiles'),
      ('cases', 'assigned_to_id', 'profiles'),
      ('cases', 'assignment_group_id', 'assignment_groups')
    ) AS relations(child_table, local_column, parent_table)
  LOOP
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM public.%1$I child
         JOIN public.%2$I parent ON parent.id = child.%3$I
         WHERE child.%3$I IS NOT NULL
           AND parent.company_id IS DISTINCT FROM child.company_id
       )',
      v_relation.child_table,
      v_relation.parent_table,
      v_relation.local_column
    )
    INTO v_has_mismatch;

    IF v_has_mismatch THEN
      RAISE EXCEPTION
        'Referência entre tenants detectada: %.% -> %',
        v_relation.child_table,
        v_relation.local_column,
        v_relation.parent_table
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$$;

SELECT public.assert_existing_tenant_references();

CREATE OR REPLACE FUNCTION public.validate_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_index integer;
  v_local_column text;
  v_parent_table text;
  v_reference_id uuid;
  v_reference_is_valid boolean;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id é obrigatório para validar referências do tenant.'
      USING ERRCODE = '23502';
  END IF;

  IF TG_NARGS = 0 OR mod(TG_NARGS, 2) <> 0 THEN
    RAISE EXCEPTION 'Configuração inválida do validador de tenant.'
      USING ERRCODE = '55000';
  END IF;

  FOR v_index IN 0..TG_NARGS - 1 BY 2 LOOP
    v_local_column := TG_ARGV[v_index];
    v_parent_table := TG_ARGV[v_index + 1];

    IF TG_OP = 'UPDATE'
       AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
       AND (to_jsonb(NEW) ->> v_local_column)
           IS NOT DISTINCT FROM (to_jsonb(OLD) ->> v_local_column) THEN
      CONTINUE;
    END IF;

    v_reference_id := nullif(to_jsonb(NEW) ->> v_local_column, '')::uuid;

    CONTINUE WHEN v_reference_id IS NULL;

    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM public.%I parent
         WHERE parent.id = $1
           AND parent.company_id = $2
       )',
      v_parent_table
    )
    INTO v_reference_is_valid
    USING v_reference_id, NEW.company_id;

    IF NOT v_reference_is_valid THEN
      RAISE EXCEPTION
        'Referência inválida entre tenants: %.% -> %',
        TG_TABLE_NAME,
        v_local_column,
        v_parent_table
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_categories_tenant_references ON public.catalog_categories;
CREATE TRIGGER trg_catalog_categories_tenant_references
  BEFORE INSERT OR UPDATE ON public.catalog_categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'department_id', 'departments'
  );

DROP TRIGGER IF EXISTS trg_catalog_items_tenant_references ON public.catalog_items;
CREATE TRIGGER trg_catalog_items_tenant_references
  BEFORE INSERT OR UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'category_id', 'catalog_categories'
  );

DROP TRIGGER IF EXISTS trg_catalog_services_tenant_references ON public.catalog_services;
CREATE TRIGGER trg_catalog_services_tenant_references
  BEFORE INSERT OR UPDATE ON public.catalog_services
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'category_id', 'catalog_categories'
  );

DROP TRIGGER IF EXISTS trg_catalog_service_symptoms_tenant_references ON public.catalog_service_symptoms;
CREATE TRIGGER trg_catalog_service_symptoms_tenant_references
  BEFORE INSERT OR UPDATE ON public.catalog_service_symptoms
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'service_id', 'catalog_services',
    'assignment_group_id', 'assignment_groups',
    'sla_calendar_id', 'sla_calendars'
  );

DROP TRIGGER IF EXISTS trg_request_categories_tenant_references ON public.request_categories;
CREATE TRIGGER trg_request_categories_tenant_references
  BEFORE INSERT OR UPDATE ON public.request_categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'department_id', 'departments'
  );

DROP TRIGGER IF EXISTS trg_request_subcategories_tenant_references ON public.request_subcategories;
CREATE TRIGGER trg_request_subcategories_tenant_references
  BEFORE INSERT OR UPDATE ON public.request_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'category_id', 'request_categories'
  );

DROP TRIGGER IF EXISTS trg_request_items_tenant_references ON public.request_items;
CREATE TRIGGER trg_request_items_tenant_references
  BEFORE INSERT OR UPDATE ON public.request_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'request_category_id', 'request_categories',
    'request_subcategory_id', 'request_subcategories',
    'assignment_group_id', 'assignment_groups',
    'approval_group_id', 'assignment_groups',
    'sla_calendar_id', 'sla_calendars'
  );

DROP TRIGGER IF EXISTS trg_tickets_tenant_references ON public.tickets;
CREATE TRIGGER trg_tickets_tenant_references
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'caller_id', 'profiles',
    'assigned_to_id', 'profiles',
    'assigned_group_id', 'assignment_groups',
    'assignment_group_id', 'assignment_groups',
    'catalog_item_id', 'incident_catalog_items',
    'catalog_subitem_id', 'incident_catalog_subitems',
    'catalog_symptom_id', 'incident_catalog_symptoms',
    'catalog_service_id', 'catalog_services',
    'pending_reason_id', 'pending_reasons',
    'request_subcategory_id', 'request_subcategories',
    'case_id', 'cases'
  );

DROP TRIGGER IF EXISTS trg_request_approvals_tenant_references ON public.request_approvals;
CREATE TRIGGER trg_request_approvals_tenant_references
  BEFORE INSERT OR UPDATE ON public.request_approvals
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'incident_id', 'tickets',
    'approver_id', 'profiles'
  );

DROP TRIGGER IF EXISTS trg_ticket_tasks_tenant_references ON public.ticket_tasks;
CREATE TRIGGER trg_ticket_tasks_tenant_references
  BEFORE INSERT OR UPDATE ON public.ticket_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'incident_id', 'tickets',
    'request_id', 'service_requests',
    'parent_task_id', 'ticket_tasks',
    'assigned_group_id', 'assignment_groups',
    'assigned_to_id', 'profiles'
  );

DROP TRIGGER IF EXISTS trg_cases_tenant_references ON public.cases;
CREATE TRIGGER trg_cases_tenant_references
  BEFORE INSERT OR UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'service_domain_id', 'service_domains',
    'case_type_id', 'case_types',
    'requester_id', 'profiles',
    'assigned_to_id', 'profiles',
    'assignment_group_id', 'assignment_groups'
  );

REVOKE ALL ON FUNCTION public.validate_tenant_references() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_existing_tenant_references() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_tenant_references()
  IS 'Impede referências a recursos de outro tenant nas tabelas operacionais do ServiceFY.';
COMMENT ON FUNCTION public.assert_existing_tenant_references()
  IS 'Preflight que interrompe a migration se o núcleo operacional já contiver referências entre tenants.';
