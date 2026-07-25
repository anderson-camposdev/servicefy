-- ============================================================
-- 174 — Estouro de SLA vira marco único, não batimento por minuto
--
-- Sintoma: a linha do tempo de SLA de um chamado exibia milhares de
-- entradas "SLA estourado" repetidas, uma por minuto. Em números:
-- 27.378 linhas de 'breached' para apenas 37 estouros reais.
--
-- Causa raiz (JÁ CORRIGIDA em b3b3a595): check_sla_breaches() lia de
-- public.tickets mas escrevia a flag em public.incidents (a view de
-- compatibilidade), cujo trigger INSTEAD OF não mapeava
-- is_response_breached/is_resolution_breached. A flag nunca persistia,
-- o chamado voltava na consulta e o cron re-logava o mesmo estouro a
-- cada ciclo. O último evento duplicado é de 2026-07-21, data daquela
-- correção — a torneira já está fechada.
--
-- Esta migration faz as duas coisas que faltaram:
--   1. Limpa o lixo histórico (só 'breached'; os demais tipos estão
--      1:1 e 'paused'/'resumed' repetem legitimamente).
--   2. Torna sla_log_event idempotente para 'breached', para que a
--      classe de bug não possa se repetir por outro caminho — o lock
--      de concorrência da migration 171 protegia contra execuções
--      simultâneas, não contra reinserção sequencial.
-- ============================================================

-- ── 1. Limpeza: mantém o PRIMEIRO evento de cada estouro real ───────
-- O primeiro é o que marca o instante verdadeiro do estouro; os
-- seguintes são ruído do cron. Escopo restrito a 'breached'.
DELETE FROM public.sla_events e
 USING (
   SELECT id,
          row_number() OVER (
            PARTITION BY incident_id, metadata->>'kind'
            ORDER BY created_at, id
          ) AS rn
     FROM public.sla_events
    WHERE event_type = 'breached'
 ) dup
 WHERE e.id = dup.id
   AND dup.rn > 1;

-- ── 2. Guarda: 'breached' é marco, não batimento ────────────────────
-- Reabertura é o único caso em que um novo estouro do mesmo tipo é
-- legítimo (o prazo recomeça). Por isso a checagem é "já existe um
-- estouro deste tipo DEPOIS da última reabertura?" em vez de uma
-- UNIQUE rígida — que bloquearia esse caso válido se um dia o fluxo
-- de reabertura passar a resetar as flags de SLA.
CREATE OR REPLACE FUNCTION public.sla_log_event(
  p_incident_id uuid,
  p_event_type  text,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF p_event_type = 'breached' AND EXISTS (
    SELECT 1
      FROM public.sla_events e
     WHERE e.incident_id = p_incident_id
       AND e.event_type  = 'breached'
       -- IS NOT DISTINCT FROM: trata NULL = NULL como igual, para o
       -- caso de metadata sem 'kind'.
       AND e.metadata->>'kind' IS NOT DISTINCT FROM v_meta->>'kind'
       AND e.created_at > COALESCE(
             (SELECT max(r.created_at)
                FROM public.sla_events r
               WHERE r.incident_id = p_incident_id
                 AND r.event_type  = 'reopened'),
             '-infinity'::timestamptz)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.sla_events (incident_id, event_type, metadata)
  VALUES (p_incident_id, p_event_type, v_meta);
END;
$function$;

-- Índice que sustenta a checagem acima (e a leitura da timeline).
CREATE INDEX IF NOT EXISTS idx_sla_events_incident_type_created
  ON public.sla_events (incident_id, event_type, created_at DESC);
