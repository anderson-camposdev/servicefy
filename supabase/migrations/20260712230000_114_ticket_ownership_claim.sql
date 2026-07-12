-- ServiceFY — Fase 17: Mecanismo de Captura de Tickets (Take Ownership).
--
-- Fecha o fluxo ITIL v4 iniciado na migration 113: tickets nascem atribuídos
-- só ao grupo (assigned_to_id NULL). Esta migration dá ao analista uma forma
-- segura de se auto-atribuir um ticket da fila do seu grupo.
--
-- Estratégia de concorrência (ver commit para o plano completo): o UPDATE que
-- grava assigned_to_id já carrega "AND assigned_to_id IS NULL" no próprio
-- WHERE — não há SELECT prévio seguido de UPDATE condicional. Isso colapsa a
-- checagem "ninguém assumiu ainda" e o write num único statement atômico: sob
-- READ COMMITTED (default do Postgres), duas transações concorrentes na mesma
-- linha serializam no lock de linha do UPDATE; a que destrava por último vê o
-- assigned_to_id já preenchido pela primeira, o predicado do WHERE não bate,
-- ROW_COUNT = 0, e ela recebe um erro de conflito distinguível — sem depender
-- de SELECT FOR UPDATE, advisory lock ou isolation level não-default.

CREATE OR REPLACE FUNCTION public.claim_ticket_secure(p_ticket_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_current_profile_id();
  v_company_id uuid := public.get_current_user_company_id();
  v_profile_name text;
  v_ticket public.tickets%ROWTYPE;
  v_is_group_member boolean;
BEGIN
  IF v_profile_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida: perfil ou empresa nao resolvidos.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_ticket
    FROM public.tickets
   WHERE id = p_ticket_id
     AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.assignment_group_id IS NULL THEN
    RAISE EXCEPTION 'Ticket sem grupo de atendimento definido — nao pode ser capturado.' USING ERRCODE = '22023';
  END IF;

  -- Pertencimento ao grupo do ticket, sob o mesmo tenant (defesa explícita:
  -- esta função é SECURITY DEFINER e roda com bypass de RLS).
  SELECT EXISTS (
    SELECT 1
      FROM public.user_groups ug
      JOIN public.profiles p ON p.id = ug.user_id
     WHERE ug.user_id = v_profile_id
       AND ug.group_id = v_ticket.assignment_group_id
       AND p.company_id = v_company_id
       AND p.active = true
  ) INTO v_is_group_member;

  IF NOT v_is_group_member THEN
    RAISE EXCEPTION 'Voce nao pertence ao grupo de atendimento deste ticket.' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_profile_name
    FROM public.profiles
   WHERE id = v_profile_id AND company_id = v_company_id;

  UPDATE public.tickets
     SET assigned_to_id = v_profile_id,
         assigned_to_name = v_profile_name,
         state = 'In Progress'
   WHERE id = p_ticket_id
     AND company_id = v_company_id
     AND assigned_to_id IS NULL
  RETURNING * INTO v_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este ticket ja foi assumido por outro analista.' USING ERRCODE = '40001';
  END IF;

  RETURN v_ticket;
END;
$$;

COMMENT ON FUNCTION public.claim_ticket_secure(uuid) IS 'Fase 17: auto-atribuicao de ticket (Take Ownership). Valida pertencimento ao assignment_group_id do ticket via user_groups sob o mesmo company_id, entao grava assigned_to_id/assigned_to_name e muda state para In Progress. O UPDATE carrega "assigned_to_id IS NULL" no proprio WHERE (nao um SELECT previo) para colapsar a checagem de concorrencia e o write num unico statement atomico — ROW_COUNT=0 sinaliza que outro analista venceu a corrida (ERRCODE 40001).';

REVOKE ALL ON FUNCTION public.claim_ticket_secure(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_ticket_secure(uuid) TO authenticated;
