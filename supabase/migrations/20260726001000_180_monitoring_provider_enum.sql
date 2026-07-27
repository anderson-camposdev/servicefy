-- ============================================================
-- 180 — Novo tipo de conexão: Monitoramento
--
-- Precisa ficar SOZINHA nesta migration: o PostgreSQL não permite usar um
-- valor de enum recém-adicionado na mesma transação em que ele foi criado.
-- A migration 181 é quem passa a usá-lo.
--
-- Por que um provider próprio em vez de regra na conexão de e-mail:
-- alerta de monitoramento não é conversa com pessoa. Colocar "expressão de
-- correlação" na conexão que recebe e-mail de cliente confundiria quem
-- configura, e o modelo ficaria desonesto sobre o que cada coisa é.
-- ============================================================

ALTER TYPE public.channel_provider ADD VALUE IF NOT EXISTS 'monitoring';
