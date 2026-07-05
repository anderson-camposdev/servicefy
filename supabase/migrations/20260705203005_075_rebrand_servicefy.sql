-- ============================================================
-- ServiceFY ITSM — Migration 075
-- Atualiza defaults persistidos da marca sem reescrever migrations antigas.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.chatbot_config') IS NOT NULL THEN
    ALTER TABLE public.chatbot_config
      ALTER COLUMN bot_name SET DEFAULT 'ServiceFY Bot';

    UPDATE public.chatbot_config
       SET bot_name = 'ServiceFY Bot'
     WHERE bot_name = 'FlowfyBot';
  END IF;
END
$$;

COMMENT ON TABLE public.chatbot_config IS
  'Configuração multicanal do chatbot ServiceFY por tenant.';
