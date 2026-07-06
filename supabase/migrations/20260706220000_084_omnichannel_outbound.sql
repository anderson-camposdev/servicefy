-- ServiceFY — Omnichannel OUTBOUND: enfileiramento, worker e triagem operacional.
--
-- Fecha o laço iniciado pela 083 (inbound → incidente): a resposta pública do
-- analista volta pelo canal de origem. A fila channel_outbox (criada na 077)
-- ganha produtor (trigger) e consumidor (RPCs de claim/complete + cron→edge).
-- Envio real por provedor fica como estrutura (edge dispatch-channel-outbox);
-- nenhuma credencial é manipulada aqui.
--
-- Reutiliza padrões: SECURITY DEFINER restrito a service_role (modelo
-- materialize_channel_message, 083); is_settings_admin + write_admin_audit (076);
-- cron + net.http_post com service_role do Vault (modelo 060).

-- ─── 1. Idempotência do enfileiramento ───────────────────────────────────────
ALTER TABLE public.channel_outbox
  ADD COLUMN IF NOT EXISTS source_ticket_message_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_outbox_source_message
  ON public.channel_outbox(source_ticket_message_id)
  WHERE source_ticket_message_id IS NOT NULL;

-- ─── 2. Trigger: resposta pública do analista → outbox ───────────────────────
-- SECURITY DEFINER: o INSERT parte de um analista autenticado, mas channel_outbox
-- é escrita apenas por processos de sistema; o trigger roda como owner e ignora a
-- RLS da fila. Só enfileira quando o incidente tem conversa de canal ativa.
CREATE OR REPLACE FUNCTION public.tg_enqueue_channel_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv        record;
  v_identity    record;
BEGIN
  IF NEW.actor_type <> 'analyst' OR COALESCE(NEW.is_internal, false) OR NEW.incident_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Conversa de canal vinculada ao incidente, com conexão habilitada.
  SELECT c.id, c.company_id, c.connection_id, c.subject, c.requester_identity_id
    INTO v_conv
    FROM public.conversations c
    JOIN public.channel_connections cc ON cc.id = c.connection_id
   WHERE c.incident_id = NEW.incident_id
     AND cc.enabled
   ORDER BY c.last_message_at DESC NULLS LAST
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW; -- ticket sem origem de canal (ex.: portal) → fluxo legado
  END IF;

  SELECT external_id, email, phone_e164, display_name
    INTO v_identity
    FROM public.external_identities
   WHERE id = v_conv.requester_identity_id;

  INSERT INTO public.channel_outbox(
    company_id, connection_id, conversation_id, correlation_id,
    source_ticket_message_id, payload, status, next_attempt_at
  ) VALUES (
    v_conv.company_id, v_conv.connection_id, v_conv.id, gen_random_uuid(),
    NEW.id,
    jsonb_build_object(
      'subject', v_conv.subject,
      'body', NEW.body,
      'to', jsonb_build_object(
        'external_id', v_identity.external_id,
        'email', v_identity.email,
        'phone', v_identity.phone_e164,
        'display_name', v_identity.display_name
      )
    ),
    'pending', now()
  )
  ON CONFLICT (source_ticket_message_id) WHERE source_ticket_message_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_channel_reply ON public.ticket_messages;
CREATE TRIGGER trg_enqueue_channel_reply
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_channel_reply();

