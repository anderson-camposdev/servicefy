# CI/CD — Pipeline de Staging

Workflow: [`.github/workflows/ci-cd-staging.yml`](../.github/workflows/ci-cd-staging.yml)

## O que roda sempre (sem segredo nenhum)

Três jobs em paralelo, disparados em todo PR contra `main`, todo push em `main`,
e manualmente via `workflow_dispatch`:

1. **Lint & Build** — `npm run lint` (ESLint) + `npm run build` (`tsc -b && vite build`).
2. **Testes Automatizados** — `npm run test:unit:vitest` (Vitest dos componentes) +
   `npm run test:security` (21 contratos de segurança do banco, checagem estática
   das migrations/RPCs via regex — não precisa de banco vivo).
3. **Validação de Migrations** — `npm run audit:migrations` (checagem estática rápida:
   tabelas core, prefixos duplicados, `config.toml` presente) e, se passar, sobe um
   Postgres **descartável** dentro do próprio runner (`supabase start`, via Docker) e
   roda `supabase db reset` — isso replica **todas** as migrations do zero, incluindo
   100→107, contra um banco que nasce vazio e morre com o job. Qualquer erro de DDL
   quebra o job. Esse é o "dry-run" pedido: nenhum projeto remoto é tocado, então não
   existe risco de dado real, e nenhum segredo é necessário.

Nenhum desses três jobs precisa de nenhuma credencial Supabase — todos os testes
mockam o client (`vi.mock('../../../lib/supabase', ...)`), e a validação de migrations
roda 100% local.

## Estágio opcional: dry-run contra Supabase Staging real

Hoje **não existe projeto de staging** na conta Supabase (só o de produção,
`Flowfy ITSM` / ref `enxtvrvsfwvcnpyspyfl`). O job `remote-staging-dry-run` existe no
workflow mas fica **desligado por padrão** (`if: vars.STAGING_ENABLED == 'true'`) até
que:

1. Um projeto Supabase novo seja criado especificamente para staging (nunca reutilizar
   o ref de produção).
2. Os secrets abaixo sejam configurados em **Settings → Secrets and variables →
   Actions** do repositório GitHub.
3. A variável de repositório (não secret) `STAGING_ENABLED` seja criada com valor
   `true` em **Settings → Secrets and variables → Actions → Variables**.

| Nome | Tipo | Onde conseguir | Uso |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Secret | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) — gerar um token pessoal ou de service account dedicado ao CI (não reusar o seu token pessoal de uso diário) | Autentica o `supabase` CLI (`supabase link`, `supabase db push`) |
| `SUPABASE_STAGING_PROJECT_ID` | Secret | Painel do projeto de staging → Settings → General → "Reference ID" | Identifica qual projeto o CLI deve linkar (`supabase link --project-ref`) |
| `SUPABASE_STAGING_DB_PASSWORD` | Secret | Definida na criação do projeto de staging (ou resetável em Settings → Database) | Necessária para o CLI conectar ao Postgres do projeto ao fazer `db push` |

Variável de repositório (pública, não sensível):

| Nome | Tipo | Valor |
|---|---|---|
| `STAGING_ENABLED` | Variable | `true` — só depois que os 3 secrets acima existirem |

Mesmo com tudo configurado, o job usa **exclusivamente** `supabase db push --dry-run`
— ele só imprime o que seria aplicado, nunca escreve nada. Não há, em lugar nenhum
deste workflow, um `db push` sem `--dry-run`, um `db reset` contra projeto remoto, ou
qualquer outro comando que apague ou sobrescreva dado real. Promover de fato as
migrations 100→107 (ou futuras) para staging continua sendo uma ação manual e
deliberada, fora deste pipeline — mesmo padrão já usado nesta sessão para produção
(aplicação via MCP, uma migration por vez, com verificação em cada passo).

## Por que não há job de deploy do frontend aqui

O escopo desta fase (Fase 11) é validação — lint, testes, compatibilidade de
migrations. Um job de deploy do frontend (Vercel/Netlify/etc.) ou de deploy de Edge
Functions para staging é um próximo passo natural, mas depende de decisões ainda não
tomadas (onde hospedar o staging do frontend, se as Edge Functions de staging
reusam os mesmos secrets de produção como `RESEND_API_KEY` ou têm os seus próprios).
Fica como proposta para uma "Fase 11.1" separada, uma vez que o projeto de staging
exista.
