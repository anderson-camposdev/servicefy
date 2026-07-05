-- ============================================================
-- Flowfy ITSM — Migration 002
-- Catálogo Hierárquico de Requisições (2 níveis + aprovação gestor)
-- Item → Sub-item (com flag de aprovação por e-mail + token único)
-- ============================================================

-- ─── Nível 1: Item de Requisição ─────────────────────────────
CREATE TABLE IF NOT EXISTS request_catalog_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '📋',
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_catalog_items_company ON request_catalog_items(company_id);

-- ─── Nível 2: Sub-item com regras de aprovação ───────────────
CREATE TABLE IF NOT EXISTS request_catalog_subitems (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                   UUID NOT NULL REFERENCES request_catalog_items(id) ON DELETE CASCADE,
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  description               TEXT,
  -- Controle de aprovação
  requires_manager_approval BOOLEAN NOT NULL DEFAULT false,
  approval_email_template   TEXT,         -- Template HTML do e-mail de aprovação
  -- SLA de atendimento (estimativa em dias úteis)
  estimated_delivery_days   INT NOT NULL DEFAULT 3,
  -- Custo e financeiro
  cost                      NUMERIC(10,2),
  currency                  TEXT DEFAULT 'BRL',
  -- Visibilidade por papel
  visible_to_roles          TEXT[] NOT NULL DEFAULT ARRAY['end_user'],
  -- Formulário dinâmico (campos em JSON)
  form_fields               JSONB NOT NULL DEFAULT '[]',
  active                    BOOLEAN NOT NULL DEFAULT true,
  sort_order                INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_catalog_subitems_item ON request_catalog_subitems(item_id);
CREATE INDEX idx_request_catalog_subitems_company ON request_catalog_subitems(company_id);

-- ─── Adicionar vínculo de catálogo na tabela service_requests ──
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS request_catalog_item_id    UUID REFERENCES request_catalog_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_catalog_subitem_id UUID REFERENCES request_catalog_subitems(id) ON DELETE SET NULL;

-- ─── Tabela de Tokens de Aprovação por E-mail ────────────────
CREATE TABLE IF NOT EXISTS approval_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Quem deve aprovar
  approver_email  TEXT NOT NULL,
  approver_name   TEXT,
  -- Token único para link no e-mail
  token           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- Controle de tempo
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  -- Resultado
  used_at         TIMESTAMPTZ,
  decision        TEXT CHECK (decision IN ('approved', 'rejected')),
  rejection_reason TEXT,
  -- Auditoria
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE INDEX idx_approval_tokens_request ON approval_tokens(request_id);
CREATE INDEX idx_approval_tokens_token ON approval_tokens(token);
CREATE INDEX idx_approval_tokens_company ON approval_tokens(company_id);

-- ─── Função: gerar token de aprovação e registrar ─────────────
CREATE OR REPLACE FUNCTION create_approval_token(
  p_request_id    UUID,
  p_company_id    UUID,
  p_approver_email TEXT,
  p_approver_name  TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_token UUID;
BEGIN
  INSERT INTO approval_tokens (request_id, company_id, approver_email, approver_name)
    VALUES (p_request_id, p_company_id, p_approver_email, p_approver_name)
    RETURNING token INTO v_token;
  RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- ─── Função: processar decisão via token ──────────────────────
CREATE OR REPLACE FUNCTION process_approval_token(
  p_token      UUID,
  p_decision   TEXT,  -- 'approved' | 'rejected'
  p_reason     TEXT DEFAULT NULL,
  p_ip         TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_token_row approval_tokens%ROWTYPE;
  v_new_state TEXT;
BEGIN
  -- Busca e valida o token
  SELECT * INTO v_token_row FROM approval_tokens WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token não encontrado');
  END IF;
  IF v_token_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token já utilizado');
  END IF;
  IF v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token expirado');
  END IF;

  -- Determina o novo estado da requisição
  v_new_state := CASE p_decision WHEN 'approved' THEN 'Approved' ELSE 'Rejected' END;

  -- Atualiza o token
  UPDATE approval_tokens SET
    used_at          = now(),
    decision         = p_decision,
    rejection_reason = p_reason,
    ip_address       = p_ip,
    user_agent       = p_user_agent
  WHERE token = p_token;

  -- Atualiza a requisição
  UPDATE service_requests SET
    state            = v_new_state,
    approver_name    = v_token_row.approver_name,
    approved_at      = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
    rejection_reason = p_reason,
    updated_at       = now()
  WHERE id = v_token_row.request_id;

  RETURN jsonb_build_object(
    'success',     true,
    'decision',    p_decision,
    'request_id',  v_token_row.request_id
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE request_catalog_items IS 'Catálogo de Requisições — Nível 1: Item (ex: Equipamento, Acesso)';
COMMENT ON TABLE request_catalog_subitems IS 'Catálogo de Requisições — Nível 2: Sub-item com flag de aprovação do gestor';
COMMENT ON TABLE approval_tokens IS 'Tokens únicos para aprovação/rejeição de requisições via e-mail (72h de validade)';;
