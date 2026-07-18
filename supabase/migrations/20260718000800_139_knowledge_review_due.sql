-- ============================================================
-- ServiceFY — Migration 139
-- Revisão programada de conteúdo da KB: um artigo operacional
-- envelhece; review_due_at registra até quando o conteúdo é
-- considerado confiável. O editor exibe "Revisão vencida" após a
-- data, e a governança usa isso para priorizar manutenção da base.
-- Coluna aditiva, coberta pelas policies existentes de
-- knowledge_articles (leitura via can_read_knowledge_article,
-- escrita via knowledge_author_insert/update, migration 132).
-- ============================================================

ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS review_due_at date;

COMMENT ON COLUMN public.knowledge_articles.review_due_at IS
  'Data-limite de validade editorial do artigo. Após esta data a UI sinaliza "Revisão vencida"; não bloqueia leitura.';

CREATE INDEX IF NOT EXISTS idx_kb_articles_review_due
  ON public.knowledge_articles(company_id, review_due_at)
  WHERE review_due_at IS NOT NULL;
