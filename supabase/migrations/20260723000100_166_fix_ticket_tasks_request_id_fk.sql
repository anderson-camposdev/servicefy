-- ServiceFY — ticket_tasks.request_id apontava para service_requests,
-- tabela nunca migrada para o modelo unificado de tickets (migration 096
-- renomeou incidents -> tickets, mas service_requests ficou órfã; nada
-- além do seed de dev grava nela desde então).
--
-- Achado no pente fino de 2026-07-23: toda tarefa criada num chamado tipo
-- "requisição" falhava com "Referência inválida entre tenants" —
-- src/components/TicketTasksPanel.tsx grava request_id = ticketId, que é
-- sempre um tickets.id real, nunca um service_requests.id.

-- ─── 1. Reaponta a FK para a tabela real ──────────────────────────────
ALTER TABLE public.ticket_tasks
  DROP CONSTRAINT IF EXISTS ticket_tasks_request_id_fkey;

ALTER TABLE public.ticket_tasks
  ADD CONSTRAINT ticket_tasks_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES public.tickets(id) ON DELETE CASCADE;

-- ─── 2. Corrige o validador de referência entre tenants (migration 146) ──
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
      ('ticket_tasks', 'request_id', 'tickets'),
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

-- ─── 3. Recria o trigger de validação com o parent_table corrigido ────
DROP TRIGGER IF EXISTS trg_ticket_tasks_tenant_references ON public.ticket_tasks;
CREATE TRIGGER trg_ticket_tasks_tenant_references
  BEFORE INSERT OR UPDATE ON public.ticket_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references(
    'incident_id', 'tickets',
    'request_id', 'tickets',
    'parent_task_id', 'ticket_tasks',
    'assigned_group_id', 'assignment_groups',
    'assigned_to_id', 'profiles'
  );

REVOKE ALL ON FUNCTION public.assert_existing_tenant_references() FROM PUBLIC, anon, authenticated;
