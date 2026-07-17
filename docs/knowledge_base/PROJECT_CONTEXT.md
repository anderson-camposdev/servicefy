# PROJECT_CONTEXT.md — ServiceFY

> Documento vivo. Atualize sempre que um módulo novo for entregue ou a estratégia mudar.

## 1. O que é o ServiceFY

ServiceFY é uma plataforma SaaS multi-tenant de **ITSM/ESM** (IT & Enterprise Service
Management) — gestão de incidentes, requisições de serviço, catálogo, SLA, CMDB e
automação de atendimento, competindo no espaço ocupado por ferramentas como Jira
Service Management, Freshservice e ServiceNow, com foco inicial em MSPs (Managed
Service Providers) e times de TI internos de médio porte.

- **Modelo de negócio:** SaaS multi-tenant (uma instância, N empresas isoladas por
  `company_id`), com planos e assinaturas (`plans_subscriptions`).
- **Domínio de dados:** tenant = `companies`; usuário = `profiles`; chamado =
  `incidents` (a tabela chama-se `incidents`, mas cobre tickets/requisições/casos —
  não confundir com a tabela legada `cases`, que só existe para artigos de
  conhecimento restritos e alguns fluxos de RH/Jurídico).
- **Público-alvo:** MSPs que atendem múltiplos clientes finais e times de TI/Service
  Desk internos que precisam de ITSM sem a complexidade/custo de ferramentas
  enterprise.

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions/Deno) |
| Autorização | RLS (Row Level Security) + RPCs `SECURITY DEFINER` para operações administrativas |
| Testes | Vitest (unit), Playwright (E2E), `node --test` (contratos de segurança sobre as migrations) |
| CI/CD | GitHub Actions (`ci-cd-staging.yml`) → lint/build, testes, dry-run + deploy de migrations em staging |
| Deploy frontend | Vercel |
| Deploy backend | Supabase Cloud |

Ver [PADRAO_ARQUITETURA.md](./PADRAO_ARQUITETURA.md) para as convenções detalhadas de
código, migrations e RLS.

## 3. Módulos entregues (visão macro)

> Lista indicativa baseada no histórico de migrations e commits — sempre confirme o
> estado real no banco/código antes de assumir que algo está pronto para produção.

- Fundação da plataforma: multi-tenancy, RBAC, auditoria administrativa, CAB
  (Change Advisory Board), aprovações.
- Catálogo de serviços + requisições estruturadas (categorias/subcategorias/itens,
  formulários dinâmicos).
- SLA: políticas, calendários, matriz de prioridade, eventos de SLA, timers com
  estado "pausado".
- Base de Conhecimento (KB): artigos versionados, permissões por perfil/grupo,
  vínculo com casos.
- Omnichannel: conexões de canal, roteamento, outbox de mensagens, triagem.
- Agente Virtual / condutor de triagem: FSM determinística (sem LLM) que conduz o
  usuário pelo catálogo e abre requisições via RPCs governadas.
- CSAT, macros, analytics executivo, busca global, webhooks de saída.
- White-label / identidade visual (temas claros e escuros, branding por tenant).
- SSO / JIT provisioning.

## 4. Módulos planejados / próximos

- ESM UI (domínios e tipos de caso além de TI).
- CMDB (Configuration Management Database).
- Major Incident Management / Status Page pública.
- Expansão do dashboard de CSAT.

## 5. Glossário rápido

| Termo | Significado |
|---|---|
| `company_id` | Identificador do tenant. Toda tabela multi-tenant tem essa coluna. |
| `incidents` | Tabela principal de chamados/tickets/requisições (apesar do nome). |
| `cases` | Tabela separada, usada apenas para artigos de conhecimento restritos e alguns fluxos sensíveis (RH/Jurídico) — tem regra de privacidade própria, sem bypass de admin. |
| MSP | Managed Service Provider — tenant que atende outras empresas. |
| CAB | Change Advisory Board — fluxo de aprovação de mudanças. |
| SLA | Service Level Agreement — prazos de resposta/resolução monitorados por trigger de banco. |

## 6. Ambientes

| Ambiente | Frontend | Backend | Observações |
|---|---|---|---|
| Local (dev) | `npm run dev` (Vite) | Supabase local (`supabase start`) ou projeto de dev na nuvem | Nunca aponte o frontend local para o banco de produção. |
| Staging | Vercel (preview/staging) | Projeto Supabase de staging | CI aplica migrations automaticamente via `ci-cd-staging.yml`. |
| Produção | Vercel (produção) | Projeto Supabase de produção | Ver [GO_LIVE.md](../../GO_LIVE.md) para o runbook de deploy. |

## 7. Links úteis

- Runbook de go-live: [`GO_LIVE.md`](../../GO_LIVE.md)
- Padrões de arquitetura: [`PADRAO_ARQUITETURA.md`](./PADRAO_ARQUITETURA.md)
- Checklist de SaaS vendável: [`CHECKLIST_SAAS_VENDAVEL.md`](./CHECKLIST_SAAS_VENDAVEL.md)
- Prompts-base para agentes de IA: [`PROMPTS_BASE.md`](./PROMPTS_BASE.md)

---
*Placeholder para preenchimento futuro pelo CTO/Tech Lead: metas de negócio do
trimestre, ICP (Ideal Customer Profile) detalhado, roadmap priorizado, métricas
norte (North Star Metric).*
