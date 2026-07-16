# Auditoria Arquitetural: Motor de Automações e Filas Assíncronas (Workflow Engine)

Esta auditoria detalha o fluxo de dados, a modelagem de banco de dados, os mecanismos de segurança, concorrência e o pipeline de processamento do motor de automação do ServiceFY (**Flowfy ITSM**).

---

## 1. Fluxo de Dados de Automação: Da Criação ao Disparo

O motor opera em um modelo híbrido, dividindo a execução entre regras síncronas de banco de dados e processamento assíncrono em background:

### 1.1 Persistência de Regras (Passo 1)
As regras configuradas no `WorkflowBuilder.tsx` são salvas na tabela `public.workflow_rules` usando as seguintes colunas estruturais:
- `company_id`: UUID que garante o isolamento estrito por tenant.
- `trigger_event`: Rótulo de gatilho (`incident_created`, `incident_updated`, `incident_resolved`, `incident_closed`, `sla_warning`, `sla_breached`, `comment_added`, `scheduled`).
- `trigger_source`: Origem do canal (`any`, `portal`, `email`, `api`).
- `conditions`: Array JSONB estruturado contendo `{ field, operator, value, logicOp }`.
- `actions`: Array JSONB contendo `{ type, params }`.

A avaliação é executada no banco pela função estável `public.workflow_eval_conditions()`, que extrai o valor atual do ticket (incluindo cálculo dinâmico de horas de inatividade via `idle_hours` e nome do departamento via consultas estruturadas) e aplica operações booleanas sequenciais (`AND`/`OR`).

---

## 2. Enfileiramento e Triggers de Banco de Dados (Passo 2)

As tabelas de incidentes (`public.incidents`) e mensagens (`public.ticket_messages`) possuem triggers anexados que iniciam a execução das regras:
- `tg_workflow_on_incident_change` (`AFTER INSERT OR UPDATE ON public.incidents`)
- `tg_workflow_on_comment_added` (`AFTER INSERT ON public.ticket_messages`)

Ao disparar as ações via `public.workflow_dispatch_actions()`:
- **Ações Síncronas**: Se a ação for imediata (ex: `assign_group`, `change_priority`), a trigger executa a alteração diretamente via `UPDATE` na tabela de incidentes, na mesma transação.
- **Divisor de Fila (Delay)**: Se um bloco `delay` é encontrado no fluxo de ações, uma flag interna `v_queue_rest` é ativada. A partir desse ponto, todas as ações subsequentes na regra são desviadas para inserção na fila `public.workflow_action_queue` com o timestamp `run_after` calculado.
- **Log de Execução**: Um registro é imediatamente adicionado a `public.workflow_execution_log` indicando sucesso/falha do trigger.

---

## 3. Concorrência e Prevenção de Loops Infinitos (Passo 3)

### 3.1 Prevenção de Recursão Infinita
Para impedir que ações síncronas de um trigger (ex: alterar status) disparem novamente os mesmos triggers indefinidamente, o motor implementa uma trava de profundidade:
- É utilizada a variável de sessão/transação PostgreSQL `flowfy.workflow_depth`.
- No início de cada trigger, o motor lê a profundidade:
  ```sql
  v_depth := COALESCE(NULLIF(current_setting('flowfy.workflow_depth', true), '')::INT, 0);
  IF v_depth >= 3 THEN
    RETURN NEW; -- Cancela processamento em cascata profundo
  END IF;
  PERFORM set_config('flowfy.workflow_depth', (v_depth + 1)::TEXT, true);
  ```
- O limite máximo é de **3 níveis de recursão**, o que bloqueia loops infinitos causados por regras conflitantes.

### 3.2 Concorrência de Workers
Para permitir o dimensionamento horizontal de workers sem duplicar execuções de ações (como enviar o mesmo e-mail duas vezes):
- A RPC `workflow_claim_queue_batch` utiliza a cláusula `FOR UPDATE SKIP LOCKED`. Os candidatos a execução são bloqueados e ignorados por qualquer outra transação concorrente no mesmo instante.
- **Gerenciamento de Leases**: Itens que entram em estado `processing` e ficam travados por falha do worker voltam a ficar `pending` após 5 minutos. Se estourarem o limite de tentativas (`max_attempts`), são marcados definitivamente como `failed`.
- **Integridade de Cadeias**: Se uma ação em uma cadeia (`chain_id`) falha, todas as ações subsequentes são automaticamente marcadas como `cancelled` para evitar ações parciais e fora de ordem.

---

## 4. Gargalos Técnicos Mapeados (Passo 4)

1. **Latência de Minuto (Minutely Latency)**:
   A fila de ações é drenada por um agendamento do `pg_cron` rodando a cada minuto (`* * * * *`). Ações marcadas para execução imediata ou pós-delay que caem na fila podem esperar até 59 segundos para serem detectadas e processadas, inviabilizando integrações em tempo real estrito.
2. **Processamento Sequencial nos Workers**:
   A Edge Function `run-workflow-actions` varre o lote de 50 ações síncronas de forma **sequencial** (`for (const row of rows)` com chamadas bloqueantes `await`). Se múltiplos webhooks lentos ou com timeout (10s) estiverem na fila, eles atrasarão o processamento de todo o lote.
3. **Dependência Crítica de Vault**:
   A chamada do `pg_cron` descriptografa a chave `service_role_key` em tempo real a partir de `vault.decrypted_secrets`. Se o Vault do Supabase estiver inacessível ou sem permissão para a role do cron, o motor assíncrono para de funcionar por completo.

---

## 5. Plano de Ação Técnico Recomendado

### Fase 1: Paralelismo na Edge Function (Correção de Gargalo)
- Substituir o loop sequencial na Edge Function por processamento paralelo controlado (utilizando `Promise.all` com limitador de concorrência ou filas em memória Deno) para processar webhooks e e-mails de forma concorrente, reduzindo o impacto de requisições lentas.

### Fase 2: Redução de Latência por Evento (Trigger HTTP)
- Adicionar uma trigger `AFTER INSERT ON public.workflow_action_queue` que execute um disparo imediato de notificação (via `pg_net` em background) para a Edge Function se o item não possuir delay (`run_after <= now()`). Isso elimina a dependência do tempo de 1 minuto do cron para ações imediatas que caíram na fila.

### Fase 3: Hardening de Timeout e Circuit Breaking para Webhooks
- Reduzir o timeout padrão de webhook de 10 segundos para 3 segundos, adicionando um mecanismo de *Circuit Breaker* (suspender disparos temporariamente para URLs que estão falhando repetidamente) para evitar consumo desnecessário de CPU da Edge Function.
