# ServiceFY ITSM — Roadmap de Gaps Arquiteturais

> Varredura técnica do repositório realizada em 25/06/2026.
> Documenta o que **já existe**, o que **falta** e a **ordem de prioridade** para um ITSM de mercado.

---

## 1. Estado Atual — O que já foi construído

| Módulo | Status | Localização |
|---|---|---|
| Autenticação (Supabase Auth + RLS) | ✅ Completo | `src/auth/`, `src/lib/supabase.ts` |
| Multi-tenancy (Row Level Security) | ✅ Completo | Supabase migrations |
| Portal do Usuário (abertura de chamados) | ✅ Completo | `src/pages/UserPortalLayout.tsx` |
| Catálogo de Serviços hierárquico | ✅ Completo | `src/pages/ServiceCatalog.tsx`, `CatalogManager.tsx` |
| Gestão de Incidentes (ITIL) | ✅ Completo | `src/pages/TicketManagementDashboard.tsx` |
| Gestão de Requisições (ITIL) | ✅ Completo | Integrado ao dashboard |
| Gestão de Problemas (ITIL) | ✅ Completo | Integrado ao dashboard |
| Gestão de Mudanças / CAB (ITIL) | ✅ Completo | Integrado ao dashboard |
| ServiceFY BI (dashboards gerenciais) | ✅ Completo | `src/features/bi/BiApp.tsx` |
| Workflow Builder visual (Motor de Automação) | ✅ Completo | `src/pages/WorkflowBuilder.tsx` |
| Configurações de Governança (SLA, Branding) | ✅ Parcial | `src/pages/SettingsGovernance.tsx` |
| Motor de SLA (cálculo de deadlines) | ⚠️ Parcial | Regras de UI existem, falta engine backend |
| White-label (branding por tenant) | ✅ Completo | `src/tenant/`, `AdminPortalSettings.tsx` |
| Cockpit do Analista | ✅ Completo | `src/pages/AnalystCockpit.tsx` |

---

## 2. Gaps Críticos — O que falta para ITSM maduro

### 🔴 GAP 1 — Motor de SLA Backend (Prioridade: CRÍTICA)

**O que falta:**
O frontend já tem as regras de SLA configuradas visualmente (`SlaPolicyManager.tsx`, `SlaCalendarManager.tsx`), mas **não existe um serviço backend** que:
- Calcule deadlines de "Primeira Resposta" e "Resolução" no momento da criação do chamado
- Pause o cronômetro em fins de semana e fora do horário comercial (conforme `SlaCalendarManager`)
- Dispare alertas automaticamente quando o SLA está a 30 min de brechar
- Marque o campo `sla_breached = true` no banco automaticamente

**Impacto:** Todos os SLAs exibidos hoje são estáticos (hardcoded no front). Em produção, nenhum cliente terá SLA calculado corretamente.

**Stack sugerida:**
```
Supabase Edge Function (Deno): calcular_sla
├── Trigger: incidents AFTER INSERT/UPDATE
├── Lógica: calendarService.getDeadline(priority, company_id, created_at)
└── Output: atualiza sla_deadline e cria entradas em sla_events

Supabase pg_cron: verificar_sla_alerts
└── Roda a cada 5 min → busca incidents onde sla_deadline < NOW() + 30min
    → insere notificação → dispara webhook do Workflow Builder
```

**Arquivos a criar:**
- `supabase/functions/calculate-sla/index.ts`
- `supabase/functions/check-sla-alerts/index.ts`
- `supabase/migrations/xxx_sla_engine.sql` (trigger SQL)

---

### 🔴 GAP 2 — Listener de E-mail Backend (Prioridade: CRÍTICA)

**O que falta:**
O Workflow Builder já tem o gatilho visual "Chamado criado via E-mail" e o tipo de ação "Chamar Webhook", mas **não existe o serviço que lê e-mails reais** e os converte em tickets.

