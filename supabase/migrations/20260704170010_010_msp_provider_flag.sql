-- ============================================================
-- Flowfy ITSM — Migration 010
-- ETAPA 3 (Segurança) — Modelo de Governança MSP / White-Label
--
-- Substitui o UUID hardcoded da migration 006 por uma FLAG lógica
-- `is_provider_tenant`. A empresa-provedora (consultoria que
-- administra o ecossistema) é identificada por essa flag, e não
-- mais por um id fixo no código.
-- ============================================================

-- ─── 1. Flag de provedor na tabela companies ──────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_provider_tenant BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.is_provider_tenant IS
  'TRUE = tenant provedor (consultoria MSP) com superpoderes sobre todos os clientes.';

-- ─── 2. Marca a empresa provedora atual (Allied IT) ───────────
-- Mantém compatibilidade com o ecossistema já existente.
UPDATE public.companies
SET is_provider_tenant = true
WHERE id = '44444444-4444-4444-4444-444444444444';

-- ─── 3. Remediação da função de autorização MSP ───────────────
-- Antes: comparava com o UUID fixo da Allied IT.
-- Agora: superpoderes se o tenant do usuário tem is_provider_tenant
-- OU se o papel do usuário é 'sysadmin'. Resolução via auth_id
-- (Supabase Auth real — ver migration 011).
CREATE OR REPLACE FUNCTION public.is_current_user_msp_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_is_provider BOOLEAN;
  v_role        TEXT;
BEGIN
  SELECT c.is_provider_tenant, p.role::text
    INTO v_is_provider, v_role
    FROM public.profiles p
    JOIN public.companies c ON c.id = p.company_id
   WHERE p.auth_id = auth.uid();

  RETURN COALESCE(v_is_provider, false) OR COALESCE(v_role, '') = 'sysadmin';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
