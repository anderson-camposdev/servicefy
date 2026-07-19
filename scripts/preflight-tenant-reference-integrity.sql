-- Preflight somente leitura para executar ANTES da migration 146 em produção.
-- O resultado seguro tem zero em todas as linhas.
WITH checks AS (
  SELECT 'catalog_categories.department_id' relation, count(*) violations FROM public.catalog_categories c JOIN public.departments p ON p.id = c.department_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'catalog_items.category_id', count(*) FROM public.catalog_items c JOIN public.catalog_categories p ON p.id = c.category_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'catalog_services.category_id', count(*) FROM public.catalog_services c JOIN public.catalog_categories p ON p.id = c.category_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'catalog_service_symptoms.service_id', count(*) FROM public.catalog_service_symptoms c JOIN public.catalog_services p ON p.id = c.service_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'catalog_service_symptoms.assignment_group_id', count(*) FROM public.catalog_service_symptoms c JOIN public.assignment_groups p ON p.id = c.assignment_group_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'catalog_service_symptoms.sla_calendar_id', count(*) FROM public.catalog_service_symptoms c JOIN public.sla_calendars p ON p.id = c.sla_calendar_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_categories.department_id', count(*) FROM public.request_categories c JOIN public.departments p ON p.id = c.department_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_subcategories.category_id', count(*) FROM public.request_subcategories c JOIN public.request_categories p ON p.id = c.category_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_items.request_category_id', count(*) FROM public.request_items c JOIN public.request_categories p ON p.id = c.request_category_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_items.request_subcategory_id', count(*) FROM public.request_items c JOIN public.request_subcategories p ON p.id = c.request_subcategory_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_items.assignment_group_id', count(*) FROM public.request_items c JOIN public.assignment_groups p ON p.id = c.assignment_group_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_items.approval_group_id', count(*) FROM public.request_items c JOIN public.assignment_groups p ON p.id = c.approval_group_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_items.sla_calendar_id', count(*) FROM public.request_items c JOIN public.sla_calendars p ON p.id = c.sla_calendar_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.caller_id', count(*) FROM public.tickets c JOIN public.profiles p ON p.id = c.caller_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.assigned_to_id', count(*) FROM public.tickets c JOIN public.profiles p ON p.id = c.assigned_to_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.assigned_group_id', count(*) FROM public.tickets c JOIN public.assignment_groups p ON p.id = c.assigned_group_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.assignment_group_id', count(*) FROM public.tickets c JOIN public.assignment_groups p ON p.id = c.assignment_group_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.catalog_item_id', count(*) FROM public.tickets c JOIN public.incident_catalog_items p ON p.id = c.catalog_item_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.catalog_subitem_id', count(*) FROM public.tickets c JOIN public.incident_catalog_subitems p ON p.id = c.catalog_subitem_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.catalog_symptom_id', count(*) FROM public.tickets c JOIN public.incident_catalog_symptoms p ON p.id = c.catalog_symptom_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.catalog_service_id', count(*) FROM public.tickets c JOIN public.catalog_services p ON p.id = c.catalog_service_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.pending_reason_id', count(*) FROM public.tickets c JOIN public.pending_reasons p ON p.id = c.pending_reason_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.request_subcategory_id', count(*) FROM public.tickets c JOIN public.request_subcategories p ON p.id = c.request_subcategory_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'tickets.case_id', count(*) FROM public.tickets c JOIN public.cases p ON p.id = c.case_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_approvals.incident_id', count(*) FROM public.request_approvals c JOIN public.tickets p ON p.id = c.incident_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'request_approvals.approver_id', count(*) FROM public.request_approvals c JOIN public.profiles p ON p.id = c.approver_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'ticket_tasks.incident_id', count(*) FROM public.ticket_tasks c JOIN public.tickets p ON p.id = c.incident_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'ticket_tasks.request_id', count(*) FROM public.ticket_tasks c JOIN public.service_requests p ON p.id = c.request_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'ticket_tasks.parent_task_id', count(*) FROM public.ticket_tasks c JOIN public.ticket_tasks p ON p.id = c.parent_task_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'ticket_tasks.assigned_group_id', count(*) FROM public.ticket_tasks c JOIN public.assignment_groups p ON p.id = c.assigned_group_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'ticket_tasks.assigned_to_id', count(*) FROM public.ticket_tasks c JOIN public.profiles p ON p.id = c.assigned_to_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'cases.service_domain_id', count(*) FROM public.cases c JOIN public.service_domains p ON p.id = c.service_domain_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'cases.case_type_id', count(*) FROM public.cases c JOIN public.case_types p ON p.id = c.case_type_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'cases.requester_id', count(*) FROM public.cases c JOIN public.profiles p ON p.id = c.requester_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'cases.assigned_to_id', count(*) FROM public.cases c JOIN public.profiles p ON p.id = c.assigned_to_id WHERE p.company_id IS DISTINCT FROM c.company_id
  UNION ALL SELECT 'cases.assignment_group_id', count(*) FROM public.cases c JOIN public.assignment_groups p ON p.id = c.assignment_group_id WHERE p.company_id IS DISTINCT FROM c.company_id
)
SELECT relation, violations
FROM checks
ORDER BY relation;
