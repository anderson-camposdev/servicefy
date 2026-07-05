-- ============================================================
-- Flowfy ITSM - Migration 026
-- Ticket governance:
--   1. Strict INC/REQ numbering at database level.
--   2. Mandatory initial audit event for every ticket.
--   3. Dynamic form fields for Incident Service x Symptom.
-- ============================================================

-- Incident-specific custom fields live on the governed combination.
ALTER TABLE public.catalog_service_symptoms
  ADD COLUMN IF NOT EXISTS form_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.catalog_service_symptoms
   SET form_fields = '[]'::jsonb
 WHERE form_fields IS NULL
    OR jsonb_typeof(form_fields) <> 'array';

UPDATE public.request_items
   SET form_fields = '[]'::jsonb
 WHERE form_fields IS NULL
    OR jsonb_typeof(form_fields) <> 'array';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'catalog_service_symptoms_form_fields_array_chk'
       AND conrelid = 'public.catalog_service_symptoms'::regclass
  ) THEN
    ALTER TABLE public.catalog_service_symptoms
      ADD CONSTRAINT catalog_service_symptoms_form_fields_array_chk
      CHECK (jsonb_typeof(form_fields) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'request_items_form_fields_array_chk'
       AND conrelid = 'public.request_items'::regclass
  ) THEN
    ALTER TABLE public.request_items
      ADD CONSTRAINT request_items_form_fields_array_chk
      CHECK (jsonb_typeof(form_fields) = 'array');
  END IF;
END $$;

-- Repair the known legacy classification bug before deriving prefixes.
UPDATE public.incidents
   SET ticket_type = 'incident'
 WHERE catalog_service_id IS NOT NULL
    OR symptom_id IS NOT NULL;

UPDATE public.incidents
   SET ticket_type = 'request'
 WHERE request_item_id IS NOT NULL;

-- One sequence keeps the numeric suffix globally unique across INC and REQ.
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START WITH 10000;

DO $$
DECLARE
  v_max_suffix BIGINT;
  v_last_value BIGINT;
BEGIN
  SELECT COALESCE(MAX((substring(number FROM '([0-9]+)$'))::BIGINT), 10000)
    INTO v_max_suffix
    FROM public.incidents
   WHERE number ~ '[0-9]+$';

  SELECT last_value INTO v_last_value FROM public.ticket_number_seq;

  PERFORM setval(
    'public.ticket_number_seq',
    GREATEST(v_max_suffix, v_last_value, 10000),
    true
  );
END $$;

CREATE OR REPLACE FUNCTION public.set_ticket_number_by_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
BEGIN
  NEW.ticket_type := COALESCE(NULLIF(NEW.ticket_type, ''), 'incident');

  IF NEW.ticket_type NOT IN ('incident', 'request') THEN
    RAISE EXCEPTION 'Unsupported ticket_type: %', NEW.ticket_type;
  END IF;

  v_prefix := CASE NEW.ticket_type
    WHEN 'request' THEN 'REQ'
    ELSE 'INC'
  END;

  NEW.number := v_prefix || lpad(nextval('public.ticket_number_seq')::TEXT, 7, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_set_ticket_number_by_type ON public.incidents;
CREATE TRIGGER zzz_set_ticket_number_by_type
  BEFORE INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_number_by_type();

-- Repair legacy records that received the wrong prefix. Preserve the suffix
-- whenever it is free; allocate a fresh sequence value on collision.
DO $$
DECLARE
  v_ticket RECORD;
  v_prefix TEXT;
  v_candidate TEXT;
BEGIN
  FOR v_ticket IN
    SELECT id, number, ticket_type
      FROM public.incidents
     WHERE number ~ '^[A-Za-z]+[0-9]+$'
       AND (
         (ticket_type = 'request' AND number NOT LIKE 'REQ%')
         OR
         (ticket_type = 'incident' AND number NOT LIKE 'INC%')
       )
     ORDER BY created_at, id
  LOOP
    v_prefix := CASE v_ticket.ticket_type WHEN 'request' THEN 'REQ' ELSE 'INC' END;
    v_candidate := v_prefix || substring(v_ticket.number FROM '([0-9]+)$');

    IF EXISTS (
      SELECT 1
        FROM public.incidents
       WHERE number = v_candidate
         AND id <> v_ticket.id
    ) THEN
      v_candidate := v_prefix || lpad(nextval('public.ticket_number_seq')::TEXT, 7, '0');
    END IF;

    UPDATE public.incidents
       SET number = v_candidate
     WHERE id = v_ticket.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_ticket_opening()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_creator_name TEXT;
  v_description TEXT;
BEGIN
  v_creator_id := COALESCE(NEW.caller_id, public.get_current_profile_id());
  v_creator_name := COALESCE(NULLIF(NEW.caller_name, ''), 'Usuário não identificado');
  v_description := format(
    'Chamado aberto via Portal de Autoatendimento por %s',
    v_creator_name
  );

  INSERT INTO public.incident_history (
    incident_id,
    changed_by_id,
    changed_by_name,
    field_name,
    old_value,
    new_value,
    comment,
    is_public,
    created_at
  ) VALUES (
    NEW.id,
    v_creator_id,
    v_creator_name,
    'Criação',
    NULL,
    NEW.number,
    v_description,
    true,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

-- Backfill the opening event for legacy tickets that have no creation audit.
INSERT INTO public.incident_history (
  incident_id,
  changed_by_id,
  changed_by_name,
  field_name,
  old_value,
  new_value,
  comment,
  is_public,
  created_at
)
SELECT
  incident.id,
  incident.caller_id,
  COALESCE(NULLIF(incident.caller_name, ''), 'Usuário não identificado'),
  'Criação',
  NULL,
  incident.number,
  format(
    'Chamado aberto via Portal de Autoatendimento por %s',
    COALESCE(NULLIF(incident.caller_name, ''), 'Usuário não identificado')
  ),
  true,
  incident.created_at
FROM public.incidents AS incident
WHERE NOT EXISTS (
  SELECT 1
    FROM public.incident_history AS history
   WHERE history.incident_id = incident.id
     AND history.field_name IN ('created', 'Criação', 'Abertura')
);

DROP TRIGGER IF EXISTS trg_log_ticket_opening ON public.incidents;
CREATE TRIGGER trg_log_ticket_opening
  AFTER INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ticket_opening();
