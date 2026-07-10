-- ============================================================================
-- ServiceFY ITSM — Migration 097
-- Implementação de Trigger de Disparo em Tempo Real para a Fila de Automações
--
-- Esta migração resolve o gargalo de latência (de até 59 segundos) para ações
-- de fluxo de automação imediatas (sem delay de agendamento futuro).
--
-- A extensão 'pg_net' do Supabase é utilizada de forma ASSÍNCRONA via a função
-- 'net.http_post'. Isso garante que a chamada HTTP para a Edge Function
-- 'run-workflow-actions' ocorra fora do ciclo de vida bloqueante da transação
-- principal do banco de dados, evitando qualquer impacto em performance.
--
-- Restrições/Segurança:
-- 1. Apenas dispara se o status for 'pending' e a ação for imediata (run_after <= clock_timestamp()).
-- 2. Credenciais de service_role são extraídas com segurança a partir da tabela
--    de segredos descriptografados do Vault ('vault.decrypted_secrets'), sem
--    exposição em texto puro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_trigger_workflow_realtime_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_url    TEXT := 'https://enxtvrvsfwvcnpyspyfl.supabase.co/functions/v1/run-workflow-actions';
BEGIN
  -- Dispara apenas para ações pendentes cujo tempo de agendamento já passou ou é imediato.
  -- Ações futuras com delay agendado não entram aqui e serão drenadas normalmente pelo pg_cron.
  IF NEW.status = 'pending' AND (NEW.run_after IS NULL OR NEW.run_after <= clock_timestamp()) THEN
    -- Obter de forma segura a service_role_key a partir do Vault do Supabase
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
     WHERE name = 'service_role_key'
     LIMIT 1;

    -- Chamada HTTP assíncrona não bloqueante: pg_net enfileira a requisição localmente
    -- e a envia em background, liberando a transação do banco imediatamente.
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_secret, '')
      ),
      body := '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Criar a trigger para interceptar novas inserções na fila
DROP TRIGGER IF EXISTS tg_workflow_realtime_insertion ON public.workflow_action_queue;
CREATE TRIGGER tg_workflow_realtime_insertion
  AFTER INSERT ON public.workflow_action_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trigger_workflow_realtime_notify();
