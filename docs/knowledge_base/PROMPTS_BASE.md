# PROMPTS_BASE.md — ServiceFY

> Prompts e instruções-base para agentes de IA (Claude Code, Codex, etc.) que forem
> trabalhar neste repositório. Objetivo: reduzir retrabalho e evitar que um agente
> sem contexto reintroduza padrões já descartados deliberadamente.

## 1. Prompt de contexto inicial (colar no início de uma sessão nova)

```
Você vai trabalhar no repositório ServiceFY, um SaaS multi-tenant de ITSM/ESM
(React 19 + TypeScript + Vite + Tailwind 4 no frontend; Supabase/Postgres com
RLS + RPCs SECURITY DEFINER no backend). Antes de propor qualquer mudança:

1. Leia docs/knowledge_base/PROJECT_CONTEXT.md para entender o domínio.
2. Leia docs/knowledge_base/PADRAO_ARQUITETURA.md e siga os padrões descritos
   (RPC administrativa, migrations, testes, composição de frontend).
3. Nunca rode `supabase db reset` contra o banco de desenvolvimento
   compartilhado — use um projeto Supabase isolado para validar migrations.
4. Toda operação administrativa sensível precisa de checagem explícita de
   autorização dentro da função (SECURITY DEFINER não deve confiar só em RLS).
5. Rode `npm run build && npm run lint && npm run test:security` antes de
   considerar qualquer entrega concluída.
```

## 2. Prompt para criar uma RPC administrativa nova

```
Crie uma migration nova em supabase/migrations/ com timestamp posterior à
última existente, seguindo o molde documentado em PADRAO_ARQUITETURA.md
(seção "Padrão de RPC administrativa"). A função deve:
- Validar company_id antes de qualquer lógica.
- Chamar is_settings_admin(company_id) (ou o helper de autorização
  correspondente) e abortar com ERRCODE 42501 se negado.
- Registrar a ação via write_admin_audit.
- Ter REVOKE ALL ... FROM PUBLIC, anon e GRANT EXECUTE ... TO authenticated.
Depois, adicione um teste de contrato em tests/security/ que leia a migration
via regex e confirme os pontos acima, seguindo o padrão dos testes existentes
nessa pasta.
```

## 3. Prompt para validar uma migration sem arriscar o ambiente

```
Valide esta migration sem tocar no banco de desenvolvimento compartilhado.
Use um projeto Supabase isolado (supabase init em diretório temporário, cópia
de supabase/migrations/, portas offset no config.toml,
supabase start -x studio -x storage-api -x imgproxy -x edge-runtime
-x logflare -x vector -x pgbouncer) e rode a cadeia completa do zero. Compare
information_schema.tables/columns e a contagem de pg_proc/pg_trigger contra o
banco de desenvolvimento real para confirmar paridade estrutural antes de
considerar a migration segura.
```

## 4. Prompt para revisão de segurança de uma mudança

```
Revise esta mudança sob a ótica de segurança multi-tenant:
1. Toda tabela nova tem company_id e RLS habilitado?
2. Toda RPC SECURITY DEFINER valida autorização explicitamente no corpo,
   sem depender apenas de RLS?
3. Existe algum caminho de UI que bypassa a RPC governada e escreve
   diretamente na tabela?
4. Timestamps críticos de SLA/governança dependem de um único caminho de UI,
   ou estão garantidos por trigger de banco?
5. Existe ON CONFLICT sobre coluna anulável assumindo idempotência indevida?
Reporte cada ponto como confirmado-seguro, risco encontrado, ou não-aplicável.
```

## 5. Regras gerais para qualquer agente neste repo

- Não usar `git push --force` sem confirmação explícita do usuário.
- Nunca inserir credenciais em código, migrations, ou arquivos versionados —
  apenas o usuário configura secrets (GitHub Actions, Supabase Dashboard,
  Vercel).
- `supabase/legacy_migrations/` é referência histórica — nunca executar.
- Preferir editar arquivos existentes a criar novos; não introduzir abstrações
  além do que a tarefa pede.
- Ao terminar uma mudança de UI, validar no navegador (preview) antes de
  reportar como concluída — testes automatizados verificam corretude de
  código, não necessariamente a experiência final.

---
*Placeholder para preenchimento futuro: prompts específicos para os próximos
módulos do roadmap (ESM UI, CMDB, Major Incident/Status Page), templates de
prompt para geração de relatórios executivos, e um prompt-base para triagem
de bugs reportados por clientes.*