**Impacto:** O gatilho de e-mail nunca disparará em produção. A funcionalidade é 100% decorativa hoje.

**Stack sugerida:**
```
Opção A — Webhook de provedor (Recomendado)
├── SendGrid Inbound Parse → POST /api/email-inbound
├── Supabase Edge Function: parse-email-inbound
│   ├── Extrai remetente, assunto, corpo, anexos
│   ├── Resolve tenant pelo domínio do destinatário
│   ├── Cria incident com source='email'
│   └── Dispara workflows com triggerSource='email'

Opção B — IMAP Polling (mais simples, mas menos confiável)
└── Worker externo (Node.js / Deno Deploy) que faz IMAP fetch a cada 2 min
```

**Arquivos a criar:**
- `supabase/functions/parse-email-inbound/index.ts`
- `supabase/migrations/xxx_ticket_source_column.sql` — coluna `source TEXT DEFAULT 'portal'`

---

### 🟠 GAP 3 — Fila de Atendimento do Analista / Workspace (Prioridade: ALTA)

**O que falta:**
Existe um `AnalystCockpit.tsx` e um `WorkspaceLayout.tsx`, mas falta um **painel de fila dedicado ao técnico** com:
- Kanban de chamados atribuídos ao analista logado
- Ação de "Assumir" (pull) chamado da fila global
- Registro de horas trabalhadas por chamado (`work_notes`)
- Adição de notas internas (visíveis só para técnicos, não para o cliente)
- Temporizador de SLA visível por card no Kanban

**Impacto:** Técnicos hoje não têm um espaço de trabalho focado. Precisam navegar pelo dashboard gerencial, que não é otimizado para operação diária.

**Arquivos a criar/modificar:**
- `src/pages/TechnicianQueue.tsx` — Kanban/Lista rica de chamados do analista
- `supabase/migrations/xxx_work_notes.sql` — tabela `work_notes(incident_id, author_id, content, minutes_worked, is_internal)`

---

### 🟠 GAP 4 — Motor de Automação Backend (Execução Real) (Prioridade: ALTA)

**O que falta:**
O Workflow Builder visual é completo, mas os workflows **não executam em produção**. Falta o engine backend que:
- Lê os workflows do banco (campo JSONB `trigger` + `conditions` + `actions`)
- Avalia condições em tempo real quando um evento ocorre
- Executa as ações (envio de e-mail, atribuição, webhook)
- Registra o log de execução (`execution_logs`)

**Arquivos a criar:**
```
supabase/functions/automation-engine/index.ts
├── Recebe: { event, ticket_id, company_id }
├── Busca workflows WHERE trigger->>'event' = event AND enabled = true
├── Filtra por triggerSource (portal/email/api)
├── Avalia conditions (AND/OR)
├── Executa actions em sequência
└── Grava em execution_logs
```

---

### 🟡 GAP 5 — Base de Conhecimento / KCS (Prioridade: MÉDIA)

**O que falta:**
Não existe nenhum módulo de Base de Conhecimento. Para deflexão de chamados, o portal deveria sugerir artigos relevantes antes do usuário submeter o ticket.

**Funcionalidades necessárias:**
- CRUD de artigos (title, content markdown, tags, category)
- Busca full-text nos artigos
- Sugestão automática durante abertura do chamado (by keyword match)
- Métricas: "X pessoas acharam esse artigo útil"
- Deflexão: "Isso resolveu?" → se sim, chamado não é aberto

**Arquivos a criar:**
- `src/pages/KnowledgeBase.tsx` — portal de artigos para usuário final
- `src/pages/KnowledgeBaseAdmin.tsx` — CRUD para técnicos/admins
- `supabase/migrations/xxx_knowledge_base.sql`

---

### 🟡 GAP 6 — Fluxo de Aprovação Formal (Prioridade: MÉDIA)

