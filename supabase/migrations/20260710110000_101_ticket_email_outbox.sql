-- ServiceFY - Fase 9: outbox confiavel para notificacoes por e-mail de tickets.

CREATE TABLE IF NOT EXISTS public.ticket_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('ticket_opened', 'status_changed', 'assignment_changed', 'ticket_closed', 'public_comment')),
  recipient_email text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ticket_email_outbox_due
  ON public.ticket_email_outbox(next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ticket_email_outbox_ticket
  ON public.ticket_email_outbox(company_id, ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ticket_email_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.ticket_email_outbox(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('queued', 'sending', 'tenant_failed', 'sent', 'fallback_sent', 'retry_scheduled', 'dead_letter')),
  transport text NOT NULL DEFAULT 'none' CHECK (transport IN ('tenant_smtp', 'global_smtp', 'none')),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_email_delivery_events_outbox
  ON public.ticket_email_delivery_events(outbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_email_delivery_events_company
  ON public.ticket_email_delivery_events(company_id, created_at DESC);

ALTER TABLE public.ticket_email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_email_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_email_outbox_admin_read
  ON public.ticket_email_outbox
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

CREATE POLICY ticket_email_delivery_events_admin_read
  ON public.ticket_email_delivery_events
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

REVOKE ALL ON public.ticket_email_outbox FROM authenticated;
GRANT SELECT ON public.ticket_email_outbox TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_email_outbox FROM authenticated;

REVOKE ALL ON public.ticket_email_delivery_events FROM authenticated;
GRANT SELECT ON public.ticket_email_delivery_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_email_delivery_events FROM authenticated;

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

  WITH expired AS (
    UPDATE public.ticket_email_outbox
       SET status = CASE WHEN attempt_count >= 5 THEN 'dead_letter' ELSE 'pending' END,
           locked_at = NULL,
           last_error = 'Lease expirado: worker interrompido durante o envio',
           next_attempt_at = CASE WHEN attempt_count >= 5 THEN next_attempt_at ELSE now() END,
           updated_at = now()
     WHERE status = 'processing'
       AND locked_at < now() - interval '5 minutes'
    RETURNING id, company_id, attempt_count
  ), expired_events AS (
    INSERT INTO public.ticket_email_delivery_events(outbox_id, company_id, event_type, transport, error_message)
    SELECT id, company_id,
           CASE WHEN attempt_count >= 5 THEN 'dead_letter' ELSE 'retry_scheduled' END,
           'none', 'Lease expirado: worker interrompido durante o envio'
      FROM expired
  ), claimed AS (
    SELECT o.id
      FROM public.ticket_email_outbox o
     WHERE o.status = 'pending'
       AND o.next_attempt_at <= now()
     ORDER BY o.next_attempt_at, o.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  ), updated AS (
    UPDATE public.ticket_email_outbox o
       SET status = 'processing',
           locked_at = now(),
           attempt_count = o.attempt_count + 1,
           updated_at = now()
      FROM claimed
     WHERE o.id = claimed.id
    RETURNING o.id, o.company_id, o.ticket_id, o.event_type, o.recipient_email, o.payload, o.attempt_count
  ), sending_events AS (
    INSERT INTO public.ticket_email_delivery_events(outbox_id, company_id, event_type, transport)
    SELECT id, company_id, 'sending', 'none' FROM updated
  )
  SELECT * FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket_email_outbox(integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_ticket_email_delivery(
  p_outbox_id uuid,
  p_outcome text,
  p_transport text DEFAULT 'none',
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ticket_email_outbox;
  v_event_type text;
  v_max_attempts constant integer := 5;
  v_error text := NULLIF(left(trim(COALESCE(p_error, '')), 512), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker de e-mail' USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('tenant_failed', 'sent', 'fallback_sent', 'retry_scheduled', 'dead_letter')
     OR p_transport NOT IN ('tenant_smtp', 'global_smtp', 'none') THEN
    RAISE EXCEPTION 'Resultado de entrega invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
    FROM public.ticket_email_outbox
   WHERE id = p_outbox_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de outbox inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF p_outcome = 'tenant_failed' THEN
    v_event_type := 'tenant_failed';
  ELSIF p_outcome IN ('sent', 'fallback_sent') THEN
    UPDATE public.ticket_email_outbox
       SET status = 'sent', sent_at = now(), locked_at = NULL, last_error = NULL, updated_at = now()
     WHERE id = p_outbox_id;
    v_event_type := p_outcome;
  ELSIF p_outcome = 'dead_letter' OR v_row.attempt_count >= v_max_attempts THEN
    UPDATE public.ticket_email_outbox
       SET status = 'dead_letter', locked_at = NULL, last_error = v_error, updated_at = now()
     WHERE id = p_outbox_id;
    v_event_type := 'dead_letter';
  ELSE
    UPDATE public.ticket_email_outbox
       SET status = 'pending',
           locked_at = NULL,
           last_error = v_error,
           next_attempt_at = now() + (interval '1 minute' * power(2, v_row.attempt_count)),
           updated_at = now()
     WHERE id = p_outbox_id;
    v_event_type := 'retry_scheduled';
  END IF;

  INSERT INTO public.ticket_email_delivery_events(
    outbox_id, company_id, event_type, transport, error_message
  ) VALUES (
    p_outbox_id, v_row.company_id, v_event_type, p_transport, v_error
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ticket_email_delivery(uuid,text,text,text) FROM public, anon, authenticated;
