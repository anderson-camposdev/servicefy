# Documentação do MVP — ServiceFY ITSM Enterprise

Esta documentação fornece uma visão clara do estado atual de maturidade técnica e funcional do ServiceFY ITSM, categorizada em módulos concluídos, em andamento e gaps arquiteturais e operacionais para atingir competitividade contra players de mercado (ex: ServiceNow, Jira Service Management, Freshservice).

---

## 1. Mapeamento de Módulos (Estado Atual)

O ServiceFY ITSM está estruturado como uma aplicação multi-tenant com autenticação do Supabase. Abaixo estão os módulos de frontend identificados:

### 1.1 Portal do Usuário / Catálogo de Serviços
* **Status:** ✅ **Completo (Frontend)**
* **Localização:** `src/pages/UserPortalLayout.tsx`, `src/pages/ServiceCatalog.tsx`, `src/pages/CatalogManager.tsx`
* **Funcionalidades Prontas:**
  * Painel de boas-vindas com saudação personalizada e visualização do branding por tenant (white-label).
  * Barra de busca preditiva ("OmniSearch") para itens do catálogo e artigos de ajuda.
  * Catálogo hierárquico com navegação por categorias (TI, RH, Compras, etc.).
  * Formulário dinâmico de abertura de tickets (Incidentes e Requisições) com base nos campos definidos para o item do catálogo.
  * Aba "Meus Chamados" exibindo tickets abertos e seu status atual.

### 1.2 Cockpit do Analista e Gestão de Tickets (ITIL)
* **Status:** ✅ **Completo (Frontend + Mocks)**
* **Localização:** `src/pages/AnalystCockpit.tsx`, `src/pages/TicketManagementDashboard.tsx`
* **Funcionalidades Prontas:**
  * Painel administrativo central para visualizar incidentes, requisições de serviço, problemas e mudanças de forma segregada.
  * Visualização detalhada do ciclo de vida dos tickets (fila geral, triagem, atendimento, resolvido).
  * Chat do ticket para interação direta entre analista e solicitante.
  * Painel de tarefas integradas ao ciclo de vida do chamado.

### 1.3 Workflow Builder (Automação de Processos)
* **Status:** ✅ **Completo (Interface Visual)**
* **Localização:** `src/pages/WorkflowBuilder.tsx`
* **Funcionalidades Prontas:**
  * Interface visual baseada em nós para mapear fluxos de trabalho.
  * Definição de **Gatilhos** (ex: Chamado criado, Status alterado, Recebido por e-mail).
  * Configuração de **Condições** lógicas (ex: Se prioridade for Crítica, Se categoria for Infraestrutura).
  * Mapeamento de **Ações** (ex: Enviar e-mail de alerta, Atribuir a grupo, Chamar Webhook).

### 1.4 ServiceFY BI & Analytics
* **Status:** ✅ **Completo (Frontend)**
* **Localização:** `src/features/bi/BiApp.tsx`
* **Funcionalidades Prontas:**
  * Gráficos interativos para volumetria de chamados (abertos vs. resolvidos).
  * Distribuição de chamados por prioridade, categoria e analista.
  * Métricas de SLA (tempo de resposta, tempo de resolução, taxa de conformidade).

### 1.5 Configurações e Governança
* **Status:** ⚠️ **Parcial (Frontend Completo, Backend Pendente)**
* **Localização:** `src/pages/SettingsGovernance.tsx`, `SlaPolicyManager.tsx`, `SlaCalendarManager.tsx`
* **Funcionalidades Prontas:**
  * Definição visual de políticas de SLA por prioridade e tempo de resposta/resolução.
  * Cadastro de calendários de trabalho (dias, horas comerciais e feriados por tenant).
  * Customização de branding (logotipo, cores primárias/secundárias, mensagens de boas-vindas).

---

## 2. Gaps Funcionais Críticos (Comparado ao Mercado)

Para se posicionar como uma ferramenta ITSM Enterprise, o ServiceFY precisa resolver as seguintes lacunas de infraestrutura e backend:

### 🔴 GAP 1 — Motor de SLA Backend (Engine Ativa)
* **Status:** ❌ **Inexistente no Backend**
* **Impacto:** Alta criticidade. O frontend permite configurar SLAs e calendários, mas não há um serviço que calcule os deadlines reais ao abrir chamados, pare o tempo fora do horário comercial, ou notifique analistas próximos a estourar prazos. Os dados em tela são baseados em mocks estáticos.
* **Solução:** Implementar triggers de banco ou Supabase Edge Functions que rodem no evento `AFTER INSERT` da tabela `incidents`/`service_requests`, calculem os prazos dinamicamente e criem eventos de auditoria de SLA.

### 🔴 GAP 2 — Inbound de E-mail (Email-to-Ticket)
* **Status:** ❌ **Inexistente no Backend**
* **Impacto:** Alta criticidade. O Workflow Builder exibe visualmente o gatilho de "Chamado via e-mail", mas não há integração real com servidores de email para transformar mensagens externas em chamados válidos vinculados a um tenant e solicitante.
* **Solução:** Integrar um serviço de Inbound Parse (ex: SendGrid, Mailgun) disparando um webhook para uma Edge Function do Supabase, que tratará a triagem e inserção do ticket no banco.

### 🟠 GAP 3 — Workspace Unificado do Técnico (Fila Focada)
* **Status:** ⚠️ **Parcial**
* **Impacto:** Média criticidade. O analista hoje interage através de dashboards gerais. Falta uma fila de atendimento personalizada (Kanban individual de trabalho), ação ágil de assumir ("pull") chamados e a possibilidade de inserir notas internas confidenciais (invisíveis ao solicitante final).

### 🟠 GAP 4 — Motor de Execução de Workflows (Automações Reais)
* **Status:** ❌ **Inexistente no Backend**
* **Impacto:** Alta criticidade. O motor visual de workflows salva a estrutura em JSON no banco, mas nenhum evento dispara de fato as ações mapeadas (atribuições, alertas de e-mail ou webhooks reais).
* **Solução:** Implementar um webhook runner ou fila de jobs que interprete o JSON de definição do workflow e execute as ações no evento de mutação dos tickets.

### 🟡 GAP 5 — Base de Conhecimento (KCS)
* **Status:** ❌ **Inexistente**
* **Impacto:** Baixa/Média criticidade. Falta um CRUD de artigos de conhecimento e uma busca semântica para sugerir soluções e incentivar a deflexão de chamados (auto-atendimento do usuário final) antes da submissão do ticket.

---

## 3. Próximas Prioridades Técnicas

1. **Implementar a Estrutura de Testes E2E (Playwright) para assegurar o fluxo de fumaça (Smoke Test) do Portal do Usuário.**
2. Criar a infraestrutura de cálculo de SLA (Banco/Edge Function) utilizando os calendários configurados.
3. Desenvolver o endpoint de recebimento de e-mails para processar novos chamados de forma automatizada.
