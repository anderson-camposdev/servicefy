-- ============================================================
-- Flowfy ITSM — Migration 049
-- Catalog UI Config (JSONB) for highly editable buttons
-- ============================================================

-- Add ui_config to all catalog hierarchical tables to support
-- highly customizable UI rendering (themes, icons, accent colors).

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS ui_config JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.catalog_categories
  ADD COLUMN IF NOT EXISTS ui_config JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.request_categories
  ADD COLUMN IF NOT EXISTS ui_config JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.request_subcategories
  ADD COLUMN IF NOT EXISTS ui_config JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.catalog_services
  ADD COLUMN IF NOT EXISTS ui_config JSONB DEFAULT '{}'::jsonb;

-- Example payload for ui_config:
-- {
--   "theme": "minimalist" | "modern_3d",
--   "iconType": "lucide" | "emoji" | "image",
--   "iconValue": "Monitor" | "🖥️" | "https://...",
--   "accentColor": "#0ea5e9"
-- }
