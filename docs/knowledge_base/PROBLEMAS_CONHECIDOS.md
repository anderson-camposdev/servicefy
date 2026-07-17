# PROBLEMAS_CONHECIDOS.md — ServiceFY

> Registro de Known Errors (erros conhecidos) no sentido ITIL: problemas cuja causa
> raiz é entendida, mesmo que a correção definitiva ainda não tenha sido aplicada.
> Todo incidente recorrente que já foi diagnosticado deve virar uma entrada aqui,
> mesmo que já tenha sido corrigido — o valor está em não repetir o diagnóstico.

## 1. Convenções

- **ID:** `KE-NNN`, sequencial, nunca reaproveitado.
- **Status da Correção Definitiva:** `Aberto` (sem fix) | `Contornado` (workaround
  ativo, fix definitivo pendente) | `Corrigido` (fix aplicado e verificado) |
  `Aceito` (decisão consciente de não corrigir — justificar).
- Toda entrada com Status `Contornado` deve ter uma referência ao item
  correspondente em [`CHECKLIST_SAAS_VENDAVEL.md`](./CHECKLIST_SAAS_VENDAVEL.md) ou
  ao roadmap, se o fix definitivo depender de trabalho planejado.

## 2. Template — copie este bloco para registrar um novo erro conhecido

```markdown
### KE-NNN — [Título curto e descritivo]

**Descoberto em:** AAAA-MM-DD
**Status da Correção Definitiva:** Aberto | Contornado | Corrigido | Aceito
**Severidade:** Baixa | Média | Alta | Crítica

#### Descrição Técnica
[O que acontece, tecnicamente. Componente/arquivo/função afetado. Condições
exatas de reprodução, se conhecidas.]

#### Impacto no Negócio
[Quem é afetado (todos os tenants? um caso específico?), com que frequência, e
qual a consequência prática — dado incorreto, funcionalidade indisponível,
experiência degradada, risco de segurança/compliance.]

#### Causa Raiz
[O motivo real, não o sintoma. Se ainda não foi totalmente isolada, declare o
melhor entendimento atual e marque como hipótese.]

#### Solução de Contorno (Workaround)
[O que fazer *agora* se o problema ocorrer, até a correção definitiva existir.
Se não houver workaround viável, declare isso explicitamente.]

#### Correção Definitiva
[O que precisa ser feito para eliminar a causa raiz. Referência a
issue/migration/PR quando existir.]

#### Responsáveis
| Papel | Nome/Função |
|---|---|
| Diagnosticado por | |
| Dono da correção | |
```

## 3. Registro de erros conhecidos

> As três entradas abaixo são reais, extraídas do histórico do projeto, e servem
> de exemplo de preenchimento — mantenha esse padrão de detalhe para as próximas.

### KE-001 — Duplicação de seed por `ON CONFLICT` sobre coluna anulável

**Descoberto em:** 2026-07-06
**Status da Correção Definitiva:** Corrigido
**Severidade:** Média

#### Descrição Técnica
Seeds com `service_domain_id NULL` duplicavam registros mesmo com uma constraint
`UNIQUE` cobrindo a coluna, porque `ON CONFLICT` não considera dois valores `NULL`
como iguais — `NULL ≠ NULL` também vale dentro de uma constraint `UNIQUE`.

#### Impacto no Negócio
Registros duplicados na tabela afetada, potencialmente inflando dados
apresentados ao usuário (ex.: ações do agente virtual listadas mais de uma vez).

#### Causa Raiz
Uso de `ON CONFLICT (colunas...)` como estratégia de idempotência quando uma das
colunas da constraint é anulável.

#### Solução de Contorno (Workaround)
Rodar um script de deduplicação manual antes de cada novo seed até o índice
único parcial existir.

#### Correção Definitiva
Migration `086`: dedupe dos registros existentes + criação de índice único
parcial (que trata `NULL` de forma determinística).

#### Responsáveis
| Papel | Nome/Função |
|---|---|
| Diagnosticado por | Sessão de engenharia, 2026-07-06 |
| Dono da correção | Migration 086 |

---

### KE-002 — Transferência indevida para humano com `min_confidence = 0`

**Descoberto em:** 2026-07-06
**Status da Correção Definitiva:** Corrigido
**Severidade:** Alta

#### Descrição Técnica
A função `handoff_to_human` do agente virtual usava `min_confidence = 0` como
threshold, o que fazia qualquer mensagem sem palavra-chave reconhecida (ex.:
"oi", "ok") ser tratada como candidata a transferência para atendimento humano.

#### Impacto no Negócio
Usuários eram transferidos para um agente humano em conversas triviais que
deveriam apenas reapresentar o menu de opções — gerando fila desnecessária e
má experiência de atendimento automatizado.

#### Causa Raiz
Threshold de confiança configurado em `0`, que na prática desabilita o filtro
de confiança (qualquer valor de confiança, incluindo "não reconhecido", passa).

#### Solução de Contorno (Workaround)
Nenhum — o comportamento incorreto era o padrão até a correção.

#### Correção Definitiva
Migration `087`: só qualifica uma ação com confiança estritamente maior que
zero; mensagem não reconhecida volta ao menu, sem transferência automática.

#### Responsáveis
| Papel | Nome/Função |
|---|---|
| Diagnosticado por | Sessão de engenharia, 2026-07-07 |
| Dono da correção | Migration 087 |

---

### KE-003 — `apply_migration` (MCP) não registra em `schema_migrations`

**Descoberto em:** 2026-07-07
**Status da Correção Definitiva:** Contornado
**Severidade:** Média

#### Descrição Técnica
Ao aplicar uma migration via MCP `apply_migration` (ou SQL manual direto), o DDL
é executado no banco, mas a linha correspondente em
`supabase_migrations.schema_migrations` não é registrada — ou é registrada com
um timestamp diferente do nome do arquivo. Isso cria divergência entre o
histórico real de migrations aplicadas e o que o CLI do Supabase acredita ter
sido aplicado.

#### Impacto no Negócio
Nenhum impacto direto ao usuário final. Risco operacional: o próximo
`supabase db push` pode tentar reaplicar (ou pular) migrations de forma
inconsistente se o histórico não for reconciliado antes.

#### Causa Raiz
`apply_migration` via MCP é um caminho de aplicação de DDL separado do fluxo
padrão do CLI (`supabase db push`), e não escreve no mesmo registro de
histórico de migrations.

#### Solução de Contorno (Workaround)
Sempre confirmar o estado real do banco via
`SELECT * FROM supabase_migrations.schema_migrations` e testar diretamente a
existência/comportamento de funções e triggers (não confiar só no registro).
Rodar `supabase migration repair` para reconciliar o histórico antes do
próximo `db push` do CLI.

#### Correção Definitiva
Nenhuma prevista — é uma limitação conhecida do fluxo MCP vs. CLI, não um bug
a ser corrigido no ServiceFY. Mitigação permanente é processual (ver
workaround), documentada também em
[`PADRAO_ARQUITETURA.md`](./PADRAO_ARQUITETURA.md).

#### Responsáveis
| Papel | Nome/Função |
|---|---|
| Diagnosticado por | Sessões de engenharia, 2026-07-07 e recorrente |
| Dono da correção | N/A — mitigação processual permanente |

---

*Placeholder para preenchimento futuro: novos KEs conforme surgirem, e uma
revisão periódica dos itens `Contornado` para avaliar se viram prioridade de
correção definitiva.*
