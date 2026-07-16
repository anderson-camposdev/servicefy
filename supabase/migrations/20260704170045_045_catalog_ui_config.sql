-- Add catalog_ui_config to companies
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS catalog_ui_config jsonb DEFAULT '{}'::jsonb;

-- Example payload:
-- {
--   "layout_style": "modern_3d",
--   "background": {
--     "type": "image",
--     "value": "url_to_image"
--   },
--   "cards": [
--     {
--       "id": "incident",
--       "title": "Reportar um Problema?",
--       "image_url": "url",
--       "action": "incident",
--       "style": "pill_label"
--     }
--   ]
-- }
