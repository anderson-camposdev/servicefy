-- ============================================================
-- ServiceFY ITSM — SEED DE LOGINS (auth.users) PARA HOMOLOGAÇÃO
-- Arquivo: supabase/seed_auth_logins.sql
--
-- Cria usuários reais no Supabase Auth para TODOS os perfis do
-- seed_sla_testing.sql e vincula profiles.auth_id, permitindo login.
--
-- PRÉ-REQUISITO: rodar ANTES o seed_sla_testing.sql (cria os profiles).
--
-- SENHA ÚNICA DE TESTE:  Flowfy@2026
--
-- IDEMPOTENTE: não duplica usuários nem identities (NOT EXISTS).
-- Observação: manipular auth.users diretamente é um atalho de
-- homologação. Em produção use o painel/Admin API. Funciona no
-- Postgres do Supabase (pgcrypto + gen_random_uuid disponíveis).
-- ============================================================

BEGIN;

-- ─── 1. Cria os usuários de autenticação (senha = Flowfy@2026) ──
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  p.email,
  crypt('Flowfy@2026', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', p.name),
  '', '', '', ''
FROM public.profiles p
WHERE p.email IN (
  'root@allied-sla.it',
  'ana.allied@allied-sla.it',
  'bruno.allied@allied-sla.it',
  'carla@alpha-sla.tech',
  'diego@beta-sla.hospital',
  'alice@alpha-sla.tech',
  'aldo@alpha-sla.tech',
  'bia@beta-sla.hospital',
  'caio@beta-sla.hospital'
)
AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = p.email);

-- ─── 2. Cria a identidade de e-mail (exigida pelo GoTrue novo) ──
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
FROM auth.users u
WHERE u.email IN (
  'root@allied-sla.it',
  'ana.allied@allied-sla.it',
  'bruno.allied@allied-sla.it',
  'carla@alpha-sla.tech',
  'diego@beta-sla.hospital',
  'alice@alpha-sla.tech',
  'aldo@alpha-sla.tech',
  'bia@beta-sla.hospital',
  'caio@beta-sla.hospital'
)
AND NOT EXISTS (
  SELECT 1 FROM auth.identities i
  WHERE i.provider = 'email' AND i.user_id = u.id
);

-- ─── 3. Vincula profiles.auth_id ao usuário criado ─────────────
UPDATE public.profiles p
   SET auth_id = u.id
  FROM auth.users u
 WHERE u.email = p.email
   AND p.auth_id IS DISTINCT FROM u.id
   AND p.email IN (
     'root@allied-sla.it',
     'ana.allied@allied-sla.it',
     'bruno.allied@allied-sla.it',
     'carla@alpha-sla.tech',
     'diego@beta-sla.hospital',
     'alice@alpha-sla.tech',
     'aldo@alpha-sla.tech',
     'bia@beta-sla.hospital',
     'caio@beta-sla.hospital'
   );

COMMIT;

-- ─── Verificação ────────────────────────────────────────────────
-- SELECT p.email, p.role, p.profile_role, (p.auth_id IS NOT NULL) AS pode_logar
--   FROM public.profiles p
--  WHERE p.email LIKE '%-sla.%' OR p.email LIKE '%allied-sla%'
--  ORDER BY p.email;
