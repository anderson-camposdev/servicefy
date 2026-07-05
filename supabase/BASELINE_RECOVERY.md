# Recuperação segura do baseline Supabase

## Estado atual (recuperado em 2026-07-05)

O diretorio `supabase/migrations` agora reproduz o historico timestampado real
do projeto remoto, incluindo as migrations 071-081. Os arquivos numericos
anteriores foram preservados em `supabase/legacy_migrations` apenas para
auditoria e nao devem ser executados pela CLI.

Antes de publicar novas migrations, execute `supabase db push --linked --dry-run`.
O resultado esperado deve listar somente migrations novas.

O repositório não contém a criação das tabelas core (`companies`, `profiles`,
`incidents`, `problems`, `changes` e históricos). Por isso, `supabase db reset`
em um ambiente vazio não é confiável, mesmo com as migrations incrementais.

## Fonte de verdade necessária

Use um dump **somente de schema** do ambiente Supabase que contém a versão
mais atual dessas tabelas. Não inclua dados, conteúdo de `auth.users`, Vault,
chaves ou secrets.

```powershell
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db dump --linked --schema public --file C:\tmp\flowfy-current-schema.sql
```

O comando exige acesso autorizado ao projeto e não deve ser executado em CI
com senha exposta em argumentos ou logs.

## Como construir `000_core_schema.sql`

1. Copie do dump apenas extensões, enums e objetos core que já existiam antes
   de `001_incident_catalog.sql`.
2. Não copie tabelas criadas pelas migrations `001+`; elas devem continuar
   pertencendo às migrations incrementais.
3. Remova owners, grants específicos do ambiente e qualquer valor secreto.
4. Salve o resultado como `supabase/migrations/000_core_schema.sql`.
5. Renomeie os prefixos duplicados `020`, `021` e `022` preservando a ordem
   efetiva já registrada no ambiente remoto.

## Critério de aceite

Em um projeto local descartável:

```powershell
supabase start
supabase db reset
npm.cmd run test:security
npm.cmd run audit:migrations
```

Depois, compare o schema local com o ambiente vinculado. O diff estrutural
deve estar vazio ou conter apenas diferenças deliberadamente documentadas.

Até esse teste passar, as migrations `071` e `072` devem ser revisadas em um
ambiente de homologação antes de qualquer aplicação em produção.
