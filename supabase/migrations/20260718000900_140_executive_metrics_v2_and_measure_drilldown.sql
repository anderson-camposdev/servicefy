-- Métricas executivas v2: números auditáveis, comparação com período anterior
-- e estoque no fechamento. Também preserva a medida selecionada no drill-down.

CREATE OR REPLACE FUNCTION public.get_executive_metrics(p_start_date date, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_current_user_company_id();
  v_days integer;
  v_prev_start date;
  v_prev_end date;
  v_result jsonb;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida: empresa não resolvida.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_current_user_ticket_staff() THEN
    RAISE EXCEPTION 'Acesso restrito à equipe interna.' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  v_days := p_end_date - p_start_date + 1;
  v_prev_end := p_start_date - 1;
  v_prev_start := v_prev_end - v_days + 1;

  WITH scoped AS (
    SELECT *
    FROM public.bi_tickets_unified
    WHERE company_id = v_company_id
      AND created_at::date <= p_end_date
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE created_at::date BETWEEN p_start_date AND p_end_date) AS opened,
      count(*) FILTER (WHERE created_at::date BETWEEN v_prev_start AND v_prev_end) AS prev_opened,
      count(*) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date) AS resolved,
      count(*) FILTER (WHERE resolved_at::date BETWEEN v_prev_start AND v_prev_end) AS prev_resolved,
      round(100.0 * count(*) FILTER (
        WHERE resolved_at::date BETWEEN p_start_date AND p_end_date AND NOT COALESCE(is_resolution_breached, false)
      ) / NULLIF(count(*) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date), 0), 1) AS sla,
      round(100.0 * count(*) FILTER (
        WHERE resolved_at::date BETWEEN v_prev_start AND v_prev_end AND NOT COALESCE(is_resolution_breached, false)
      ) / NULLIF(count(*) FILTER (WHERE resolved_at::date BETWEEN v_prev_start AND v_prev_end), 0), 1) AS prev_sla,
      round(avg(mttr_minutes) FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date), 1) AS mttr,
      round((percentile_cont(0.5) WITHIN GROUP (ORDER BY mttr_minutes)
        FILTER (WHERE resolved_at::date BETWEEN p_start_date AND p_end_date))::numeric, 1) AS mttr_median,
      round(avg(mttr_minutes) FILTER (WHERE resolved_at::date BETWEEN v_prev_start AND v_prev_end), 1) AS prev_mttr,
      count(*) FILTER (
        WHERE created_at::date <= p_end_date
          AND (resolved_at IS NULL OR resolved_at::date > p_end_date)
      ) AS backlog_end,
      count(*) FILTER (
        WHERE created_at::date < p_start_date
          AND (resolved_at IS NULL OR resolved_at::date >= p_start_date)
      ) AS backlog_start,
      count(*) FILTER (
        WHERE created_at::date <= p_end_date
          AND (resolved_at IS NULL OR resolved_at::date > p_end_date)
          AND priority IN ('P1 - Critical', 'P2 - High')
      ) AS critical_backlog,
      count(*) FILTER (
        WHERE resolved_at::date BETWEEN p_start_date AND p_end_date
          AND COALESCE(is_resolution_breached, false)
      ) AS breached_resolved,
      round(100.0 * count(*) FILTER (
        WHERE created_at::date BETWEEN p_start_date AND p_end_date AND COALESCE(was_reopened, false)
      ) / NULLIF(count(*) FILTER (WHERE created_at::date BETWEEN p_start_date AND p_end_date), 0), 1) AS reopen_rate
    FROM scoped
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'previous_period', jsonb_build_object('start', v_prev_start, 'end', v_prev_end),
    'total_opened', opened,
    'previous_total_opened', prev_opened,
    'total_resolved', resolved,
    'previous_total_resolved', prev_resolved,
    'sla_compliance_pct', sla,
    'previous_sla_compliance_pct', prev_sla,
    'mttr_minutes', mttr,
    'mttr_hours', round(mttr / 60.0, 2),
    'mttr_median_minutes', mttr_median,
    'previous_mttr_minutes', prev_mttr,
    'backlog_at_end', backlog_end,
    'backlog_at_start', backlog_start,
    'critical_backlog', critical_backlog,
    'breached_resolved', breached_resolved,
    'reopen_rate_pct', reopen_rate,
    'by_status', COALESCE((
      SELECT jsonb_object_agg(state, qty)
      FROM (
        SELECT state, count(*) qty
        FROM scoped
        WHERE created_at::date <= p_end_date
          AND (resolved_at IS NULL OR resolved_at::date > p_end_date)
        GROUP BY state
      ) status_rows
    ), '{}'::jsonb),
    'by_priority', COALESCE((
      SELECT jsonb_object_agg(COALESCE(priority, 'Sem prioridade'), qty)
      FROM (
        SELECT priority, count(*) qty
        FROM scoped
        WHERE created_at::date <= p_end_date
          AND (resolved_at IS NULL OR resolved_at::date > p_end_date)
        GROUP BY priority
      ) priority_rows
    ), '{}'::jsonb),
    'aging_buckets', jsonb_build_object(
      '0-2', count(*) FILTER (WHERE created_at::date <= p_end_date AND (resolved_at IS NULL OR resolved_at::date > p_end_date) AND p_end_date - created_at::date <= 2),
      '3-7', count(*) FILTER (WHERE created_at::date <= p_end_date AND (resolved_at IS NULL OR resolved_at::date > p_end_date) AND p_end_date - created_at::date BETWEEN 3 AND 7),
      '8-15', count(*) FILTER (WHERE created_at::date <= p_end_date AND (resolved_at IS NULL OR resolved_at::date > p_end_date) AND p_end_date - created_at::date BETWEEN 8 AND 15),
      '16-30', count(*) FILTER (WHERE created_at::date <= p_end_date AND (resolved_at IS NULL OR resolved_at::date > p_end_date) AND p_end_date - created_at::date BETWEEN 16 AND 30),
      '30+', count(*) FILTER (WHERE created_at::date <= p_end_date AND (resolved_at IS NULL OR resolved_at::date > p_end_date) AND p_end_date - created_at::date > 30)
    )
  ) INTO v_result
  FROM totals LEFT JOIN scoped ON true
  GROUP BY opened, prev_opened, resolved, prev_resolved, sla, prev_sla, mttr,
           mttr_median, prev_mttr, backlog_end, backlog_start, critical_backlog,
           breached_resolved, reopen_rate;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_executive_metrics(date, date) IS
  'Métricas executivas v2 com comparação anterior, backlog histórico no fechamento, aging, prioridade e estados exclusivos.';

