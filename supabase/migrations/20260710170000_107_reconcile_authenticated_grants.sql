-- ServiceFY — Fase 9 (fecho): reconcilia GRANTs de leitura da role "authenticated".
--
-- Diagnóstico: dezenas de tabelas lidas pelo hook useAppData e pelo dashboard
-- principal (companies, profiles, assignment_groups, departments, changes,
-- incidents, chatbot_*, notifications, incident_history, etc.) nunca tiveram
-- GRANT SELECT para "authenticated" nesta linha de migrations, causando
-- "permission denied for table X" mesmo com RLS corretamente configurado —
-- GRANT e RLS são camadas independentes: sem GRANT, o Postgres nem chega a
-- avaliar a policy.
--
-- Verificado antes desta migration (introspecção local): TODAS as tabelas de
-- public têm RLS habilitado (relrowsecurity = true, 0 exceções). É seguro
-- conceder SELECT em nível de schema e deixar a filtragem por tenant
-- inteiramente a cargo das policies já existentes. Não escrevemos os GRANTs
-- tabela-a-tabela porque essa abordagem enumerativa foi exatamente o que
-- causou a lacuna original: qualquer tabela nova esquecida reproduz o bug.

-- 0) Achado crítico da auditoria: a view public.incidents (compatibilidade
--    sobre tickets, migration 096) foi criada SEM security_invoker=on, ao
--    contrário de v_license_usage e bi_tickets_unified, que já usam esse
--    padrão corretamente (migration 068). O dono da view (postgres) tem
--    BYPASSRLS=true — sem security_invoker, todo SELECT através da view
--    roda com esse privilégio de dono, ignorando por completo a RLS de
--    tickets/incident_attributes/service_request_attributes. Conceder SELECT
--    nesta view sem corrigir isso primeiro causaria vazamento cross-tenant
--    total. Corrigido aqui antes de qualquer GRANT.
ALTER VIEW public.incidents SET (security_invoker = on);

-- 1) SELECT amplo para authenticated (tabelas e views atuais) + default
--    privileges para que tabelas/views futuras já nasçam com SELECT liberado,
--    sem depender de lembrar o GRANT em cada nova migration.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;

-- 2) Duas tabelas têm colunas propositalmente ocultas do cliente (segredos
--    legados pré-Vault) via GRANT SELECT(colunas) em vez de SELECT pleno. O
--    passo 1 acima reabriria essas colunas — reaplicamos a versão restrita
--    por cima, replicando exatamente o que as migrations 068/076/100 já
--    definiram.
REVOKE SELECT ON public.tenant_smtp_settings FROM authenticated;
GRANT SELECT (
  id, company_id, smtp_host, smtp_port, smtp_user, from_email, from_name,
  encryption_type, created_at, updated_at
) ON public.tenant_smtp_settings TO authenticated;

REVOKE SELECT ON public.chatbot_config FROM authenticated;
GRANT SELECT (
  id, company_id, whatsapp_enabled, whatsapp_phone_number_id,
  teams_enabled, teams_app_id, teams_tenant_id,
  bot_name, welcome_message, unauthorized_message,
  business_hours_start, business_hours_end, business_days, outside_hours_message,
  whatsapp_vault_secret_id, whatsapp_webhook_vault_secret_id, teams_vault_secret_id,
  rotation_required, created_at, updated_at
) ON public.chatbot_config TO authenticated;

-- 3) INSERT/UPDATE propositalmente NÃO incluídos aqui. Escritas em tabelas
--    sensíveis (profiles, companies, etc.) já são funis para RPCs
--    SECURITY DEFINER dedicadas (ex.: update_profile_secure, migration 076)
--    que impedem auto-elevação de privilégio (company_admin virar sysadmin,
--    trocar o próprio company_id, etc.). Um GRANT de escrita amplo aqui
--    reabriria exatamente essa brecha; a superfície de escrita permanece
--    exclusivamente os GRANTs específicos por tabela já existentes em suas
--    migrations de origem.
