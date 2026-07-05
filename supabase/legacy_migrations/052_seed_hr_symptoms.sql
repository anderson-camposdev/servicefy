-- Migration 052: Sintomas de RH para system_symptoms.
-- Cobre folha de pagamento, benefícios, ponto/jornada e sistemas de RH.

INSERT INTO public.system_symptoms (name, icon, sort_order) VALUES
  -- ── Folha de Pagamento ────────────────────────────────────────────────────
  ('Holerite / Contracheque Incorreto',        '💰', 50),
  ('Desconto Indevido na Folha de Pagamento',  '📉', 51),
  ('Salário Não Creditado no Prazo',           '🏦', 52),
  ('FGTS com Divergência',                     '📋', 53),
  ('13º Salário com Erro',                     '🎁', 54),
  ('Rescisão com Divergência de Valores',      '📝', 55),
  -- ── Benefícios ───────────────────────────────────────────────────────────
  ('Vale Alimentação / Refeição Não Creditado','🍽️', 60),
  ('Vale Transporte Incorreto ou Não Recebido','🚌', 61),
  ('Plano de Saúde com Problema de Cobertura', '🏥', 62),
  ('Plano Odontológico com Problema',          '🦷', 63),
  ('Seguro de Vida com Erro no Cadastro',      '🛡️', 64),
  -- ── Ponto e Jornada ──────────────────────────────────────────────────────
  ('Ponto Eletrônico Não Registra',            '🕐', 70),
  ('Banco de Horas com Saldo Incorreto',       '⏰', 71),
  ('Férias Lançadas de Forma Incorreta',       '🏖️', 72),
  ('Ausência / Abono Não Processado',          '📅', 73),
  -- ── Sistemas de RH ───────────────────────────────────────────────────────
  ('Acesso ao Portal / Sistema de RH Negado',  '🔒', 80),
  ('Erro ao Emitir Documento no Portal RH',    '📄', 81),
  ('eSocial / CAGED com Erro',                 '🗂️', 82)
ON CONFLICT (name) DO NOTHING;
