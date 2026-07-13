-- ServiceFY — Fase 23: Analytics e Relatórios Executivos.
--
-- get_executive_metrics(p_start_date, p_end_date): totais de abertura/
-- resolução, % de conformidade de SLA, MTTR e distribuição por status, num
-- único JSON. Reaproveita tickets.mttr_minutes (já calculado e persistido
-- por tg_persist_bi_sla_minutes, em minutos ÚTEIS via sla_business_minutes_
-- between, já descontando pausas de On Hold) em vez de recalcular
-- business-hours na mão — evita duplicar uma engine já correta.
--
-- Achado, não corrigido nesta fase: mttr_minutes ainda não desconta o tempo
-- de espera em aprovação departamental (Fase 21 empurra o deadline em vez de
-- acumular um contador de minutos consumidos, como o On Hold faz) — um
-- ticket que passou por aprovação tem mttr_minutes levemente inflado. Lacuna
-- pré-existente entre a engine de BI e a engine de aprovação, fora do
-- escopo de uma RPC de leitura.

-- ─── Achado durante a verificação empírica desta fase: tg_create_csat_on_
-- resolution insere em notifications sem company_id — coluna NOT NULL desde
-- a migration 111 (Fase 16). Bloqueava a resolução de QUALQUER ticket com
-- caller_id preenchido (reproduzido: UPDATE incidents SET state='Resolved'
-- falhava sempre com "null value in column company_id of relation
-- notifications"). Mesma classe de bug já corrigida na Fase 21 para
-- tg_create_request_approvals/decide_request_approval — esta função ainda
-- não tinha sido tocada. Corrigido aqui por bloquear a própria verificação
-- desta fase (não dá pra medir MTTR de tickets que não conseguem ser
-- resolvidos). ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_create_csat_on_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.state::text = 'Resolved'
     AND OLD.state::text IS DISTINCT FROM 'Resolved'
     AND NEW.caller_id IS NOT NULL THEN
    INSERT INTO public.csat_surveys (company_id, incident_id, requester_id)
    VALUES (NEW.company_id, NEW.id, NEW.caller_id)
    ON CONFLICT (incident_id) DO UPDATE
      SET status = 'pending', rating = NULL, comment = NULL,
          sent_at = now(), submitted_at = NULL
      WHERE csat_surveys.status = 'expired';

    INSERT INTO public.notifications
      (company_id, user_id, title, message, type, linked_ticket_id, linked_ticket_type, link)
    VALUES
      (NEW.company_id, NEW.caller_id, 'Como foi o atendimento?',
       'Avalie o atendimento do chamado ' || NEW.number || '.',
       'info', NEW.id, NEW.ticket_type, '/tickets/' || NEW.id::text);
  ELSIF OLD.state::text IN ('Resolved', 'Closed')
        AND NEW.state::text NOT IN ('Resolved', 'Closed') THEN
    UPDATE public.csat_surveys
       SET status = 'expired'
     WHERE incident_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Índice de suporte (aditivo) ────────────────────────────────────────────
-- idx_incidents_company_created já cobre bem o filtro por created_at; não
-- havia equivalente para resolved_at. Parcial — só cobre tickets já
-- resolvidos, pequeno, sem tocar nenhuma estrutura de fase anterior.
CREATE INDEX IF NOT EXISTS idx_tickets_company_resolved
  ON public.tickets (company_id, resolved_at)
  WHERE resolved_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_executive_metrics(p_start_date date, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_current_user_company_id();
  v_result jsonb;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida: empresa não resolvida.' USING ERRCODE = '28000';
  END IF;
  -- Blindagem além de company_id: agrega dados da empresa inteira, que um
  -- end_user do portal (mesmo tenant) não deve conseguir puxar.
  IF NOT public.is_current_user_ticket_staff() THEN
    RAISE EXCEPTION 'Acesso restrito à equipe interna.' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Período inválido: informe uma data inicial anterior ou igual à data final.' USING ERRCODE = '22023';
  END IF;

  WITH scoped AS (
    SELECT state, approval_status, created_at, resolved_at,
           is_resolution_breached, mttr_minutes
    FROM public.tickets
    WHERE company_id = v_company_id
      AND (
        created_at::date BETWEEN p_start_date AND p_end_date
        OR resolved_at::date BETWEEN p_start_date AND p_end_date
      )
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'total_opened',   count(*) FILTER (WHERE created_at::date BETWEEN p_start_date AND p_end_date),
    'total_resolved', count(*) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date),
    'sla_compliance_pct', ROUND(
      100.0 * count(*) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date AND NOT is_resolution_breached)
        / NULLIF(count(*) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date), 0), 1),
    'mttr_minutes', ROUND(avg(mttr_minutes) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date), 1),
    'mttr_hours',   ROUND(avg(mttr_minutes) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date) / 60.0, 2),
    -- "Pending Approval" não é um valor de state (não existe no enum
    -- incident_state) — é uma dimensão ortogonal via approval_status, com
    -- state congelado em 'New' (Fases 19/21). Por isso participa deste
    -- mesmo objeto como uma chave adicional, não como parte da partição de
    -- state: um ticket pode contar em "New" E em "Pending Approval" ao
    -- mesmo tempo, de propósito.
    'by_status', (
      SELECT jsonb_object_agg(bucket, qty) FROM (
        SELECT state::text AS bucket, count(*) AS qty
        FROM scoped WHERE created_at::date BETWEEN p_start_date AND p_end_date
        GROUP BY state
        UNION ALL
        SELECT 'Pending Approval', count(*)
        FROM scoped WHERE created_at::date BETWEEN p_start_date AND p_end_date AND approval_status = 'pending'
        HAVING count(*) > 0
      ) x
    )
  ) INTO v_result
  FROM scoped;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_executive_metrics(date, date) IS 'Fase 23: métricas executivas (abertos, resolvidos, % conformidade de SLA, MTTR em minutos/horas úteis via tickets.mttr_minutes já persistido, distribuição por status + Pending Approval) num único JSON, agregado inteiramente em SQL. SECURITY DEFINER com company_id explícito (get_current_user_company_id()) e bloqueio de end_user (is_current_user_ticket_staff()).';

REVOKE ALL ON FUNCTION public.get_executive_metrics(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_executive_metrics(date, date) TO authenticated;
