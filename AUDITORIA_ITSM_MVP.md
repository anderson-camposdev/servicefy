# Relatório de Auditoria ITSM & Conformidade ITIL v4
**ServiceFY Enterprise MVP**

Este documento apresenta a consolidação de engenharia realizada no repositório local do **ServiceFY**, avaliando a cobertura de funcionalidades do MVP, a robustez da segurança multitenant e o nível de aderência aos processos recomendados pelo framework ITIL v4.

---

## 1. Tabela de Mapeamento e Checklist de Funcionalidades

Abaixo está o mapeamento detalhado de todos os módulos identificados no código-fonte e banco de dados, correlacionando a interface do usuário com a respectiva camada de dados.

| Módulo ITSM | Telas e Arquivos Principais | Cobertura do Banco de Dados (Supabase) | Status Técnico / Maturidade |
| :--- | :--- | :--- | :--- |
| **Portal do Usuário** | `UserPortalLayout.tsx`, `ServiceCatalog.tsx` | `catalog_categories`, `catalog_services` | **✅ Completo (Produção)**<br>Exibição de catálogo hierárquico, busca unificada de serviços, formulários dinâmicos de abertura de chamados e aba de acompanhamento de tickets. |
| **Cockpit do Agente** | `AnalystCockpit.tsx`, `WorkspaceLayout.tsx` | `incidents`, `ticket_messages` | **✅ Completo (Produção)**<br>Fila de chamados segmentada por estado, chat interativo com solicitante e painel de subtarefas integradas. |
| **Gerência de Incidentes** | `TicketManagementDashboard.tsx`, `NewTicketModal.tsx` | `incidents`, `incident_history`, `assignment_groups` | **✅ Completo (Produção)**<br>Priorização automática via matriz de Impacto x Urgência (triggers de BD) e contadores de SLA de resposta/resolução. |
| **Requisições de Serviço** | `TicketManagementDashboard.tsx`, `ApprovalInbox.tsx` | `request_items`, `request_approvals`, `approval_tokens` | **✅ Completo (Produção)**<br>Abertura de itens específicos, fluxos de aprovação dinâmicos (Gestor Direto, Chefe de Departamento ou Grupo) e links de aprovação por token. |
| **Gerência de Problemas** | Inline em `App.tsx` (Componente `ProblemDashboard`) | `problems`, `problem_incidents`, `problem_history` | **✅ Completo (Produção)**<br>Identificação de erros conhecidos (KEDB), registro de soluções de contorno (workarounds) e investigação de causa raiz ligada a incidentes. |
| **Gerência de Mudanças** | `ChangeManagementDashboard.tsx` | `changes`, `change_history` | **✅ Completo (Produção)**<br>Fluxos Standard, Normal e Emergencial. Pré-seleção inteligente de membros do CAB (Comitê de Mudanças) baseada em parâmetros do tenant e votação integrada. |
| **Governança & SLAs** | `SettingsGovernance.tsx`, `SlaCalendarManager.tsx` | `sla_policies`, `sla_calendars`, `sla_calendar_shifts` | **✅ Completo (Produção)**<br>Parametrização de tempos de resposta e resolução por prioridade, turnos de calendários comerciais e motivos de pausa de SLA. |
| **Configurações Gerais** | `SettingsCenter.tsx`, `PlatformModuleSettings.tsx` | `companies`, `profiles`, `departments`, `groups` | **✅ Completo (Produção)**<br>Configuração de branding visual do tenant (white-label), gerenciamento de usuários (RBAC), equipes solucionadoras e domínios. |
| **Base de Conhecimento** | `KnowledgePortal.tsx`, `KnowledgeAdmin.tsx` | `knowledge_articles`, `knowledge_article_feedback` | **✅ Completo (Produção)**<br>Visualização de artigos, editor de Markdown, controle de permissões por perfil, versionamento e associação de artigos a tickets. |
| **Ativos / CMDB (SACM)** | `PlatformModuleSettings.tsx` (seção CMDB) | `configuration_items`, `ci_relationships`, `ci_classes` | **✅ Completo (Produção)**<br>CRUD de Itens de Configuração (CIs), classes de CI e mapeamento visual de dependências upstream/downstream. |
| **Motor de Automação** | `WorkflowBuilder.tsx` | `workflow_rules`, `workflow_action_queue` | **✅ Completo (Produção)**<br>Criação de automações trigger-condition-action. Disparadores integrados no banco via triggers que enfileiram ações assíncronas. |
| **Analytics & BI** | `BiApp.tsx` | `bi_daily_snapshots`, `bi_dimensions`, `bi_measures` | **✅ Completo (Produção)**<br>Métricas gerenciais, snapshots históricos diários e relatórios customizados baseados em dimensões e medidas. |