-- ─── 3. Worker: claim (SKIP LOCKED) e complete (backoff/dead_letter) ─────────
-- Restritas a service_role, como materialize_channel_message. Nunca expostas ao
-- cliente autenticado. claim NÃO retorna o segredo — apenas vault_secret_id.
CREATE OR REPLACE FUNCTION public.claim_channel_outbox(p_limit integer DEFAULT 25)
RETURNS TABLE (
  id uuid, connection_id uuid, conversation_id uuid, company_id uuid,
  provider public.channel_provider, vault_secret_id uuid, attempt_count integer,
  payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker omnichannel' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
      FROM public.channel_outbox o
     WHERE o.status = 'pending' AND o.next_attempt_at <= now()
     ORDER BY o.next_attempt_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  )
  UPDATE public.channel_outbox o
     SET status = 'processing', locked_at = now(), attempt_count = o.attempt_count + 1
    FROM claimed
    JOIN public.channel_connections cc ON true
   WHERE o.id = claimed.id AND cc.id = o.connection_id
  RETURNING o.id, o.connection_id, o.conversation_id, o.company_id,
            cc.provider, cc.vault_secret_id, o.attempt_count, o.payload;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_channel_outbox(integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_channel_outbox(
  p_id uuid,
  p_status text,
  p_provider_event_id text DEFAULT NULL,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.channel_outbox;
  v_max_attempts constant integer := 6;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao worker omnichannel' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.channel_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de outbox inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'sent' THEN
    UPDATE public.channel_outbox
       SET status = 'sent', locked_at = NULL, last_error = NULL
     WHERE id = p_id;
  ELSIF p_status = 'not_configured' THEN
    -- Provedor sem integração real ainda: encerra sem retry infinito.
    UPDATE public.channel_outbox
       SET status = 'dead_letter', locked_at = NULL,
           last_error = COALESCE(p_error, 'Integração do provedor ainda não configurada')
     WHERE id = p_id;
  ELSE
    -- Falha transitória: backoff exponencial até o teto; depois dead_letter.
    IF v_row.attempt_count >= v_max_attempts THEN
      UPDATE public.channel_outbox
         SET status = 'dead_letter', locked_at = NULL, last_error = p_error
       WHERE id = p_id;
    ELSE
      UPDATE public.channel_outbox
         SET status = 'pending', locked_at = NULL, last_error = p_error,
             next_attempt_at = now() + (interval '1 minute' * power(2, v_row.attempt_count))
       WHERE id = p_id;
    END IF;
  END IF;

  INSERT INTO public.channel_delivery_events(company_id, message_id, status, provider_event_id, error_code, error_message, payload)
  SELECT v_row.company_id, cm.id,
         (CASE WHEN p_status = 'sent' THEN 'sent' ELSE 'failed' END)::public.delivery_status,
         p_provider_event_id, NULL, p_error, jsonb_build_object('outbox_id', p_id, 'result', p_status)
    FROM public.channel_messages cm
   WHERE cm.ticket_message_id = v_row.source_ticket_message_id
   LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_channel_outbox(uuid, text, text, text) FROM public, anon, authenticated;

-- ─── 4. Triagem operacional (UI admin) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_channel_triage(
  p_id uuid,
  p_action text,
  p_target_company_id uuid DEFAULT NULL
) RETURNS public.channel_triage_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.channel_triage_events;
  v_status text;
BEGIN
  IF p_action NOT IN ('assigned', 'discarded', 'reprocessed') THEN
    RAISE EXCEPTION 'Ação de triagem inválida: %', p_action USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.channel_triage_events WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento de triagem inexistente' USING ERRCODE = 'P0002';
  END IF;

  -- Autorização: admin do tenant do evento; se atribuir a outro tenant, admin do destino.
  IF NOT public.is_settings_admin(v_row.company_id)
     AND NOT (p_target_company_id IS NOT NULL AND public.is_settings_admin(p_target_company_id)) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;

  v_status := p_action;

  UPDATE public.channel_triage_events
     SET status = v_status,
         resolved_company_id = CASE WHEN p_action = 'assigned' THEN p_target_company_id ELSE resolved_company_id END,
         resolved_by = public.get_current_profile_id(),
         resolved_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  PERFORM public.write_admin_audit(
    v_row.company_id, 'omnichannel.triage.' || p_action, 'channel_triage_event', p_id::text,
    NULL, jsonb_build_object('action', p_action, 'target_company_id', p_target_company_id));

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_channel_triage(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_channel_triage(uuid, text, uuid) TO authenticated;

-- ─── 5. Agendamento do worker (pg_cron → edge function) ──────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-channel-outbox');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'dispatch-channel-outbox',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://enxtvrvsfwvcnpyspyfl.supabase.co/functions/v1/dispatch-channel-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1), ''
        )
      ),
      body := '{}'::jsonb
    );
  $$
);

-- ─── Verificação (comentada) ─────────────────────────────────────────────────
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enqueue_channel_reply';
--   SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE '%channel_outbox%' OR proname='resolve_channel_triage';
--   SELECT jobname FROM cron.job WHERE jobname = 'dispatch-channel-outbox';
