-- ============================================================
-- Flowfy ITSM — Migration 017
-- Encerramento padrão ServiceNow: garante resolved_at em incidents
-- (close_code/close_notes já foram criados na migration 013).
-- Idempotente: não falha se a coluna já existir.
-- ============================================================

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS closed_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.incidents.resolved_at IS 'Carimbo de resolução (congela o SLA e alimenta métricas de MTTR).';
