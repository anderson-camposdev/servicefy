-- Reconstrói o livro-caixa de SLA para chamados criados antes da ativação
-- dos triggers de governança. Cada INSERT é idempotente e preserva eventos
-- reais já existentes.

INSERT INTO public.sla_events (incident_id, event_type, metadata, created_at)
SELECT i.id, 'response_start',
       jsonb_build_object('deadline', i.sla_response_deadline),
       i.created_at
  FROM public.incidents i
 WHERE i.sla_response_deadline IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sla_events e
      WHERE e.incident_id = i.id AND e.event_type = 'response_start'
   );

INSERT INTO public.sla_events (incident_id, event_type, metadata, created_at)
SELECT i.id, 'resolution_start',
       jsonb_build_object(
         'deadline', i.sla_resolution_deadline,
         'priority_level', i.priority_level
       ),
       i.created_at
  FROM public.incidents i
 WHERE i.sla_resolution_deadline IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sla_events e
      WHERE e.incident_id = i.id AND e.event_type = 'resolution_start'
   );

INSERT INTO public.sla_events (incident_id, event_type, metadata, created_at)
SELECT i.id, 'response_achieved',
       jsonb_build_object(
         'at', i.responded_at,
         'breached', i.sla_response_deadline IS NOT NULL
                     AND i.responded_at > i.sla_response_deadline
       ),
       i.responded_at
  FROM public.incidents i
 WHERE i.responded_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sla_events e
      WHERE e.incident_id = i.id AND e.event_type = 'response_achieved'
   );

INSERT INTO public.sla_events (incident_id, event_type, metadata, created_at)
SELECT i.id, 'resolution_achieved',
       jsonb_build_object(
         'at', i.resolved_at,
         'breached', i.sla_resolution_deadline IS NOT NULL
                     AND i.resolved_at > i.sla_resolution_deadline
       ),
       i.resolved_at
  FROM public.incidents i
 WHERE i.resolved_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sla_events e
      WHERE e.incident_id = i.id AND e.event_type = 'resolution_achieved'
   );

INSERT INTO public.sla_events (incident_id, event_type, metadata, created_at)
SELECT i.id, 'paused',
       jsonb_build_object(
         'state', i.state,
         'reason_id', i.pending_reason_id,
         'pending_reason', pr.name,
         'at', i.paused_at
       ),
       i.paused_at
  FROM public.incidents i
  LEFT JOIN public.pending_reasons pr ON pr.id = i.pending_reason_id
 WHERE i.paused_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sla_events e
      WHERE e.incident_id = i.id AND e.event_type = 'paused'
   );

INSERT INTO public.sla_events (incident_id, event_type, metadata, created_at)
SELECT i.id, 'breached', jsonb_build_object('kind', 'response'),
       COALESCE(i.sla_response_deadline, i.updated_at, i.created_at)
  FROM public.incidents i
 WHERE i.is_response_breached = true
   AND NOT EXISTS (
     SELECT 1 FROM public.sla_events e
      WHERE e.incident_id = i.id
        AND e.event_type = 'breached'
        AND e.metadata ->> 'kind' = 'response'
   );

INSERT INTO public.sla_events (incident_id, event_type, metadata, created_at)
SELECT i.id, 'breached', jsonb_build_object('kind', 'resolution'),
       COALESCE(i.sla_resolution_deadline, i.updated_at, i.created_at)
  FROM public.incidents i
 WHERE i.is_resolution_breached = true
   AND NOT EXISTS (
     SELECT 1 FROM public.sla_events e
      WHERE e.incident_id = i.id
        AND e.event_type = 'breached'
        AND e.metadata ->> 'kind' = 'resolution'
   );
