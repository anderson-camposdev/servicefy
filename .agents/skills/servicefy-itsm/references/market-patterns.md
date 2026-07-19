# Padrões de mercado

Usar como hipóteses. Para cada padrão, descrever problema observado, origem, princípio
universal, acoplamento proprietário, custo, risco e decisão.

## Padrões valiosos

- **Registro comum:** centralizar identidade, tenant, estado, prioridade e atribuição;
  especializar atributos sem criar uma supertabela ilimitada.
- **Identidade:** UUID imutável como PK e número humano com unicidade definida.
- **Catálogo em camadas:** domínio, serviço, item/sintoma, formulário, SLA, grupo e fluxo.
- **Request/item/tarefa:** adotar hierarquia somente se houver agregação ou fulfillment
  multi-equipe; não copiar REQ/RITM/SCTASK por aparência.
- **Estado governado:** controlar transições, campos, autorização e efeitos.
- **SLA por instância/ledger:** separar política, calendário, aplicação e eventos.
- **Aprovação reutilizável:** etapas, aprovadores, decisão, delegação, prazo e evidência.
- **Problema/KEDB:** incidentes relacionados, causa, workaround, erro e correção.
- **Mudança por risco:** padrão, normal e emergencial; plano, teste, rollback e PIR.
- **CMDB orientada a serviço:** CIs, relações direcionadas, criticidade e qualidade.
- **Conhecimento conectado:** vínculos operacionais, revisão, validade e feedback.
- **Auditoria imutável:** ator, tenant, ação, recurso, alteração, origem e instante.

## Cautela

Evitar estados numéricos opacos, scripts arbitrários no banco, customização irrestrita,
benchmarks sem fonte, automação sem explicabilidade e CMDB volumosa sem caso de uso.

Preservar a arquitetura PostgreSQL/Supabase, RLS, MSP nativo, configuração guiada,
explicabilidade e identidade visual próprias do ServiceFY.
