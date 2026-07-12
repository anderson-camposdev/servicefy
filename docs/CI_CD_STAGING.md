# CI/CD — Pipeline de Staging

Workflow: [`.github/workflows/ci-cd-staging.yml`](../.github/workflows/ci-cd-staging.yml)

Disparado em toda PR e todo push contra `staging` ou `main`, e manualmente via
`workflow_dispatch`. Três jobs **sequenciais** (`needs:`) — cada um só roda se o
anterior passar:

## Job 1 — Lint & Build

`npm ci && npm run lint && npm run build` (ESLint + `tsc -b && vite build`). Não
precisa de nenhuma credencial.

## Job 2 — Testes Automatizados

`npm run test:unit:vitest` (suíte Vitest completa) + `npm run test:security`
(contratos de segurança do banco — checagem estática de migrations/RPCs via
regex, não abre conexão nenhuma). Também não precisa de credencial: todo teste
mocka o client Supabase (`vi.mock('../../../lib/supabase', ...)`).

## Job 3 — Supabase Dry-Run & Deploy

**Só roda em `push`, nunca em `pull_request`** — aplicar migrations e publicar
Edge Functions a cada PR aberta seria um efeito colateral perigoso; deploy real
só deve acontecer quando o código já estiver na branch de destino. O job usa o
GitHub Environment `staging`: configure um *required reviewer* nele (Settings →
Environments → staging) se quiser um gate manual de aprovação antes do deploy
rodar, sem precisar tocar no YAML.

Passos, nesta ordem:
1. **Rede de segurança local** — sobe um Postgres descartável dentro do próprio
   runner (`supabase start` + `supabase db reset`) e faz o replay de todas as
   migrations (009→107) do zero. Se qualquer uma tiver erro de DDL, o job falha
   aqui, antes de tocar o projeto de staging real.
2. **Link** — `supabase link --project-ref $SUPABASE_PROJECT_ID_STAGING`.
3. **Dry-run** — `supabase migration list --linked`, que mostra o diff entre
   migrations locais e as já aplicadas em staging, sem escrever nada. `migration
   up` (próximo passo) não tem flag `--dry-run` própria; isso cobre a
   pré-visualização antes dela.
4. **Deploy de migrations** — `supabase migration up --linked`. Aplica
   estritamente as migrations **pendentes** (as 100→107 desta fase, e qualquer
   futura); não dropa, não reseta, não sobrescreve nada existente. Sem
   `--force`, sem `db reset` remoto, sem `db push` de escrita.
5. **Deploy de Edge Functions** — `supabase functions deploy test-smtp-connection`
   e `supabase functions deploy dispatch-ticket-email-outbox`, contra o mesmo
   `--project-ref` de staging.

Nenhum comando destrutivo em nenhum passo: `db reset` só roda contra o Postgres
efêmero local do passo 1, nunca contra staging.

## Secrets a cadastrar no GitHub

Em **Settings → Secrets and variables → Actions → Secrets** do repositório:

| Nome | Onde conseguir | Uso |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) — gere um token dedicado ao CI, não reuse o seu pessoal de uso diário | Autentica o `supabase` CLI (`link`, `migration up`, `functions deploy`) |
| `SUPABASE_PROJECT_ID_STAGING` | Painel do projeto de staging → Settings → General → "Reference ID" | Identifica qual projeto o CLI deve linkar/deployar (`--project-ref`) |
| `SUPABASE_STAGING_DB_PASSWORD` | Definida na criação do projeto de staging (ou resetável em Settings → Database) | Necessária para o CLI conectar ao Postgres ao rodar `migration up` |

Recomendo também criar o Environment `staging` (Settings → Environments → New
environment) e anexar esses mesmos 3 secrets **a ele** em vez de deixá-los como
secrets globais do repositório — isso permite exigir aprovação manual antes do
Job 3 rodar e restringe quem pode ver/usar essas credenciais.

## Pré-requisito ainda pendente: o projeto de staging não existe

Hoje a conta Supabase só tem o projeto de produção (`Flowfy ITSM` /
`enxtvrvsfwvcnpyspyfl`). O Job 3 vai falhar no passo de link até que:

1. Um projeto Supabase **novo** seja criado especificamente para staging (nunca
   reutilizar o ref de produção — isso misturaria dados de teste com dados reais
   de clientes).
2. Os 3 secrets acima sejam cadastrados apontando para esse novo projeto.

Não criei esse projeto automaticamente nesta sessão porque provisionar infra
nova na nuvem (e potencialmente gerar custo, dependendo do plano da
organização) é uma decisão que cabe ao usuário confirmar antes — posso criar
via MCP do Supabase se você autorizar.

## Sobre o deploy do frontend

Este workflow cobre banco (migrations) e Edge Functions, conforme pedido nesta
fase. Deploy do frontend (Vercel/Netlify/etc.) para staging fica como próximo
passo natural, dependente de onde vocês decidirem hospedar esse ambiente —
ainda não coberto aqui.
