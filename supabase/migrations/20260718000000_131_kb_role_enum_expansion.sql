-- ServiceFY — Expansão do enum user_role para autoria/governança de KB e
-- privacidade de tickets por grupo solucionador.
--
-- Só adiciona os valores ao enum; nenhuma policy/RPC/CHECK os referencia
-- aqui (o Postgres não permite usar um valor de enum novo na mesma
-- transação/migration que o cria). Migrations seguintes (132+) podem usá-los
-- com segurança.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ops_manager';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'governance_manager';
