# CHECKLIST_SAAS_VENDAVEL.md — ServiceFY

> Checklist de prontidão para um SaaS "vendável" (production-ready, cobrável e
> defensável em due diligence). Marque `[x]` conforme confirmado no código/infra —
> não marque por suposição. Itens sem confirmação ficam `[ ]` propositalmente.

## 1. Segurança

- [x] RLS habilitado em todas as tabelas multi-tenant.
- [x] Operações administrativas sensíveis via RPC `SECURITY DEFINER` com checagem
      explícita de autorização (não depende só de RLS).
- [x] Auditoria de ações administrativas (`write_admin_audit`).
- [x] Testes de contrato de segurança automatizados rodando no CI
      (`tests/security/*.test.mjs`).
- [x] Credenciais de produção nunca versionadas (`.env.*` no `.gitignore`,
      exceto `.env.example`).
- [x] `service_role_key` nunca exposta no frontend (apenas `anon_key`).
- [ ] Rotina formal de rotação de credenciais/segredos (DB password, API tokens).
- [ ] Pentest ou revisão de segurança externa antes do primeiro cliente pagante.
- [ ] Política de retenção e exclusão de dados por tenant (direito ao
      esquecimento / offboarding).

## 2. Multi-tenancy e isolamento

- [x] Isolamento por `company_id` em todas as tabelas de domínio.
- [x] Suporte a resolução de tenant por domínio DNS customizado.
- [ ] Limite de recursos por tenant/plano (rate limiting, quotas) documentado e
      aplicado.
- [ ] Processo testado de exportação/migração de dados de um tenant específico.

## 3. Billing e planos

- [x] Estrutura de planos e assinaturas no banco (`plans_subscriptions`).
- [ ] Integração real com gateway de pagamento (Stripe ou equivalente).
- [ ] Fluxo de upgrade/downgrade de plano self-service.
- [ ] Tratamento de inadimplência (suspensão/dunning).
- [ ] Notas fiscais / compliance fiscal para o mercado-alvo.

## 4. Onboarding e ativação

- [x] Runbook de go-live documentado ([`GO_LIVE.md`](../../GO_LIVE.md)).
- [ ] Onboarding self-service (sem intervenção manual do time) para novos tenants.
- [ ] Dados de exemplo / wizard de configuração inicial (categorias de catálogo,
      grupos de atendimento) fora do fluxo manual via SQL Editor.
- [ ] Documentação voltada ao usuário final (não só engenharia).

## 5. Observabilidade e operação

- [ ] Monitoramento de erros em produção (ex.: Sentry ou equivalente) no
      frontend e nas Edge Functions.
- [ ] Dashboard de saúde da fila de outbox (e-mail/canais) com alertas de
      dead-letter.
- [ ] SLA de disponibilidade definido e monitorado (uptime).
- [ ] Runbook de incidentes (o que fazer quando o próprio ServiceFY cai).

## 6. Backup e continuidade

- [ ] Backup automático do banco de produção com teste periódico de restauração.
- [ ] RPO/RTO definidos e documentados.
- [ ] Plano de disaster recovery testado ao menos uma vez.

## 7. Legal e compliance

- [ ] Termos de Uso e Política de Privacidade publicados.
- [ ] Conformidade com LGPD (ou regulação aplicável ao mercado-alvo) revisada.
- [ ] Contrato de nível de serviço (SLA) para clientes definido.
- [ ] Data Processing Agreement (DPA) disponível para clientes enterprise.

## 8. Suporte ao cliente

- [ ] Canal de suporte definido (o próprio ServiceFY, e-mail, chat?).
- [ ] SLA de atendimento a clientes documentado.
- [ ] Base de conhecimento pública (não apenas a KB interna do produto).

## 9. Qualidade e CI/CD

- [x] Pipeline de CI com lint, build, testes automatizados.
- [x] Dry-run de migrations antes de aplicar em staging.
- [x] Deploy automatizado de Edge Functions no pipeline.
- [ ] Deploy automatizado (gated) para produção — hoje o runbook de produção é
      manual (ver `GO_LIVE.md`).
- [ ] Ambiente de staging espelhando produção com dados sintéticos realistas.

## 10. Go-to-market

- [ ] Página de preços pública.
- [ ] Landing page / material de vendas.
- [ ] Programa de trial self-service.
- [ ] Métricas de produto instrumentadas (ativação, retenção, churn).

---
*Este checklist deve ser revisado a cada ciclo de planejamento (trimestral ou por
release major). Itens marcados `[ ]` não são bloqueadores automáticos de venda —
priorize com o CTO/Tech Lead conforme o segmento de cliente-alvo (MSP enterprise
exige muito mais desta lista do que um piloto com cliente pequeno).*
