-- Migration 050: Adiciona campo background_url à tabela companies
-- Armazena a URL da imagem de fundo do portal do usuário (independente do bg_color da tela de login)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS background_url text;

COMMENT ON COLUMN public.companies.background_url
  IS 'URL da imagem de fundo do portal do usuário. Exibida com overlay semitransparente para manter a legibilidade.';
