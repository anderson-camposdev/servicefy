-- ============================================================
-- Flowfy ITSM - Migration 030
-- Atomic service start with immutable catalog routing group.
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_ticket_service(p_incident_id UUID)
RETURNS public.incidents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_ticket public.incidents;
  v_original_group_id UUID;
  v_original_group_name TEXT;
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

  v_original_group_id := v_ticket.assignment_group_id;
  v_original_group_name := v_ticket.assigned_group_name;
  v_started_at := clock_timestamp();

  UPDATE public.incidents
     SET assigned_to_id = v_profile.id,
         assigned_to_name = v_profile.name,
         assignment_group_id = v_original_group_id,
         assigned_group_name = v_original_group_name,
         state = 'In Progress',
         responded_at = v_started_at,
         updated_at = v_started_at
   WHERE id = p_incident_id
   RETURNING * INTO v_ticket;

  IF v_ticket.assignment_group_id IS DISTINCT FROM v_original_group_id
     OR v_ticket.assigned_group_name IS DISTINCT FROM v_original_group_name THEN
    RAISE EXCEPTION 'O grupo solucionador original não pode ser alterado ao iniciar atendimento.'
      USING ERRCODE = '23514';
  END IF;

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

