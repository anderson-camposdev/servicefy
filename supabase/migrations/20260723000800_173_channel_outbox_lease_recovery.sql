-- ServiceFY — claim_channel_outbox nunca recuperava lease abandonado.
--
-- Achado no pente fino de 2026-07-23: diferente das outras 3 filas do
-- sistema (ticket_email_outbox desde a migration 106, webhook_events_queue,
-- workflow_action_queue), claim_channel_outbox só fazia
-- `status='processing'`, sem nenhum passo de reaproveitar lease expirado.
-- Se o worker (dispatch-channel-outbox) cair/travar entre reivindicar um
-- lote e chamar complete_channel_outbox, essas linhas ficam 'processing'
-- para sempre — nunca mais são reprocessadas nem retornam para
-- 'pending'/'dead_letter'. Baixo impacto hoje (sendOutbound ainda retorna
-- not_configured para todos os provedores reais), mas o bug é real e vai
-- morder assim que qualquer provedor for implementado.
--
-- Fix: mesmo padrão de recuperação de lease já usado em
-- claim_ticket_email_outbox (migration 106) — item preso em 'processing'
-- por mais de 5 minutos volta para 'pending' (ou 'dead_letter' se já
-- esgotou as tentativas, mesmo limite de 6 usado por complete_channel_outbox).

CREATE OR REPLACE FUNCTION public.claim_channel_outbox(p_limit integer DEFAULT 25)
RETURNS TABLE (
  id uuid, connection_id uuid, conversation_id uuid, company_id uuid,
  provider public.channel_provider, vault_secret_id uuid, attempt_count integer,
  payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_attempts CONSTANT integer := 6;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker omnichannel' USING ERRCODE = '42501';
  END IF;

  -- Recupera lease abandonado antes de reivindicar um lote novo.
  UPDATE public.channel_outbox o
     SET status = (CASE WHEN o.attempt_count >= v_max_attempts THEN 'dead_letter' ELSE 'pending' END)::public.delivery_status,
         locked_at = NULL,
         last_error = 'Lease expirado: worker interrompido durante o envio',
         next_attempt_at = CASE WHEN o.attempt_count >= v_max_attempts THEN o.next_attempt_at ELSE now() END
   WHERE o.status = 'processing'
     AND o.locked_at < now() - interval '5 minutes';

  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
      FROM public.channel_outbox o
     WHERE o.status = 'pending' AND o.next_attempt_at <= now()
     ORDER BY o.next_attempt_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  )
  UPDATE public.channel_outbox o
     SET status = 'processing', locked_at = now(), attempt_count = o.attempt_count + 1
    FROM claimed
    JOIN public.channel_connections cc ON true
   WHERE o.id = claimed.id AND cc.id = o.connection_id
  RETURNING o.id, o.connection_id, o.conversation_id, o.company_id,
            cc.provider, cc.vault_secret_id, o.attempt_count, o.payload;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_channel_outbox(integer) FROM public, anon, authenticated;
