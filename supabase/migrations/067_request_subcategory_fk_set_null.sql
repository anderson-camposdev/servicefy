-- ============================================================
-- Flowfy ITSM — Migration 067
-- Excluir uma subcategoria NÃO pode apagar os itens dela.
--
-- A FK request_items.request_subcategory_id era ON DELETE CASCADE
-- (migration 047): excluir uma subcategoria deletava silenciosamente
-- todos os itens de requisição vinculados. Passa a SET NULL: os
-- itens ficam "sem subcategoria" e continuam acessíveis no portal
-- pelo fallback (card "Outros" / lista direta da categoria).
-- ============================================================

ALTER TABLE public.request_items
  DROP CONSTRAINT IF EXISTS request_items_request_subcategory_id_fkey;

ALTER TABLE public.request_items
  ADD CONSTRAINT request_items_request_subcategory_id_fkey
  FOREIGN KEY (request_subcategory_id)
  REFERENCES public.request_subcategories(id)
  ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT confdeltype FROM pg_constraint
--    WHERE conname = 'request_items_request_subcategory_id_fkey'; -- 'n' = SET NULL
-- ────────────────────────────────────────────────────────────
