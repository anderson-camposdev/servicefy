# Práticas e métricas

## Práticas

- **Incidente:** restaurar serviço; registrar item afetado, impacto, urgência, prioridade
  explicável, comunicação, vínculos e resolução estruturada.
- **Solicitação:** dirigir por catálogo, elegibilidade, formulário, aprovação, tarefas e
  evidência de entrega.
- **Problema:** suportar análise reativa/proativa, RCA com evidência, workaround, erro
  conhecido, correção e verificação.
- **Mudança:** governança proporcional para padrão, normal e emergencial; registrar impacto,
  risco, plano, teste, rollback, janela, aprovação e PIR.
- **Conhecimento:** rascunho, revisão, publicação, uso, feedback, validade e arquivamento.
- **CMDB:** começar por impacto, diagnóstico, ownership ou compliance; medir qualidade.

## UX operacional

Cada tela deve mostrar o que exige atenção, por quê, próxima ação, impacto, prazo e evidência.
Todo KPI deve exibir unidade, período, denominador, comparação e drilldown coerente.

## Métricas

- `MTTR = soma(duração elegível) / resolvidos elegíveis`; declarar período, população,
  calendário e pausas.
- `SLA = metas concluídas no prazo / metas concluídas elegíveis`; denominador zero é `N/A`.
- Backlog é estoque no corte; separar criado, resolvido e faixas de idade.
- Ausência de reatribuição não prova FCR; definir primeiro contato por eventos reais.
- Reabertura exige denominador e janela de observação.
- Mudanças devem separar sucesso, ressalva, falha, rollback e cancelamento.
- Problemas e KB devem medir recorrência, workaround, eficácia, cobertura, uso e vencimento.

Painéis executivos devem encadear resultado, risco, causa, decisão e drilldown. Não usar
gráficos decorativos nem metas exemplificativas como benchmark de indústria.
