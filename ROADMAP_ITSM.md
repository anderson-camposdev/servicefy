# ROADMAP ITSM — Flowfy Enterprise

> Estado atual: MVP funcional com fila de incidentes, catálogo de serviços, motor de automação e portal white-label.
> Este documento mapeia as lacunas para competir no segmento enterprise de ITSM (ServiceNow, Jira Service Management, Freshservice).

---

## 1. Workspace do Agente (Cockpit)

### Lacunas críticas

| # | Funcionalidade | Impacto | Complexidade |
|---|----------------|---------|--------------|
| 1.1 | **Vista unificada multi-fila** — agente vê incidentes + requisições + problemas em uma única fila configurável | Alto | Média |
| 1.2 | **Merge de chamados** — duplicatas identificadas pelo usuário ou por IA são fundidas em um único ticket com histórico unificado | Alto | Média |
| 1.3 | **Atribuição em lote** — selecionar N chamados e atribuir ao grupo/analista de uma vez | Médio | Baixa |
| 1.4 | **Templates de resposta** — biblioteca de respostas pré-aprovadas com variáveis (`{{caller_name}}`, `{{ticket_number}}`) | Alto | Baixa |
| 1.5 | **SLA visible no cockpit** — barra de progresso com contagem regressiva e alerta de risco em tempo real | Alto | Média |
| 1.6 | **Modo de foco** — modo tela-cheia que oculta a sidebar e exibe apenas o cockpit ativo | Baixo | Baixa |

### Roadmap sugerido

- **Sprint 1:** Templates de resposta + SLA no cockpit (maior retorno de produtividade por esforço)
- **Sprint 2:** Vista unificada multi-fila + merge de chamados
- **Sprint 3:** Atribuição em lote + modo de foco

---

## 2. Motor de SLA

### Lacunas críticas

| # | Funcionalidade | Impacto | Complexidade |
|---|----------------|---------|--------------|
| 2.1 | **Calendários de trabalho por tenant** — SLA pausa fora do horário comercial; suporte a feriados nacionais e locais | Crítico | Alta |
| 2.2 | **Alvos híbridos** — tempo de resposta (primeiro toque) separado do tempo de resolução | Alto | Média |
| 2.3 | **Pausa de SLA com motivo** — ao colocar chamado "On Hold", o SLA pausa e retoma ao reabrir | Alto | Baixa |
| 2.4 | **Reabertura de chamado** — chamado resolvido pode ser reaberto pelo usuário dentro de N dias; SLA retoma | Alto | Média |
| 2.5 | **Escalada automática** — quando SLA entra em risco, automação notifica supervisor e pode mudar prioridade | Médio | Média |
| 2.6 | **Relatório de conformidade de SLA** — % de chamados dentro do prazo por período, grupo e categoria | Médio | Média |

### Decisões de arquitetura registradas

- Motor SLA usa acumulador de minutos trabalhados (não deadline estático) para suportar pausas
- Feriados são configurados por tenant em tabela `company_holidays`
- Ver memória: `sla-engine-scope.md`

### Roadmap sugerido

- **Sprint 1:** Calendários de trabalho + pausa com motivo (fundação obrigatória)
- **Sprint 2:** Alvos híbridos + reabertura
- **Sprint 3:** Escalada automática + relatório de conformidade

---

## 3. Inbound de E-mail

### Lacunas críticas

| # | Funcionalidade | Impacto | Complexidade |
|---|----------------|---------|--------------|
| 3.1 | **Parser de e-mail → ticket** — e-mail recebido em endereço dedicado (`suporte@cliente.flowfy.io`) cria chamado com remetente como solicitante | Crítico | Alta |
| 3.2 | **Respostas por e-mail** — analista responde no sistema e o e-mail vai para o solicitante; resposta do solicitante por e-mail adiciona mensagem no ticket | Crítico | Alta |
| 3.3 | **Detecção de duplicatas** — e-mails com mesmo `Message-ID` ou `In-Reply-To` são associados ao ticket existente | Alto | Média |
| 3.4 | **Triagem automática** — automações classificam prioridade e categoria com base em palavras-chave no subject/body | Médio | Média |
| 3.5 | **Assinatura de e-mail por tenant** — rodapé com logo e informações do portal | Baixo | Baixa |
| 3.6 | **Blacklist / whitelist de remetentes** — bloqueia spam ou garante que domínios parceiros sempre criem tickets | Médio | Baixa |

### Arquitetura recomendada

