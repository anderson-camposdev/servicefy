-- Executar no SQL Editor do Supabase antes da migration 144.
-- Retorna somente contagens agregadas; nenhum dado pessoal é projetado.

WITH checks AS (
  SELECT 'duplicate_profile_email_keys' AS metric, count(*)::bigint AS value
  FROM (
    SELECT 1
    FROM public.profiles
    GROUP BY company_id, lower(btrim(email))
    HAVING count(*) > 1
  ) duplicate_keys

  UNION ALL

  SELECT 'duplicate_active_department_keys', count(*)::bigint
  FROM (
    SELECT 1
    FROM public.departments
    WHERE is_active
    GROUP BY company_id, lower(btrim(name))
    HAVING count(*) > 1
  ) duplicate_keys

  UNION ALL

  SELECT 'duplicate_active_assignment_group_keys', count(*)::bigint
  FROM (
    SELECT 1
    FROM public.assignment_groups
    WHERE is_active
    GROUP BY company_id, lower(btrim(name))
    HAVING count(*) > 1
  ) duplicate_keys

  UNION ALL

  SELECT 'cross_tenant_user_group_links', count(*)::bigint
  FROM public.user_groups ug
  JOIN public.profiles p ON p.id = ug.user_id
  JOIN public.assignment_groups ag ON ag.id = ug.group_id
  WHERE p.company_id IS DISTINCT FROM ag.company_id

  UNION ALL

  SELECT 'invalid_profile_manager_links', count(*)::bigint
  FROM public.profiles p
  LEFT JOIN public.profiles manager ON manager.id = p.manager_id
  LEFT JOIN public.profiles alternate ON alternate.id = p.alternate_manager_id
  WHERE (p.manager_id IS NOT NULL AND (
           p.manager_id = p.id
           OR manager.id IS NULL
           OR manager.company_id IS DISTINCT FROM p.company_id
         ))
     OR (p.alternate_manager_id IS NOT NULL AND (
           p.alternate_manager_id = p.id
           OR alternate.id IS NULL
           OR alternate.company_id IS DISTINCT FROM p.company_id
         ))

  UNION ALL

  SELECT 'invalid_department_manager_links', count(*)::bigint
  FROM public.departments d
  LEFT JOIN public.profiles manager ON manager.id = d.manager_id
  LEFT JOIN public.profiles alternate ON alternate.id = d.alternate_manager_id
  WHERE (d.manager_id IS NOT NULL AND (
           manager.id IS NULL
           OR manager.company_id IS DISTINCT FROM d.company_id
         ))
     OR (d.alternate_manager_id IS NOT NULL AND (
           alternate.id IS NULL
           OR alternate.company_id IS DISTINCT FROM d.company_id
         ))
)
SELECT metric, value, value = 0 AS ready
FROM checks
ORDER BY metric;
