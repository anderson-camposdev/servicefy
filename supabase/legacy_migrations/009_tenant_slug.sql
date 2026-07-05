-- ============================================================
-- Flowfy ITSM — Migration 009
-- ETAPA 1 (Multi-Tenant) — Identificador de Tenant por Slug
--
-- Adiciona a coluna `slug` em companies para resolver o tenant
-- a partir do subdomínio (ex.: acme.flowfy.app → slug "acme").
-- O backfill deriva o slug do `domain` já existente, sem depender
-- de nomes hardcoded de empresas.
-- ============================================================

-- ─── 1. Coluna slug (idempotente) ─────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- ─── 2. Backfill a partir do domínio existente ────────────────
-- Ex.: 'alliedit.com' → 'alliedit'. Apenas linhas ainda sem slug.
UPDATE public.companies
SET slug = regexp_replace(
             lower(split_part(domain, '.', 1)),
             '[^a-z0-9-]', '', 'g'
           )
WHERE slug IS NULL
  AND domain IS NOT NULL
  AND length(split_part(domain, '.', 1)) > 0;

-- Fallback: qualquer linha sem domínio utilizável recebe slug
-- derivado do id (garante NOT NULL + unicidade até ajuste manual).
UPDATE public.companies
SET slug = 'tenant-' || replace(left(id::text, 8), '-', '')
WHERE slug IS NULL OR length(slug) = 0;

-- ─── 3. Restrições de integridade ─────────────────────────────
ALTER TABLE public.companies
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug
  ON public.companies (slug);

-- Garante formato válido de slug (minúsculas, números e hífen).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_slug_format_chk'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_slug_format_chk
      CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$');
  END IF;
END $$;

COMMENT ON COLUMN public.companies.slug IS
  'Identificador do tenant usado no subdomínio (acme.flowfy.app). Único, [a-z0-9-].';
