# Auditoria de Ativos (CMDB/SACM) e Análise de Impacto em Cascata

Esta auditoria detalha a modelagem física, os mecanismos de segurança por tenant (multitenancy), os riscos de concorrência/integridade e a proposta arquitetural para análise preditiva de impacto em cascata no módulo de CMDB do ServiceFY.

---

## 1. Diagrama de Entidades e Relacionamentos (DER)

A modelagem de ativos é baseada em classes tipadas (`ci_classes`) com herança simples (`parent_id`) e relacionamentos direcionais flexíveis:

- **`public.ci_classes`**: Define as classes de ativos (ex: `computador`, `servidor_banco`, `servico_negocio`) e suporta herança recursiva estruturada. Cada classe carrega um esquema dinâmico no campo `attribute_schema` (JSONB).
- **`public.configuration_items`**: Armazena as instâncias dos ativos. Contém metadados nativos de ciclo de vida (`lifecycle`), criticidade (`criticality`) e parâmetros customizados (`attributes` JSONB).
- **`public.ci_relationships`**: Tabela de junção polimórfica que liga dois itens de configuração (`source_ci_id` e `target_ci_id`) sob uma classificação contida em `ci_relationship_types`.

---

## 2. Governança e Isolamento Multitenant (Multitenancy)

O isolamento por tenant é implementado de forma rigorosa em todas as camadas de banco e dados:
- **Separação de Chaves**: Todas as tabelas do CMDB possuem a chave estrangeira `company_id` referenciando `public.companies(id) ON DELETE CASCADE`.
- **Row-Level Security (RLS)**: As políticas restringem o tráfego de leitura e escrita baseando-se no papel (`role`) e empresa do usuário autenticado:
  - Exemplo (`public.configuration_items`):
    ```sql
    CREATE POLICY ci_tenant_read ON public.configuration_items FOR SELECT TO authenticated
      USING (public.is_current_user_msp_admin() OR (company_id=public.get_current_user_company_id() AND public.get_current_user_role()<>'end_user'));
    ```
  - Bloqueia o acesso a usuários finais (`end_user`), restringindo a visualização a técnicos e administradores do tenant correspondente.

---

## 3. Riscos Arquiteturais Mapeados

1. **Inexistência de Prevenção Contra Ciclos (Circular Dependencies)**:
   - A modelagem do banco impede apenas o auto-relacionamento de um CI consigo mesmo via `CHECK(source_ci_id <> target_ci_id)`.
   - Contudo, **dependências circulares indiretas são permitidas** (ex: A depende de B, B depende de C, C depende de A). Ao rodar consultas de recursividade simples para mapeamento do ecossistema, isso pode gerar *Stack Overflow* ou loops infinitos de execução caso o banco não aplique restrições explícitas de caminho.
2. **Falta de Integridade Entre CIs de Diferentes Empresas**:
   - A tabela `ci_relationships` não impede que um usuário ligue um CI pertencente à Empresa A com um CI pertencente à Empresa B se o painel administrativo ignorar essa validação. Embora as políticas de RLS e o formulário em `PlatformModuleSettings.tsx` filtrem os itens listados por `company_id`, o banco de dados não tem uma constraint declarativa multi-coluna para garantir que `source.company_id = target.company_id`.

---

## 4. Análise de Impacto Preditiva em Incidentes

Quando um servidor ou componente de rede sofre um incidente (ex: falha de disco em uma VM), é crítico prever quais serviços de negócio (upstream) serão impactados em cascata.

### 4.1 Função SQL Proposta para Rastreamento Recursivo (CTE)
Abaixo está o design técnico de uma função estável que percorre a árvore de relacionamentos de forma bi-direcional e detecta dependências sem entrar em loops infinitos, graças à exclusão de caminhos já visitados:

```sql
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
  RETURN QUERY
  WITH RECURSIVE impact_path AS (
    -- Elemento Âncora: O CI que sofreu o incidente
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

    -- Recursão: Busca os nós conectados de acordo com a direção desejada
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
        WHEN p_direction = 'upstream' THEN r.target_ci_id = ip.ci_id
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
      -- Impede loops infinitos abortando caminhos que visitem o mesmo ID mais de uma vez
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
```

### 4.2 Recomendações Técnicas para Implementação Futura
- **Trigger de Validação no Banco**: Implementar uma trigger de inserção/atualização (`BEFORE INSERT OR UPDATE ON public.ci_relationships`) que verifique se os dois CIs pertencem ao mesmo `company_id`.
- **Integridade de Ciclo**: Utilizar uma função similar à do impacto recursivo para impedir a criação de um relacionamento se este for fechar um ciclo (dependência mútua infinita), lançando uma exceção no PostgreSQL.
