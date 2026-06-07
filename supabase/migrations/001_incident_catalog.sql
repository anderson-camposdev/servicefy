-- ============================================================
-- Flowfy ITSM — Migration 001
-- Catálogo Hierárquico de Incidentes (3 níveis + SLA automático)
-- Item → Sub-item → Sintoma
-- ============================================================

-- ─── Nível 1: Item ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_catalog_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '🔧',
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_catalog_items_company ON incident_catalog_items(company_id);

-- ─── Nível 2: Sub-item ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_catalog_subitems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES incident_catalog_items(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_catalog_subitems_item ON incident_catalog_subitems(item_id);
CREATE INDEX idx_incident_catalog_subitems_company ON incident_catalog_subitems(company_id);

-- ─── Nível 3: Sintoma (com SLA) ──────────────────────────────
CREATE TABLE IF NOT EXISTS incident_catalog_symptoms (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subitem_id           UUID NOT NULL REFERENCES incident_catalog_subitems(id) ON DELETE CASCADE,
  item_id              UUID NOT NULL REFERENCES incident_catalog_items(id) ON DELETE CASCADE,
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT,
  -- SLA obrigatório por sintoma
  sla_response_mins    INT NOT NULL DEFAULT 60,   -- Tempo de resposta em minutos
  sla_resolution_mins  INT NOT NULL DEFAULT 480,  -- Tempo de solução em minutos
  default_priority     TEXT NOT NULL DEFAULT 'P3 - Moderate',
  auto_assign_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  active               BOOLEAN NOT NULL DEFAULT true,
  sort_order           INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_catalog_symptoms_subitem ON incident_catalog_symptoms(subitem_id);
CREATE INDEX idx_incident_catalog_symptoms_company ON incident_catalog_symptoms(company_id);

-- ─── Adicionar colunas de vínculo ao catálogo na tabela incidents ──
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS catalog_item_id    UUID REFERENCES incident_catalog_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_subitem_id UUID REFERENCES incident_catalog_subitems(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_symptom_id UUID REFERENCES incident_catalog_symptoms(id) ON DELETE SET NULL;

-- ─── Trigger: atribuir SLA automaticamente ao criar incidente ──
CREATE OR REPLACE FUNCTION auto_assign_incident_sla()
RETURNS TRIGGER AS $$
DECLARE
  v_symptom RECORD;
BEGIN
  IF NEW.catalog_symptom_id IS NOT NULL THEN
    SELECT sla_response_mins, sla_resolution_mins, default_priority
      INTO v_symptom
      FROM incident_catalog_symptoms
     WHERE id = NEW.catalog_symptom_id;

    IF FOUND THEN
      -- Calcula deadline de resolução a partir de agora
      NEW.sla_deadline := now() + (v_symptom.sla_resolution_mins * INTERVAL '1 minute');
      -- Aplica a prioridade padrão do sintoma se não foi definida manualmente
      IF NEW.priority IS NULL THEN
        NEW.priority := v_symptom.default_priority;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_assign_incident_sla ON incidents;
CREATE TRIGGER trg_auto_assign_incident_sla
  BEFORE INSERT ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_incident_sla();

-- ─── Dados de Exemplo para Acme Corp ─────────────────────────
-- (company_id deve ser substituído pelo ID real no momento do seed)
-- INSERT INTO incident_catalog_items (company_id, name, icon) VALUES
--   ('<COMPANY_ID>', 'Conectividade & Rede', '🌐'),
--   ('<COMPANY_ID>', 'Hardware & Equipamentos', '💻'),
--   ('<COMPANY_ID>', 'Software & Sistemas', '⚙️'),
--   ('<COMPANY_ID>', 'Segurança da Informação', '🛡️');

COMMENT ON TABLE incident_catalog_items IS 'Catálogo de Incidentes — Nível 1: Item (ex: Rede, Hardware)';
COMMENT ON TABLE incident_catalog_subitems IS 'Catálogo de Incidentes — Nível 2: Sub-item (ex: VPN, Impressora)';
COMMENT ON TABLE incident_catalog_symptoms IS 'Catálogo de Incidentes — Nível 3: Sintoma com SLA de resposta e solução';
