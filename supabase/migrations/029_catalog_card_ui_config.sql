-- ============================================================
-- Flowfy ITSM - Migration 029
-- Per-item visual configuration for Portal catalog cards.
-- ============================================================

ALTER TABLE public.catalog_service_symptoms
  ADD COLUMN IF NOT EXISTS ui_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS ui_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.catalog_service_symptoms
  DROP CONSTRAINT IF EXISTS catalog_service_symptoms_ui_config_object_chk;
ALTER TABLE public.catalog_service_symptoms
  ADD CONSTRAINT catalog_service_symptoms_ui_config_object_chk
  CHECK (jsonb_typeof(ui_config) = 'object');

ALTER TABLE public.request_items
  DROP CONSTRAINT IF EXISTS request_items_ui_config_object_chk;
ALTER TABLE public.request_items
  ADD CONSTRAINT request_items_ui_config_object_chk
  CHECK (jsonb_typeof(ui_config) = 'object');

