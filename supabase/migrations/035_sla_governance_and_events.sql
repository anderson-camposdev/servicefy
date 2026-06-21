-- ============================================================
-- Flowfy ITSM — Migration 035
-- Motor de SLA (4/5): GOVERNANÇA DE PAUSA + LEDGER DE EVENTOS +
-- ENGINE DE BREACH (estouro de prazo).
--
-- Entrega:
--   1. pending_reasons (motivos de pendência por tenant) + seed
--      + incidents.pending_reason_id
--   2. sla_events (livro-caixa auditável) + triggers automáticos
--      (nascimento, resposta, pausa/retomada, breach)
--   3. is_response_breached / is_resolution_breached + procedure
--      check_sla_breaches() + agendamento pg_cron (pronto/comentado)
--
-- Depende das migrations 032 (calendário), 033 (deadlines) e
-- 034 (paused_at / acumulador). Totalmente idempotente.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. MOTIVOS DE PENDÊNCIA (pending_reasons)
-- ════════════════════════════════════════════════════════════
-- Pode existir uma tabela LEGADA com formato incompatível (label/pauses_sla,
-- sem slug). Ela não é usada pela aplicação, então recriamos no formato do
-- motor. DROP + CREATE mantém a migration re-executável.
DROP TABLE IF EXISTS public.pending_reasons CASCADE;
CREATE TABLE public.pending_reasons (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  slug                     TEXT NOT NULL,
  requires_customer_action BOOLEAN NOT NULL DEFAULT false,
  active                   BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pending_reasons_company ON public.pending_reasons(company_id);

-- Vínculo do motivo no chamado (preenchido quando state = 'On Hold').
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS pending_reason_id UUID
    REFERENCES public.pending_reasons(id) ON DELETE SET NULL;

-- Seed padrão por tenant (idempotente).
INSERT INTO public.pending_reasons (company_id, name, slug, requires_customer_action)
SELECT c.id, r.name, r.slug, r.rca
  FROM public.companies c
  CROSS JOIN (VALUES
    ('Aguardando Usuário',    'aguardando-usuario',    true),
    ('Aguardando Fornecedor', 'aguardando-fornecedor', false),
    ('Aguardando Aprovação',  'aguardando-aprovacao',  false)
  ) AS r(name, slug, rca)
ON CONFLICT (company_id, slug) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 2. LIVRO-CAIXA DE SLA (sla_events)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sla_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'response_start', 'response_achieved', 'resolution_start',
    'paused', 'resumed', 'breached'
  )),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sla_events_incident ON public.sla_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_sla_events_type     ON public.sla_events(event_type);