DROP FUNCTION IF EXISTS public.bi_drilldown(uuid, text[], jsonb, timestamptz, timestamptz, text, integer, integer);

CREATE FUNCTION public.bi_drilldown(
  p_company_id uuid, p_record_types text[] DEFAULT ARRAY['incident','request'],
  p_filters jsonb DEFAULT '[]'::jsonb,
  p_date_from timestamptz DEFAULT now() - interval '30 days',
  p_date_to timestamptz DEFAULT now(), p_date_field text DEFAULT 'created_at',
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0,
  p_measure_key text DEFAULT NULL
) RETURNS TABLE(
  id uuid, record_type text, number text, short_description text, state text,
  priority text, group_name text, assigned_to_name text, created_at timestamptz,
  resolved_at timestamptz, mttr_minutes integer, mtta_minutes integer,
  paused_minutes integer, age_minutes integer, sla_breached boolean, total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_filter_sql text;
  v_measure_filter text := 'true';
  v_sql text;
BEGIN
  IF public.is_current_user_msp_admin() THEN v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
    IF v_company IS NULL THEN RAISE EXCEPTION 'Usuário sem tenant associado.'; END IF;
  END IF;
  IF p_date_field NOT IN ('created_at','resolved_at','closed_at') THEN
    RAISE EXCEPTION 'Campo de data inválido: %', p_date_field;
  END IF;
  IF p_measure_key IN ('mttr_avg', 'mttr_median') THEN v_measure_filter := 'mttr_minutes IS NOT NULL';
  ELSIF p_measure_key IN ('mtta_avg', 'mtta_median') THEN v_measure_filter := 'mtta_minutes IS NOT NULL';
  ELSIF p_measure_key = 'avg_paused_minutes' THEN v_measure_filter := 'paused_minutes IS NOT NULL';
  ELSIF p_measure_key = 'avg_age_minutes' THEN v_measure_filter := 'age_minutes IS NOT NULL';
  ELSIF p_measure_key IS NOT NULL AND p_measure_key NOT IN (
    'count','backlog','resolved_count','breached_count','sla_resolution_pct',
    'sla_response_pct','reopen_rate','reopened_count'
  ) THEN
    RAISE EXCEPTION 'Medida inválida para detalhamento: %', p_measure_key;
  END IF;

  v_filter_sql := public.bi_build_filter_sql(p_filters, COALESCE(v_company, p_company_id), '$4');
  v_sql := format(
    'SELECT id, record_type, number, short_description, state, priority,
            group_name, assigned_to_name, created_at, resolved_at, mttr_minutes,
            mtta_minutes, paused_minutes, age_minutes, COALESCE(sla_breached, false),
            count(*) OVER () AS total_count
       FROM public.bi_tickets_unified
      WHERE ($1::uuid IS NULL OR company_id = $1) AND record_type = ANY($5)
        AND %I >= $2 AND %I < $3 AND (%s) AND (%s)
      ORDER BY created_at DESC LIMIT %s OFFSET %s',
    p_date_field, p_date_field, v_filter_sql, v_measure_filter,
    LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500), GREATEST(COALESCE(p_offset, 0), 0));
  RETURN QUERY EXECUTE v_sql
    USING v_company, p_date_from, p_date_to, p_filters, p_record_types;
END;
$$;

REVOKE ALL ON FUNCTION public.bi_drilldown(uuid, text[], jsonb, timestamptz, timestamptz, text, integer, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bi_drilldown(uuid, text[], jsonb, timestamptz, timestamptz, text, integer, integer, text) TO authenticated;
