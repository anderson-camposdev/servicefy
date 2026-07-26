-- ============================================================
-- Harness de carga para medir a fila de chamados em escala.
--
-- Uso:
--   psql ... -v n=50000 -f scripts/scale-bench.sql
--
-- Cria N chamados sintéticos marcados com a tag 'scalebench',
-- mede o caminho crítico (fila do analista com RLS ativa) e
-- remove tudo ao final. Triggers são desligados durante a carga:
-- o objetivo é medir LEITURA, e a cadeia de triggers de escrita
-- levaria minutos e geraria centenas de milhares de linhas
-- satélite irrelevantes para a medição.
--
-- IMPORTANTE: rodar apenas contra o Supabase LOCAL.
-- ============================================================
\set ON_ERROR_STOP on
\set n :n

\echo '── Preparando carga...'

SELECT id AS bench_company FROM companies ORDER BY created_at LIMIT 1 \gset
SELECT auth_id AS bench_auth FROM profiles WHERE role = 'sysadmin' AND active LIMIT 1 \gset

SET session_replication_role = replica;

INSERT INTO tickets (
  number, company_id, short_description, description, priority, state,
  caller_name, ticket_type, created_at, updated_at, tags,
  assigned_group_name, sla_response_deadline, sla_resolution_deadline,
  is_response_breached, is_resolution_breached, sla_breached, responded_at
)
SELECT
  'BENCH' || lpad(g::text, 8, '0'),
  :'bench_company'::uuid,
  (ARRAY['Link de Internet — Sem Conexão','VPN Corporativa — Falha',
         'Rede Local / Wi-Fi','ERP — Lentidão','E-mail — Não recebe'])[1 + (g % 5)],
  repeat('Descrição sintética ' || g || '. ', 6),
  (ARRAY['P1 - Critical','P2 - High','P3 - Moderate','P4 - Low','P5 - Planning'])[1 + (g % 5)]::ticket_priority,
  (ARRAY['New','In Progress','On Hold','Resolved','Closed'])[1 + (g % 5)]::incident_state,
  'Usuário ' || (g % 500),
  CASE WHEN g % 4 = 0 THEN 'request' ELSE 'incident' END,
  now() - ((g % 730) || ' days')::interval,
  now() - ((g % 730) || ' days')::interval,
  ARRAY['scalebench'],
  (ARRAY['Service Desk','Infraestrutura','Redes'])[1 + (g % 3)],
  now() - ((g % 730) || ' days')::interval + interval '4 hours',
  now() - ((g % 730) || ' days')::interval + interval '24 hours',
  (g % 9 = 0), (g % 11 = 0), (g % 11 = 0),
  CASE WHEN g % 3 <> 0 THEN now() - ((g % 730) || ' days')::interval + interval '1 hour' ELSE NULL END
FROM generate_series(1, :n) g;

SET session_replication_role = DEFAULT;
ANALYZE tickets;

SELECT count(*) AS chamados_na_base FROM tickets;

\echo ''
\echo '── MEDIÇÃO: fila do analista, como o app roda (RLS ativa)'

BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claim.sub', :'bench_auth', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

\timing on
\echo ''
\echo '   (a) SEM limite — o que o código faz hoje:'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON, COSTS OFF)
SELECT * FROM incidents ORDER BY updated_at DESC;

\echo ''
\echo '   (b) COM limite 50 — uma página:'
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON, COSTS OFF)
SELECT * FROM incidents ORDER BY updated_at DESC LIMIT 50;
\timing off

ROLLBACK;

\echo ''
\echo '── Limpando carga...'
SET session_replication_role = replica;
DELETE FROM tickets WHERE tags @> ARRAY['scalebench'];
SET session_replication_role = DEFAULT;
ANALYZE tickets;
SELECT count(*) AS chamados_restantes FROM tickets;
