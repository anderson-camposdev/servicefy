# Arquitetura de dados

## Checklist

Definir PK, `company_id`, número humano, FKs, exclusão, timestamps, estados, índices, RLS,
grants, auditoria, retenção, migration, backfill e rollback.

## Guardrails

- Usar constraint composta quando uma FK simples permitir cruzamento de tenant.
- Validar tenant em RPCs `SECURITY DEFINER`, fixar `search_path` e qualificar objetos.
- Testar acesso horizontal entre tenants e grupos.
- Usar `security_invoker` nas views quando apropriado.
- Separar PK, chave natural, chave alternativa, idempotency key e número humano.
- Preferir FK concreta; se polimórfica, usar alvo único validado ou supertipo real.
- Usar ledger imutável para estado, SLA, aprovação, atribuição e publicação.
- Definir transições com origem, destino, autorização, campos, eventos e concorrência.
- Usar constraints, compare-and-set, idempotência e outbox em operações repetíveis.

## Anexos

Guardar binário em bucket privado; validar tamanho, quantidade, extensão, MIME e tenant;
visualizar com URL autenticada e `inline`; aplicar quarentena, auditoria e retenção.

## Migration

1. Adicionar estrutura compatível.
2. Fazer backfill determinístico em lotes.
3. Validar órfãos, duplicidades e isolamento.
4. Migrar leitores e escritores.
5. Ativar constraints após o backfill.
6. Remover legado em fase posterior.
7. Testar upgrade e rollback lógico.
