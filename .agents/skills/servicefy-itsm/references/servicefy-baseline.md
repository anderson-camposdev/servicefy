# Baseline do ServiceFY

Usar como mapa inicial e confirmar tudo no repositório.

## Arquitetura observada

- React, TypeScript e Vite; PostgreSQL/Supabase.
- Multi-tenancy por `company_id`, RLS e tenant provedor MSP.
- Modelo polimórfico de `tickets` com atributos específicos e views de compatibilidade.
- Migrations ordenadas, tipos gerados, serviços TypeScript e testes.

## Rotas iniciais

| Capacidade | Migrations |
|---|---|
| Núcleo | `20260606191642_001_flowfy_core_schema.sql` |
| Catálogo | `019`, `023`, `024`, `028` |
| SLA | `032`–`035`, `090`–`093`, `116` |
| Prioridade | `039_servicenow_priority_matrix` |
| Solicitações/tarefas | `047`, `048`, `095` |
| Workflow/aprovação | `055`–`060`, `072`, `118` |
| Segurança/RBAC | `068`, `071`, `107`, `134`, `141` |
| Modelo unificado | `096_tickets_polymorphic_schema` |
| CMDB | `079`, `098` |
| Analytics | `061`–`066`, `099`, `120`, `140` |
| Conhecimento | `082`, `117`, `131`–`139` |
| Anexos | `143_attachment_security_foundation` |

## Invariantes a preservar

- UUID técnico separado de números `INC`, `REQ`, `PRB` e `CHG`.
- Relações entre tickets, catálogo, problemas, mudanças, CMDB e conhecimento.
- Isolamento por tenant, histórico, SLA, auditoria, CAB e RBAC.
- Métricas com período, comparação e drilldown.

## Descoberta

1. Localizar a migration mais recente da entidade.
2. Verificar alterações posteriores em view, policy, trigger ou RPC.
3. Conferir `src/lib/database.generated.ts`, serviços e consumidores.
4. Localizar testes unitários, segurança e E2E.

Não criar tabela paralela se a entidade já estiver no modelo unificado, duplicar SLA no
frontend ou consultar view sem verificar `security_invoker` e RLS.
