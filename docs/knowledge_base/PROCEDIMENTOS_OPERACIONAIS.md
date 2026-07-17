# PROCEDIMENTOS_OPERACIONAIS.md — ServiceFY

> Repositório de SOPs (Standard Operating Procedures) do ServiceFY. Cada
> procedimento operacional relevante — deploy, rotação de credenciais, resposta a
> incidente, restauração de backup, etc. — deve ter uma entrada nesta estrutura.
> Copie o template da seção 2 para cada novo procedimento.

## 1. Convenções

- **Nomenclatura do ID:** `SOP-NNN` (sequencial, nunca reaproveitar número de um
  SOP descontinuado — marque como `Obsoleto` em vez de reutilizar o número).
- **Dono do documento:** quem cria o SOP é responsável por mantê-lo atualizado até
  transferir a titularidade explicitamente.
- **Revisão:** todo SOP crítico (produção, segurança, dados) deve ser revisado a
  cada 6 meses ou após qualquer incidente que o envolva.
- **Rollback é obrigatório:** nenhum SOP que altera estado (deploy, migration,
  configuração de produção) deve ser publicado sem um plano de reversão testado
  ou explicitamente justificado como irreversível.

## 2. Template — copie este bloco para criar um novo SOP

```markdown
### SOP-NNN — [Nome do Procedimento]

**Status:** Ativo | Em revisão | Obsoleto
**Última atualização:** AAAA-MM-DD
**Responsável (owner):** [Nome / Função]
**Criticidade:** Baixa | Média | Alta | Crítica

#### Propósito
[Por que este procedimento existe. Qual problema ele resolve ou qual operação
padroniza. Uma ou duas frases — não descreva o "como", só o "por quê".]

#### Gatilhos de Execução
[Quando este procedimento deve ser executado. Pode ser um evento (ex.: "alerta de
disco acima de 90%"), uma rotina agendada (ex.: "toda segunda-feira às 08h") ou
uma decisão manual (ex.: "antes de qualquer deploy em produção").]
- Gatilho 1:
- Gatilho 2:

#### Pré-requisitos
[O que precisa estar disponível/verdadeiro antes de começar: acessos, ferramentas,
aprovações, janela de manutenção, backup recente confirmado, etc.]
- [ ] Acesso a: ...
- [ ] Aprovação de: ...
- [ ] Backup/snapshot confirmado (se aplicável)

#### Passo a Passo
1. [Passo 1 — comando ou ação exata, sem ambiguidade]
2. [Passo 2]
3. [Passo 3 — inclua pontos de verificação: "confirme que X antes de prosseguir"]
   ...

#### Plano de Rollback (Reversão)
[Como desfazer cada passo acima, na ordem inversa quando aplicável. Se o
procedimento for irreversível a partir de algum ponto, declare isso explicitamente
e qual é o ponto de não-retorno.]
1. [Passo de reversão N]
2. [Passo de reversão N-1]
   ...
- **Ponto de não-retorno:** [descreva, ou "Nenhum — procedimento totalmente
  reversível"]

#### Responsáveis
| Papel | Nome/Função | Quando acionar |
|---|---|---|
| Executor primário | | |
| Aprovador (se exigir aprovação) | | |
| Escalação (se algo der errado) | | |

#### Histórico de execução (opcional)
| Data | Executado por | Resultado | Observações |
|---|---|---|---|
```

## 3. SOPs publicados

### SOP-001 — Onboarding de Novo Cliente (Tenant)

**Status:** Ativo
**Última atualização:** 2026-07-17
**Responsável (owner):** Tech Lead / Administrador MSP
**Criticidade:** Alta

#### Propósito
Padronizar o cadastro de uma nova empresa contratante (tenant) no ServiceFY, do
provisionamento do registro no banco até o primeiro acesso funcional do cliente,
garantindo que nenhuma etapa de governança (admin do tenant, entitlements de
módulo, SLA, catálogo) seja esquecida por depender de memória ou SQL manual.

#### Gatilhos de Execução
- Contrato comercial assinado com um novo cliente (MSP onboarding um cliente
  gerenciado).
- Migração de um cliente de trial/piloto para conta paga com dados definitivos.
- Recriação de um tenant após um offboarding anterior (novo ciclo comercial).

#### Pré-requisitos
- [ ] Acesso a: conta com papel `sysadmin` ou MSP admin
      (`is_current_user_msp_admin()` = true) no ServiceFY.
- [ ] Aprovação de: Comercial/Account Manager confirmando contrato assinado,
      plano contratado (`starter` | `professional` | `enterprise`) e
      quantidade de licenças (`concurrent_licenses`).
- [ ] Dados em mãos: razão social, domínio de e-mail corporativo do cliente,
      branding (cores/logo, se aplicável), nome e e-mail do primeiro
      administrador do cliente (Company Admin).
- [ ] Backup/snapshot confirmado: não aplicável (operação aditiva, sem
      alteração de dados de outros tenants).

#### Passo a Passo
1. Login no ServiceFY com uma conta `sysadmin`/MSP admin e acessar o
   **Admin Dashboard → aba de Tenants/Clientes**.
