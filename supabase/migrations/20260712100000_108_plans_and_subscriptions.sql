-- ServiceFY — Fase 12: catálogo de planos + assinatura por tenant.
--
-- Não confundir com public.company_module_entitlements (migration 076): aquela
-- tabela liga/desliga MÓDULOS inteiros manualmente por tenant (ex.: 'cmdb',
-- 'omnichannel'). Aqui é um nível acima: um catálogo de PLANOS (SKU) com limites
-- e feature flags, e uma ASSINATURA por tenant apontando para um plano, com
-- status de pagamento — a base para gates de "recurso premium" na UI.

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  max_agents integer CHECK (max_agents IS NULL OR max_agents > 0),
  max_tickets_per_month integer CHECK (max_tickets_per_month IS NULL OR max_tickets_per_month > 0),
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  monthly_price_cents integer NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS 'Catálogo global de planos (SKU). Não é por tenant — subscriptions.plan_id que liga um tenant a um plano.';
COMMENT ON COLUMN public.plans.max_agents IS 'Limite de agentes/analistas simultâneos. NULL = ilimitado.';
COMMENT ON COLUMN public.plans.max_tickets_per_month IS 'Limite de chamados abertos por mês. NULL = ilimitado.';
COMMENT ON COLUMN public.plans.feature_flags IS 'Mapa {feature_name: boolean}. Consultado via check_tenant_feature_access.';

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  external_customer_id text,
  external_subscription_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS 'Assinatura vigente de um tenant (1:1 com companies). external_*_id ficam prontos para um provedor de pagamento futuro (ex. Stripe), hoje sempre NULL.';
COMMENT ON COLUMN public.subscriptions.status IS 'trialing/active liberam feature_flags do plano; past_due/canceled/paused não.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- plans: leitura para qualquer usuário autenticado (catálogo público, precisa
-- aparecer em telas de upgrade); escrita só sysadmin (plano é decisão da
-- plataforma, não do tenant).
CREATE POLICY plans_authenticated_read
  ON public.plans
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY plans_sysadmin_write
  ON public.plans
  FOR ALL TO authenticated
  USING (public.get_current_user_role() = 'sysadmin')
  WITH CHECK (public.get_current_user_role() = 'sysadmin');

-- subscriptions: isolada por tenant (mesmo padrão de is_settings_admin já usado
-- em tenant_smtp_settings/company_module_entitlements); escrita só sysadmin.
CREATE POLICY subscriptions_tenant_read
  ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_settings_admin(company_id));

CREATE POLICY subscriptions_sysadmin_write
  ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.get_current_user_role() = 'sysadmin')
  WITH CHECK (public.get_current_user_role() = 'sysadmin');

REVOKE ALL ON public.plans FROM authenticated;
GRANT SELECT ON public.plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;

REVOKE ALL ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;

-- ─── RPC: check_tenant_feature_access ────────────────────────────────────────
-- Fail-closed por construção: qualquer ausência (sem assinatura, sem plano
-- ativo, feature não listada, chamador de outro tenant) retorna false, nunca
-- lança exceção — o frontend trata "sem acesso" e "erro de rede" como estados
-- visuais diferentes, mas a RPC em si nunca falha por falta de dado.
CREATE OR REPLACE FUNCTION public.check_tenant_feature_access(
  p_company_id uuid,
  p_feature_name text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_access boolean;
  v_caller_role text;
  v_caller_company_id uuid;
  v_authorized boolean;
BEGIN
  IF p_company_id IS NULL OR NULLIF(trim(COALESCE(p_feature_name, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  v_caller_role := public.get_current_user_role();
  v_caller_company_id := public.get_current_user_company_id();

  -- NULL-safe de propósito: se o papel/empresa do chamador não resolver (sessão
  -- quebrada, profile sem auth_id vinculado, etc.), "v_authorized" vira NULL e
  -- COALESCE(..., false) faz o RETURN false disparar. Sem o COALESCE aqui,
  -- "IF NOT (algo OR NULL)" avalia para NULL em plpgsql — que NÃO é tratado como
  -- true, então o RETURN false seria pulado e a checagem de tenant, ignorada.
  v_authorized := (v_caller_role = 'sysadmin')
    OR (v_caller_company_id IS NOT NULL AND v_caller_company_id = p_company_id);

  IF NOT COALESCE(v_authorized, false) THEN
    RETURN false;
  END IF;

  SELECT COALESCE((pl.feature_flags ->> p_feature_name)::boolean, false)
    INTO v_has_access
    FROM public.subscriptions s
    JOIN public.plans pl ON pl.id = s.plan_id
   WHERE s.company_id = p_company_id
     AND s.status IN ('trialing', 'active')
     AND pl.active = true;

  RETURN COALESCE(v_has_access, false);
END;
$$;

REVOKE ALL ON FUNCTION public.check_tenant_feature_access(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_tenant_feature_access(uuid, text) TO authenticated;

-- ─── Seed: planos padrão + assinatura para tenants já existentes ────────────
-- Preserva o comportamento atual (SMTP customizado já configurado nesta sessão
-- para Acme) atribuindo 'professional' com custom_smtp=true a todo tenant
-- existente. Para testar o paywall manualmente, rebaixe um tenant específico:
--   UPDATE public.subscriptions SET plan_id = (SELECT id FROM public.plans WHERE key = 'starter')
--   WHERE company_id = '<uuid do tenant>';

INSERT INTO public.plans (key, name, description, max_agents, max_tickets_per_month, feature_flags, monthly_price_cents)
VALUES
  ('starter', 'Starter', 'Plano de entrada — funcionalidades essenciais de ITSM.',
    10, 500, '{"custom_smtp": false, "omnichannel": false, "virtual_agent": false}'::jsonb, 0),
  ('professional', 'Professional', 'Recursos avançados de comunicação e automação.',
    50, 5000, '{"custom_smtp": true, "omnichannel": true, "virtual_agent": false}'::jsonb, 49900),
  ('enterprise', 'Enterprise', 'Sem limites, com Agente Virtual e suporte prioritário.',
    NULL, NULL, '{"custom_smtp": true, "omnichannel": true, "virtual_agent": true}'::jsonb, 149900)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.subscriptions (company_id, plan_id, status, current_period_end)
SELECT c.id, (SELECT id FROM public.plans WHERE key = 'professional'), 'active', now() + interval '1 year'
  FROM public.companies c
 WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.company_id = c.id);
