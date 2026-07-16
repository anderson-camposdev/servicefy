-- Migration 043: campos de texto configuráveis do catálogo de serviços
-- catalog_headline: título da página inicial do catálogo ("Como podemos te ajudar hoje?")
-- greeting_prefix:  prefixo da saudação pessoal ("Olá" → "Olá, Anderson! 👋")

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS catalog_headline text,
  ADD COLUMN IF NOT EXISTS greeting_prefix  text;
