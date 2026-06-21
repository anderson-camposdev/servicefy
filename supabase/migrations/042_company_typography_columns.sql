-- ============================================================
-- Flowfy ITSM — Migration 042
-- Motor White-Label: colunas de tipografia em companies
--
-- Adiciona colunas para fonte e tamanho de título e subtítulo
-- para permitir customização visual no SettingsGovernance.
-- ============================================================

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS title_color TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS title_font TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS title_size TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS subtitle_color TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS subtitle_font TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS subtitle_size TEXT;

COMMENT ON COLUMN public.companies.title_color IS 'Cor customizada do título principal.';
COMMENT ON COLUMN public.companies.title_font IS 'Fonte customizada do título principal.';
COMMENT ON COLUMN public.companies.title_size IS 'Tamanho customizado do título principal.';
COMMENT ON COLUMN public.companies.subtitle_color IS 'Cor customizada do subtítulo.';
COMMENT ON COLUMN public.companies.subtitle_font IS 'Fonte customizada do subtítulo.';
COMMENT ON COLUMN public.companies.subtitle_size IS 'Tamanho customizado do subtítulo.';
