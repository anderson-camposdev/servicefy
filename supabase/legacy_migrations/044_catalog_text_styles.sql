-- Migration 044: estilos de texto configuráveis do catálogo de serviços
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS greeting_color       text,
  ADD COLUMN IF NOT EXISTS catalog_headline_color text,
  ADD COLUMN IF NOT EXISTS catalog_headline_size  text;
