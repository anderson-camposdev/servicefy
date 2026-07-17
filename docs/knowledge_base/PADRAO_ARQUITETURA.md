# PADRAO_ARQUITETURA.md — ServiceFY

> Convenções de arquitetura e código. Todo módulo novo deve seguir estes padrões,
> a menos que haja uma razão documentada para desviar.

## 1. Multi-tenancy

- Isolamento por linha: toda tabela de domínio tem `company_id uuid references companies(id)`.
- RLS habilitado em todas as tabelas de tenant; nenhuma tabela de domínio deve ficar
  acessível sem policy.
- Não existe (e não deve ser reintroduzido) schema-per-tenant — modelo é
  single-schema com RLS. Ver `schema-per-tenant-removal-contract.test.mjs`.

## 2. Padrão de RPC administrativa (SECURITY DEFINER)

Toda operação administrativa sensível (criação em lote, alteração de configuração,
ações que exigem bypass controlado de RLS) segue este molde:

```sql
CREATE OR REPLACE FUNCTION public.nome_da_funcao(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := NULLIF(p_payload->>'company_id', '')::uuid;

  -- 1. Sempre validar company_id antes de qualquer outra coisa
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id é obrigatório' USING ERRCODE = '22023';
  END IF;

  -- 2. Sempre checar autorização explicitamente (nunca confiar só em RLS aqui,
  --    já que SECURITY DEFINER roda com privilégios do owner)
  IF NOT public.is_settings_admin(v_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;

  -- 3. Lógica de negócio (subtransações BEGIN...EXCEPTION por item, quando a
  --    operação é em lote, para resiliência parcial)

  -- 4. Auditoria — toda mutação administrativa é registrada
  PERFORM public.write_admin_audit(v_company_id, 'evento.realizado', 'entidade',
    NULL, NULL, jsonb_build_object('detalhe', 'valor'));

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.nome_da_funcao(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nome_da_funcao(jsonb) TO authenticated;
```

Helpers de autorização disponíveis:

- `is_settings_admin(company_id)` — checa se o usuário atual é admin do tenant.
- `is_current_user_msp_admin()` — checa se é admin do nível MSP (multi-tenant).
- `get_current_user_company_id()`, `get_current_user_role()`, `get_current_profile_id()`.
- `write_admin_audit(...)` — grava auditoria e já redige segredos automaticamente.
- `can_read_case(...)` — regra de privacidade para `cases`; **não tem** bypass de
  `is_settings_admin` (admin de empresa não lê casos privados de RH/Jurídico). KB é
  exceção proposital a essa regra.

## 3. Migrations

- Diretório: `supabase/migrations/`. Nome: `YYYYMMDDhhmmss_NNN_descricao.sql`
  (timestamp + número sequencial + slug).
- `supabase/legacy_migrations/` é **arquivo histórico** — nunca executar diretamente;
  serve apenas como fonte de consulta caso uma migration precise ser reconstruída.
- Toda migration nova usa timestamp posterior ao da última migration existente.
- Nunca rodar `supabase db reset` contra o container de desenvolvimento
  compartilhado — usar um projeto Supabase isolado (`supabase init` num diretório
  temporário, portas offset) para validar a cadeia completa do zero.
- Sempre fazer dry-run (`supabase migration list --linked` / `db diff`) antes de
  aplicar em staging/produção.
- Timestamps críticos de SLA/governança (ex.: `responded_at`, `resolved_at`) **nunca**
  devem depender de um caminho específico de UI lembrar de setá-los — usar trigger de
  banco que cubra todos os caminhos de entrada.

## 4. Testes (pirâmide)

| Camada | Ferramenta | Onde | O que cobre |
|---|---|---|---|
| Contratos de segurança | `node --test` | `tests/security/*.test.mjs` | Lê as migrations via regex e garante que padrões de segurança (RLS, `SECURITY DEFINER`, grants, guard de admin, auditoria) não regridam. |
| Unitário | Vitest / `node --test` | `tests/unit/**`, `src/**/*.test.ts` | Lógica pura (ex.: FSM do condutor de triagem). |
| Integração | scripts dedicados | `tests/integration/**` | Fluxos que cruzam múltiplos serviços (ex.: fallback de e-mail). |
| E2E | Playwright | `tests/e2e/**` | Fluxos de usuário ponta a ponta, com mock de auth e RPCs. |

Comando de validação completo antes de qualquer entrega:
`npm run build && npm run lint && npm run test:security && npm run test:e2e`
(+ `npm run audit:migrations` quando a mudança tocar `supabase/migrations/`).

## 5. Frontend — padrões de composição

- **Seções administrativas novas**: registrar em `SettingsCenter` (`SECTIONS`) e
  especializar via `if (selected?.key === 'x') return <Componente />`.
- **Telas do portal do usuário**: modeladas como `type Screen`, navegação via `<a>`
  na sidebar de `UserPortalLayout` (não `<button>`).
- **Cockpit** (visão do agente/analista) opera sobre `incidents`, não `cases`.
- **Temas**: `LIGHT_THEMES` / `DARK_THEMES` / `THEME_LIST` em
  `src/lib/theme-engine.ts`; nenhuma tela de configuração deve expor input de cor em
  hexadecimal cru para o usuário final — usar paleta de swatches + seletor
  avançado opcional.
- Tipagem estrita do Supabase: `createClient<Database>` usando o tipo gerado em
  `src/lib/database.generated.ts`; nunca `createClient<any>`.

## 6. Observabilidade e auditoria

- Toda mutação administrativa passa por `write_admin_audit` — não criar tabelas de
  auditoria paralelas sem necessidade real.
- Logs de Edge Functions e falhas de outbox (`channel_outbox`, `ticket_email_outbox`)
  devem ser consultáveis para diagnóstico de entregabilidade.

## 7. O que evitar

- Reintroduzir client Supabase por tenant (schema-per-tenant) — modelo já foi
  removido deliberadamente.
- Confiar apenas em RLS dentro de uma função `SECURITY DEFINER` — sempre validar
  autorização explicitamente no corpo da função.
- `ON CONFLICT` sobre constraint com coluna anulável esperando idempotência — `NULL`
  nunca é igual a `NULL` em `UNIQUE`; usar índice único parcial quando necessário.
- Deixar decisão de UX crítica (ex.: transferir para humano) com threshold de
  confiança em `0`, que trata "não reconhecido" como "confiança máxima".

---
*Placeholder para preenchimento futuro: diagramas de arquitetura (C4), decisões de
ADR (Architecture Decision Records), política de versionamento de API pública (se
houver), estratégia de cache/CDN.*
