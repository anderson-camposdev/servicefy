-- ============================================================
-- Prova de equivalência da policy de SELECT de tickets (migration 175)
-- + verificação de isolamento entre tenants e papéis.
--
-- A migration 175 trocou a policy de uma chamada a can_read_ticket_row(...)
-- por linha pela MESMA lógica inline com os helpers de sessão promovidos a
-- InitPlan (ganho medido de 171x). Isso só é aceitável se a autorização
-- permanecer idêntica.
--
-- Método: para cada usuário, compara o conjunto que a POLICY entrega
-- (sessão `authenticated`, RLS ativa) com o que a FUNÇÃO original aprova
-- (avaliada como superusuário — ignora RLS, mas lê as mesmas claims).
-- Divergência em qualquer direção é falha.
--
-- Rodar apenas contra o Supabase LOCAL. Reverte tudo ao final.
-- ============================================================
\set ON_ERROR_STOP on

BEGIN;

SELECT id AS msp_company FROM companies WHERE is_provider_tenant ORDER BY created_at LIMIT 1 \gset

INSERT INTO companies (id, name, domain, slug, active, is_provider_tenant)
VALUES ('bbbb0000-0000-0000-0000-00000000bbbb', 'Rival Corp', 'rival.test', 'rival', true, false);

INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at) VALUES
  ('aaaa0001-0000-0000-0000-000000000001', 'agente.msp@test.local',   'authenticated','authenticated', now(), now(), now()),
  ('aaaa0002-0000-0000-0000-000000000002', 'enduser.msp@test.local',  'authenticated','authenticated', now(), now(), now()),
  ('aaaa0003-0000-0000-0000-000000000003', 'admin.rival@test.local',  'authenticated','authenticated', now(), now(), now()),
  ('aaaa0004-0000-0000-0000-000000000004', 'enduser.rival@test.local','authenticated','authenticated', now(), now(), now());

INSERT INTO profiles (id, auth_id, name, email, role, company_id, active) VALUES
  ('cccc0001-0000-0000-0000-000000000001','aaaa0001-0000-0000-0000-000000000001','Agente MSP',   'agente.msp@test.local',   'agent',         :'msp_company', true),
  ('cccc0002-0000-0000-0000-000000000002','aaaa0002-0000-0000-0000-000000000002','End User MSP', 'enduser.msp@test.local',  'end_user',      :'msp_company', true),
  ('cccc0003-0000-0000-0000-000000000003','aaaa0003-0000-0000-0000-000000000003','Admin Rival',  'admin.rival@test.local',  'company_admin', 'bbbb0000-0000-0000-0000-00000000bbbb', true),
  ('cccc0004-0000-0000-0000-000000000004','aaaa0004-0000-0000-0000-000000000004','End User Rival','enduser.rival@test.local','end_user',     'bbbb0000-0000-0000-0000-00000000bbbb', true);

INSERT INTO assignment_groups (id, company_id, name, is_private) VALUES
  ('dddd0001-0000-0000-0000-000000000001', :'msp_company', 'Grupo Privado Bench', true),
  ('dddd0002-0000-0000-0000-000000000002', :'msp_company', 'Grupo Aberto Bench',  false);

SET session_replication_role = replica;
INSERT INTO tickets (number, company_id, short_description, caller_name, caller_id, assigned_to_id, assignment_group_id, ticket_type)
SELECT 'ISO' || lpad(g::text,4,'0'),
       CASE WHEN g % 4 = 0 THEN 'bbbb0000-0000-0000-0000-00000000bbbb'::uuid ELSE :'msp_company'::uuid END,
       'Isolamento ' || g, 'Chamador',
       CASE WHEN g % 5 = 0 THEN 'cccc0002-0000-0000-0000-000000000002'::uuid
            WHEN g % 5 = 1 THEN 'cccc0004-0000-0000-0000-000000000004'::uuid ELSE NULL END,
       CASE WHEN g % 7 = 0 THEN 'cccc0001-0000-0000-0000-000000000001'::uuid ELSE NULL END,
       CASE WHEN g % 3 = 0 THEN 'dddd0001-0000-0000-0000-000000000001'::uuid
            WHEN g % 3 = 1 THEN 'dddd0002-0000-0000-0000-000000000002'::uuid ELSE NULL END,
       'incident'
FROM generate_series(1, 400) g;
SET session_replication_role = DEFAULT;

CREATE TEMP TABLE iso(usuario text, papel text, tenant text, policy_ve int, funcao_aprova int, de_outro_tenant int);

-- Uma iteração por usuário. As duas medições correm em sessões distintas
-- (superusuário para a função, `authenticated` para a policy) sem misturar
-- estado de role.
DO $$
DECLARE
  u RECORD; v_pol int; v_fun int; v_cross int;
BEGIN
  FOR u IN
    SELECT p.auth_id, p.email, p.role::text AS papel, c.name AS tenant, c.is_provider_tenant
      FROM profiles p JOIN companies c ON c.id = p.company_id
     WHERE p.auth_id::text LIKE 'aaaa000%'
     ORDER BY p.email
  LOOP
    PERFORM set_config('request.jwt.claim.sub', u.auth_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_fun FROM tickets t
     WHERE t.number LIKE 'ISO%'
       AND public.can_read_ticket_row(t.company_id, t.caller_id, t.assigned_to_id, t.assignment_group_id);

    SET LOCAL role authenticated;
    SELECT count(*), count(*) FILTER (WHERE t.company_id <> (SELECT company_id FROM profiles WHERE auth_id = u.auth_id))
      INTO v_pol, v_cross
      FROM tickets t WHERE t.number LIKE 'ISO%';
    RESET role;

    INSERT INTO iso VALUES (u.email, u.papel, u.tenant, v_pol, v_fun, v_cross);
  END LOOP;
END $$;

\echo ''
\echo '════ 1) EQUIVALÊNCIA: policy nova x função original (divergência deve ser 0) ════'
SELECT usuario, papel, policy_ve, funcao_aprova,
       CASE WHEN policy_ve = funcao_aprova THEN 'OK — idêntico'
            ELSE '*** DIVERGENTE — migration 175 alterou autorização ***' END AS veredito
FROM iso ORDER BY usuario;

\echo ''
\echo '════ 2) ISOLAMENTO: quantos chamados de OUTRO tenant cada um enxerga ════'
SELECT usuario, papel, tenant, de_outro_tenant,
       CASE WHEN de_outro_tenant = 0 THEN 'OK — isolado'
            ELSE 'VÊ OUTRO TENANT (esperado só para papel administrativo do provedor)' END AS situacao
FROM iso ORDER BY de_outro_tenant DESC, usuario;

ROLLBACK;
