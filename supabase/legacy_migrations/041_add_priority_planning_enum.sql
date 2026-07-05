-- ============================================================
-- Flowfy ITSM — Migration 041
-- HOTFIX: adiciona 'P5 - Planning' ao ENUM public.ticket_priority.
--
-- Bug: a regra de prioridade ServiceNow (migration 039 + src/lib/priority.ts)
-- passou a produzir P5 - Planning (impacto e urgência BAIXOS). Porém a coluna
-- incidents.priority (e problems.priority) é do tipo ENUM public.ticket_priority,
-- que só tinha P1..P4. Qualquer UPDATE/INSERT com 'P5 - Planning' falhava com
--   invalid input value for enum ticket_priority: "P5 - Planning"
-- quebrando a Condução do Chamado (ex.: colocar um chamado baixo em Pendente)
-- e a abertura/edição de chamados P5.
--
-- Correção: estende o enum. Idempotente (ADD VALUE IF NOT EXISTS).
--
-- IMPORTANTE: rode esta migration FORA de um bloco BEGIN/COMMIT (statement
-- isolado). O SQL Editor do Supabase já executa assim. Não use o novo valor
-- na MESMA transação em que ele é criado.
-- ============================================================

ALTER TYPE public.ticket_priority ADD VALUE IF NOT EXISTS 'P5 - Planning';

-- Verificação:
--   SELECT unnest(enum_range(NULL::public.ticket_priority));