---

## 2. Diagnóstico de Isolamento Multitenant (Segurança de Dados)

O isolamento de dados entre clientes (tenants) no ServiceFY foi auditado de ponta a ponta. Abaixo estão as descobertas:

### Mecanismo de Identificação (Client-Side)
A identificação do tenant ativo ocorre no navegador (`resolveTenant.ts`) seguindo a prioridade:
1. Subdomínio em produção (`acme.servicefy.app`) ou desenvolvimento (`acme.localhost`).
2. Query parameter na URL (`?tenant=acme`).
3. Persistência em `localStorage`.

### Mecanismo de Segurança e Isolamento (Database-Side)
A segurança contra vazamento de dados (**cross-tenant data leak**) não depende da aplicação React, sendo garantida de forma robusta no banco de dados Supabase via **Row Level Security (RLS)**:
* **Autenticação**: O banco resolve o usuário logado via `auth.uid()`.
* **Identificação do Tenant**: A função segura `public.get_current_user_company_id()` (com privilégios de `SECURITY DEFINER`) busca a empresa vinculada ao perfil correspondente ao `auth.uid()` do JWT do usuário:
  ```sql
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
  ```
* **Políticas de RLS**: Tabelas críticas (como `incidents`, `changes`, `problems` e `profiles`) possuem políticas RLS que forçam o filtro `company_id = public.get_current_user_company_id()`. Qualquer tentativa de ler ou manipular dados de outra empresa retorna uma resposta vazia ou erro de permissão.
* **Prevenção de Autoelevação**: Comandos diretos de `UPDATE` na tabela de perfis (`profiles`) são revogados para usuários normais e autenticados. Qualquer alteração deve passar pela função definidora `update_profile_secure`, impedindo que um usuário altere seu próprio papel (`role`) ou seu código de empresa (`company_id`).

---

## 3. Análise da Estrutura de Chamados (SLA, Status e Prioridades)

O ciclo de vida e a parametrização de SLA e prioridade estão consolidados na camada de banco de dados, protegendo as regras de negócio de manipulações indevidas na interface visual.

### Matriz de Prioridade ITIL
A prioridade de um incidente (`incidents.priority`) não é selecionada manualmente. Ela é calculada dinamicamente com base no cruzamento das colunas `impact` (Impacto) e `urgency` (Urgência) através do gatilho `trg_calculate_incident_priority` que invoca a função:
```sql
calculate_incident_priority(impact, urgency)
```
* **Critical Impact + High/Medium Urgency** $\rightarrow$ `P1 - Critical`
* **High Impact + High Urgency** $\rightarrow$ `P1 - Critical`
* **Medium Impact + High Urgency** $\rightarrow$ `P2 - High`
* **Low Impact + Low/Medium Urgency** $\rightarrow$ `P4 - Low`
*(e assim por diante, respeitando fielmente a matriz clássica ITIL)*.

### Estrutura e Controle de SLA
* **Tipos de SLA**: Cobertura para **SLA de Resposta** (tempo para o analista iniciar o atendimento) e **SLA de Resolução** (tempo para encerrar o chamado).
* **Parada do Cronômetro (SLA Pause)**: Quando um ticket é colocado em `On Hold` (Pendente), a função de trigger `tg_handle_sla_pause()` calcula o tempo em que o chamado permaneceu pausado in minutos úteis comercializáveis (usando a tabela `sla_calendars` e turnos cadastrados para desconsiderar fins de semana e feriados) e incrementa os deadlines (`sla_response_deadline` e `sla_resolution_deadline`) na retomada do ticket.
* **Respeito às Políticas de Pausa**: A migração `093` introduziu a coluna `pauses_sla` na tabela de motivos de pendência (`pending_reasons`), permitindo que administradores governem quais motivos de pausa congelam ou não o prazo (ex: pausa aguardando fornecedor externo pausa o SLA, enquanto pausa por ação interna não).
* **Primeiro Atendimento**: O SLA de resposta é finalizado definindo `responded_at` sob duas condições automatizadas e idempotentes:
  1. O estado do ticket muda de `New` para qualquer outro estado.
  2. O analista registra qualquer mensagem pública no chat do ticket.

---

## 4. Diagnóstico de Aderência ITIL v4

A avaliação dos processos implementados no MVP contra os padrões recomendados pelo framework ITIL v4 identificou excelentes implementações e algumas inconsistências de arquitetura.