-- Helper centralizado de gravação no ledger.
CREATE OR REPLACE FUNCTION public.sla_log_event(
  p_incident_id UUID,
  p_event_type  TEXT,
  p_metadata    JSONB DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.sla_events (incident_id, event_type, metadata)
  VALUES (p_incident_id, p_event_type, COALESCE(p_metadata, '{}'::jsonb));
$$;

-- Constante reutilizável dos estados de pausa.
CREATE OR REPLACE FUNCTION public.sla_is_paused_state(p_state TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_state = ANY (ARRAY['On Hold', 'Pending User']); $$;

-- ─── 2a. Eventos no NASCIMENTO do chamado ────────────────────
CREATE OR REPLACE FUNCTION public.tg_sla_events_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Relógio de solução sempre arranca na criação.
  PERFORM public.sla_log_event(
    NEW.id, 'resolution_start',
    jsonb_build_object('deadline', NEW.sla_resolution_deadline, 'priority_level', NEW.priority_level)
  );

  IF NEW.responded_at IS NULL THEN
    PERFORM public.sla_log_event(
      NEW.id, 'response_start',
      jsonb_build_object('deadline', NEW.sla_response_deadline)
    );
  ELSE
    -- Aberto já "Em Atendimento" (abertura manual com início imediato):
    -- resposta liquidada no mesmo instante da criação.
    PERFORM public.sla_log_event(
      NEW.id, 'response_achieved',
      jsonb_build_object('at', NEW.responded_at, 'on_creation', true)
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_sla_events_on_insert ON public.incidents;
CREATE TRIGGER tg_sla_events_on_insert
  AFTER INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sla_events_on_insert();

-- ─── 2b. Eventos de RESPOSTA e PAUSA/RETOMADA ────────────────
CREATE OR REPLACE FUNCTION public.tg_sla_events_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Resposta atingida (primeira resposta do analista).
  IF OLD.responded_at IS NULL AND NEW.responded_at IS NOT NULL THEN
    PERFORM public.sla_log_event(
      NEW.id, 'response_achieved',
      jsonb_build_object('at', NEW.responded_at)
    );
  END IF;

  -- Transições de pausa (o BEFORE trigger da 034 já ajustou os prazos).
  IF OLD.state IS DISTINCT FROM NEW.state THEN
    IF public.sla_is_paused_state(NEW.state) AND NOT public.sla_is_paused_state(OLD.state) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'paused',
        jsonb_build_object('state', NEW.state, 'reason_id', NEW.pending_reason_id, 'at', NEW.paused_at)
      );
    ELSIF public.sla_is_paused_state(OLD.state) AND NOT public.sla_is_paused_state(NEW.state) THEN
      PERFORM public.sla_log_event(
        NEW.id, 'resumed',
        jsonb_build_object(
          'state', NEW.state,
          'accumulated_paused_minutes', NEW.accumulated_paused_time_minutes,
          'resolution_deadline', NEW.sla_resolution_deadline
        )
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Escopo restrito a state/responded_at: updates de breach NÃO disparam aqui.
DROP TRIGGER IF EXISTS tg_sla_events_on_update ON public.incidents;
CREATE TRIGGER tg_sla_events_on_update
  AFTER UPDATE OF state, responded_at ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sla_events_on_update();

-- ════════════════════════════════════════════════════════════
-- 3. ENGINE DE BREACH (estouro de prazo)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS is_response_breached   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_resolution_breached BOOLEAN NOT NULL DEFAULT false;

-- Varre chamados abertos e NÃO pausados cujo prazo já venceu, marca os
-- booleanos e grava o evento 'breached' no ledger. Idempotente: só age
-- na primeira vez (guarda is_*_breached = false).
CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  -- (A) Estouro de RESPOSTA: ainda não respondido e prazo vencido.
  FOR v_rec IN
    SELECT id FROM public.incidents
     WHERE state NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND responded_at IS NULL
       AND is_response_breached = false
       AND sla_response_deadline IS NOT NULL
       AND sla_response_deadline < now()
  LOOP
    UPDATE public.incidents
       SET is_response_breached = true
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'response'));
  END LOOP;

  -- (B) Estouro de SOLUÇÃO: ainda não resolvido e prazo vencido.
  FOR v_rec IN
    SELECT id FROM public.incidents
     WHERE state NOT IN ('Resolved', 'Closed')
       AND paused_at IS NULL
       AND resolved_at IS NULL
       AND is_resolution_breached = false
       AND sla_resolution_deadline IS NOT NULL
       AND sla_resolution_deadline < now()
  LOOP
    UPDATE public.incidents
       SET is_resolution_breached = true,
           sla_breached           = true   -- compat. com KPIs existentes
     WHERE id = v_rec.id;
    PERFORM public.sla_log_event(v_rec.id, 'breached', jsonb_build_object('kind', 'resolution'));
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_sla_breaches() IS
  'Marca is_response_breached/is_resolution_breached e registra evento breached para chamados abertos, não pausados, com prazo vencido.';

-- ─── Agendamento pg_cron (PRONTO / COMENTADO) ────────────────
-- A extensão pg_cron já é habilitada na migration 018. Para ativar a
-- varredura de estouro a cada 1 minuto, basta DESCOMENTAR o bloco abaixo
-- e executá-lo (idempotente: remove o job anterior antes de reagendar).
--
-- DO $$
-- BEGIN
--   PERFORM cron.unschedule('check-sla-breaches');
-- EXCEPTION WHEN OTHERS THEN
--   NULL; -- nenhum job anterior
-- END $$;
--
-- SELECT cron.schedule(
--   'check-sla-breaches',
--   '* * * * *',                      -- a cada 1 minuto
--   $$ SELECT public.check_sla_breaches(); $$
-- );

-- ════════════════════════════════════════════════════════════
-- 4. RLS + GRANTs
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.pending_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_events      ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_reasons TO authenticated;
GRANT SELECT                          ON public.sla_events      TO authenticated;

-- pending_reasons: leitura por tenant; escrita por admin do tenant ou MSP.
DROP POLICY IF EXISTS select_pending_reasons ON public.pending_reasons;
CREATE POLICY select_pending_reasons ON public.pending_reasons
  FOR SELECT TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());
DROP POLICY IF EXISTS write_pending_reasons ON public.pending_reasons;
CREATE POLICY write_pending_reasons ON public.pending_reasons
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')))
  WITH CHECK (public.is_current_user_msp_admin() OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin')));

-- sla_events: leitura por tenant (via join ao chamado). Escrita só pelas
-- funções SECURITY DEFINER acima (sem policy de INSERT para authenticated).
DROP POLICY IF EXISTS select_sla_events ON public.sla_events;
CREATE POLICY select_sla_events ON public.sla_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.incidents i
     WHERE i.id = incident_id
       AND (public.is_current_user_msp_admin() OR i.company_id = public.get_current_user_company_id())
  ));

-- ────────────────────────────────────────────────────────────
-- Verificação:
--   SELECT name, slug, requires_customer_action FROM public.pending_reasons ORDER BY company_id, slug;
--   SELECT event_type, metadata, created_at FROM public.sla_events ORDER BY created_at DESC LIMIT 20;
--   SELECT public.check_sla_breaches();
--   SELECT number, is_response_breached, is_resolution_breached FROM public.incidents
--    WHERE is_response_breached OR is_resolution_breached;
-- ────────────────────────────────────────────────────────────
