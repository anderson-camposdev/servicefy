-- ============================================================
-- Flowfy ITSM — Migration 022
-- Pendência com motivo: ao colocar o chamado como Pendente
-- (state = 'On Hold'), o analista informa o Motivo da Pendência.
-- ============================================================

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS pending_reason TEXT;

COMMENT ON COLUMN public.incidents.pending_reason IS
  'Motivo da pendência (Pendente pelo usuário / fornecedor / aprovação / projeto). Preenchido quando state = On Hold.';
