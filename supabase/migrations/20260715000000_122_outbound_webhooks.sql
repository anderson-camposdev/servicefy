-- ServiceFY — Fase 25: API Pública e Webhooks Outbound.
--
-- Reaproveita o padrão de fila já comprovado em workflow_action_queue/
-- workflow_claim_queue_batch (FOR UPDATE SKIP LOCKED, lease de 5 min,
-- backoff, HMAC-SHA256, timeout de 10s) — ver análise no commit para a
-- estratégia completa de não deixar um webhook lento degradar o banco. A
-- ideia central: a trigger só faz um INSERT barato (sem I/O de rede); toda a
-- chamada HTTP acontece fora de banda, no runtime Deno da Edge Function,
-- nunca segurando uma conexão do Postgres.

-- ─── 1) outbound_webhooks — assinaturas cadastradas pelo tenant ────────────
CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  events_subscribed text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  -- Segredo HMAC por webhook (não por tenant) em Vault, não em texto puro —
  -- um tenant pode cadastrar várias URLs; um segredo compartilhado entre
  -- todas significaria que vazar a credencial de um destino compromete os
  -- demais. Mesmo padrão já usado em channel_connections.vault_secret_id.
  vault_secret_id uuid,
  -- Disjuntor: desativado automaticamente após muitas falhas consecutivas,
  -- para não consumir uma vaga do lote do dispatcher a cada tick do cron
  -- indefinidamente por um endpoint permanentemente quebrado.
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_webhooks_target_url_https CHECK (target_url ~ '^https://'),
  CONSTRAINT outbound_webhooks_events_known CHECK (events_subscribed <@ ARRAY['ticket.created','ticket.resolved']::text[])
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_company ON public.outbound_webhooks(company_id);

ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY outbound_webhooks_admin ON public.outbound_webhooks
  FOR ALL TO authenticated
  USING (public.is_settings_admin(company_id))
  WITH CHECK (public.is_settings_admin(company_id));