```
E-mail externo → Mailgun/SendGrid Inbound Parse → Edge Function Supabase
  → parser.ts: extrai remetente, assunto, corpo, anexos
  → cria/atualiza incidente via RPC Supabase (respeita RLS por tenant)
  → dispara automações de triagem
```

### Roadmap sugerido

- **Sprint 1:** Parser básico → ticket (endereço único por tenant)
- **Sprint 2:** Respostas por e-mail + threading por `Message-ID`
- **Sprint 3:** Triagem automática + blacklist/whitelist

---

## 4. Base de Conhecimento

### Lacunas críticas

| # | Funcionalidade | Impacto | Complexidade |
|---|----------------|---------|--------------|
| 4.1 | **Editor rich text para artigos** — suporte a heading, lista, código, imagem inline | Alto | Média |
| 4.2 | **Sugestão automática no portal** — ao abrir formulário de chamado, sistema sugere artigos relacionados | Alto | Alta |
| 4.3 | **Deflexão de chamados** — se usuário encontra resposta no artigo, pode fechar sem abrir chamado | Alto | Média |
| 4.4 | **Artigos vinculados ao chamado** — analista pode anexar artigos à resolução para gerar base a partir de chamados recorrentes | Médio | Baixa |
| 4.5 | **Controle de versão de artigos** — histórico de edições com diff e rollback | Baixo | Alta |
| 4.6 | **Permissões por artigo** — público (portal), interno (agentes), privado (admin) | Médio | Baixa |
| 4.7 | **Busca semântica** — busca por intenção, não apenas palavras-chave exatas (pgvector + embeddings) | Alto | Alta |

### Roadmap sugerido

- **Sprint 1:** Editor + artigos básicos com permissões (fundação)
- **Sprint 2:** Sugestão automática no portal + deflexão de chamados
- **Sprint 3:** Artigos vinculados à resolução + busca semântica (pgvector)

---

## 5. Motor de Aprovações

### Lacunas críticas

| # | Funcionalidade | Impacto | Complexidade |
|---|----------------|---------|--------------|
| 5.1 | **Fluxo de aprovação em requisições** — solicitação fica bloqueada até aprovador validar; suporta N aprovadores sequenciais ou paralelos | Crítico | Alta |
| 5.2 | **Aprovação por e-mail** — aprovador recebe e-mail com link de aprovar/rejeitar sem precisar logar | Alto | Média |
| 5.3 | **Delegação de aprovação** — aprovador em férias delega para substituto temporário | Médio | Média |
| 5.4 | **Escalada por timeout** — se aprovador não responde em N horas, escala para superior | Alto | Média |
| 5.5 | **Histórico de aprovações** — audit trail completo com data, hora, quem aprovou e justificativa | Alto | Baixa |
| 5.6 | **Aprovação condicional** — regra: requisições acima de R$5.000 requerem aprovação do gerente | Médio | Média |

### Arquitetura recomendada

```
approval_requests (id, ticket_id, approver_id, status, due_at, created_at)
approval_steps (id, request_id, step_order, approver_id, status, decided_at, notes)

Automação dispara:
  → cria approval_request
  → bloqueia mudança de status do ticket até todas as steps estarem 'approved'
  → envia e-mail de aprovação com token assinado (HMAC, validade 48h)
```

### Roadmap sugerido

- **Sprint 1:** Fluxo básico sequencial + histórico de aprovações
- **Sprint 2:** Aprovação por e-mail com token + escalada por timeout
- **Sprint 3:** Aprovação condicional + delegação

---

## Priorização Geral (ordem de entrega sugerida)

| Prioridade | Módulo | Critério |
|------------|--------|----------|
| **P1** | Motor de SLA (calendários + pausa) | Bloqueador de adoção enterprise — todo cliente pergunta |
| **P1** | Inbound de E-mail (parser básico) | Canal obrigatório para qualquer ITSM real |
| **P2** | Templates de resposta (Cockpit) | Maior ganho de produtividade com menor esforço |
| **P2** | Motor de Aprovações (fluxo básico) | Necessário para requisições de qualquer porte médio |
| **P3** | Base de Conhecimento (editor + sugestão) | Deflexão de chamados reduz volume para os agentes |
| **P3** | Vista unificada multi-fila (Cockpit) | Ergonomia para times com múltiplos tipos de ticket |
| **P4** | Busca semântica (KB) | Diferencial competitivo, mas requer base de artigos madura |
| **P4** | Inbound E-mail completo (threading, triagem) | Segunda fase após parser básico validado |

---

*Documento gerado em 2026-06-28. Revisar a cada sprint com base em feedback dos primeiros clientes piloto.*
