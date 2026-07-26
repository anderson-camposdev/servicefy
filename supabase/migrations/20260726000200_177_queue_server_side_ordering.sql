-- ============================================================
-- 177 — Ordenação operacional no servidor + índice para paginar
--
-- Medido com 50.000 chamados (scripts/scale-bench.sql): a fila do
-- analista buscava TODOS os chamados sem limite, e o PostgREST devolvia
-- só as 1.000 primeiras com HTTP 200 — truncamento silencioso. Como o
-- servidor ordenava por updated_at e a ordenação por urgência acontecia
-- depois, no navegador, um chamado crítico parado há semanas ficava
-- INVISÍVEL para o analista. Reproduzido com um P1 de 60 dias.
--
-- Paginar sozinho não resolve: seria preciso garantir que a página 1
-- traga os mais urgentes. Por isso a ordenação precisa ir para o
-- servidor — e ela não pode depender de now(), senão não é indexável.
--
-- Solução: duas colunas geradas (imutáveis, portanto indexáveis) que
-- reproduzem a mesma regra que ticket-operations.ts já aplica no
-- cliente:
--   queue_rank     0 = aberto e com SLA estourado
--                  1 = aberto
--                  3 = encerrado (Resolved/Closed) — sempre por último
--   queue_deadline prazo realmente ativo (resposta antes de responder,
--                  resolução depois) — ordenar por ele ascendente coloca
--                  "a vencer" antes de "no prazo" sem consultar o relógio.
--
-- A view `incidents` é estendida com CREATE OR REPLACE acrescentando as
-- colunas ao FINAL: os triggers INSTEAD OF continuam intactos, evitando
-- a classe de regressão do commit b3b3a595.
-- ============================================================

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS queue_deadline timestamptz
    GENERATED ALWAYS AS (
      CASE WHEN responded_at IS NOT NULL
           THEN sla_resolution_deadline
           ELSE sla_response_deadline END
    ) STORED;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS queue_rank smallint
    GENERATED ALWAYS AS (
      CASE
        WHEN state = 'Closed'::incident_state
          OR state = 'Resolved'::incident_state THEN 3
        WHEN sla_breached THEN 0
        ELSE 1
      END
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_tickets_queue_order
  ON public.tickets (company_id, ticket_type, queue_rank, queue_deadline NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_tickets_queue_order_global
  ON public.tickets (queue_rank, queue_deadline NULLS LAST);

CREATE OR REPLACE VIEW public.incidents AS
SELECT t.id,
    t.number,
    t.company_id,
    t.short_description,
    t.description,
    t.priority,
    t.state,
    t.caller_id,
    t.caller_name,
    t.assigned_to_id,
    t.assigned_to_name,
    t.assigned_group_id,
    t.assigned_group_name,
    t.sla_breached,
    t.sla_deadline,
    t.created_at,
    t.updated_at,
    t.resolved_at,
    t.closed_at,
    t.catalog_item_id,
    t.catalog_subitem_id,
    t.catalog_symptom_id,
    t.assignment_group_id,
    t.close_code,
    t.close_notes,
    t.ticket_type,
    t.catalog_service_id,
    t.symptom_id,
    t.responded_at,
    t.priority_level,
    t.sla_response_deadline,
    t.sla_resolution_deadline,
    t.sla_managed_by_client,
    t.paused_at,
    t.accumulated_paused_time_minutes,
    t.pending_reason_id,
    t.is_response_breached,
    t.is_resolution_breached,
    t.request_subcategory_id,
    t.accumulated_reopen_time_minutes,
    t.tags,
    t.opened_via,
    t.sla_warning_notified,
    t.approval_status,
    t.approval_decided_at,
    t.case_id,
    ia.category,
    ia.impact,
    ia.urgency,
    ia.root_cause,
    ia.workaround,
    ia.is_major_incident,
    ia.related_problem_id,
    sra.request_item_id,
    sra.form_data,
    sra.cost,
    sra.currency,
    t.resolution_code,
    t.resolution_notes,
    t.kb_candidate,
    t.queue_rank,
    t.queue_deadline
   FROM tickets t
     LEFT JOIN incident_attributes ia ON t.id = ia.ticket_id
     LEFT JOIN service_request_attributes sra ON t.id = sra.ticket_id;
