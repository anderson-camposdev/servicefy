-- ============================================================
-- Flowfy ITSM — Migration 003
-- Controle de Licenças Concorrentes por WebSocket
-- Cada empresa tem um limite de conexões simultâneas ativas
-- ============================================================

-- ─── Adicionar coluna de licenças à tabela companies ─────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS concurrent_licenses     INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS license_plan            TEXT NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS license_expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_alert_threshold INT NOT NULL DEFAULT 80; -- % de uso para alerta

-- ─── Tabela de Sessões Ativas (WebSocket connections) ────────
CREATE TABLE IF NOT EXISTS active_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Identificador único da sessão WebSocket
  session_token    TEXT NOT NULL UNIQUE,
  -- Informações de conexão
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ping        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- IP e dispositivo para auditoria
  ip_address       TEXT,
  user_agent       TEXT,
  device_type      TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')) DEFAULT 'unknown',
  -- Encerramento
  disconnected_at  TIMESTAMPTZ,
  disconnect_reason TEXT  -- 'logout' | 'timeout' | 'kicked' | 'server_restart'
);

CREATE INDEX idx_active_sessions_company ON active_sessions(company_id);
CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_token ON active_sessions(session_token);
-- Índice parcial para sessões ainda ativas (performance crítica)
CREATE INDEX idx_active_sessions_active ON active_sessions(company_id)
  WHERE disconnected_at IS NULL;

-- ─── View: uso atual de licenças por empresa ──────────────────
CREATE OR REPLACE VIEW v_license_usage AS
SELECT
  c.id                    AS company_id,
  c.name                  AS company_name,
  c.concurrent_licenses   AS license_limit,
  c.license_plan,
  c.license_expires_at,
  COUNT(s.id)             AS active_connections,
  c.concurrent_licenses - COUNT(s.id) AS available_slots,
  CASE
    WHEN COUNT(s.id) >= c.concurrent_licenses THEN 'FULL'
    WHEN COUNT(s.id) >= (c.concurrent_licenses * c.license_alert_threshold / 100) THEN 'WARNING'
    ELSE 'OK'
  END                     AS license_status,
  ROUND(COUNT(s.id)::NUMERIC / NULLIF(c.concurrent_licenses, 0) * 100, 1) AS usage_pct
FROM companies c
LEFT JOIN active_sessions s ON s.company_id = c.id AND s.disconnected_at IS NULL
GROUP BY c.id, c.name, c.concurrent_licenses, c.license_plan,
         c.license_expires_at, c.license_alert_threshold;

-- ─── Função: verificar disponibilidade de licença ────────────
CREATE OR REPLACE FUNCTION check_license_available(p_company_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_limit   INT;
  v_active  INT;
BEGIN
  SELECT concurrent_licenses INTO v_limit
    FROM companies WHERE id = p_company_id;

  SELECT COUNT(*) INTO v_active
    FROM active_sessions
   WHERE company_id = p_company_id
     AND disconnected_at IS NULL;

  RETURN COALESCE(v_active, 0) < COALESCE(v_limit, 10);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── Função: registrar nova sessão (com verificação de licença) ─
CREATE OR REPLACE FUNCTION register_session(
  p_company_id    UUID,
  p_user_id       UUID,
  p_session_token TEXT,
  p_ip            TEXT DEFAULT NULL,
  p_user_agent    TEXT DEFAULT NULL,
  p_device_type   TEXT DEFAULT 'unknown'
) RETURNS JSONB AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Verifica disponibilidade antes de registrar
  IF NOT check_license_available(p_company_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'LICENÇA ESGOTADA: limite de conexões simultâneas atingido para esta empresa.'
    );
  END IF;

  -- Encerra sessões anteriores do mesmo usuário (login em outro dispositivo)
  UPDATE active_sessions SET
    disconnected_at  = now(),
    disconnect_reason = 'new_login'
  WHERE user_id = p_user_id
    AND disconnected_at IS NULL;

  -- Registra a nova sessão
  INSERT INTO active_sessions (company_id, user_id, session_token, ip_address, user_agent, device_type)
    VALUES (p_company_id, p_user_id, p_session_token, p_ip, p_user_agent, p_device_type)
    RETURNING id INTO v_session_id;

  RETURN jsonb_build_object('success', true, 'session_id', v_session_id);
END;
$$ LANGUAGE plpgsql;

-- ─── Função: heartbeat (mantém sessão viva) ──────────────────
CREATE OR REPLACE FUNCTION session_heartbeat(p_session_token TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE active_sessions
    SET last_ping = now()
  WHERE session_token = p_session_token
    AND disconnected_at IS NULL;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ─── Função: encerrar sessão ──────────────────────────────────
CREATE OR REPLACE FUNCTION release_session(
  p_session_token  TEXT,
  p_reason         TEXT DEFAULT 'logout'
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE active_sessions SET
    disconnected_at  = now(),
    disconnect_reason = p_reason
  WHERE session_token = p_session_token
    AND disconnected_at IS NULL;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ─── Job: expirar sessões sem ping há mais de 5 minutos ───────
CREATE OR REPLACE FUNCTION expire_stale_sessions()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE active_sessions SET
    disconnected_at  = now(),
    disconnect_reason = 'timeout'
  WHERE disconnected_at IS NULL
    AND last_ping < now() - INTERVAL '5 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE active_sessions IS 'Sessões WebSocket ativas. Controla o uso de licenças concorrentes por tenant.';
COMMENT ON VIEW v_license_usage IS 'View de uso de licenças em tempo real: contagem de conexões ativas vs limite.';
COMMENT ON FUNCTION check_license_available IS 'Verifica se há slots disponíveis antes de permitir novo login.';
COMMENT ON FUNCTION register_session IS 'Registra nova sessão após verificação de licença disponível.';
COMMENT ON FUNCTION expire_stale_sessions IS 'Expira sessões sem heartbeat há mais de 5 minutos. Deve ser chamada periodicamente.';;
