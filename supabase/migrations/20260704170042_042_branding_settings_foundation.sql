ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS branding_settings JSONB NOT NULL DEFAULT '{"logo_url": null, "text_color": "#ffffff", "primary_color": "#0056b3", "background_image_url": null}'::jsonb;
