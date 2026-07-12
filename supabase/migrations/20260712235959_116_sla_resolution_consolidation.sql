-- ServiceFY — Fase 19: Consolidação Física de SLAs de Resolução (ITIL v4).
--
-- Achado (ver análise antes desta migration): is_resolution_breached/
-- sla_breached só eram escritos por check_sla_breaches() (cron a cada
-- minuto), cujo filtro exclui explicitamente tickets já resolved_at IS NOT
-- NULL / state IN ('Resolved','Closed'). Resultado: um ticket que estoura o
-- prazo e é resolvido antes do próximo tick do cron fecha com
-- is_resolution_breached=false — silenciosamente errado. Esta migration
-- fecha esse gap calculando o veredito de SLA no exato instante da
-- transição para um estado terminal, dentro da própria transação de UPDATE.
--
-- sla_resolution_deadline já é ajustado por pausa (tg_handle_sla_pause
-- empurra o deadline pelos minutos úteis pausados) — então o veredito correto
-- é simplesmente resolved_at > sla_resolution_deadline; não é necessário
-- reconstruir "tempo decorrido menos pausado" a partir de sla_events, isso já
-- está embutido no deadline pela engine existente (evita divergir de um
-- mecanismo já correto).

CREATE OR REPLACE FUNCTION public.tg_consolidate_sla_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_at timestamptz;
BEGIN
  -- Só a PRIMEIRA transição para um estado terminal consolida o SLA. Uma
  -- reabertura seguida de nova resolução já é tratada por
  -- accumulated_reopen_time_minutes (tg_handle_sla_pause) — não recalculamos
  -- o veredito aqui numa segunda passagem por Resolved/Closed.
  IF NEW.state::text IN ('Resolved', 'Closed')
     AND OLD.state::text NOT IN ('Resolved', 'Closed') THEN

    v_resolved_at := COALESCE(NEW.resolved_at, clock_timestamp());
    IF NEW.resolved_at IS NULL THEN
      NEW.resolved_at := v_resolved_at;
    END IF;

    IF NEW.sla_resolution_deadline IS NOT NULL THEN
      NEW.is_resolution_breached := v_resolved_at > NEW.sla_resolution_deadline;
      -- Mesma convenção já usada por check_sla_breaches(): sla_breached
      -- reflete o estouro de RESOLUÇÃO, não de primeira resposta.
      NEW.sla_breached := NEW.is_resolution_breached;

      IF NEW.is_resolution_breached THEN
        PERFORM public.sla_log_event(
          NEW.id, 'breached',
          jsonb_build_object(
            'kind', 'resolution',
            'detected_at', 'transition',
            'resolved_at', v_resolved_at,
            'deadline', NEW.sla_resolution_deadline,
            'breached', NEW.is_resolution_breached
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_consolidate_sla_resolution() IS 'Fase 19: no instante em que state entra pela primeira vez em Resolved/Closed, calcula is_resolution_breached/sla_breached comparando resolved_at contra sla_resolution_deadline (já ajustado por pausa). Fecha o gap de check_sla_breaches(), cujo filtro exclui tickets já resolvidos e nunca os reavalia.';

-- Nome com prefixo "zzz_" (mesma convenção já usada no repo para
-- zz_sync_ticket_priority_label / zzz_set_ticket_number_by_type) para
-- garantir, via ordem alfabética de disparo do Postgres entre triggers BEFORE
-- do mesmo evento, que este trigger rode por ÚLTIMO — depois de
-- tg_calculate_ticket_sla e tg_handle_sla_pause já terem produzido o
-- sla_resolution_deadline final desta transação.
DROP TRIGGER IF EXISTS zzz_consolidate_sla_resolution ON public.tickets;
CREATE TRIGGER zzz_consolidate_sla_resolution
  BEFORE UPDATE OF state ON public.tickets
  FOR EACH ROW
  WHEN (NEW.state::text IN ('Resolved', 'Closed') AND OLD.state::text NOT IN ('Resolved', 'Closed'))
  EXECUTE FUNCTION public.tg_consolidate_sla_resolution();
