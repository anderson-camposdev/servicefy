-- ============================================================
-- 178 — KPIs da fila calculados no banco, não no navegador
--
-- incidentsService.getKPIs() buscava as LINHAS e contava em JavaScript
-- (rows.filter(...).length). Com o teto de 1.000 do PostgREST, medido em
-- 2026-07-26 com 50.000 chamados:
--
--     card "Total na fila"  mostrava 1.000   (real: 50.010)
--     card "SLA violado"    mostrava 1.000   (real: 31.762)
--
-- Números errados e silenciosos — e "SLA violado" é métrica contratual,
-- vai para relatório de cliente.
--
-- Esta RPC devolve as contagens exatas numa única ida ao banco.
--
-- SECURITY INVOKER (padrão): a RLS de tickets é aplicada normalmente, então
-- cada usuário conta apenas o que pode enxergar — sem risco de a função
-- virar um caminho paralelo de vazamento entre tenants.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_ticket_queue_kpis(
  p_filter_company_id uuid  DEFAULT NULL,
  p_ticket_type       text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH eu AS (
    SELECT public.get_current_profile_id() AS profile_id
  ),
  meus_grupos AS (
    SELECT ug.group_id FROM public.user_groups ug, eu WHERE ug.user_id = eu.profile_id
  )
  SELECT jsonb_build_object(
    'total',          count(*),
    'critical',       count(*) FILTER (WHERE t.priority = 'P1 - Critical'::public.ticket_priority),
    'inProgress',     count(*) FILTER (WHERE t.state    = 'In Progress'::public.incident_state),
    'slaBreached',    count(*) FILTER (WHERE t.sla_breached),
    'unassigned',     count(*) FILTER (WHERE t.assigned_to_id IS NULL),
    -- "a vencer": ainda aberto, ainda não estourado, e o prazo ativo cai
    -- nas próximas 4h — mesma janela que ticket-operations.ts usa.
    'slaToExpire',    count(*) FILTER (
                        WHERE t.queue_rank = 1
                          AND t.queue_deadline IS NOT NULL
                          AND t.queue_deadline > now()
                          AND t.queue_deadline <= now() + interval '4 hours'),
    'myQueue',        count(*) FILTER (WHERE t.assigned_to_id = (SELECT profile_id FROM eu)),
    'myGroupsQueue',  count(*) FILTER (WHERE t.assignment_group_id IN (SELECT group_id FROM meus_grupos)),
    'resolvedToday',  count(*) FILTER (WHERE t.resolved_at >= date_trunc('day', now()))
  )
  FROM public.tickets t
  WHERE (p_filter_company_id IS NULL OR t.company_id = p_filter_company_id)
    AND (p_ticket_type       IS NULL OR t.ticket_type = p_ticket_type);
$function$;

GRANT EXECUTE ON FUNCTION public.get_ticket_queue_kpis(uuid, text) TO authenticated;