**O que falta:**
O módulo de Mudanças já tem conceito de "CAB Approval" nos tipos, mas não existe um **fluxo de aprovação acionável**:
- Link de e-mail para aprovação one-click (sem precisar logar)
- Token de aprovação com expiração (72h)
- Histórico de aprovação/reprovação com motivo
- Aprovação paralela (múltiplos aprovadores, qualquer um aprova)

**Nota:** Os tipos `ApprovalToken` e `RequestCatalogSubitem.requiresManagerApproval` já existem em `src/types/index.ts`, mas a implementação backend está ausente.

**Arquivos a criar:**
- `supabase/functions/send-approval-email/index.ts`
- `supabase/functions/process-approval-token/index.ts`
- `src/pages/ApprovalPage.tsx` — página pública (sem auth) para o gestor aprovar/reprovar

---

### 🔵 GAP 7 — Relatórios e Exportação (Prioridade: BAIXA-MÉDIA)

**O que falta:**
O ServiceFY BI tem dashboards visuais mas não exporta dados:
- Exportação para PDF dos relatórios (aging, SLA compliance, volume por categoria)
- Exportação CSV das tabelas de chamados filtradas
- Relatórios agendados por e-mail (parcialmente endereçado pelo Workflow Builder com o template "Relatório Diário")

---

### 🔵 GAP 8 — Chatbot Backend (WhatsApp / Teams) (Prioridade: BAIXA)

**O que falta:**
Os tipos `ChatbotConfig`, `ChatbotWhitelistEntry` e `ChatbotMessage` existem em `src/types/index.ts`, mas não há implementação:
- Webhook do WhatsApp Business API
- Bot de conversação para abertura de chamados
- Integração com Microsoft Teams

---

## 3. Arquitetura de Testes — Estado e Recomendações

### O que foi implementado nesta sprint

```
tests/e2e/
├── helpers/
│   └── mockAuth.ts          # Mock de sessão Supabase (sem banco real)
├── auth.spec.ts             # Login UI + validação + isolamento multitenancy
├── catalog.spec.ts          # Portal do usuário + catálogo
└── workflow.spec.ts         # Workflow Builder (6 cenários)
```

### Riscos de Testes Identificados

| Risco | Impacto | Mitigação |
|---|---|---|
| Testes E2E lentos por renderização assíncrona do React | Falsos negativos | `waitForTimeout` + `waitForSelector` com timeout explícito |
| Supabase Realtime tenta conectar WebSocket nos testes | Erro de rede | `page.route('**/realtime/**', route => route.abort())` |
| `import.meta.env` falha sem `.env.local` | Build quebra antes de rodar | `.env.local` já existe; CI precisa de variáveis secretas |
| RLS do Supabase não é testável via mock de rede | Sem cobertura real de multitenancy | Criar banco de testes isolado com seed de 2 tenants |

### Próxima Camada de Testes Recomendada

1. **Testes unitários de componentes** com Vitest + Testing Library:
   - `WorkflowBuilder` — testar adição/remoção de condições
   - `SlaEngine` — testar cálculo de deadline com calendário

2. **Testes de integração com banco de testes** (Supabase local via `supabase start`):
   - RLS: usuário do tenant A não consegue fazer SELECT em dados do tenant B
   - SLA engine: trigger SQL calcula deadline corretamente

---

## 4. Checklist de Prontidão para Produção

- [x] Autenticação e isolamento de sessão por tenant
- [x] Portal do usuário responsivo e funcional
- [x] ServiceFY BI com filtros dinâmicos
- [x] Workflow Builder visual com gatilhos por origem
- [x] Estrutura de testes E2E com mock de autenticação
- [ ] Motor de SLA backend (deadlines reais)
- [ ] Listener de e-mail (inbound parsing)
- [ ] Motor de automação backend (execução real dos workflows)
- [ ] Base de conhecimento para deflexão de chamados
- [ ] Fluxo de aprovação com token de e-mail
- [ ] Suite de testes com banco de testes isolado
- [ ] Pipeline CI/CD (GitHub Actions)
