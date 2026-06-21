-- ============================================================
-- Flowfy ITSM - Migration 031
-- Diferencia a auditoria de CRIAÇÃO entre abertura via Portal
-- (solicitante) e abertura MANUAL por um analista (telefônico/direto).
--
-- Regra: se o usuário autenticado (analista) for diferente do
-- solicitante (caller_id), a abertura é manual e o histórico nomeia
-- o ANALISTA logado. Caso contrário, mantém a mensagem de Portal.
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_ticket_opening()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   UUID;
  v_actor_name TEXT;
  v_creator_id   UUID;
  v_creator_name TEXT;
  v_description  TEXT;
  v_is_manual    BOOLEAN;
BEGIN
  v_actor_id := public.get_current_profile_id();
  IF v_actor_id IS NOT NULL THEN
    SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  END IF;

  v_creator_name := COALESCE(NULLIF(NEW.caller_name, ''), 'Usuário não identificado');

  -- Manual: aberto por um analista em nome de outro solicitante.
  v_is_manual := v_actor_id IS NOT NULL AND NEW.caller_id IS DISTINCT FROM v_actor_id;

  IF v_is_manual THEN
    v_creator_id := v_actor_id;
    v_description := format(
      'Chamado aberto manualmente via atendimento telefônico/direto pelo analista %s',
      COALESCE(NULLIF(v_actor_name, ''), 'Analista')
    );
  ELSE
    v_creator_id := COALESCE(NEW.caller_id, v_actor_id);
    v_description := format(
      'Chamado aberto via Portal de Autoatendimento por %s',
      v_creator_name
    );
  END IF;

  INSERT INTO public.incident_history (
    incident_id, changed_by_id, changed_by_name,
    field_name, old_value, new_value, comment, is_public, created_at
  ) VALUES (
    NEW.id,
    v_creator_id,
    CASE WHEN v_is_manual THEN COALESCE(NULLIF(v_actor_name, ''), 'Analista') ELSE v_creator_name END,
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

-- Trigger já existe (trg_log_ticket_opening, migration 026); o CREATE OR
-- REPLACE acima atualiza a função usada por ele. Reafirma por segurança:
DROP TRIGGER IF EXISTS trg_log_ticket_opening ON public.incidents;
CREATE TRIGGER trg_log_ticket_opening
  AFTER INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ticket_opening();
