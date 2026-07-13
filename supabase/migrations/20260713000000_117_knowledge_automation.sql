-- ServiceFY — Fase 20: Automação da Base de Conhecimento (KEDB, ITIL v4).
--
-- Fecha o loop iniciado na Fase 18 (resolution_code/resolution_notes/
-- kb_candidate) e na Fase 19 (consolidação de SLA): quando um analista marca
-- um ticket como candidato a KB e o resolve, um rascunho é gerado
-- automaticamente para revisão de um admin, em vez de depender de alguém
-- lembrar de criar o artigo manualmente depois.

-- ─── Rastreabilidade + dedupe: liga o artigo ao ticket que o originou ──────
-- Não existia vínculo knowledge_articles → tickets. knowledge_article_cases
-- liga a "cases", não a tickets, e nem todo ticket tem case_id preenchido —
-- não serve como chave de dedupe confiável. Nullable: não afeta artigos
-- manuais existentes.
ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS source_ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_source_ticket
  ON public.knowledge_articles(source_ticket_id)
  WHERE source_ticket_id IS NOT NULL;

COMMENT ON COLUMN public.knowledge_articles.source_ticket_id IS 'Fase 20: ticket que originou este artigo via automação de KEDB (kb_candidate=true na resolução). NULL para artigos escritos manualmente.';

-- ─── Automação: rascunho de KB ao resolver um ticket kb_candidate ──────────
CREATE OR REPLACE FUNCTION public.tg_generate_kb_draft_on_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_slug text;
  v_slug text;
  v_body text;
BEGIN
  -- Só a PRIMEIRA transição para um estado terminal gera rascunho — mesma
  -- condição de "primeira consolidação" usada na Fase 19
  -- (zzz_consolidate_sla_resolution), para não duplicar em reaberturas.
  IF NOT (NEW.state::text IN ('Resolved', 'Closed') AND OLD.state::text NOT IN ('Resolved', 'Closed')) THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(NEW.kb_candidate, false) THEN
    RETURN NEW;
  END IF;

  -- Dedupe: um ciclo reabrir → resolver de novo com kb_candidate ainda
  -- marcado não deve gerar um segundo rascunho para o mesmo ticket.
  IF EXISTS (SELECT 1 FROM public.knowledge_articles WHERE source_ticket_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_base_slug := lower(regexp_replace(COALESCE(NEW.short_description, 'artigo'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'artigo';
  END IF;
  -- Sufixo do número do ticket garante unicidade determinística contra
  -- knowledge_articles_company_id_slug_key sem precisar de retry-on-conflict
  -- (tickets.number já é único por tenant).
  v_slug := v_base_slug || '-' || lower(NEW.number);

  v_body := '## Problema' || E'\n\n'
    || COALESCE(NULLIF(trim(NEW.description), ''), NEW.short_description) || E'\n\n'
    || '## Solução Aplicada (' || COALESCE(NEW.resolution_code, 'Não especificado') || ')' || E'\n\n'
    || COALESCE(NEW.resolution_notes, '');

  INSERT INTO public.knowledge_articles (
    company_id, title, slug, summary, body, status, visibility, author_id, source_ticket_id
  ) VALUES (
    NEW.company_id,
    NEW.short_description,
    v_slug,
    'Rascunho gerado automaticamente a partir da resolução do ticket ' || NEW.number || '.',
    v_body,
    'draft',
    'internal',
    public.get_current_profile_id(),
    NEW.id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_generate_kb_draft_on_resolution() IS 'Fase 20 (KEDB): na primeira transição de um ticket para Resolved/Closed com kb_candidate=true, gera um rascunho (status=draft, visibility=internal) em knowledge_articles, herdando company_id do ticket. Idempotente por source_ticket_id — reaberturas não duplicam o rascunho.';

REVOKE ALL ON FUNCTION public.tg_generate_kb_draft_on_resolution() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_generate_kb_draft_on_resolution ON public.tickets;
CREATE TRIGGER trg_generate_kb_draft_on_resolution
  AFTER UPDATE OF state ON public.tickets
  FOR EACH ROW
  WHEN (NEW.state::text IN ('Resolved', 'Closed') AND OLD.state::text NOT IN ('Resolved', 'Closed'))
  EXECUTE FUNCTION public.tg_generate_kb_draft_on_resolution();
