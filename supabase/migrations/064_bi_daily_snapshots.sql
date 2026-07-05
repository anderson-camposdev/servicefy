-- ============================================================
-- Flowfy ITSM — Migration 064
-- Flowfy BI v2 (4/4): SNAPSHOT diário de backlog.
--
-- Backlog e aging históricos não são reconstituíveis (estados
-- mudam). Um job pg_cron fotografa o backlog aberto por tenant/
-- tipo/prioridade/grupo/bucket todo dia às 03:10 UTC, alimentando
-- o gráfico "tendência de backlog" dos dashboards.
--
-- bi_take_daily_snapshot() é SECURITY DEFINER (job de sistema,
-- cross-tenant por design) e consulta as TABELAS BASE diretamente
-- (não a view security_invoker). Leitura via RLS por tenant.
-- ============================================================

-- ─── 1. Tabela ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bi_daily_snapshots (
  snapshot_date  DATE NOT NULL,
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  record_type    TEXT NOT NULL,
  priority       TEXT NOT NULL DEFAULT '(sem)',
  group_name     TEXT NOT NULL DEFAULT '(sem grupo)',
  state_group    TEXT NOT NULL,
  aging_bucket   TEXT NOT NULL DEFAULT '(sem)',
  open_count     INT  NOT NULL DEFAULT 0,
  breached_count INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_date, company_id, record_type, priority, group_name, state_group, aging_bucket)
);

CREATE INDEX IF NOT EXISTS idx_bi_snapshots_company_date
  ON public.bi_daily_snapshots(company_id, snapshot_date);

ALTER TABLE public.bi_daily_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bi_daily_snapshots TO authenticated;

DROP POLICY IF EXISTS select_bi_daily_snapshots ON public.bi_daily_snapshots;
CREATE POLICY select_bi_daily_snapshots ON public.bi_daily_snapshots
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR company_id = public.get_current_user_company_id()
  );
-- Escrita: somente a função SECURITY DEFINER (sem policy de INSERT).

-- ─── 2. Função de snapshot (job de sistema) ──────────────────
CREATE OR REPLACE FUNCTION public.bi_take_daily_snapshot()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Incidentes + solicitações abertos
  INSERT INTO public.bi_daily_snapshots
    (snapshot_date, company_id, record_type, priority, group_name, state_group, aging_bucket, open_count, breached_count)
  SELECT
    current_date,
    i.company_id,
    CASE WHEN i.ticket_type = 'request' THEN 'request' ELSE 'incident' END,
    COALESCE(i.priority::text, '(sem)'),
    COALESCE(ag.name, i.assigned_group_name, '(sem grupo)'),
    public.bi_normalize_state(i.state::text),
    COALESCE(public.bi_aging_bucket(i.created_at, NULL, NULL), '(sem)'),
    count(*)::int,
    count(*) FILTER (WHERE COALESCE(i.sla_breached, false))::int
  FROM public.incidents i
  LEFT JOIN public.assignment_groups ag ON ag.id = i.assignment_group_id
  WHERE i.resolved_at IS NULL AND i.closed_at IS NULL
  GROUP BY 2, 3, 4, 5, 6, 7
  ON CONFLICT DO NOTHING;

  -- Problemas abertos
  INSERT INTO public.bi_daily_snapshots
    (snapshot_date, company_id, record_type, priority, group_name, state_group, aging_bucket, open_count, breached_count)
  SELECT
    current_date, p.company_id, 'problem',
    COALESCE(p.priority::text, '(sem)'),
    COALESCE(ag.name, p.assigned_group_name, '(sem grupo)'),
    public.bi_normalize_state(p.state::text),
    COALESCE(public.bi_aging_bucket(p.created_at, NULL, NULL), '(sem)'),
    count(*)::int, 0
  FROM public.problems p
  LEFT JOIN public.assignment_groups ag ON ag.id = p.assigned_group_id
  WHERE p.resolved_at IS NULL AND p.state::text NOT IN ('Resolved', 'Closed')
  GROUP BY 2, 4, 5, 6, 7
  ON CONFLICT DO NOTHING;

  -- Mudanças em andamento
  INSERT INTO public.bi_daily_snapshots
    (snapshot_date, company_id, record_type, priority, group_name, state_group, aging_bucket, open_count, breached_count)
  SELECT
    current_date, c.company_id, 'change',
    COALESCE(c.risk::text, '(sem)'),
    '(sem grupo)',
    public.bi_normalize_state(c.state::text),
    COALESCE(public.bi_aging_bucket(c.created_at, NULL, NULL), '(sem)'),
    count(*)::int, 0
  FROM public.changes c
  WHERE c.completed_at IS NULL
    AND c.state::text NOT IN ('Completed', 'Failed', 'Cancelled', 'CAB Rejected')
  GROUP BY 2, 4, 6, 7
  ON CONFLICT DO NOTHING;
$$;

COMMENT ON FUNCTION public.bi_take_daily_snapshot() IS
  'Job diário: fotografa o backlog aberto por tenant/tipo/prioridade/grupo/bucket em bi_daily_snapshots. Idempotente (ON CONFLICT DO NOTHING).';

REVOKE EXECUTE ON FUNCTION public.bi_take_daily_snapshot() FROM PUBLIC, authenticated;

-- ─── 3. RPC de leitura: tendência de backlog ─────────────────
CREATE OR REPLACE FUNCTION public.bi_backlog_trend(
  p_company_id   UUID,
  p_record_types TEXT[] DEFAULT '{incident,request}',
  p_date_from    DATE   DEFAULT current_date - 30,
  p_date_to      DATE   DEFAULT current_date
) RETURNS TABLE (
  snapshot_date  DATE,
  record_type    TEXT,
  open_count     BIGINT,
  breached_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  IF public.is_current_user_msp_admin() THEN
    v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
  END IF;

  RETURN QUERY
  SELECT s.snapshot_date, s.record_type,
         sum(s.open_count)::bigint, sum(s.breached_count)::bigint
    FROM public.bi_daily_snapshots s
   WHERE (v_company IS NULL OR s.company_id = v_company)
     AND s.record_type = ANY(p_record_types)
     AND s.snapshot_date BETWEEN p_date_from AND p_date_to
   GROUP BY 1, 2
   ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bi_backlog_trend(UUID, TEXT[], DATE, DATE) TO authenticated;

-- ─── 4. Agendamento pg_cron (padrão das migrations 053/060) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove agendamento anterior, se houver (idempotência).
    PERFORM cron.unschedule(jobid)
       FROM cron.job WHERE jobname = 'bi-daily-snapshot';
    PERFORM cron.schedule(
      'bi-daily-snapshot',
      '10 3 * * *',
      $job$ SELECT public.bi_take_daily_snapshot(); $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron não instalado — agende bi_take_daily_snapshot() manualmente.';
  END IF;
END $$;

-- Snapshot inicial imediato (popular o gráfico já no primeiro dia).
SELECT public.bi_take_daily_snapshot();

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT snapshot_date, record_type, sum(open_count)
--     FROM public.bi_daily_snapshots GROUP BY 1,2 ORDER BY 1;
--   SELECT * FROM public.bi_backlog_trend(NULL);
-- ────────────────────────────────────────────────────────────
