-- ServiceFY - Fase 9: produtores de eventos semanticos para a outbox de e-mail.

CREATE OR REPLACE FUNCTION public.enqueue_ticket_email_notification(
  p_company_id uuid,
  p_ticket_id uuid,
  p_event_type text,
  p_recipient_email text,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox_id uuid;
  v_recipient text := lower(trim(COALESCE(p_recipient_email, '')));
BEGIN
  IF v_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN;
  END IF;

  INSERT INTO public.ticket_email_outbox(
    company_id, ticket_id, event_type, recipient_email, payload, idempotency_key
  ) VALUES (
    p_company_id, p_ticket_id, p_event_type, v_recipient, COALESCE(p_payload, '{}'::jsonb), p_idempotency_key
  )
  ON CONFLICT (company_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_outbox_id;

  IF v_outbox_id IS NOT NULL THEN
    INSERT INTO public.ticket_email_delivery_events(outbox_id, company_id, event_type, transport)
    VALUES (v_outbox_id, p_company_id, 'queued', 'none');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_ticket_email_notification(uuid,uuid,text,text,jsonb,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_enqueue_ticket_email_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_key_base text;
  v_payload jsonb;
  v_caller_email text;
  v_assignee_email text;
  v_member record;
BEGIN
  v_payload := jsonb_build_object(
    'ticket_number', NEW.number,
    'ticket_type', NEW.ticket_type,
    'short_description', NEW.short_description,
    'state', NEW.state::text,
    'caller_name', NEW.caller_name
  );
  v_key_base := NEW.id::text || ':' || txid_current()::text;

  IF NEW.caller_id IS NOT NULL THEN
    SELECT email INTO v_caller_email
      FROM public.profiles
     WHERE id = NEW.caller_id AND active = true;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := 'ticket_opened';
    PERFORM public.enqueue_ticket_email_notification(
      NEW.company_id, NEW.id, v_event, v_caller_email, v_payload,
      v_key_base || ':' || v_event || ':' || lower(COALESCE(v_caller_email, ''))
    );
    RETURN NEW;
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NEW.state::text = 'Closed' AND OLD.state::text IS DISTINCT FROM 'Closed' THEN
      v_event := 'ticket_closed';
    ELSE
      v_event := 'status_changed';
    END IF;

    PERFORM public.enqueue_ticket_email_notification(
      NEW.company_id, NEW.id, v_event, v_caller_email, v_payload,
      v_key_base || ':' || v_event || ':' || lower(COALESCE(v_caller_email, ''))
    );
  END IF;

  IF NEW.assigned_to_id IS DISTINCT FROM OLD.assigned_to_id
     OR NEW.assigned_group_id IS DISTINCT FROM OLD.assigned_group_id THEN
    v_event := 'assignment_changed';

    IF NEW.assigned_to_id IS NOT NULL THEN
      SELECT email INTO v_assignee_email
        FROM public.profiles
       WHERE id = NEW.assigned_to_id AND active = true;
      PERFORM public.enqueue_ticket_email_notification(
        NEW.company_id, NEW.id, v_event, v_assignee_email, v_payload,
        v_key_base || ':' || v_event || ':' || lower(COALESCE(v_assignee_email, ''))
      );
    ELSIF NEW.assigned_group_id IS NOT NULL THEN
      FOR v_member IN
        SELECT p.id, p.email
          FROM public.user_groups ug
          JOIN public.profiles p ON p.id = ug.user_id
         WHERE ug.group_id = NEW.assigned_group_id
           AND p.active = true
      LOOP
        PERFORM public.enqueue_ticket_email_notification(
          NEW.company_id, NEW.id, v_event, v_member.email, v_payload,
          v_key_base || ':' || v_event || ':' || lower(COALESCE(v_member.email, ''))
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_enqueue_ticket_email_notifications() FROM public, anon, authenticated;

CREATE TRIGGER tg_enqueue_ticket_email_notifications
  AFTER INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enqueue_ticket_email_notifications();

CREATE OR REPLACE FUNCTION public.tg_enqueue_public_comment_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.tickets;
  v_caller_email text;
BEGIN
  IF NEW.actor_type <> 'analyst' OR COALESCE(NEW.is_internal, false) OR NEW.incident_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = NEW.incident_id;
  IF NOT FOUND OR v_ticket.caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_caller_email
    FROM public.profiles
   WHERE id = v_ticket.caller_id AND active = true;

  PERFORM public.enqueue_ticket_email_notification(
    v_ticket.company_id,
    v_ticket.id,
    'public_comment',
    v_caller_email,
    jsonb_build_object(
      'ticket_number', v_ticket.number,
      'ticket_type', v_ticket.ticket_type,
      'short_description', v_ticket.short_description,
      'state', v_ticket.state::text,
      'caller_name', v_ticket.caller_name,
      'comment_body', NEW.body,
      'commenter_name', NEW.sender_name
    ),
    v_ticket.id::text || ':public_comment:' || NEW.id::text || ':' || lower(COALESCE(v_caller_email, ''))
  );

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_enqueue_public_comment_email() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_ticket_message ON public.ticket_messages;
DROP TRIGGER IF EXISTS tg_enqueue_public_comment_email ON public.ticket_messages;
CREATE TRIGGER tg_enqueue_public_comment_email
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enqueue_public_comment_email();
