-- ============================================================
-- Flowfy ITSM — Migration 004
-- Chatbot Whitelist (WhatsApp / Microsoft Teams)
-- Segurança baseada no cadastro de telefone do usuário
-- ============================================================

-- ─── Whitelist de Telefones Autorizados ──────────────────────
CREATE TABLE IF NOT EXISTS chatbot_whitelist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Vínculo com o perfil do usuário no sistema
  user_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Número normalizado no formato E.164 (ex: +5511999990000)
  phone_e164       TEXT NOT NULL,
  -- Canais habilitados
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  teams_enabled    BOOLEAN NOT NULL DEFAULT false,
  -- Teams: identificador interno (upn ou object_id)
  teams_user_id    TEXT,
  -- Auditoria de aprovação
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at       TIMESTAMPTZ,
  revoked_reason   TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Garante único por empresa + número
  UNIQUE (company_id, phone_e164)
);

CREATE INDEX idx_chatbot_whitelist_company ON chatbot_whitelist(company_id);
CREATE INDEX idx_chatbot_whitelist_phone ON chatbot_whitelist(phone_e164);
CREATE INDEX idx_chatbot_whitelist_user ON chatbot_whitelist(user_id);
-- Índice parcial para buscas rápidas de números ativos
CREATE INDEX idx_chatbot_whitelist_active ON chatbot_whitelist(company_id, phone_e164)
  WHERE active = true AND revoked_at IS NULL;

-- ─── Log de Mensagens do Chatbot ─────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Canal de origem
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp', 'teams', 'web')),
  -- Direção: 'in' = recebida do usuário / 'out' = enviada pelo bot
  direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  -- Identificador externo do remetente (phone para WhatsApp, teams_id para Teams)
  sender_ref    TEXT,
  -- Conteúdo da mensagem
  content       TEXT NOT NULL,
  -- Metadados extras (ex: type = 'text' | 'image' | 'file', message_id externo)
  metadata      JSONB NOT NULL DEFAULT '{}',
  -- Vínculo com ticket (se o chatbot abriu um chamado)
  linked_ticket_id   UUID,
  linked_ticket_type TEXT CHECK (linked_ticket_type IN ('incident', 'request', 'problem', 'change')),
  -- Status de processamento
  processed     BOOLEAN NOT NULL DEFAULT false,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatbot_messages_company ON chatbot_messages(company_id);
CREATE INDEX idx_chatbot_messages_user ON chatbot_messages(user_id);
CREATE INDEX idx_chatbot_messages_channel ON chatbot_messages(channel, created_at DESC);

-- ─── Log de Tentativas Bloqueadas (Auditoria de Segurança) ───
CREATE TABLE IF NOT EXISTS chatbot_blocked_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Não há company_id aqui pois o número pode ser desconhecido
  phone_e164   TEXT,           -- Número que tentou contato (pode ser NULL para Teams)
  teams_user   TEXT,           -- Username do Teams (se aplicável)
  channel      TEXT NOT NULL CHECK (channel IN ('whatsapp', 'teams', 'web')),
  message      TEXT,           -- Conteúdo da mensagem bloqueada
  block_reason TEXT NOT NULL,  -- 'not_whitelisted' | 'revoked' | 'company_not_found'
  raw_payload  JSONB,          -- Payload completo da requisição (para auditoria)
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatbot_blocked_phone ON chatbot_blocked_attempts(phone_e164);
CREATE INDEX idx_chatbot_blocked_date ON chatbot_blocked_attempts(attempted_at DESC);

-- ─── Função: verificar se número está na whitelist ───────────
CREATE OR REPLACE FUNCTION is_chatbot_authorized(
  p_phone_e164 TEXT,
  p_company_id UUID,
  p_channel    TEXT DEFAULT 'whatsapp'
) RETURNS JSONB AS $$
DECLARE
  v_entry chatbot_whitelist%ROWTYPE;
BEGIN
  SELECT * INTO v_entry
    FROM chatbot_whitelist
   WHERE phone_e164 = p_phone_e164
     AND company_id = p_company_id
     AND active = true
     AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'not_whitelisted');
  END IF;

  -- Verifica canal específico
  IF p_channel = 'whatsapp' AND NOT v_entry.whatsapp_enabled THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'whatsapp_not_enabled');
  END IF;

  IF p_channel = 'teams' AND NOT v_entry.teams_enabled THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'teams_not_enabled');
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'user_id',    v_entry.user_id,
    'entry_id',   v_entry.id
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── Função: registrar tentativa bloqueada ───────────────────
CREATE OR REPLACE FUNCTION log_blocked_attempt(
  p_phone      TEXT,
  p_channel    TEXT,
  p_message    TEXT,
  p_reason     TEXT,
  p_payload    JSONB DEFAULT NULL,
  p_teams_user TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO chatbot_blocked_attempts (phone_e164, teams_user, channel, message, block_reason, raw_payload)
    VALUES (p_phone, p_teams_user, p_channel, p_message, p_reason, p_payload)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Configuração de Chatbot por Empresa ─────────────────────
CREATE TABLE IF NOT EXISTS chatbot_config (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  -- WhatsApp via Meta Cloud API ou Twilio
  whatsapp_enabled         BOOLEAN NOT NULL DEFAULT false,
  whatsapp_phone_number_id TEXT,   -- ID do número na Meta API
  whatsapp_token           TEXT,   -- Token de acesso (armazenar criptografado)
  whatsapp_webhook_secret  TEXT,   -- Segredo de validação do webhook
  -- Microsoft Teams via Bot Framework
  teams_enabled            BOOLEAN NOT NULL DEFAULT false,
  teams_app_id             TEXT,
  teams_app_secret         TEXT,
  teams_tenant_id          TEXT,
  -- Comportamento do bot
  bot_name                 TEXT NOT NULL DEFAULT 'FlowfyBot',
  welcome_message          TEXT,   -- Mensagem de boas-vindas
  unauthorized_message     TEXT NOT NULL DEFAULT 'Desculpe, seu número não está autorizado a usar este serviço. Entre em contato com o suporte.',
  -- Horário de atendimento
  business_hours_start     TIME DEFAULT '08:00',
  business_hours_end       TIME DEFAULT '18:00',
  business_days            INT[] DEFAULT ARRAY[1,2,3,4,5], -- 1=seg, 7=dom
  outside_hours_message    TEXT DEFAULT 'Nosso atendimento é de segunda a sexta, das 8h às 18h.',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE chatbot_whitelist IS 'Whitelist de números autorizados a usar o chatbot (WhatsApp/Teams). Segurança baseada no telefone do usuário.';
COMMENT ON TABLE chatbot_messages IS 'Log completo de mensagens do chatbot para auditoria e análise de atendimento.';
COMMENT ON TABLE chatbot_blocked_attempts IS 'Log de tentativas bloqueadas — números não autorizados. Importante para auditoria de segurança.';
COMMENT ON TABLE chatbot_config IS 'Configuração do chatbot por empresa: credenciais de API e comportamento do bot.';
COMMENT ON FUNCTION is_chatbot_authorized IS 'Verifica se um número E.164 está na whitelist de uma empresa para um canal específico.';
