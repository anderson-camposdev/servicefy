-- ============================================================
-- Flowfy ITSM — Migration 016
-- Motor White-Label: colunas de identidade visual em companies
--
-- logo_url / primary_color já existem (migrations anteriores).
-- Adiciona secondary_color e brand_name e abre o UPDATE para o
-- admin da própria empresa (além do provedor MSP).
-- ============================================================

-- ─── 1. Colunas de customização (idempotente) ─────────────────
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url        TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS primary_color   TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS brand_name      TEXT;

COMMENT ON COLUMN public.companies.secondary_color IS 'Cor de suporte (HEX) do tema white-label.';
COMMENT ON COLUMN public.companies.brand_name IS 'Nome de exibição customizado da marca (fallback: name).';

-- ─── 2. Backfill a partir do que já existe ────────────────────
UPDATE public.companies SET secondary_color = COALESCE(secondary_color, accent_color, '#00a3e0') WHERE secondary_color IS NULL;
UPDATE public.companies SET brand_name = COALESCE(brand_name, name) WHERE brand_name IS NULL;

-- ─── 3. Leitura (SELECT) ──────────────────────────────────────
-- A leitura de companies já é pública (migration 008) — o branding
-- precisa carregar ANTES do login. Usuários autenticados leem a config
-- visual da própria empresa sem ajustes adicionais. (Reafirmado abaixo.)
DROP POLICY IF EXISTS select_company_policy ON public.companies;
CREATE POLICY select_company_policy ON public.companies
  FOR SELECT TO public
  USING (true);

-- ─── 4. Escrita (UPDATE) — provedor OU admin da própria empresa ─
GRANT UPDATE ON public.companies TO authenticated;

DROP POLICY IF EXISTS write_company_policy ON public.companies;
CREATE POLICY write_company_policy ON public.companies
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (id = public.get_current_user_company_id() AND public.get_current_user_role() IN ('sysadmin', 'company_admin'))
  );
