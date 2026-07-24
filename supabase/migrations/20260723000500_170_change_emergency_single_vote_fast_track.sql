-- ServiceFY — "Voto Rápido" de mudança Emergency era só um rótulo na UI
-- (ChangeManagementDashboard.tsx: "Emergency (Emergencial / Voto Rápido)")
-- — o backend exigia a mesma votação unânime completa de uma mudança
-- Normal, sem nenhum tratamento diferenciado.
--
-- Achado no pente fino de 2026-07-23. Decisão do usuário: mudança
-- Emergency avança para Scheduled assim que QUALQUER aprovador do CAB
-- votar sim — não precisa esperar todos. Qualquer rejeição continua
-- bloqueando imediatamente (comportamento já existente, inalterado).

CREATE OR REPLACE FUNCTION public.cast_change_cab_vote(
  p_change_id UUID,
  p_approve BOOLEAN
)
RETURNS public.changes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_change public.changes;
  v_approvals JSONB;
  v_decision TEXT;
  v_new_state public.change_state;
  v_all_approved BOOLEAN;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;

  SELECT * INTO v_change FROM public.changes
   WHERE id = p_change_id FOR UPDATE;

  IF v_profile.id IS NULL OR v_change.id IS NULL
     OR v_change.company_id IS DISTINCT FROM v_profile.company_id THEN
    RAISE EXCEPTION 'Mudança não pertence ao usuário autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_profile.role::text = 'end_user'
     OR NOT (COALESCE(v_change.cab_approvers, '[]'::jsonb) ? v_profile.id::text) THEN
    RAISE EXCEPTION 'Usuário não é aprovador desta mudança' USING ERRCODE = '42501';
  END IF;
  IF v_change.state::text <> 'Awaiting CAB Approval' THEN
    RAISE EXCEPTION 'Mudança não está aguardando aprovação do CAB';
  END IF;
  IF COALESCE(v_change.cab_approvals, '{}'::jsonb) ? v_profile.id::text THEN
    RAISE EXCEPTION 'Aprovador já registrou seu voto';
  END IF;

  v_decision := CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END;
  v_approvals := COALESCE(v_change.cab_approvals, '{}'::jsonb)
                 || jsonb_build_object(v_profile.id::text, v_decision);

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(v_change.cab_approvers, '[]'::jsonb)) a(id)
    WHERE COALESCE(v_approvals->>a.id, '') <> 'Approved'
  ) INTO v_all_approved;

  v_new_state := CASE
    WHEN NOT p_approve THEN 'CAB Rejected'::public.change_state
    -- Emergency: um único "sim" já libera — não espera unanimidade.
    WHEN v_change.type::text = 'Emergency' THEN 'Scheduled'::public.change_state
    WHEN v_all_approved THEN 'Scheduled'::public.change_state
    ELSE v_change.state
  END;

  UPDATE public.changes
     SET cab_approvals = v_approvals, state = v_new_state, updated_at = now()
   WHERE id = p_change_id
   RETURNING * INTO v_change;

  INSERT INTO public.change_history
    (change_id, changed_by_name, field_name, new_value, is_public)
  VALUES
    (p_change_id, v_profile.name, 'cab_approval',
     v_profile.name || ' votou: ' || v_decision || '. Novo estado: ' || v_new_state::text,
     true);

  RETURN v_change;
END;
$$;

-- Permissões inalteradas (GRANT EXECUTE já concedido na migration 071);
-- CREATE OR REPLACE preserva GRANT/REVOKE existentes.