-- ─── 2) webhook_events_queue — uma linha por (evento, assinante) ───────────
-- Uma linha por assinante casado, não uma linha por evento com lista de
-- destinos — cada entrega tem seu próprio retry/attempts/status, igual ao
-- modelo de entrega do Stripe/GitHub.
CREATE TABLE IF NOT EXISTS public.webhook_events_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  last_error text,
  claimed_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_queue_status_check CHECK (status IN ('pending','processing','done','failed'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_company ON public.webhook_events_queue(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_pending ON public.webhook_events_queue(status, run_after) WHERE status = 'pending';

ALTER TABLE public.webhook_events_queue ENABLE ROW LEVEL SECURITY;

-- Somente leitura para admins (histórico de entrega na tela de
-- Configurações de Desenvolvedor) — escrita só via trigger SECURITY DEFINER
-- e via service_role no dispatcher, nunca por authenticated diretamente
-- (mesmo padrão de workflow_action_queue).
CREATE POLICY webhook_events_queue_admin_read ON public.webhook_events_queue
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

REVOKE INSERT, UPDATE, DELETE ON public.webhook_events_queue FROM authenticated;

-- ─── 3) Trigger não-bloqueante: fan-out barato, sem I/O de rede ────────────
CREATE OR REPLACE FUNCTION public.tg_enqueue_webhook_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'ticket.created';
  ELSIF TG_OP = 'UPDATE' AND NEW.state::text = 'Resolved' AND OLD.state::text IS DISTINCT FROM 'Resolved' THEN
    v_event_type := 'ticket.resolved';
  ELSE
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'ticket_id', NEW.id, 'number', NEW.number, 'short_description', NEW.short_description,
    'ticket_type', NEW.ticket_type, 'state', NEW.state, 'priority', NEW.priority,
    'company_id', NEW.company_id, 'created_at', NEW.created_at, 'resolved_at', NEW.resolved_at
  );

  -- Fan-out limitado ao número de webhooks ativos do tenant (tipicamente
  -- poucas dezenas no máximo) — INSERT...SELECT único, sem loop, sem I/O
  -- de rede. O trabalho lento (entrega HTTP) fica inteiramente para o
  -- dispatcher assíncrono, fora desta transação.
  INSERT INTO public.webhook_events_queue (company_id, webhook_id, event_type, payload)
  SELECT NEW.company_id, w.id, v_event_type, v_payload
  FROM public.outbound_webhooks w
  WHERE w.company_id = NEW.company_id
    AND w.is_active = true
    AND v_event_type = ANY (w.events_subscribed);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_enqueue_webhook_events() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS tg_enqueue_webhook_events_insert ON public.tickets;
CREATE TRIGGER tg_enqueue_webhook_events_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enqueue_webhook_events();

DROP TRIGGER IF EXISTS tg_enqueue_webhook_events_update ON public.tickets;
CREATE TRIGGER tg_enqueue_webhook_events_update
  AFTER UPDATE OF state ON public.tickets
  FOR EACH ROW
  WHEN (NEW.state::text = 'Resolved' AND OLD.state::text IS DISTINCT FROM 'Resolved')
  EXECUTE FUNCTION public.tg_enqueue_webhook_events();

-- ─── 4) Reivindicação atômica do lote (mesmo padrão de workflow_claim_queue_
-- batch) — FOR UPDATE SKIP LOCKED evita bloqueio entre execuções
-- concorrentes do dispatcher; lease de 5 min recupera itens abandonados ──
CREATE OR REPLACE FUNCTION public.webhook_claim_queue_batch(p_limit integer DEFAULT 50)
RETURNS SETOF public.webhook_events_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.webhook_events_queue
     SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
         attempts = attempts + 1,
         last_error = 'Lease expirado: worker interrompido durante o processamento',
         run_after = CASE WHEN attempts + 1 >= max_attempts THEN run_after ELSE now() END,
         processed_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
         claimed_at = NULL
   WHERE status = 'processing'
     AND (claimed_at IS NULL OR claimed_at < now() - INTERVAL '5 minutes');

  RETURN QUERY
  UPDATE public.webhook_events_queue q
     SET status = 'processing', claimed_at = now()
   WHERE q.id IN (
     SELECT candidate.id FROM public.webhook_events_queue candidate
      WHERE candidate.status = 'pending'
        AND candidate.attempts < candidate.max_attempts
        AND candidate.run_after <= now()
      ORDER BY candidate.run_after, candidate.created_at
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
      FOR UPDATE SKIP LOCKED
   )
   RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.webhook_claim_queue_batch(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_claim_queue_batch(integer) TO service_role;

-- ─── 5) RPC administrativa write-only (segredo em Vault, nunca em texto
-- puro na tabela) — mesmo padrão de save_channel_connection ────────────────
CREATE OR REPLACE FUNCTION public.save_outbound_webhook(
  p_company_id uuid,
  p_webhook_id uuid,
  p_target_url text,
  p_events_subscribed text[],
  p_is_active boolean,
  p_secret text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.outbound_webhooks;
  v_saved public.outbound_webhooks;
  v_secret_id uuid;
BEGIN
  IF NOT public.is_settings_admin(p_company_id) THEN
    RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE = '42501';
  END IF;
  IF p_target_url !~ '^https://' THEN
    RAISE EXCEPTION 'A URL do webhook precisa usar https://' USING ERRCODE = '22023';
  END IF;

  IF p_webhook_id IS NOT NULL THEN
    SELECT * INTO v_current FROM public.outbound_webhooks
     WHERE id = p_webhook_id AND company_id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Webhook não encontrado' USING ERRCODE = 'P0002'; END IF;
  END IF;

  IF NULLIF(trim(p_secret), '') IS NOT NULL THEN
    IF to_regprocedure('vault.create_secret(text,text,text)') IS NULL THEN
      RAISE EXCEPTION 'Vault não está disponível';
    END IF;
    EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO v_secret_id
      USING p_secret, 'servicefy_webhook_' || gen_random_uuid(), 'ServiceFY outbound webhook signing secret';
  ELSE
    v_secret_id := v_current.vault_secret_id;
  END IF;

  IF p_webhook_id IS NULL THEN
    INSERT INTO public.outbound_webhooks (
      company_id, target_url, events_subscribed, is_active, vault_secret_id, created_by
    ) VALUES (
      p_company_id, p_target_url, COALESCE(p_events_subscribed, '{}'::text[]), p_is_active, v_secret_id, public.get_current_profile_id()
    ) RETURNING * INTO v_saved;
  ELSE
    UPDATE public.outbound_webhooks SET
      target_url = p_target_url, events_subscribed = COALESCE(p_events_subscribed, '{}'::text[]),
      is_active = p_is_active, vault_secret_id = v_secret_id,
      consecutive_failures = CASE WHEN p_is_active AND NOT v_current.is_active THEN 0 ELSE v_current.consecutive_failures END,
      updated_at = now()
    WHERE id = p_webhook_id RETURNING * INTO v_saved;
  END IF;

  PERFORM public.write_admin_audit(
    p_company_id,
    CASE WHEN p_webhook_id IS NULL THEN 'outbound_webhook.created' ELSE 'outbound_webhook.updated' END,
    'outbound_webhook', v_saved.id::text,
    CASE WHEN p_webhook_id IS NULL THEN NULL ELSE to_jsonb(v_current) - 'vault_secret_id' END,
    to_jsonb(v_saved) - 'vault_secret_id'
  );

  RETURN to_jsonb(v_saved) - 'vault_secret_id';
END;
$$;

REVOKE ALL ON FUNCTION public.save_outbound_webhook(uuid, uuid, text, text[], boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_outbound_webhook(uuid, uuid, text, text[], boolean, text) TO authenticated;

-- ─── 6) Resolução do segredo para o dispatcher — mesmo padrão de
-- get_tenant_smtp_delivery_credential: só service_role, join com
-- vault.decrypted_secrets, nunca exposto a authenticated ──────────────────
CREATE OR REPLACE FUNCTION public.get_webhook_signing_secret(p_webhook_id uuid)
RETURNS TABLE(target_url text, signing_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao dispatcher de webhooks' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT w.target_url, secrets.decrypted_secret
    FROM public.outbound_webhooks w
    LEFT JOIN vault.decrypted_secrets secrets ON secrets.id = w.vault_secret_id
   WHERE w.id = p_webhook_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_webhook_signing_secret(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_signing_secret(uuid) TO service_role;

-- ─── 7) Disjuntor: contabiliza sucesso/falha de entrega, desativa após
-- muitas falhas consecutivas ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_webhook_delivery_result(p_webhook_id uuid, p_success boolean, p_failure_threshold integer DEFAULT 10)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao dispatcher de webhooks' USING ERRCODE = '42501';
  END IF;

  IF p_success THEN
    UPDATE public.outbound_webhooks SET consecutive_failures = 0, updated_at = now() WHERE id = p_webhook_id;
  ELSE
    UPDATE public.outbound_webhooks
       SET consecutive_failures = consecutive_failures + 1,
           is_active = CASE WHEN consecutive_failures + 1 >= p_failure_threshold THEN false ELSE is_active END,
           updated_at = now()
     WHERE id = p_webhook_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_webhook_delivery_result(uuid, boolean, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_delivery_result(uuid, boolean, integer) TO service_role;
