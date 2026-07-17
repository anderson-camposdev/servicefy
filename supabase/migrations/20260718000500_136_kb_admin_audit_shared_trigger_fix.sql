-- ============================================================
-- ServiceFY — Migration 136
-- Corrige bug pré-existente (herdado da migration 082, nunca
-- exercitado porque concessões restritas eram admin-only até
-- agora): tg_kb_admin_audit é a mesma função para knowledge_
-- articles/knowledge_categories/knowledge_article_grants, mas a
-- comparação de diff de conteúdo referenciava NEW.title (só
-- existe em knowledge_articles) numa expressão só protegida por
-- "AND" no mesmo IF — o PL/pgSQL resolve o tipo do campo no
-- preparo da expressão, então falha mesmo quando o AND deveria
-- curto-circuitar antes de chegar em NEW.title. A correção
-- aninha a comparação de diff num IF separado, só alcançado
-- quando TG_TABLE_NAME já é 'knowledge_articles'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_kb_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  v_id text := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_kb_contributor(v_company) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME = 'knowledge_articles' AND TG_OP = 'UPDATE' THEN
    IF (NEW.title, NEW.summary, NEW.body, NEW.category_id, NEW.service_domain_id,
        NEW.status, NEW.visibility, NEW.tags, NEW.scheduled_at)
       IS NOT DISTINCT FROM
       (OLD.title, OLD.summary, OLD.body, OLD.category_id, OLD.service_domain_id,
        OLD.status, OLD.visibility, OLD.tags, OLD.scheduled_at) THEN
      RETURN NEW;
    END IF;
  END IF;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL
    ELSE to_jsonb(OLD) - ARRAY['body','search_vector'] END;
  v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL
    ELSE to_jsonb(NEW) - ARRAY['body','search_vector'] END;

  PERFORM public.write_kb_audit_event(
    v_company,
    'kb.' || replace(TG_TABLE_NAME, 'knowledge_', '') || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_id,
    v_before,
    v_after
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
