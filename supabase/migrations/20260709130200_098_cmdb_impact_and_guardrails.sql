-- ============================================================================
-- ServiceFY ITSM — Migration 098
-- Implementação do Motor Preditivo de Impacto e Trava Multitenant no CMDB
--
-- Esta migração introduz as seguintes proteções e ferramentas analíticas no CMDB:
--
-- 1. Função Recursiva de Análise de Impacto (cmdb_predict_incident_impact):
--    Usa uma Common Table Expression (CTE) recursiva com privilégios de SECURITY DEFINER
--    e search_path configurado. Mapeia o ecossistema de CIs afetados a montante
--    (upstream) ou a jusante (downstream) limitando a busca a 10 níveis.
--    Implementa prevenção ativa de dependências circulares infinitas verificando se
--    o CI candidato já existe na matriz de caminho percorrido ('path').
--
-- 2. Trigger de Proteção e Governança de Empresa (tg_validate_ci_relationship_company):
--    Valida se os CIs de origem e destino, bem como a própria linha de relacionamento,
--    pertencem ao mesmo 'company_id', impedindo vazamento de dados cruzado.
-- ============================================================================

-- ─── 1. Função de Análise Preditiva de Impacto ─────────────────────────────
CREATE OR REPLACE FUNCTION public.cmdb_predict_incident_impact(
  p_company_id UUID,
  p_root_ci_id UUID,
  p_direction TEXT DEFAULT 'upstream', -- 'upstream' (afetados) ou 'downstream' (dependências)
  p_max_depth INT DEFAULT 10
)
RETURNS TABLE (
  ci_id UUID,
  ci_name TEXT,
  class_name TEXT,
  criticality TEXT,
  depth INT,
  path UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Normaliza e limita a profundidade máxima em 10 níveis para preservar recursos de CPU
  p_max_depth := LEAST(COALESCE(p_max_depth, 10), 10);

  RETURN QUERY
  WITH RECURSIVE impact_path AS (
    -- Elemento Âncora: O CI raiz sob auditoria de incidente
    SELECT 
      ci.id AS ci_id, 
      ci.name AS ci_name,
      ci.class_id,
      ci.criticality,
      0 AS depth,
      ARRAY[ci.id] AS path
    FROM public.configuration_items ci
    WHERE ci.id = p_root_ci_id AND ci.company_id = p_company_id

    UNION ALL

    -- Recursão: Busca nós adjacentes seguindo o grafo direcionado de relacionamentos
    SELECT 
      c.id AS ci_id,
      c.name AS ci_name,
      c.class_id,
      c.criticality,
      ip.depth + 1,
      ip.path || c.id
    FROM impact_path ip
    JOIN public.ci_relationships r ON (
      CASE 
        -- Upstream (A montante): Rastreia o impacto subindo a cadeia de dependências
        -- (ex: Banco de Dados -> Aplicação -> Serviço de Negócio)
        WHEN p_direction = 'upstream' THEN r.target_ci_id = ip.ci_id
        -- Downstream (A jusante): Rastreia as dependências descendo a cadeia
        -- (ex: Serviço de Negócio -> Aplicação -> Banco de Dados)
        ELSE r.source_ci_id = ip.ci_id
      END
    )
    JOIN public.configuration_items c ON (
      CASE 
        WHEN p_direction = 'upstream' THEN c.id = r.source_ci_id
        ELSE c.id = r.target_ci_id
      END
    )
    WHERE c.company_id = p_company_id
      AND ip.depth < p_max_depth
      -- Trava contra dependências circulares: encerra a recursão se o CI já foi visitado
      AND NOT (c.id = ANY(ip.path))
  )
  SELECT 
    ip.ci_id,
    ip.ci_name,
    cls.name AS class_name,
    ip.criticality,
    ip.depth,
    ip.path
  FROM impact_path ip
  JOIN public.ci_classes cls ON cls.id = ip.class_id
  ORDER BY ip.depth, ip.criticality DESC;
END;
$$;

-- Liberar execução apenas para usuários autenticados
REVOKE ALL ON FUNCTION public.cmdb_predict_incident_impact(UUID, UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cmdb_predict_incident_impact(UUID, UUID, TEXT, INT) TO authenticated;

-- ─── 2. Validador de Isolamento Multitenant de Relacionamentos ──────────────
CREATE OR REPLACE FUNCTION public.fn_validate_ci_relationship_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_company_id UUID;
  v_target_company_id UUID;
BEGIN
  -- Obter a empresa vinculada ao CI de origem
  SELECT company_id INTO v_source_company_id
    FROM public.configuration_items
   WHERE id = NEW.source_ci_id;

  -- Obter a empresa vinculada ao CI de destino
  SELECT company_id INTO v_target_company_id
    FROM public.configuration_items
   WHERE id = NEW.target_ci_id;

  -- Guardrail 1: Origem e Destino devem pertencer à mesma empresa (tenant)
  IF v_source_company_id IS DISTINCT FROM v_target_company_id THEN
    RAISE EXCEPTION 'CMDB Multitenancy Violation: Source CI (Company: %) and Target CI (Company: %) must belong to the same company.',
      v_source_company_id, v_target_company_id;
  END IF;

  -- Guardrail 2: O próprio registro de relacionamento deve herdar a empresa correta
  IF NEW.company_id IS DISTINCT FROM v_source_company_id THEN
    RAISE EXCEPTION 'CMDB Multitenancy Violation: Relationship company_id (%) must match CIs company_id (%).',
      NEW.company_id, v_source_company_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar a trigger para interceptar inserções e atualizações em ci_relationships
DROP TRIGGER IF EXISTS tg_validate_ci_relationship_company ON public.ci_relationships;
CREATE TRIGGER tg_validate_ci_relationship_company
  BEFORE INSERT OR UPDATE ON public.ci_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_ci_relationship_company();