### Pontos Fortes e Aderência
* **Gerência de Incidentes**: Fluxo clássico completo com registro de sintomas, triagem N1/N2 por equipes solucionadoras (`assignment_groups`) e cálculo automatizado de criticidade.
* **Requisições de Serviço**: Excelente esteira de aprovação. Suporta aprovações de gestores diretos de perfil e chefes de departamento antes da liberação do chamado para cumprimento de serviço (fulfillment).
* **Gerência de Problemas**: Separação clara entre incidentes (restaurar operação) e problemas (investigar causa raiz e registrar erros conhecidos no KEDB).
* **Gerência de Mudanças**: Papel ativo do CAB com parametrizadores de janela, planos de implantação, testes e plano de retorno (backout), além de controle de membros permanentes do comitê por tenant.

### Lacunas e Desvios de Boas Práticas (Gaps)
1. **Descompasso Estrutural de Tabelas**: O banco de dados cria a tabela `service_requests` com status específicos de requisição, mas no frontend e nas consultas de serviços, a tabela `incidents` é utilizada para armazenar tanto incidentes quanto requisições de serviço (utilizando a coluna `ticket_type` como discriminador). Isso deixa a tabela `service_requests` isolada e subutilizada, misturando registros de falhas (incidentes) com requisições na mesma tabela física.
2. **Avaliação Estática de Impacto do CMDB**: Embora dependências upstream e downstream possam ser mapeadas graficamente entre CIs, o sistema não cruza o impacto de um CI indisponível em tempo real no momento da abertura do chamado para elevar a prioridade de incidentes de forma preditiva.
3. **Falta de Auditoria de Liberação (Release Management)**: Mudanças aprovadas pelo CAB entram em estado de implantação sem ligação direta a um fluxo de homologação, automação de build ou controle de pacotes de liberação (Releases).

---

## 5. Lista de Débitos Técnicos

Foi identificada uma lista de pontos de melhoria de arquitetura e qualidade de código que impactam a manutenibilidade do ServiceFY a longo prazo.

### 5.1 Lógica na Camada Visual e Tamanho dos Arquivos
* **Monólitos de Interface**: O arquivo `UserPortalLayout.tsx` possui **121 KB** e centraliza lógica de listagem de chamados, busca de catálogo, visualização de base de conhecimento, perfil de usuário e abertura de chamados. A falta de componentização dificulta a reutilização.
* **Acoplamento de Dashboards**: O component `ProblemDashboard` está declarado diretamente dentro do arquivo principal de roteamento e visualização (`src/App.tsx`), misturando a montagem da árvore do app com a lógica e layout de um módulo de dados específico.

### 5.2 Tipagens Genéricas (`any`)
* **Perda de Type Safety com Supabase**: A instanciação do cliente principal do Supabase em `src/lib/supabase.ts` e dinamicamente em `src/lib/services.ts` (função `getSupabaseForSchema`) utiliza `createClient<any>`. Isso remove a checagem estática de tipos nas consultas, obrigando o uso de casts como `as any` ou casts manuais de tipos, aumentando a probabilidade de falhas de digitação de nomes de colunas passarem despercebidas na compilação.

### 5.3 Duplicação de Componentes com Comportamento Semelhante
* **Seletores de Catálogo**: Os arquivos `IncidentCatalogSelector.tsx` e `RequestCatalogSelector.tsx` compartilham layouts de cards e listagens de categorias quase idênticos, que poderiam ser consolidados em um componente unificado paramétrico.
* **Componentes de Chat**: Duplicação conceitual de interfaces de chat entre `TicketChat.tsx` e `TriageChat.tsx`.

### 5.4 Eficiência no Carregamento de Dados (Overhead no Client)
* **Múltiplas Requisições no Hook de App**: O hook `useAppData` (`useDbData.ts`) faz o carregamento inicial de perfis mapeando todas as empresas do sistema e disparando consultas individuais em lote:
  ```typescript
  const allProfiles = await Promise.all(comps.map(c => profilesService.listByCompany(c.id)))
  ```
  Isso gera um overhead de conexões HTTP e consultas sequenciais pesadas ao carregar a aplicação, mesmo sabendo que a RLS irá bloquear e retornar listas vazias para os tenants nos quais o usuário logado não possui acesso. O correto seria carregar apenas os perfis da empresa atual do usuário ativo.

### 5.5 Ponto Único de Falha na Segurança do Provedor (MSP)
* **UUID Hardcoded**: A validação de administrador do provedor de serviços gerenciados (MSP) depende do UUID fixo da empresa Allied IT (`MSP_COMPANY_ID = '44444444-4444-4444-4444-444444444444'`) hardcoded no arquivo de serviços. A vulnerabilidade reside em expor essa regra na camada de frontend, onde qualquer brecha ou vazamento de RLS dependente desse ID expõe a segurança do sistema. O correto seria que a validação de MSP ocorresse de forma transparente no backend através de atributos e claims do perfil do usuário autenticado.
