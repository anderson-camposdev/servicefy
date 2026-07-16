-- Migration 051: Semeia sintomas específicos de TI/Microinformática em system_symptoms.
-- Esses sintomas são globais (sem company_id) e servem como base para todos os tenants
-- associarem aos seus serviços via catalog_service_symptoms.

INSERT INTO public.system_symptoms (name, icon, sort_order) VALUES
  -- ── Redes e Conectividade ─────────────────────────────────────────────────
  ('Sem Conexão com a Internet',       '🌐', 10),
  ('Internet Lenta ou Instável',       '📶', 11),
  ('Wi-Fi Sem Sinal',                  '📵', 12),
  ('VPN Não Conecta',                  '🔒', 13),
  ('Drive Compartilhado Inacessível',  '📂', 14),
  ('Impressora de Rede Offline',       '🖨️', 15),
  ('Sem Acesso à Rede Interna',        '🔌', 16),
  ('E-mail Não Envia / Não Recebe',    '📧', 17),
  ('Microsoft Teams com Falha',        '💬', 18),
  -- ── Sistemas e Aplicações ─────────────────────────────────────────────────
  ('Sistema Extremamente Lento',       '🐌', 20),
  ('Erro de Login / Autenticação',     '🚫', 21),
  ('Página Não Carrega / Timeout',     '⏱️', 22),
  ('Sistema Totalmente Fora do Ar',    '💀', 23),
  ('Relatório com Erro ou Incorreto',  '📊', 24),
  ('Licença Expirada ou Inválida',     '🔑', 25),
  ('Erro ao Salvar / Gravar Dados',    '💾', 26),
  ('OneDrive / SharePoint Sem Sincronizar', '☁️', 27),
  -- ── Hardware e Periféricos ────────────────────────────────────────────────
  ('Computador Não Liga',              '💻', 30),
  ('Tela Azul (BSOD)',                 '🔵', 31),
  ('Superaquecimento',                 '🌡️', 32),
  ('Papel Atolado na Impressora',      '📄', 33),
  ('Impressão com Qualidade Ruim',     '🖨️', 34),
  ('Monitor Sem Imagem / Tela Preta',  '🖥️', 35),
  ('Teclado ou Mouse Sem Resposta',    '⌨️', 36),
  ('Bateria do Notebook Não Carrega',  '🔋', 37),
  -- ── Segurança e Acessos ───────────────────────────────────────────────────
  ('Senha Bloqueada',                  '🔐', 40),
  ('Não Recebe Código 2FA / MFA',      '📱', 41),
  ('Acesso Negado ao Sistema',         '⛔', 42),
  ('Atividade Suspeita na Conta',      '🚨', 43),
  ('Sem Permissão em Arquivo ou Pasta','📁', 44)
ON CONFLICT (name) DO NOTHING;
