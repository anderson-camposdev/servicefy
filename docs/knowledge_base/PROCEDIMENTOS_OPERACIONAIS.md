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

## 3. Índice de SOPs

> Preencha conforme os procedimentos forem formalizados. Nenhum SOP-NNN foi
> instanciado ainda — esta seção é o índice vivo.

| ID | Nome | Criticidade | Status |
|---|---|---|---|
| _(nenhum registrado ainda)_ | | | |

## 4. Candidatos a SOP prioritários

> Procedimentos que já existem informalmente (documentados em `GO_LIVE.md` ou no
> conhecimento da equipe) e deveriam virar um SOP formal com plano de rollback:

- [ ] Deploy de migration em produção (hoje descrito de forma narrativa em
      [`GO_LIVE.md`](../../GO_LIVE.md) — falta o plano de rollback formal).
- [ ] Rotação de senha do banco de dados (Supabase) e sincronização com os
      secrets do GitHub Actions / Vercel.
- [ ] Restauração de backup do banco de produção.
- [ ] Resposta a incidente de indisponibilidade da aplicação.
- [ ] Provisionamento de um novo tenant (empresa) em produção.
- [ ] Rollback de um deploy do frontend na Vercel.

---
*Placeholder para preenchimento futuro pelo CTO/Tech Lead: SOPs formalizados a
partir da lista de candidatos acima, com donos e criticidade atribuídos.*
