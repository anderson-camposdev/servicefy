-- ============================================================
-- Flowfy ITSM — Migration 065
-- Flowfy BI v2 (Fase 2): valores distintos de uma dimensão.
--
-- Alimenta os seletores de filtro do PivotExplorer: dado uma
-- dimensão da whitelist (ou form.<label>), retorna até 50 valores
-- distintos observados no tenant, com busca opcional.
-- Mesma segurança do bi_cube: SECURITY INVOKER + guard de tenant +
-- whitelist via bi_resolve_dimension.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bi_dimension_values(
  p_company_id   UUID,
  p_dimension    TEXT,
  p_search       TEXT   DEFAULT NULL,
  p_record_types TEXT[] DEFAULT '{incident,request,problem,change}'
) RETURNS TABLE (value TEXT, occurrences BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_expr    TEXT;
  v_sql     TEXT;
BEGIN
  IF public.is_current_user_msp_admin() THEN
    v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'Usuário sem tenant associado.';
    END IF;
  END IF;

  v_expr := public.bi_resolve_dimension(p_dimension, COALESCE(v_company, p_company_id));

  v_sql := format(
    'SELECT (%s)::text AS value, count(*) AS occurrences
       FROM public.bi_tickets_unified
      WHERE ($1::uuid IS NULL OR company_id = $1)
        AND record_type = ANY($2)
        AND (%s) IS NOT NULL
        AND (%s)::text <> ''''
        AND ($3::text IS NULL OR (%s)::text ILIKE ''%%'' || $3 || ''%%'')
      GROUP BY 1
      ORDER BY 2 DESC, 1
      LIMIT 50',
    v_expr, v_expr, v_expr, v_expr
  );

  RETURN QUERY EXECUTE v_sql USING v_company, p_record_types, p_search;
END;
$$;

COMMENT ON FUNCTION public.bi_dimension_values(UUID, TEXT, TEXT, TEXT[]) IS
  'Valores distintos (top 50 por ocorrência) de uma dimensão da whitelist para os seletores de filtro do BI.';

GRANT EXECUTE ON FUNCTION public.bi_dimension_values(UUID, TEXT, TEXT, TEXT[]) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT * FROM public.bi_dimension_values('<company>', 'group_name');
--   SELECT * FROM public.bi_dimension_values('<company>', 'form.Local', 'and');
--   -- dimensão fora da whitelist deve falhar:
--   SELECT * FROM public.bi_dimension_values('<company>', 'x; DROP TABLE y');
-- ────────────────────────────────────────────────────────────
