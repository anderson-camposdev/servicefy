-- ============================================================
-- ServiceFY ITSM — HOTFIX: Alpha Tech para tema CLARO técnico
-- Arquivo: supabase/fix_alpha_light.sql
--
-- Remove o tema escuro da Alpha Tech atualizando as cores white-label
-- no banco vivo. O ThemeProvider injeta bg_color em --brand-bg e o
-- Portal usa bg_color como background direto; por isso a troca precisa
-- acontecer NO BANCO, não só no CSS.
--
-- NÃO altera o Beta Hospital (mantém o tema clínico original que já existia).
--
-- Rode no SQL Editor. Idempotente (apenas UPDATE).
-- ============================================================

UPDATE public.companies
   SET primary_color   = '#2563EB',   -- azul técnico de engenharia
       secondary_color = '#E0E7FF',   -- índigo claro
       accent_color    = '#0EA5E9',   -- ciano de destaque
       bg_color        = '#F8FAFC',   -- fundo claro (era #0F172A escuro)
       logo_url        = 'https://dummyimage.com/180x48/2563eb/ffffff&text=Alpha+Tech'
 WHERE id = '5e1a0001-1111-1111-1111-111111111111'  -- Alpha Tech (seed SLA)
    OR slug = 'alpha-sla';

-- Verificação:
-- SELECT name, slug, primary_color, bg_color FROM public.companies WHERE slug = 'alpha-sla';
