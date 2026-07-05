-- ============================================================
-- Flowfy ITSM — Migration 074
-- Quick wins: CSAT pós-resolução + macros compartilhadas.
-- ============================================================

-- ─── 1. CSAT ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.csat_surveys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id   UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  requester_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'expired')),
  rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id)
);

CREATE INDEX IF NOT EXISTS idx_csat_company_submitted
  ON public.csat_surveys (company_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_csat_requester_pending
  ON public.csat_surveys (requester_id, status);

CREATE OR REPLACE FUNCTION public.tg_create_csat_on_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.state::text = 'Resolved'
     AND OLD.state::text IS DISTINCT FROM 'Resolved'
     AND NEW.caller_id IS NOT NULL THEN
    INSERT INTO public.csat_surveys (company_id, incident_id, requester_id)
    VALUES (NEW.company_id, NEW.id, NEW.caller_id)
    ON CONFLICT (incident_id) DO UPDATE
      SET status = 'pending', rating = NULL, comment = NULL,
          sent_at = now(), submitted_at = NULL
      WHERE csat_surveys.status = 'expired';

    INSERT INTO public.notifications
      (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
    VALUES
      (NEW.caller_id, 'Como foi o atendimento?',
       'Avalie o atendimento do chamado ' || NEW.number || '.',
       'info', NEW.id, NEW.ticket_type);
  ELSIF OLD.state::text IN ('Resolved', 'Closed')
        AND NEW.state::text NOT IN ('Resolved', 'Closed') THEN
    UPDATE public.csat_surveys
       SET status = 'expired'
     WHERE incident_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_create_csat_on_resolution ON public.incidents;
CREATE TRIGGER tg_create_csat_on_resolution
  AFTER UPDATE OF state ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_create_csat_on_resolution();

-- Chamados já resolvidos recebem pesquisa apenas se ainda não houver uma.
INSERT INTO public.csat_surveys (company_id, incident_id, requester_id, sent_at)
SELECT company_id, id, caller_id, COALESCE(resolved_at, now())
FROM public.incidents
WHERE state::text = 'Resolved' AND caller_id IS NOT NULL
ON CONFLICT (incident_id) DO NOTHING;

ALTER TABLE public.csat_surveys ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.csat_surveys TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.csat_surveys FROM PUBLIC, authenticated;

DROP POLICY IF EXISTS select_csat_surveys ON public.csat_surveys;
CREATE POLICY select_csat_surveys ON public.csat_surveys
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR requester_id = public.get_current_profile_id()
    OR (company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() <> 'end_user')
  );

CREATE OR REPLACE FUNCTION public.submit_csat(
  p_survey_id UUID,
  p_rating SMALLINT,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.csat_surveys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.get_current_profile_id();
  v_survey public.csat_surveys;
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'A nota deve estar entre 1 e 5';
  END IF;

  SELECT * INTO v_survey FROM public.csat_surveys
  WHERE id = p_survey_id FOR UPDATE;

  IF v_survey.id IS NULL OR v_survey.requester_id IS DISTINCT FROM v_profile_id THEN
    RAISE EXCEPTION 'Pesquisa não pertence ao usuário autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_survey.status <> 'pending' THEN
    RAISE EXCEPTION 'Pesquisa já respondida ou expirada';
  END IF;

  UPDATE public.csat_surveys
     SET status = 'submitted', rating = p_rating,
         comment = NULLIF(trim(p_comment), ''), submitted_at = now()
   WHERE id = p_survey_id
   RETURNING * INTO v_survey;
  RETURN v_survey;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_csat(UUID, SMALLINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_csat(UUID, SMALLINT, TEXT) TO authenticated;

-- ─── 2. Macros compartilhadas ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.response_macros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  body          TEXT NOT NULL,
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'both')),
  active        BOOLEAN NOT NULL DEFAULT true,
  usage_count   INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_response_macros_company
  ON public.response_macros (company_id, active, name);

ALTER TABLE public.response_macros ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.response_macros TO authenticated;

DROP POLICY IF EXISTS select_response_macros ON public.response_macros;
CREATE POLICY select_response_macros ON public.response_macros
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id()
        AND public.is_current_user_ticket_staff())
  );

DROP POLICY IF EXISTS write_response_macros ON public.response_macros;
CREATE POLICY write_response_macros ON public.response_macros
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'it_manager'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() IN ('sysadmin', 'company_admin', 'it_manager'))
  );

INSERT INTO public.response_macros (company_id, name, body, visibility)
SELECT id, 'Recebemos seu chamado',
       'Olá {{usuario.nome}}, recebemos o chamado {{chamado.numero}} e já iniciamos a análise.',
       'public'
FROM public.companies
ON CONFLICT (company_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_response_macros()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.response_macros (company_id, name, body, visibility) VALUES
    (NEW.id, 'Recebemos seu chamado',
     'Olá {{usuario.nome}}, recebemos o chamado {{chamado.numero}} e já iniciamos a análise.', 'public'),
    (NEW.id, 'Solicitar mais informações',
     'Olá {{usuario.nome}}, precisamos de mais informações para continuar o atendimento do chamado {{chamado.numero}}. Poderia enviar detalhes ou evidências adicionais?', 'public'),
    (NEW.id, 'Nota técnica de investigação',
     'Investigação em andamento. Validar logs, horário da ocorrência e alterações recentes antes da próxima atualização.', 'internal')
  ON CONFLICT (company_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_seed_default_response_macros ON public.companies;
CREATE TRIGGER tg_seed_default_response_macros
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_response_macros();

INSERT INTO public.response_macros (company_id, name, body, visibility)
SELECT id, 'Solicitar mais informações',
       'Olá {{usuario.nome}}, precisamos de mais informações para continuar o atendimento do chamado {{chamado.numero}}. Poderia enviar detalhes ou evidências adicionais?',
       'public'
FROM public.companies
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO public.response_macros (company_id, name, body, visibility)
SELECT id, 'Nota técnica de investigação',
       'Investigação em andamento. Validar logs, horário da ocorrência e alterações recentes antes da próxima atualização.',
       'internal'
FROM public.companies
ON CONFLICT (company_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_response_macro_use(p_macro_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.response_macros
     SET usage_count = usage_count + 1, updated_at = now()
   WHERE id = p_macro_id
     AND active = true
     AND (public.is_current_user_msp_admin()
          OR (company_id = public.get_current_user_company_id()
              AND public.is_current_user_ticket_staff()));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Macro não encontrada ou sem permissão' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_response_macro_use(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_response_macro_use(UUID) TO authenticated;
