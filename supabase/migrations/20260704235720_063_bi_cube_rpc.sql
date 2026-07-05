-- Flowfy BI v2 (3/4): RPC de CUBO genérico + drill-down.

CREATE OR REPLACE FUNCTION public.bi_resolve_dimension(
  p_key        TEXT,
  p_company_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expr  TEXT;
  v_label TEXT;
BEGIN
  IF p_key LIKE 'form.%' THEN
    v_label := substr(p_key, 6);
    IF NOT EXISTS (
      SELECT 1 FROM public.bi_form_dimensions(p_company_id) fd WHERE fd.key = p_key
    ) THEN
      RAISE EXCEPTION 'Dimensão de formulário desconhecida: %', p_key;
    END IF;
    RETURN format('(form_data->>%L)', v_label);
  END IF;

  SELECT sql_expr INTO v_expr FROM public.bi_dimensions WHERE key = p_key;
  IF v_expr IS NULL THEN
    RAISE EXCEPTION 'Dimensão desconhecida: %', p_key;
  END IF;
  RETURN '(' || v_expr || ')';
END;
$$;

CREATE OR REPLACE FUNCTION public.bi_build_filter_sql(
  p_filters     JSONB,
  p_company_id  UUID,
  p_param_ref   TEXT
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_conds TEXT[] := '{}';
  v_i     INT;
  v_n     INT;
  v_dim   TEXT;
  v_op    TEXT;
  v_expr  TEXT;
  v_val   TEXT;
BEGIN
  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'array' THEN
    RETURN 'true';
  END IF;

  v_n := jsonb_array_length(p_filters);
  IF v_n = 0 THEN RETURN 'true'; END IF;
  IF v_n > 20 THEN RAISE EXCEPTION 'Máximo de 20 filtros por consulta.'; END IF;

  FOR v_i IN 0 .. v_n - 1 LOOP
    v_dim  := p_filters->v_i->>'dim';
    v_op   := COALESCE(p_filters->v_i->>'op', 'eq');
    v_expr := public.bi_resolve_dimension(v_dim, p_company_id);
    v_val  := format('(%s->%s->>''value'')', p_param_ref, v_i);

    v_conds := v_conds || CASE v_op
      WHEN 'eq'       THEN format('%s = %s', v_expr, v_val)
      WHEN 'neq'      THEN format('%s IS DISTINCT FROM %s', v_expr, v_val)
      WHEN 'in'       THEN format('%s IN (SELECT jsonb_array_elements_text(%s->%s->''value''))', v_expr, p_param_ref, v_i)
      WHEN 'not_in'   THEN format('COALESCE(%s, '''') NOT IN (SELECT jsonb_array_elements_text(%s->%s->''value''))', v_expr, p_param_ref, v_i)
      WHEN 'contains' THEN format('%s ILIKE ''%%'' || %s || ''%%''', v_expr, v_val)
      WHEN 'gte'      THEN format('%s >= %s', v_expr, v_val)
      WHEN 'lte'      THEN format('%s <= %s', v_expr, v_val)
      WHEN 'is_null'  THEN format('(%s IS NULL OR %s = '''')', v_expr, v_expr)
      WHEN 'not_null' THEN format('(%s IS NOT NULL AND %s <> '''')', v_expr, v_expr)
      ELSE NULL
    END;

    IF v_conds[array_length(v_conds, 1)] IS NULL THEN
      RAISE EXCEPTION 'Operador de filtro desconhecido: %', v_op;
    END IF;
  END LOOP;

  RETURN array_to_string(v_conds, ' AND ');
END;
$$;

CREATE OR REPLACE FUNCTION public.bi_cube(
  p_company_id   UUID,
  p_record_types TEXT[]      DEFAULT '{incident,request}',
  p_dimensions   TEXT[]      DEFAULT '{}',
  p_measures     TEXT[]      DEFAULT '{count}',
  p_filters      JSONB       DEFAULT '[]',
  p_date_from    TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_date_to      TIMESTAMPTZ DEFAULT now(),
  p_date_field   TEXT        DEFAULT 'created_at',
  p_limit        INT         DEFAULT 1000
) RETURNS TABLE (dims JSONB, measures JSONB)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company     UUID;
  v_dim_pairs   TEXT[] := '{}';
  v_dim_exprs   TEXT[] := '{}';
  v_mea_pairs   TEXT[] := '{}';
  v_first_mea   TEXT;
  v_expr        TEXT;
  v_key         TEXT;
  v_filter_sql  TEXT;
  v_sql         TEXT;
  v_limit       INT;
BEGIN
  IF public.is_current_user_msp_admin() THEN
    v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'Usuário sem tenant associado.';
    END IF;
  END IF;

  IF array_length(p_dimensions, 1) > 3 THEN
    RAISE EXCEPTION 'Máximo de 3 dimensões por consulta.';
  END IF;
  IF COALESCE(array_length(p_measures, 1), 0) = 0 OR array_length(p_measures, 1) > 8 THEN
    RAISE EXCEPTION 'Informe de 1 a 8 medidas.';
  END IF;
  IF p_date_field NOT IN ('created_at', 'resolved_at', 'closed_at') THEN
    RAISE EXCEPTION 'Campo de data inválido: %', p_date_field;
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);

  FOREACH v_key IN ARRAY COALESCE(p_dimensions, '{}') LOOP
    v_expr := public.bi_resolve_dimension(v_key, COALESCE(v_company, p_company_id));
    v_dim_pairs := v_dim_pairs || format('%L, (%s)::text', v_key, v_expr);
    v_dim_exprs := v_dim_exprs || v_expr;
  END LOOP;

  FOREACH v_key IN ARRAY p_measures LOOP
    SELECT sql_expr INTO v_expr FROM public.bi_measures WHERE key = v_key;
    IF v_expr IS NULL THEN
      RAISE EXCEPTION 'Medida desconhecida: %', v_key;
    END IF;
    v_mea_pairs := v_mea_pairs || format('%L, (%s)::numeric', v_key, v_expr);
    IF v_first_mea IS NULL THEN v_first_mea := v_expr; END IF;
  END LOOP;

  v_filter_sql := public.bi_build_filter_sql(p_filters, COALESCE(v_company, p_company_id), '$5');

  v_sql := format(
    'SELECT %s AS dims, jsonb_build_object(%s) AS measures
       FROM public.bi_tickets_unified
      WHERE ($1::uuid IS NULL OR company_id = $1)
        AND record_type = ANY($4)
        AND %I >= $2 AND %I < $3
        AND (%s)
      %s
      ORDER BY (%s) DESC NULLS LAST
      LIMIT %s',
    CASE WHEN cardinality(v_dim_pairs) > 0
         THEN 'jsonb_build_object(' || array_to_string(v_dim_pairs, ', ') || ')'
         ELSE '''{}''::jsonb' END,
    array_to_string(v_mea_pairs, ', '),
    p_date_field, p_date_field,
    v_filter_sql,
    CASE WHEN cardinality(v_dim_exprs) > 0
         THEN 'GROUP BY ' || array_to_string(v_dim_exprs, ', ')
         ELSE '' END,
    v_first_mea,
    v_limit
  );

  RETURN QUERY EXECUTE v_sql
    USING v_company, p_date_from, p_date_to, p_record_types, p_filters;
END;
$$;

COMMENT ON FUNCTION public.bi_cube(UUID, TEXT[], TEXT[], TEXT[], JSONB, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT) IS
  'Cubo do Flowfy BI: agrega bi_tickets_unified por dimensões/medidas da whitelist (migration 062). SECURITY INVOKER + guard de tenant.';

GRANT EXECUTE ON FUNCTION public.bi_cube(UUID, TEXT[], TEXT[], TEXT[], JSONB, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.bi_drilldown(
  p_company_id   UUID,
  p_record_types TEXT[]      DEFAULT '{incident,request}',
  p_filters      JSONB       DEFAULT '[]',
  p_date_from    TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_date_to      TIMESTAMPTZ DEFAULT now(),
  p_date_field   TEXT        DEFAULT 'created_at',
  p_limit        INT         DEFAULT 100,
  p_offset       INT         DEFAULT 0
) RETURNS TABLE (
  id                UUID,
  record_type       TEXT,
  number            TEXT,
  short_description TEXT,
  state             TEXT,
  priority          TEXT,
  group_name        TEXT,
  assigned_to_name  TEXT,
  created_at        TIMESTAMPTZ,
  sla_breached      BOOLEAN,
  total_count       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company    UUID;
  v_filter_sql TEXT;
  v_sql        TEXT;
BEGIN
  IF public.is_current_user_msp_admin() THEN
    v_company := p_company_id;
  ELSE
    v_company := public.get_current_user_company_id();
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'Usuário sem tenant associado.';
    END IF;
  END IF;

  IF p_date_field NOT IN ('created_at', 'resolved_at', 'closed_at') THEN
    RAISE EXCEPTION 'Campo de data inválido: %', p_date_field;
  END IF;

  v_filter_sql := public.bi_build_filter_sql(p_filters, COALESCE(v_company, p_company_id), '$4');

  v_sql := format(
    'SELECT id, record_type, number, short_description, state, priority,
            group_name, assigned_to_name, created_at, COALESCE(sla_breached, false),
            count(*) OVER () AS total_count
       FROM public.bi_tickets_unified
      WHERE ($1::uuid IS NULL OR company_id = $1)
        AND record_type = ANY($5)
        AND %I >= $2 AND %I < $3
        AND (%s)
      ORDER BY created_at DESC
      LIMIT %s OFFSET %s',
    p_date_field, p_date_field,
    v_filter_sql,
    LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500),
    GREATEST(COALESCE(p_offset, 0), 0)
  );

  RETURN QUERY EXECUTE v_sql
    USING v_company, p_date_from, p_date_to, p_filters, p_record_types;
END;
$$;

COMMENT ON FUNCTION public.bi_drilldown(UUID, TEXT[], JSONB, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT, INT) IS
  'Drill-down do Flowfy BI: lista paginada dos tickets por trás de um agregado do bi_cube. Mesmos filtros/whitelist.';

GRANT EXECUTE ON FUNCTION public.bi_drilldown(UUID, TEXT[], JSONB, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT, INT) TO authenticated;;
