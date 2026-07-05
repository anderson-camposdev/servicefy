-- ============================================================
-- Flowfy ITSM — Migration 022
-- Matriz de Prioridade ITIL (Impacto x Urgência) & Auto-Close Dinâmico
-- ============================================================

-- ─── 1. Colunas de Impacto e Urgência na tabela public.incidents ───
ALTER TABLE public.incidents 
  ADD COLUMN IF NOT EXISTS impact text CHECK (impact IN ('Low', 'Medium', 'High', 'Critical')),
  ADD COLUMN IF NOT EXISTS urgency text CHECK (urgency IN ('Low', 'Medium', 'High'));

-- ─── 2. Tabela de Configurações Globais do Sistema (system_settings) ───
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Habilitar RLS para system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para system_settings
DROP POLICY IF EXISTS select_system_settings ON public.system_settings;
CREATE POLICY select_system_settings ON public.system_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS write_system_settings ON public.system_settings;
CREATE POLICY write_system_settings ON public.system_settings
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin() 
    OR public.get_current_user_role() = 'sysadmin'
  );

-- Valor padrão para auto_close_hours (72 horas)
INSERT INTO public.system_settings (key, value, description)
VALUES ('auto_close_hours', '72', 'Tempo em horas para fechamento automático de chamados Resolvidos')
ON CONFLICT (key) DO NOTHING;

-- ─── 3. Função de Cálculo da Matriz ITIL no Banco de Dados ───
CREATE OR REPLACE FUNCTION public.calculate_incident_priority(impact text, urgency text)
RETURNS public.ticket_priority AS $$
BEGIN
  -- Matrix:
  -- Critical Impact: High/Medium Urgency -> P1, Low Urgency -> P2
  IF impact = 'Critical' THEN
    IF urgency = 'High' OR urgency = 'Medium' THEN
      RETURN 'P1 - Critical'::public.ticket_priority;
    ELSE
      RETURN 'P2 - High'::public.ticket_priority;
    END IF;
  -- High Impact: High Urgency -> P1, Medium Urgency -> P2, Low Urgency -> P3
  ELSIF impact = 'High' THEN
    IF urgency = 'High' THEN
      RETURN 'P1 - Critical'::public.ticket_priority;
    ELSIF urgency = 'Medium' THEN
      RETURN 'P2 - High'::public.ticket_priority;
    ELSE
      RETURN 'P3 - Moderate'::public.ticket_priority;
    END IF;
  -- Medium Impact: High Urgency -> P2, Medium Urgency -> P3, Low Urgency -> P4
  ELSIF impact = 'Medium' THEN
    IF urgency = 'High' THEN
      RETURN 'P2 - High'::public.ticket_priority;
    ELSIF urgency = 'Medium' THEN
      RETURN 'P3 - Moderate'::public.ticket_priority;
    ELSE
      RETURN 'P4 - Low'::public.ticket_priority;
    END IF;
  -- Low Impact: High Urgency -> P3, Medium/Low Urgency -> P4
  ELSIF impact = 'Low' THEN
    IF urgency = 'High' THEN
      RETURN 'P3 - Moderate'::public.ticket_priority;
    ELSE
      RETURN 'P4 - Low'::public.ticket_priority;
    END IF;
  END IF;

  -- Fallback
  RETURN 'P3 - Moderate'::public.ticket_priority;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── 4. Gatilho (Trigger) para Atualização Automática de Prioridade ───
CREATE OR REPLACE FUNCTION public.trg_set_incident_priority()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.impact IS NOT NULL AND NEW.urgency IS NOT NULL THEN
    NEW.priority := public.calculate_incident_priority(NEW.impact, NEW.urgency);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_incident_priority_trigger ON public.incidents;
CREATE TRIGGER set_incident_priority_trigger
  BEFORE INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_incident_priority();

-- ─── 5. Atualização da Automação de Auto-Close Parametrizável ───
CREATE OR REPLACE FUNCTION public.auto_close_resolved_incidents()
RETURNS void AS $$
DECLARE
  v_hours integer;
BEGIN
  -- Busca a configuração de horas para auto-close na tabela system_settings
  SELECT COALESCE(NULLIF(value, '')::integer, 72) INTO v_hours
    FROM public.system_settings
   WHERE key = 'auto_close_hours';

  IF v_hours IS NULL THEN
    v_hours := 72;
  END IF;

  -- Atualiza chamados com estado 'Resolved' resolvidos há mais de v_hours horas
  UPDATE public.incidents
     SET state = 'Closed',
         closed_at = now()
   WHERE state = 'Resolved'
     AND resolved_at IS NOT NULL
     AND resolved_at <= now() - make_interval(hours => v_hours);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
