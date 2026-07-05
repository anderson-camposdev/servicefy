-- Flowfy BI v2 (Fase 2): evolução de bi_saved_reports (não destrutiva).

ALTER TABLE public.bi_saved_reports
  ADD COLUMN IF NOT EXISTS schema_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS report_kind TEXT NOT NULL DEFAULT 'pivot'
    CHECK (report_kind IN ('pivot', 'dashboard')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_bi_saved_reports_company
  ON public.bi_saved_reports(company_id, report_kind);

CREATE OR REPLACE FUNCTION public.tg_bi_saved_reports_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bi_saved_reports_touch ON public.bi_saved_reports;
CREATE TRIGGER trg_bi_saved_reports_touch
  BEFORE UPDATE ON public.bi_saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_bi_saved_reports_touch();;
