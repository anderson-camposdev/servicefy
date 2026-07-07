-- ServiceFY — Governança do SLA de resposta: fecha uma lacuna real onde
-- `responded_at` só era gravado pelo fluxo dedicado "Iniciar Atendimento"
-- (RPC start_ticket_service). Qualquer outro caminho que tirasse o chamado
-- do estado 'New' (ex.: o dropdown de estado em "Gravar Condução", que faz
-- um UPDATE direto via incidentsService.conduct) NUNCA setava `responded_at`
-- — o cronômetro de resposta ficava correndo/estourando indefinidamente,
-- mesmo com o analista já tendo atendido o chamado.
--
-- Definição de "primeiro atendimento" (SLA de resposta), coberta por dois
-- gatilhos independentes e idempotentes (responded_at IS NULL como trava):
--   1. O chamado sai do estado 'New' para qualquer outro (qualquer caminho
--      de UPDATE em incidents.state — Cockpit, RPC, automação).
--   2. Um analista registra uma mensagem PÚBLICA (não interna) no chamado
--      (TicketChat, "Gravar Condução" com comentário, e-mail materializado).
--
-- Ambos convergem no mesmo ponto: `incidents.responded_at`. O gatilho já
-- existente `tg_sla_events_on_update` (migration 054) continua sendo quem
-- grava o evento 'response_achieved' — nada muda ali.
--
-- Depois disso, `check_sla_breaches()` (que já ignora chamados com
-- responded_at preenchido) passa a de fato parar de avaliar o SLA de
-- resposta assim que o analista atende — sem precisar mudar essa função.

-- ─── 1. Sai de 'New' para qualquer outro estado → primeiro atendimento ──────
CREATE OR REPLACE FUNCTION public.tg_stamp_first_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responded_at IS NULL
     AND OLD.state::text = 'New'
     AND NEW.state::text <> 'New' THEN
    NEW.responded_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_stamp_first_response ON public.incidents;
CREATE TRIGGER tg_stamp_first_response
  BEFORE UPDATE OF state ON public.incidents
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.tg_stamp_first_response();

-- ─── 2. Mensagem pública do analista → primeiro atendimento ─────────────────
CREATE OR REPLACE FUNCTION public.tg_ticket_message_stamps_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actor_type = 'analyst'
     AND NOT COALESCE(NEW.is_internal, false)
     AND NEW.incident_id IS NOT NULL THEN
    UPDATE public.incidents
       SET responded_at = clock_timestamp()
     WHERE id = NEW.incident_id
       AND responded_at IS NULL
       AND state::text NOT IN ('Resolved', 'Closed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ticket_message_stamps_response ON public.ticket_messages;
CREATE TRIGGER tg_ticket_message_stamps_response
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_ticket_message_stamps_response();

-- ─── Verificação (comentada) ─────────────────────────────────────────────────
--   -- (a) UPDATE state 'New'→'On Hold' direto (sem passar por start_ticket_service) grava responded_at:
--   -- (b) mensagem pública de analista em chamado 'New' grava responded_at:
--   -- (c) mensagem interna (is_internal=true) NÃO grava responded_at:
--   -- (d) reexecução idempotente: responded_at já setado não é sobrescrito.
