-- ServiceFY - Fase 9: corrige colisão entre RETURNS TABLE e colunas de CTE.

CREATE OR REPLACE FUNCTION public.claim_ticket_email_outbox(p_limit integer DEFAULT 25)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  ticket_id uuid,
  event_type text,
  recipient_email text,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker de e-mail' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH expired AS (
    UPDATE public.ticket_email_outbox outbox
       SET status = CASE WHEN outbox.attempt_count >= 5 THEN 'dead_letter' ELSE 'pending' END,
           locked_at = NULL,
           last_error = 'Lease expirado: worker interrompido durante o envio',
           next_attempt_at = CASE WHEN outbox.attempt_count >= 5 THEN outbox.next_attempt_at ELSE now() END,
           updated_at = now()
     WHERE outbox.status = 'processing'
       AND outbox.locked_at < now() - interval '5 minutes'
    RETURNING outbox.id, outbox.company_id, outbox.attempt_count
  ), expired_events AS (
    INSERT INTO public.ticket_email_delivery_events(outbox_id, company_id, event_type, transport, error_message)
    SELECT expired.id, expired.company_id,
           CASE WHEN expired.attempt_count >= 5 THEN 'dead_letter' ELSE 'retry_scheduled' END,
           'none', 'Lease expirado: worker interrompido durante o envio'
      FROM expired
  ), claimed AS (
    SELECT outbox.id
      FROM public.ticket_email_outbox outbox
     WHERE outbox.status = 'pending'
       AND outbox.next_attempt_at <= now()
     ORDER BY outbox.next_attempt_at, outbox.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  ), updated AS (
    UPDATE public.ticket_email_outbox outbox
       SET status = 'processing',
           locked_at = now(),
           attempt_count = outbox.attempt_count + 1,
           updated_at = now()
      FROM claimed
     WHERE outbox.id = claimed.id
    RETURNING outbox.id, outbox.company_id, outbox.ticket_id, outbox.event_type,
              outbox.recipient_email, outbox.payload, outbox.attempt_count
  ), sending_events AS (
    INSERT INTO public.ticket_email_delivery_events(outbox_id, company_id, event_type, transport)
    SELECT updated.id, updated.company_id, 'sending', 'none' FROM updated
  )
  SELECT updated.* FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket_email_outbox(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ticket_email_outbox(integer) TO service_role;
