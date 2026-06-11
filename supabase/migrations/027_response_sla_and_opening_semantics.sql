-- ============================================================
-- Flowfy ITSM - Migration 027
-- Response SLA and ticket lifecycle consistency.
-- ============================================================

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.incidents.responded_at IS
  'Timestamp of the first analyst response. Immutable after first service start.';

-- Normalize opening events created by previous versions.
UPDATE public.incident_history
   SET field_name = 'Criação'
 WHERE field_name IN ('created', 'Abertura')
   AND comment LIKE 'Chamado aberto via Portal de Autoatendimento por %';

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

CREATE OR REPLACE FUNCTION public.start_ticket_service(p_incident_id UUID)
RETURNS public.incidents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_ticket public.incidents;
  v_started_at TIMESTAMPTZ;
BEGIN
  SELECT *
    INTO v_profile
    FROM public.profiles
   WHERE auth_id = auth.uid()
     AND active = true
   LIMIT 1;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Perfil autenticado não encontrado.'
      USING ERRCODE = '42501';
  END IF;

  IF v_profile.role::TEXT NOT IN (
    'sysadmin',
    'company_admin',
    'agent',
    'technician',
    'area_manager',
    'it_manager'
  ) THEN
    RAISE EXCEPTION 'Perfil sem permissão para iniciar atendimento.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_ticket
    FROM public.incidents
   WHERE id = p_incident_id
   FOR UPDATE;

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'Chamado não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_current_user_msp_admin()
    OR v_ticket.company_id = v_profile.company_id
  ) THEN
    RAISE EXCEPTION 'Usuário sem acesso ao chamado.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ticket.state IN ('Resolved', 'Closed') THEN
    RAISE EXCEPTION 'Chamados resolvidos ou fechados não podem iniciar atendimento.'
      USING ERRCODE = '22023';
  END IF;

  IF v_ticket.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'O atendimento deste chamado já foi iniciado.'
      USING ERRCODE = '22023';
  END IF;

  v_started_at := clock_timestamp();

  UPDATE public.incidents
     SET assigned_to_id = v_profile.id,
         assigned_to_name = v_profile.name,
         state = 'In Progress',
         responded_at = v_started_at,
         updated_at = clock_timestamp()
   WHERE id = p_incident_id
   RETURNING * INTO v_ticket;

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
    v_ticket.id,
    v_profile.id,
    v_profile.name,
    'Início de Atendimento',
    NULL,
    v_started_at::TEXT,
    format('Atendimento iniciado por %s', v_profile.name),
    true,
    v_started_at
  );

  RETURN v_ticket;
END;
$$;

REVOKE ALL ON FUNCTION public.start_ticket_service(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_ticket_service(UUID) TO authenticated;
