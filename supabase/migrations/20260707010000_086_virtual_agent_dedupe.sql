-- ServiceFY — Fix: deduplicação das ações do Agente Virtual.
--
-- A UNIQUE (company_id, service_domain_id, action_key) da migration 079 não
-- protege linhas com service_domain_id NULL (NULL <> NULL em constraints), e
-- o seed da 085 usa exatamente domain NULL: o ON CONFLICT nunca dispara e cada
-- execução do seed — inclusive a chamada de ensure_virtual_agent_connection a
-- cada mensagem do widget — insere 3 novas cópias por tenant.
--
-- Correção em 3 passos: (1) remove duplicatas existentes preservando execuções,
-- (2) índice único parcial cobrindo domain NULL, (3) seed passa a usar esse
-- índice como alvo do ON CONFLICT.

-- ─── 1. Deduplica: mantém a cópia mais antiga (menor id como desempate) ──────
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY company_id, action_key
           ORDER BY id
         ) AS keeper_id
    FROM public.virtual_agent_actions
   WHERE service_domain_id IS NULL
)
UPDATE public.virtual_agent_executions e
   SET action_id = r.keeper_id
  FROM ranked r
 WHERE e.action_id = r.id AND r.id <> r.keeper_id;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY company_id, action_key
           ORDER BY id
         ) AS rn
    FROM public.virtual_agent_actions
   WHERE service_domain_id IS NULL
)
DELETE FROM public.virtual_agent_actions a
 USING ranked r
 WHERE a.id = r.id AND r.rn > 1;

-- ─── 2. Índice único parcial para ações sem domínio ─────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_va_actions_company_key_nodomain
  ON public.virtual_agent_actions(company_id, action_key)
  WHERE service_domain_id IS NULL;

-- ─── 3. Seed idempotente de verdade (ON CONFLICT no índice parcial) ─────────
CREATE OR REPLACE FUNCTION public.ensure_virtual_agent_connection(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_id uuid;
BEGIN
  SELECT id INTO v_connection_id
    FROM public.channel_connections
   WHERE company_id = p_company_id AND provider = 'api' AND name = 'Assistente do Portal'
   LIMIT 1;

  IF v_connection_id IS NULL THEN
    INSERT INTO public.channel_connections(company_id, scope, provider, name, enabled, status)
    VALUES (p_company_id, 'tenant', 'api', 'Assistente do Portal', true, 'healthy')
    RETURNING id INTO v_connection_id;
  END IF;

  INSERT INTO public.virtual_agent_actions(company_id, action_key, name, enabled, requires_confirmation, min_confidence, config)
  VALUES
    (p_company_id, 'check_tickets', 'Consultar meus chamados', true, false, 0.150,
     jsonb_build_object('keywords', jsonb_build_array('chamado','chamados','ticket','status','andamento'))),
    (p_company_id, 'open_request', 'Abrir solicitação simples', true, true, 0.150,
     jsonb_build_object('keywords', jsonb_build_array('solicitar','solicitação','abrir','pedido','preciso de'))),
    (p_company_id, 'handoff_to_human', 'Transferir para atendente humano', true, false, 0.000,
     jsonb_build_object('keywords', jsonb_build_array('humano','atendente','pessoa','alguém','falar com')))
  ON CONFLICT (company_id, action_key) WHERE service_domain_id IS NULL DO NOTHING;

  RETURN v_connection_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_virtual_agent_connection(uuid) FROM public, anon, authenticated;

-- ─── Verificação (comentada) ─────────────────────────────────────────────────
--   SELECT company_id, action_key, count(*) FROM public.virtual_agent_actions
--    WHERE service_domain_id IS NULL GROUP BY 1,2 HAVING count(*) > 1; -- deve ser vazio
