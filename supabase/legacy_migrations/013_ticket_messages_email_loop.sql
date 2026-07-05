-- ============================================================
-- Flowfy ITSM — Migration 013
-- Comunicação bidirecional do chamado (chat + e-mail loop)
--
-- 1) Tabela ticket_messages (chat público + notas internas)
-- 2) RLS (isolamento por tenant/provedor; notas internas ocultas
--    de end_user) + Realtime
-- 3) Colunas de encerramento (close_code / close_notes) em incidents
-- 4) Trigger de Outbound Email: ao inserir comentário PÚBLICO de
--    analista, chama a Edge Function send-ticket-notification
-- ============================================================

-- ─── 1. Tabela de interações ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id   UUID,                      -- NULL = automação/sistema
  sender_name TEXT,
  actor_type  TEXT NOT NULL DEFAULT 'analyst' CHECK (actor_type IN ('analyst', 'user', 'system')),
  body        TEXT NOT NULL,             -- texto/HTML
  is_internal BOOLEAN NOT NULL DEFAULT false, -- true = Nota Técnica interna
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_incident ON public.ticket_messages(incident_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_company  ON public.ticket_messages(company_id);

COMMENT ON TABLE public.ticket_messages IS 'Interações do chamado: chat público (is_internal=false) e notas técnicas internas (is_internal=true).';

-- ─── 2. RLS ───────────────────────────────────────────────────
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Leitura: provedor OU mesma empresa; notas internas só para staff (não end_user).
DROP POLICY IF EXISTS select_ticket_messages ON public.ticket_messages;
CREATE POLICY select_ticket_messages ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
    AND (is_internal = false OR public.get_current_user_role() <> 'end_user')
  );

-- Escrita: provedor OU mesma empresa (a automação usa service_role e ignora RLS).
DROP POLICY IF EXISTS write_ticket_messages ON public.ticket_messages;
CREATE POLICY write_ticket_messages ON public.ticket_messages
  FOR ALL TO authenticated
  USING (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
  WITH CHECK (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id());

-- Realtime: publica a tabela para o canal do Supabase.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- já estava na publicação
END $$;

-- ─── 3. Colunas de encerramento (padrão ServiceNow) ───────────
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS close_code  TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS close_notes TEXT;

-- ─── 4. Outbound Email: trigger → Edge Function ───────────────
-- Usa pg_net para chamar a Edge Function send-ticket-notification.
-- A service_role key é lida do Vault (crie o segredo conforme nota).
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_ticket_message()
RETURNS TRIGGER AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Só dispara e-mail para comentário PÚBLICO de analista.
  IF NEW.actor_type = 'analyst' AND NEW.is_internal = false THEN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

    PERFORM net.http_post(
      url := 'https://enxtvrvsfwvcnpyspyfl.supabase.co/functions/v1/send-ticket-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_key, '')
      ),
      body := jsonb_build_object('record', to_jsonb(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_ticket_message ON public.ticket_messages;
CREATE TRIGGER trg_notify_ticket_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_message();

-- ────────────────────────────────────────────────────────────
-- NOTA DE SETUP (rodar uma vez):
--   1) Crie o segredo no Vault para o trigger autenticar na Edge Function:
--        SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--   2) Deploy das funções:
--        supabase functions deploy send-ticket-notification
--        supabase functions deploy handle-inbound-email
--   3) Configure os secrets das funções (RESEND_API_KEY, etc).
--   Alternativa ao trigger pg_net: criar um Database Webhook pela dashboard
--   apontando INSERT em public.ticket_messages → send-ticket-notification.
-- ────────────────────────────────────────────────────────────