2. Preencher o formulário **"Onboarding de Novo Cliente"** (Nome da Empresa,
   Domínio de E-mail, URL da Logo, Cor Primária, Cor Secundária) e submeter em
   **"Onboard Company"**. Isso chama `provisionTenant()`
   (`src/tenant/provisionTenant.ts`) → RPC `public.provision_tenant`, que
   cria — de forma idempotente por `slug` — o registro em `public.companies`
   já com `license_plan` e `concurrent_licenses`.
   - Verificação: confirmar na lista de tenants que a empresa aparece com o
     `slug` esperado e `active = true`.
3. Cadastrar o **administrador do cliente**: na aba **Usuários**, preencher
   "Adicionar Novo Colaborador" com Nome completo, E-mail corporativo (deve
   usar o mesmo domínio configurado no passo 2), selecionar a Empresa/Tenant
   recém-criada e definir **Papel de Acesso (RBAC) = `company_admin`**
   ("CompanyAdmin — Admin do Tenant").
   - Verificação: este papel consome uma licença de analista
     (`LICENSE_CONSUMING_ROLES`) — confirmar que o tenant tem
     `concurrent_licenses` suficiente antes de salvar.
4. Orientar o cliente a completar o primeiro acesso (convite/login via
   Supabase Auth) com o e-mail cadastrado no passo 3.
   - Verificação: confirmar que o `profile` foi vinculado corretamente ao
     `company_id` do tenant após o primeiro login.
5. Habilitar os **módulos contratados**: revisar
   `company_module_entitlements` do tenant e desbloquear (`enabled = true`,
   remover qualquer `status: 'locked'` remanescente na seção correspondente
   do `SettingsCenter`) apenas os módulos incluídos no plano contratado.
6. Configurar o **catálogo de serviços inicial**: em `SettingsCenter →
   Catálogo de Serviços`, cadastrar ao menos um Departamento, as categorias
   de catálogo e os serviços correspondentes. Usar um catálogo padrão como
   ponto de partida quando o cliente ainda não tiver o próprio definido.
7. Configurar o **SLA inicial**: revisar/criar política de SLA, calendário de
   atendimento e matriz de prioridade para o tenant. Não liberar acesso ao
   cliente com o tenant sem nenhum SLA configurado.
8. **Smoke test**: logar como o Company Admin recém-criado (ou acompanhar o
   cliente fazendo isso) e abrir uma requisição de teste pelo Portal do
   Usuário. Confirmar que ela aparece no Cockpit do agente e que o timer de
   SLA inicia corretamente.
9. Registrar a conclusão no **Histórico de execução** deste SOP (data, quem
   executou, observações).

#### Plano de Rollback (Reversão)
1. **Interrupção antes do passo 4** (nenhum usuário efetivamente logou
   ainda): desativar o tenant (`companies.active = false`) ou remover o
   registro, já que não há dados de cliente reais em risco.
2. **Interrupção a partir do passo 3** (usuário(s) já criado(s), mas
   onboarding cancelado): desativar os `profiles` do tenant
   (`active = false`) e o registro em `companies` (`active = false`) em vez
   de excluir — preserva auditoria e evita reaproveitamento acidental do
   `slug`.
3. Erros de digitação nos dados do passo 2 **não exigem rollback**: o RPC
   `provision_tenant` é idempotente por `slug` — reexecutar o passo 2 com os
   dados corrigidos apenas atualiza o registro existente.
- **Ponto de não-retorno:** a partir do momento em que o cliente começa a
  operar de fato (tickets reais abertos, dados de negócio inseridos), o
  cancelamento deixa de ser um "rollback" deste SOP e passa a ser um
  **offboarding** — procedimento distinto, ainda não formalizado (ver lista
  de candidatos, seção 5).

#### Responsáveis
| Papel | Nome/Função | Quando acionar |
|---|---|---|
| Executor primário | Administrador MSP / Sysadmin (time de Implantação/Customer Success) | A cada novo cliente contratado |
| Aprovador | Comercial / Account Manager | Antes do passo 1 — confirma contrato e plano |
| Escalação | Tech Lead | Se o RPC `provision_tenant` falhar (ex.: erro `42501` de permissão) ou qualquer passo 5–7 não puder ser concluído |

#### Histórico de execução (opcional)
| Data | Executado por | Resultado | Observações |
|---|---|---|---|

## 4. Índice de SOPs

> Preencha conforme os procedimentos forem formalizados.

| ID | Nome | Criticidade | Status |
|---|---|---|---|
| SOP-001 | Onboarding de Novo Cliente (Tenant) | Alta | Ativo |

## 5. Candidatos a SOP prioritários

> Procedimentos que já existem informalmente (documentados em `GO_LIVE.md` ou no
> conhecimento da equipe) e deveriam virar um SOP formal com plano de rollback:

- [ ] Deploy de migration em produção (hoje descrito de forma narrativa em
      [`GO_LIVE.md`](../../GO_LIVE.md) — falta o plano de rollback formal).
- [ ] Rotação de senha do banco de dados (Supabase) e sincronização com os
      secrets do GitHub Actions / Vercel.
- [ ] Restauração de backup do banco de produção.
- [ ] Resposta a incidente de indisponibilidade da aplicação.
- [ ] Offboarding de um tenant (desativação/exportação de dados de um cliente
      que encerrou o contrato) — complemento natural do SOP-001.
- [ ] Rollback de um deploy do frontend na Vercel.

---
*Placeholder para preenchimento futuro pelo CTO/Tech Lead: SOPs formalizados a
partir da lista de candidatos acima, com donos e criticidade atribuídos.*
