-- ============================================================
-- ServiceFY ITSM — SEED DE HOMOLOGAÇÃO MULTI-TENANT DO MOTOR DE SLA
-- Arquivo: supabase/seed_sla_testing.sql
--
-- Ambiente completo de simulação expandido (Hiper-realista):
--   • 2 tenants white-label (Alpha Tech engenharia · Beta Hospital saúde)
--   • Calendários úteis (Comercial 08–18 vs 24x7) — migration 032
--   • Matriz/políticas + overrides (calendário + prioridade fixa) — 033/038
--   • Acumulador de pausa — 034 · ledger/breach — 035 · hotfixes 036/037/038
--   • Perfis híbridos (allied vs client) — migration 033
--   • Catálogo de 3 níveis: INCIDENTES (Categoria>Serviço>Sintoma) e
--     REQUISIÇÕES (Categoria>Item), com formulários dinâmicos (form_fields)
--
-- PRÉ-REQUISITO: aplicar as migrations 032 → 038 ANTES deste seed.
--
-- IDEMPOTENTE & SEM QUEBRAS:
--   • companies/profiles via INSERT ... ON CONFLICT (id) DO UPDATE
--     (NÃO deletamos profiles → evita FK da tabela legada service_requests).
--   • Demais coleções via upsert por id ou DELETE por company_id (seguro).
--   • UUIDs exclusivos (prefixo 5e1a…) não colidem com tenants demo.
--
-- IDs estáticos:
--   Alpha Tech ..... 5e1a0001-1111-1111-1111-111111111111
--   Beta Hospital .. 5e1a0002-2222-2222-2222-222222222222
-- ============================================================

-- ─── PRE-SEED: garantir coluna slug de forma resiliente ──────
ALTER TABLE public.pending_reasons ADD COLUMN IF NOT EXISTS slug TEXT;

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1. CLIENTES (companies) — white-label, via UPSERT
-- ════════════════════════════════════════════════════════════
-- Alpha: tema ESCURO (engenharia). Beta: tema CLARO hospitalar.
INSERT INTO public.companies (
  id, name, domain, slug, is_provider_tenant, active,
  logo_url, brand_name, primary_color, secondary_color, accent_color, bg_color,
  welcome_title, welcome_subtitle, allow_local_login, sso_providers,
  concurrent_licenses, license_plan, license_alert_threshold
) VALUES
  ('5e1a0001-1111-1111-1111-111111111111', 'Alpha Tech', 'alpha-sla.servicefy.app', 'alpha-sla',
   false, true,
   'https://dummyimage.com/180x48/2563eb/ffffff&text=Alpha+Tech', 'Alpha Tech',
   '#2563EB', '#E0E7FF', '#0EA5E9', '#F8FAFC',
   'Central de Engenharia Alpha', 'Suporte técnico para o time de engenharia', true, '[]'::jsonb,
   25, 'pro', 80),
  ('5e1a0002-2222-2222-2222-222222222222', 'Beta Hospital', 'beta-sla.servicefy.app', 'beta-sla',
   false, true,
   'https://dummyimage.com/180x48/ffffff/0d9488&text=Beta+Hospital', 'Beta Hospital',
   '#0D9488', '#CCFBF1', '#14B8A6', '#F0FDFA',
   'Suporte TI Beta Hospital', 'Atendimento de missão crítica 24/7', true, '[]'::jsonb,
   50, 'enterprise', 80)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, domain = EXCLUDED.domain, slug = EXCLUDED.slug,
  is_provider_tenant = EXCLUDED.is_provider_tenant, active = EXCLUDED.active,
  logo_url = EXCLUDED.logo_url, brand_name = EXCLUDED.brand_name,
  primary_color = EXCLUDED.primary_color, secondary_color = EXCLUDED.secondary_color,
  accent_color = EXCLUDED.accent_color, bg_color = EXCLUDED.bg_color,
  welcome_title = EXCLUDED.welcome_title, welcome_subtitle = EXCLUDED.welcome_subtitle;

-- ════════════════════════════════════════════════════════════
-- 2. CALENDÁRIOS ÚTEIS (sla_calendars + shifts) — UPSERT
-- ════════════════════════════════════════════════════════════
-- Fornecemos Comercial e 24x7 para ambas as empresas de forma estática
INSERT INTO public.sla_calendars (id, company_id, name, timezone, is_24x7) VALUES
  ('5e1aca1e-1111-1111-1111-111111111111', '5e1a0001-1111-1111-1111-111111111111',
   'Comercial (08–18, Seg–Sex)', 'America/Sao_Paulo', false),
  ('5e1aca1e-1111-1111-1111-247247247247', '5e1a0001-1111-1111-1111-111111111111',
   '24x7 Missão Crítica', 'America/Sao_Paulo', true),
  ('5e1aca1e-2222-2222-2222-111111111111', '5e1a0002-2222-2222-2222-222222222222',
   'Comercial (08–18, Seg–Sex)', 'America/Sao_Paulo', false),
  ('5e1aca1e-2222-2222-2222-222222222222', '5e1a0002-2222-2222-2222-222222222222',
   '24x7 Missão Crítica', 'America/Sao_Paulo', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, timezone = EXCLUDED.timezone, is_24x7 = EXCLUDED.is_24x7;

-- Turnos do calendário comercial (recria de forma limpa).
DELETE FROM public.sla_calendar_shifts WHERE calendar_id IN (
  '5e1aca1e-1111-1111-1111-111111111111',
  '5e1aca1e-2222-2222-2222-111111111111'
);

INSERT INTO public.sla_calendar_shifts (calendar_id, weekday, start_time, end_time)
SELECT '5e1aca1e-1111-1111-1111-111111111111', wd, TIME '08:00', TIME '18:00'
  FROM generate_series(1, 5) AS wd;   -- Segunda(1) a Sexta(5)

INSERT INTO public.sla_calendar_shifts (calendar_id, weekday, start_time, end_time)
SELECT '5e1aca1e-2222-2222-2222-111111111111', wd, TIME '08:00', TIME '18:00'
  FROM generate_series(1, 5) AS wd;   -- Segunda(1) a Sexta(5)

-- Calendários padrões das empresas.
UPDATE public.companies SET default_sla_calendar_id = '5e1aca1e-1111-1111-1111-111111111111'
 WHERE id = '5e1a0001-1111-1111-1111-111111111111';
UPDATE public.companies SET default_sla_calendar_id = '5e1aca1e-2222-2222-2222-222222222222'
 WHERE id = '5e1a0002-2222-2222-2222-222222222222';

-- ════════════════════════════════════════════════════════════
-- 3. POLÍTICAS DE SLA por prioridade (P1..P5) — UPSERT
-- ════════════════════════════════════════════════════════════
INSERT INTO public.sla_policies (company_id, priority, response_time_minutes, resolution_time_minutes)
SELECT c.id, p.priority, p.resp, p.resol
  FROM (VALUES
    ('5e1a0001-1111-1111-1111-111111111111'::uuid),
    ('5e1a0002-2222-2222-2222-222222222222'::uuid)
  ) AS c(id)
  CROSS JOIN (VALUES
    (1, 15, 240), (2, 30, 480), (3, 60, 1440), (4, 240, 2880), (5, 480, 5760)
  ) AS p(priority, resp, resol)
ON CONFLICT (company_id, priority) DO UPDATE SET
  response_time_minutes = EXCLUDED.response_time_minutes,
  resolution_time_minutes = EXCLUDED.resolution_time_minutes;

-- ════════════════════════════════════════════════════════════
-- 4. MOTIVOS DE PENDÊNCIA — UPSERT
-- ════════════════════════════════════════════════════════════
INSERT INTO public.pending_reasons (id, company_id, name, slug, requires_customer_action) VALUES
  ('5e1ae000-0000-0000-0000-0000000001a1', '5e1a0001-1111-1111-1111-111111111111', 'Aguardando Usuário',    'aguardando-usuario',    true),
  ('5e1ae000-0000-0000-0000-0000000002a1', '5e1a0001-1111-1111-1111-111111111111', 'Aguardando Fornecedor', 'aguardando-fornecedor', false),
  ('5e1ae000-0000-0000-0000-0000000003a1', '5e1a0001-1111-1111-1111-111111111111', 'Aguardando Aprovação',  'aguardando-aprovacao',  false),
  ('5e1ae000-0000-0000-0000-0000000001b1', '5e1a0002-2222-2222-2222-222222222222', 'Aguardando Usuário',    'aguardando-usuario',    true),
  ('5e1ae000-0000-0000-0000-0000000002b1', '5e1a0002-2222-2222-2222-222222222222', 'Aguardando Fornecedor', 'aguardando-fornecedor', false),
  ('5e1ae000-0000-0000-0000-0000000003b1', '5e1a0002-2222-2222-2222-222222222222', 'Aguardando Aprovação',  'aguardando-aprovacao',  false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug,
  requires_customer_action = EXCLUDED.requires_customer_action;

-- ════════════════════════════════════════════════════════════
-- 5. PERSONAS / PERFIS — UPSERT (sem DELETE → não fere FK legada)
-- ════════════════════════════════════════════════════════════
-- role = RBAC; profile_role = Allied x Cliente.
INSERT INTO public.profiles (id, auth_id, company_id, name, email, role, profile_role, department, active) VALUES
  ('5e1ad000-0000-0000-0000-000000000001', NULL, '5e1a0001-1111-1111-1111-111111111111',
   'Root Allied IT', 'root@allied-sla.it', 'sysadmin', NULL, 'Allied IT', true),
  ('5e1ad000-0000-0000-0000-0000000000a1', NULL, '5e1a0001-1111-1111-1111-111111111111',
   'Ana Allied', 'ana.allied@allied-sla.it', 'agent', 'allied_analyst', 'Service Desk Allied', true),
  ('5e1ad000-0000-0000-0000-0000000000a2', NULL, '5e1a0001-1111-1111-1111-111111111111',
   'Bruno Allied', 'bruno.allied@allied-sla.it', 'agent', 'allied_analyst', 'Service Desk Allied', true),
  ('5e1ad000-0000-0000-0000-0000000000b1', NULL, '5e1a0001-1111-1111-1111-111111111111',
   'Carla Alpha (Interno)', 'carla@alpha-sla.tech', 'agent', 'client_analyst', 'TI Interna Alpha', true),
  ('5e1ad000-0000-0000-0000-0000000000b2', NULL, '5e1a0002-2222-2222-2222-222222222222',
   'Diego Beta (Interno)', 'diego@beta-sla.hospital', 'agent', 'client_analyst', 'TI Interna Beta', true),
  ('5e1ad000-0000-0000-0000-0000000000c1', NULL, '5e1a0001-1111-1111-1111-111111111111',
   'Alice Alpha', 'alice@alpha-sla.tech', 'end_user', NULL, 'Engenharia', true),
  ('5e1ad000-0000-0000-0000-0000000000c2', NULL, '5e1a0001-1111-1111-1111-111111111111',
   'Aldo Alpha', 'aldo@alpha-sla.tech', 'end_user', NULL, 'Engenharia', true),
  ('5e1ad000-0000-0000-0000-0000000000c3', NULL, '5e1a0002-2222-2222-2222-222222222222',
   'Bia Beta', 'bia@beta-sla.hospital', 'end_user', NULL, 'Enfermagem', true),
  ('5e1ad000-0000-0000-0000-0000000000c4', NULL, '5e1a0002-2222-2222-2222-222222222222',
   'Caio Beta', 'caio@beta-sla.hospital', 'end_user', NULL, 'Recepção', true)
ON CONFLICT (id) DO UPDATE SET
  company_id = EXCLUDED.company_id, name = EXCLUDED.name, email = EXCLUDED.email,
  role = EXCLUDED.role, profile_role = EXCLUDED.profile_role,
  department = EXCLUDED.department, active = EXCLUDED.active;

-- ════════════════════════════════════════════════════════════
-- CLEAN UP: Limpeza dos chamados e catálogo antigo dos tenants de teste
-- ════════════════════════════════════════════════════════════
DELETE FROM public.incidents WHERE company_id IN (
  '5e1a0001-1111-1111-1111-111111111111',
  '5e1a0002-2222-2222-2222-222222222222'
);

DELETE FROM public.catalog_service_symptoms WHERE company_id IN (
  '5e1a0001-1111-1111-1111-111111111111',
  '5e1a0002-2222-2222-2222-222222222222'
);

DELETE FROM public.catalog_services WHERE company_id IN (
  '5e1a0001-1111-1111-1111-111111111111',
  '5e1a0002-2222-2222-2222-222222222222'
);

DELETE FROM public.catalog_categories WHERE company_id IN (
  '5e1a0001-1111-1111-1111-111111111111',
  '5e1a0002-2222-2222-2222-222222222222'
);

DELETE FROM public.request_items WHERE company_id IN (
  '5e1a0001-1111-1111-1111-111111111111',
  '5e1a0002-2222-2222-2222-222222222222'
);

DELETE FROM public.request_categories WHERE company_id IN (
  '5e1a0001-1111-1111-1111-111111111111',
  '5e1a0002-2222-2222-2222-222222222222'
);

DELETE FROM public.user_groups WHERE group_id IN (
  SELECT id FROM public.assignment_groups WHERE company_id IN (
    '5e1a0001-1111-1111-1111-111111111111',
    '5e1a0002-2222-2222-2222-222222222222'
  )
);

DELETE FROM public.assignment_groups WHERE company_id IN (
  '5e1a0001-1111-1111-1111-111111111111',
  '5e1a0002-2222-2222-2222-222222222222'
);

-- ════════════════════════════════════════════════════════════
-- 6. SYSTEM SYMPTOMS (Sintomas Globais/Mestre)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.system_symptoms (name, icon, sort_order) VALUES
  ('Queda de Link Dedicado', '🌐', 10),
  ('Falha no Wi-Fi Corporativo', '📶', 20),
  ('Lentidão na VPN', '🔒', 30),
  ('Notebook não liga/Tela Azul', '💻', 40),
  ('Falha em Monitor/Periférico', '🖥️', 50),
  ('Problema em Impressora Térmica', '🖨️', 60),
  ('Suspeita de Phishing/Malware', '🎣', 70),
  ('Bloqueio de Conta por Erro de Senha', '🔑', 80),
  ('Vazamento de Credenciais', '🗂️', 90),
  ('Erro de Timeout no ERP', '⏱️', 100),
  ('Falha na Emissão de Nota Fiscal', '📄', 110),
  ('Banco de Dados Lento', '🛢️', 120),
  ('Ramal mudo', '📞', 130),
  ('Queda na Central de Atendimento/Callcenter', '🎧', 140),
  ('Falha em Aparelho Físico', '☎️', 150)
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 6B. GRUPOS SOLUCIONADORES (assignment_groups & user_groups)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.assignment_groups (id, company_id, name, description, is_active) VALUES
  ('5e1a0001-8888-8888-8888-111111111111', '5e1a0001-1111-1111-1111-111111111111', 'Suporte Redes Alpha', 'Time responsável por conectividade, links dedicados e VPN', true),
  ('5e1a0001-8888-8888-8888-222222222222', '5e1a0001-1111-1111-1111-111111111111', 'Suporte Hardware Alpha', 'Time responsável por desktops, notebooks, periféricos e impressoras físicas', true),
  ('5e1a0001-8888-8888-8888-333333333333', '5e1a0001-1111-1111-1111-111111111111', 'Segurança da Informação Alpha', 'Tratamento de phishing, vazamento de credenciais e acessos suspeitos', true),
  ('5e1a0001-8888-8888-8888-444444444444', '5e1a0001-1111-1111-1111-111111111111', 'Gestão de Acessos Alpha', 'Criação de usuários, permissões em pastas de rede e ERP', true),
  ('5e1a0001-8888-8888-8888-555555555555', '5e1a0001-1111-1111-1111-111111111111', 'Suporte VIP Alpha', 'Atendimento dedicado a diretores, gerentes e dispositivos VIP', true),

  ('5e1a0002-8888-8888-8888-111111111111', '5e1a0002-2222-2222-2222-222222222222', 'Sistemas & Banco de Dados Beta', 'Suporte ao ERP hospitalar, banco de dados e faturamento', true),
  ('5e1a0002-8888-8888-8888-222222222222', '5e1a0002-2222-2222-2222-222222222222', 'Telefonia & VoIP Beta', 'Time responsável por centrais telefônicas, ramais de leitos e callcenter', true),
  ('5e1a0002-8888-8888-8888-333333333333', '5e1a0002-2222-2222-2222-222222222222', 'Onboarding & Integração Beta', 'Criação de contas e kits de tecnologia para novos funcionários hospitalares', true),
  ('5e1a0002-8888-8888-8888-444444444444', '5e1a0002-2222-2222-2222-222222222222', 'Mudanças & Instalações Beta', 'Instalação de pontos físicos, remanejamento de computadores de UTI/leito', true),
  ('5e1a0002-8888-8888-8888-555555555555', '5e1a0002-2222-2222-2222-222222222222', 'Compras & Licenciamento Beta', 'Aquisição de hardware adicional e licenças de software médico', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, is_active = EXCLUDED.is_active;

INSERT INTO public.user_groups (user_id, group_id) VALUES
  ('5e1ad000-0000-0000-0000-0000000000b1', '5e1a0001-8888-8888-8888-111111111111'),
  ('5e1ad000-0000-0000-0000-0000000000b1', '5e1a0001-8888-8888-8888-222222222222'),
  ('5e1ad000-0000-0000-0000-0000000000b1', '5e1a0001-8888-8888-8888-333333333333'),
  ('5e1ad000-0000-0000-0000-0000000000b1', '5e1a0001-8888-8888-8888-444444444444'),
  ('5e1ad000-0000-0000-0000-0000000000b1', '5e1a0001-8888-8888-8888-555555555555'),

  ('5e1ad000-0000-0000-0000-0000000000b2', '5e1a0002-8888-8888-8888-111111111111'),
  ('5e1ad000-0000-0000-0000-0000000000b2', '5e1a0002-8888-8888-8888-222222222222'),
  ('5e1ad000-0000-0000-0000-0000000000b2', '5e1a0002-8888-8888-8888-333333333333'),
  ('5e1ad000-0000-0000-0000-0000000000b2', '5e1a0002-8888-8888-8888-444444444444'),
  ('5e1ad000-0000-0000-0000-0000000000b2', '5e1a0002-8888-8888-8888-555555555555'),

  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0001-8888-8888-8888-111111111111'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0001-8888-8888-8888-222222222222'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0001-8888-8888-8888-333333333333'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0001-8888-8888-8888-444444444444'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0001-8888-8888-8888-555555555555'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0002-8888-8888-8888-111111111111'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0002-8888-8888-8888-222222222222'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0002-8888-8888-8888-333333333333'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0002-8888-8888-8888-444444444444'),
  ('5e1ad000-0000-0000-0000-0000000000a1', '5e1a0002-8888-8888-8888-555555555555'),

  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0001-8888-8888-8888-111111111111'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0001-8888-8888-8888-222222222222'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0001-8888-8888-8888-333333333333'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0001-8888-8888-8888-444444444444'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0001-8888-8888-8888-555555555555'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0002-8888-8888-8888-111111111111'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0002-8888-8888-8888-222222222222'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0002-8888-8888-8888-333333333333'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0002-8888-8888-8888-444444444444'),
  ('5e1ad000-0000-0000-0000-0000000000a2', '5e1a0002-8888-8888-8888-555555555555')
ON CONFLICT (user_id, group_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 7. CATÁLOGO DE INCIDENTES — NÍVEL 1: CATEGORIAS (catalog_categories)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.catalog_categories (id, company_id, name, description, icon) VALUES
  -- Alpha Tech (C1, C2, C3)
  ('5e1aca70-1111-0000-0000-000000000001', '5e1a0001-1111-1111-1111-111111111111', 'Infraestrutura de Rede', 'Conectividade, links e VPN corporativa', '🌐'),
  ('5e1aca70-1111-0000-0000-000000000002', '5e1a0001-1111-1111-1111-111111111111', 'Hardware & Desktops', 'Desktops, notebooks, monitores e impressoras', '🖥️'),
  ('5e1aca70-1111-0000-0000-000000000003', '5e1a0001-1111-1111-1111-111111111111', 'Segurança da Informação', 'Incidentes de segurança, phishing e vazamento de dados', '🛡️'),
  -- Beta Hospital (C4, C5)
  ('5e1aca70-2222-0000-0000-000000000004', '5e1a0002-2222-2222-2222-222222222222', 'Sistemas & ERP', 'Aplicações médicas, prontuário e emissão de notas', '💻'),
  ('5e1aca70-2222-0000-0000-000000000005', '5e1a0002-2222-2222-2222-222222222222', 'Telefonia e VoIP', 'Ramais físicos, VoIP e central de callcenter', '📞')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon;

-- ════════════════════════════════════════════════════════════
-- 8. CATÁLOGO DE INCIDENTES — NÍVEL 2: SERVIÇOS (catalog_services)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.catalog_services (id, company_id, category_id, name, description) VALUES
  -- Alpha Tech (S1, S2, S3)
  ('5e1a5e57-1111-0000-0000-000000000001', '5e1a0001-1111-1111-1111-111111111111', '5e1aca70-1111-0000-0000-000000000001', 'Conectividade e Redes', 'Links de Internet, Wi-Fi e VPN'),
  ('5e1a5e57-1111-0000-0000-000000000002', '5e1a0001-1111-1111-1111-111111111111', '5e1aca70-1111-0000-0000-000000000002', 'Hardware de Estação de Trabalho', 'Manutenção física de equipamentos e periféricos'),
  ('5e1a5e57-1111-0000-0000-000000000003', '5e1a0001-1111-1111-1111-111111111111', '5e1aca70-1111-0000-0000-000000000003', 'Segurança Cibernética', 'Tratamento de ameaças e vulnerabilidades'),
  -- Beta Hospital (S4, S5)
  ('5e1a5e57-2222-0000-0000-000000000004', '5e1a0002-2222-2222-2222-222222222222', '5e1aca70-2222-0000-0000-000000000004', 'Suporte ERP e Banco de Dados', 'Incidentes no ERP hospitalar e lentidão no banco'),
  ('5e1a5e57-2222-0000-0000-000000000005', '5e1a0002-2222-2222-2222-222222222222', '5e1aca70-2222-0000-0000-000000000005', 'Canais de Voz', 'Atendimento de ramais e centrais telefônicas')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, category_id = EXCLUDED.category_id;

-- ════════════════════════════════════════════════════════════
-- 9. CATÁLOGO DE INCIDENTES — NÍVEL 3: JUNÇÃO SERVIÇO × SINTOMA (catalog_service_symptoms)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.catalog_service_symptoms
  (id, company_id, service_id, symptom_id, sla_hours, fixed_priority, sla_calendar_id, form_fields, ui_config)
VALUES
  -- ==========================================
  -- Categoria 1: Infraestrutura de Rede (Alpha Tech)
  -- ==========================================
  -- 1.1 Queda de Link Dedicado [SLA Critical 24/7]
  ('5e1ac55a-1111-0000-0000-000000000001', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000001',
   (SELECT id FROM public.system_symptoms WHERE name = 'Queda de Link Dedicado'),
   2, 1, '5e1aca1e-1111-1111-1111-247247247247',
   '[
     {"id":"circuito","label":"ID do Circuito/Designação","type":"text","required":true},
     {"id":"operadora","label":"Operadora do Link","type":"select","required":true,"options":["Embratel","Vivo","Claro"]},
     {"id":"impacto_negocio","label":"Impacto no Negócio","type":"text","required":true},
     {"id":"evidencia","label":"Evidência do Link Fora (Ping/Logs)","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- 1.2 Falha no Wi-Fi Corporativo
  ('5e1ac55a-1111-0000-0000-000000000002', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000001',
   (SELECT id FROM public.system_symptoms WHERE name = 'Falha no Wi-Fi Corporativo'),
   12, NULL, NULL,
   '[
     {"id":"localizacao","label":"Localização/Prédio/Sala","type":"text","required":true},
     {"id":"dispositivo","label":"Tipo de Dispositivo Afetado","type":"select","required":true,"options":["Notebook","Smartphone","Coletor de Dados"]},
     {"id":"sinal_status","label":"O sinal do Wi-Fi aparece?","type":"select","required":true,"options":["Sim, mas não conecta","Não aparece","Conecta mas sem internet"]},
     {"id":"patrimonio","label":"Patrimônio do Dispositivo","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- 1.3 Lentidão na VPN
  ('5e1ac55a-1111-0000-0000-000000000003', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000001',
   (SELECT id FROM public.system_symptoms WHERE name = 'Lentidão na VPN'),
   24, NULL, NULL,
   '[
     {"id":"usuario_vpn","label":"Usuário da VPN","type":"text","required":true},
     {"id":"tipo_conexao","label":"Tipo de Conexão (ex: Wi-Fi doméstico, 4G/5G)","type":"text","required":true},
     {"id":"mensagem_erro","label":"Mensagem de Erro Exibida","type":"text","required":false},
     {"id":"evidencia","label":"Print do Erro / Latência","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 2: Hardware & Desktops (Alpha Tech)
  -- ==========================================
  -- 2.1 Notebook não liga/Tela Azul
  ('5e1ac55a-1111-0000-0000-000000000004', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000002',
   (SELECT id FROM public.system_symptoms WHERE name = 'Notebook não liga/Tela Azul'),
   12, NULL, NULL,
   '[
     {"id":"patrimonio","label":"Patrimônio do Notebook","type":"text","required":true},
     {"id":"comportamento","label":"Comportamento ao ligar","type":"select","required":true,"options":["Não dá sinal de vida","Liga os LEDs mas tela preta","Dá tela azul (BSOD)"]},
     {"id":"codigo_erro","label":"Código do Erro (STOP code)","type":"text","required":false},
     {"id":"evidencia","label":"Evidência (Mensagem de erro ou foto)","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- 2.2 Falha em Monitor/Periférico
  ('5e1ac55a-1111-0000-0000-000000000005', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000002',
   (SELECT id FROM public.system_symptoms WHERE name = 'Falha em Monitor/Periférico'),
   48, NULL, NULL,
   '[
     {"id":"patrimonio_periferico","label":"Patrimônio/Modelo do Periférico","type":"text","required":true},
     {"id":"tipo_periferico","label":"Tipo de Periférico","type":"select","required":true,"options":["Monitor","Teclado/Mouse","Dock Station","Headset"]},
     {"id":"descricao_falha","label":"Descrição da Falha","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 2.3 Problema em Impressora Térmica
  ('5e1ac55a-1111-0000-0000-000000000006', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000002',
   (SELECT id FROM public.system_symptoms WHERE name = 'Problema em Impressora Térmica'),
   8, NULL, NULL,
   '[
     {"id":"patrimonio_impressora","label":"Patrimônio da Impressora","type":"text","required":true},
     {"id":"modelo","label":"Modelo da Impressora","type":"select","required":true,"options":["Zebra ZD220","Zebra GC420t","Elgin L42 Pro"]},
     {"id":"sintoma_impressora","label":"Sintoma da Impressora","type":"select","required":true,"options":["Luz vermelha piscando","Impressão em branco/clara","Papel travado/enganchado","Não liga"]},
     {"id":"evidencia","label":"Foto da etiqueta com erro","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 3: Segurança da Informação (Alpha Tech)
  -- ==========================================
  -- 3.1 Suspeita de Phishing/Malware [P1 Automático]
  ('5e1ac55a-1111-0000-0000-000000000007', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000003',
   (SELECT id FROM public.system_symptoms WHERE name = 'Suspeita de Phishing/Malware'),
   4, 1, NULL,
   '[
     {"id":"remetente_suspeito","label":"E-mail do Remetente Suspeito","type":"text","required":true},
     {"id":"assunto_email","label":"Assunto do E-mail","type":"text","required":true},
     {"id":"acao_usuario","label":"Clicou em algum link ou baixou anexo?","type":"select","required":true,"options":["Apenas denunciei (seguro)","Cliquei no link","Baixei/executei o anexo","Digitei credenciais"]},
     {"id":"evidencia","label":"Print do E-mail/Link suspeito","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 3.2 Bloqueio de Conta por Erro de Senha
  ('5e1ac55a-1111-0000-0000-000000000008', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000003',
   (SELECT id FROM public.system_symptoms WHERE name = 'Bloqueio de Conta por Erro de Senha'),
   1, NULL, NULL,
   '[
     {"id":"username_bloqueado","label":"Usuário/E-mail Bloqueado","type":"text","required":true},
     {"id":"sistema_bloqueado","label":"Sistema Afetado","type":"select","required":true,"options":["AD/Windows","E-mail Corporativo","VPN","ERP"]}
   ]'::jsonb, '{}'::jsonb),

  -- 3.3 Vazamento de Credenciais
  ('5e1ac55a-1111-0000-0000-000000000009', '5e1a0001-1111-1111-1111-111111111111', '5e1a5e57-1111-0000-0000-000000000003',
   (SELECT id FROM public.system_symptoms WHERE name = 'Vazamento de Credenciais'),
   4, NULL, NULL,
   '[
     {"id":"origem_vazamento","label":"Origem/Como soube do vazamento?","type":"text","required":true},
     {"id":"credenciais_expostas","label":"Quais credenciais foram expostas?","type":"text","required":true},
     {"id":"acoes_tomadas","label":"Alguma ação corretiva já foi tomada?","type":"text","required":false},
     {"id":"evidencia","label":"Print/Link do alerta de vazamento","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 4: Sistemas & ERP (Beta Hospital)
  -- ==========================================
  -- 4.1 Erro de Timeout no ERP
  ('5e1ac55a-2222-0000-0000-000000000004', '5e1a0002-2222-2222-2222-222222222222', '5e1a5e57-2222-0000-0000-000000000004',
   (SELECT id FROM public.system_symptoms WHERE name = 'Erro de Timeout no ERP'),
   12, NULL, NULL,
   '[
     {"id":"modulo_erp","label":"Módulo do ERP","type":"select","required":true,"options":["Faturamento","Financeiro","Suprimentos","Prontuário/Assistencial"]},
     {"id":"tela_funcao","label":"Tela ou Função Acessada","type":"text","required":true},
     {"id":"tempo_espera","label":"Tempo de carregamento antes do timeout (segundos)","type":"text","required":false},
     {"id":"evidencia","label":"Print da tela de timeout/erro","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- 4.2 Falha na Emissão de Nota Fiscal [P1 Automático]
  ('5e1ac55a-2222-0000-0000-000000000005', '5e1a0002-2222-2222-2222-222222222222', '5e1a5e57-2222-0000-0000-000000000004',
   (SELECT id FROM public.system_symptoms WHERE name = 'Falha na Emissão de Nota Fiscal'),
   4, 1, NULL,
   '[
     {"id":"numero_pedido","label":"Número do Pedido/Atendimento","type":"text","required":true},
     {"id":"cliente_paciente","label":"Nome do Cliente/Paciente","type":"text","required":true},
     {"id":"codigo_retorno","label":"Código/Mensagem de Retorno da SEFAZ","type":"text","required":true},
     {"id":"evidencia","label":"XML ou Print da Rejeição","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- 4.3 Banco de Dados Lento
  ('5e1ac55a-2222-0000-0000-000000000006', '5e1a0002-2222-2222-2222-222222222222', '5e1a5e57-2222-0000-0000-000000000004',
   (SELECT id FROM public.system_symptoms WHERE name = 'Banco de Dados Lento'),
   8, NULL, NULL,
   '[
     {"id":"instancia_db","label":"Instância/Nome do Banco de Dados","type":"text","required":true},
     {"id":"query_ou_rotina","label":"Query ou Rotina Afetada (se souber)","type":"text","required":false},
     {"id":"usuarios_afetados","label":"Quantidade estimada de usuários afetados","type":"select","required":true,"options":["Apenas eu","Setor inteiro","Toda a empresa/hospital"]},
     {"id":"evidencia","label":"Logs/Relatório de Performance (Slow Query Log)","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 5: Telefonia e VoIP (Beta Hospital)
  -- ==========================================
  -- 5.1 Ramal mudo
  ('5e1ac55a-2222-0000-0000-000000000007', '5e1a0002-2222-2222-2222-222222222222', '5e1a5e57-2222-0000-0000-000000000005',
   (SELECT id FROM public.system_symptoms WHERE name = 'Ramal mudo'),
   24, NULL, NULL,
   '[
     {"id":"numero_ramal","label":"Número do Ramal Afetado","type":"text","required":true},
     {"id":"modelo_aparelho","label":"Modelo do Aparelho (se físico)","type":"text","required":false},
     {"id":"localizacao_ramal","label":"Localização Física (Prédio/Setor)","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 5.2 Queda na Central de Atendimento/Callcenter [SLA Critical 24/7]
  ('5e1ac55a-2222-0000-0000-000000000008', '5e1a0002-2222-2222-2222-222222222222', '5e1a5e57-2222-0000-0000-000000000005',
   (SELECT id FROM public.system_symptoms WHERE name = 'Queda na Central de Atendimento/Callcenter'),
   2, 1, '5e1aca1e-2222-2222-2222-222222222222',
   '[
     {"id":"fila_atendimento","label":"Fila/Frentes de Atendimento Afetadas","type":"text","required":true},
     {"id":"sintoma_central","label":"Sintoma da Central","type":"select","required":true,"options":["Ligações caindo","Clientes não conseguem completar ligação","Analistas não conseguem logar no sistema"]},
     {"id":"numero_piloto","label":"Número Piloto da Central","type":"text","required":true},
     {"id":"evidencia","label":"Print do erro do painel do agente","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- 5.3 Falha em Aparelho Físico
  ('5e1ac55a-2222-0000-0000-000000000009', '5e1a0002-2222-2222-2222-222222222222', '5e1a5e57-2222-0000-0000-000000000005',
   (SELECT id FROM public.system_symptoms WHERE name = 'Falha em Aparelho Físico'),
   48, NULL, NULL,
   '[
     {"id":"patrimonio_aparelho","label":"Patrimônio do Aparelho","type":"text","required":true},
     {"id":"sintoma_fisico","label":"Sintoma Físico do Aparelho","type":"select","required":true,"options":["Não liga","Sem áudio no fone","Teclado travado","Tela quebrada"]}
   ]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  sla_hours = EXCLUDED.sla_hours, fixed_priority = EXCLUDED.fixed_priority,
  sla_calendar_id = EXCLUDED.sla_calendar_id, form_fields = EXCLUDED.form_fields,
  ui_config = EXCLUDED.ui_config;

-- ════════════════════════════════════════════════════════════
-- 10. CATÁLOGO DE REQUISIÇÕES — NÍVEL 1: CATEGORIAS (request_categories)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.request_categories (id, company_id, name, description, icon) VALUES
  -- Alpha Tech (C6, C7)
  ('5e1a47c0-1111-0000-0000-000000000006', '5e1a0001-1111-1111-1111-111111111111', 'Acessos e Identidades', 'Criação de contas e liberação de acessos a pastas e sistemas', '🔐'),
  ('5e1a47c0-1111-0000-0000-000000000007', '5e1a0001-1111-1111-1111-111111111111', 'Suporte Executivo e VIP', 'Atendimento prioritário de TI para C-Level e reuniões de conselho', '⭐'),
  -- Beta Hospital (C8, C9, C10)
  ('5e1a47c0-2222-0000-0000-000000000008', '5e1a0002-2222-2222-2222-222222222222', 'Integração de Novos Colaboradores', 'Onboarding de novos funcionários e crachás físicos', '👥'),
  ('5e1a47c0-2222-0000-0000-000000000009', '5e1a0002-2222-2222-2222-222222222222', 'Mudança e Movimentação', 'Movimentação física de estações e upgrades de hardware', '📦'),
  ('5e1a47c0-2222-0000-0000-000000000010', '5e1a0002-2222-2222-2222-222222222222', 'Compras e Licenciamento', 'Aquisição de softwares, licenças Adobe e periféricos extras', '🛒')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon;

-- ════════════════════════════════════════════════════════════
-- 11. CATÁLOGO DE REQUISIÇÕES — NÍVEL 2: ITENS (request_items)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.request_items
  (id, company_id, request_category_id, name, description, fixed_priority, sla_calendar_id, form_fields, ui_config)
VALUES
  -- ==========================================
  -- Categoria 6: Acessos e Identidades (Alpha Tech)
  -- ==========================================
  -- 6.1 Criação de Novo Usuário/E-mail
  ('5e1a17e3-1111-0000-0000-000000000061', '5e1a0001-1111-1111-1111-111111111111', '5e1a47c0-1111-0000-0000-000000000006',
   'Criação de Novo Usuário/E-mail', 'Provisionamento de conta de rede AD, e-mail corporativo e acessos básicos', NULL, NULL,
   '[
     {"id":"nome_completo","label":"Nome Completo do Novo Colaborador","type":"text","required":true},
     {"id":"centro_custo","label":"Centro de Custo","type":"text","required":true},
     {"id":"cargo","label":"Cargo/Função","type":"text","required":true},
     {"id":"gestor_aprovador","label":"Gestor Aprovador","type":"text","required":true},
     {"id":"data_admissao","label":"Data de Admissão","type":"date","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 6.2 Liberação de Pasta na Rede
  ('5e1a17e3-1111-0000-0000-000000000062', '5e1a0001-1111-1111-1111-111111111111', '5e1a47c0-1111-0000-0000-000000000006',
   'Liberação de Pasta na Rede', 'Acesso a diretórios compartilhados de rede da empresa', NULL, NULL,
   '[
     {"id":"caminho_pasta","label":"Caminho da Pasta (ex: \\\\servidor\\pasta)","type":"text","required":true},
     {"id":"nivel_acesso","label":"Nível de Acesso","type":"select","required":true,"options":["Apenas Leitura","Leitura e Gravação (Completo)"]},
     {"id":"aprovador","label":"Gestor/Responsável pela Pasta","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 6.3 Acesso a Sistemas de Terceiros
  ('5e1a17e3-1111-0000-0000-000000000063', '5e1a0001-1111-1111-1111-111111111111', '5e1a47c0-1111-0000-0000-000000000006',
   'Acesso a Sistemas de Terceiros', 'Permissão e criação de login em sistemas externos de parceiros/clientes', NULL, NULL,
   '[
     {"id":"nome_sistema","label":"Nome do Sistema","type":"text","required":true},
     {"id":"url_sistema","label":"URL de Acesso ao Sistema","type":"text","required":false},
     {"id":"justificativa","label":"Justificativa do Acesso","type":"text","required":true},
     {"id":"aprovador_sistema","label":"Gestor Aprovador","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 7: Suporte Executivo e VIP (Alpha Tech)
  -- ==========================================
  -- 7.1 Configuração de Dispositivo de Diretor [Fixed_priority=1]
  ('5e1a17e3-1111-0000-0000-000000000071', '5e1a0001-1111-1111-1111-111111111111', '5e1a47c0-1111-0000-0000-000000000007',
   'Configuração de Dispositivo de Diretor', 'Entrega e configuração rápida de notebooks, celulares e tablets corporativos para diretores', 1, NULL,
   '[
     {"id":"nome_diretor","label":"Nome do Diretor/Membro do Board","type":"text","required":true},
     {"id":"dispositivo_tipo","label":"Tipo de Dispositivo","type":"select","required":true,"options":["iPhone","iPad","Macbook","Notebook VIP"]},
     {"id":"detalhes_config","label":"Necessidades Específicas de Configuração","type":"text","required":false},
     {"id":"data_entrega","label":"Data/Hora Desejada para Entrega","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 7.2 Liberação de Sala de Reunião Boardroom
  ('5e1a17e3-1111-0000-0000-000000000072', '5e1a0001-1111-1111-1111-111111111111', '5e1a47c0-1111-0000-0000-000000000007',
   'Liberação de Sala de Reunião Boardroom', 'Reserva e suporte presencial técnico para reuniões de conselho e diretores', NULL, NULL,
   '[
     {"id":"data_reuniao","label":"Data da Reunião","type":"date","required":true},
     {"id":"horario_inicio","label":"Horário de Início","type":"text","required":true},
     {"id":"horario_fim","label":"Horário de Término","type":"text","required":true},
     {"id":"necessidades","label":"Necessidades Extras (ex: videoconferência, coffee break)","type":"text","required":false},
     {"id":"solicitante_vip","label":"Membro VIP Solicitante","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 7.3 Homologação de Software para C-Level
  ('5e1a17e3-1111-0000-0000-000000000073', '5e1a0001-1111-1111-1111-111111111111', '5e1a47c0-1111-0000-0000-000000000007',
   'Homologação de Software para C-Level', 'Análise de segurança e liberação de instalação de softwares requisitados por diretores', NULL, NULL,
   '[
     {"id":"nome_software","label":"Nome do Software","type":"text","required":true},
     {"id":"versao_fabricante","label":"Versão/Fabricante","type":"text","required":true},
     {"id":"finalidade","label":"Finalidade/Uso Recomendado","type":"text","required":true},
     {"id":"diretor_apadrinhador","label":"Diretor Solicitante/Aprovador","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 8: Integração de Novos Colaboradores (Beta Hospital)
  -- ==========================================
  -- 8.1 Kit Onboarding Completo [SLA Padrão]
  ('5e1a17e3-2222-0000-0000-000000000081', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000008',
   'Kit Onboarding Completo', 'Solicitação de kit padrão (PC, Acessos, E-mail, Telefonia) para novos funcionários do hospital', NULL, NULL,
   '[
     {"id":"nome_completo","label":"Nome Completo do Colaborador","type":"text","required":true},
     {"id":"cargo","label":"Cargo","type":"text","required":true},
     {"id":"centro_custo","label":"Centro de Custo","type":"text","required":true},
     {"id":"perfil_equipamento","label":"Perfil do Equipamento","type":"select","required":true,"options":["Padrão Administrativo","Perfil Assistencial/Enfermagem","Notebook Engenharia/TI"]},
     {"id":"aprovador","label":"Gestor Aprovador","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 8.2 Solicitação de Crachá/Acesso Físico
  ('5e1a17e3-2222-0000-0000-000000000082', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000008',
   'Solicitação de Crachá/Acesso Físico', 'Emissão e ativação de crachá de proximidade para portas e catracas do hospital', NULL, NULL,
   '[
     {"id":"nome_cracha","label":"Nome a ser impresso no Crachá","type":"text","required":true},
     {"id":"tipo_vinculo","label":"Tipo de Vínculo","type":"select","required":true,"options":["CLT","Terceirizado","Estagiário","Médico Residente"]},
     {"id":"alas_liberadas","label":"Alas/Setores de Acesso Físico Necessário","type":"text","required":true},
     {"id":"foto_status","label":"Foto do Colaborador anexada?","type":"select","required":true,"options":["Sim","Não, tirar foto no RH"]}
   ]'::jsonb, '{}'::jsonb),

  -- 8.3 Criação de Perfil no RH
  ('5e1a17e3-2222-0000-0000-000000000083', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000008',
   'Criação de Perfil no RH', 'Cadastramento do colaborador no sistema integrado de recursos humanos do hospital', NULL, NULL,
   '[
     {"id":"cpf_colaborador","label":"CPF do Colaborador","type":"text","required":true},
     {"id":"data_admissao","label":"Data de Admissão","type":"date","required":true},
     {"id":"telefone_contato","label":"Telefone de Contato","type":"text","required":true},
     {"id":"dados_bancarios","label":"Dados Bancários (Banco/Ag/CC)","type":"text","required":false}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 9: Mudança e Movimentação (Beta Hospital)
  -- ==========================================
  -- 9.1 Mudança de Layout de Estação de Trabalho
  ('5e1a17e3-2222-0000-0000-000000000091', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000009',
   'Mudança de Layout de Estação de Trabalho', 'Transferência física de móveis, cabeamento e equipamentos de TI entre setores', NULL, NULL,
   '[
     {"id":"origem_layout","label":"Localização Atual (Prédio/Setor/Mesa)","type":"text","required":true},
     {"id":"destino_layout","label":"Localização Destino (Prédio/Setor/Mesa)","type":"text","required":true},
     {"id":"data_mudanca","label":"Data da Mudança","type":"date","required":true},
     {"id":"patrimonios_mover","label":"Patrimônios dos Equipamentos a Mover","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 9.2 Solicitação de Upgrade de Memória/SSD
  ('5e1a17e3-2222-0000-0000-000000000092', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000009',
   'Solicitação de Upgrade de Memória/SSD', 'Instalação física de novos módulos de memória RAM ou discos SSD em computadores lentos', NULL, NULL,
   '[
     {"id":"patrimonio_equipamento","label":"Patrimônio do Equipamento","type":"text","required":true},
     {"id":"upgrade_tipo","label":"Tipo de Upgrade Solicitado","type":"select","required":true,"options":["Upgrade de RAM (+8GB)","Upgrade de RAM (+16GB)","Upgrade de SSD (Troca por 512GB)","Upgrade de SSD (Troca por 1TB)"]},
     {"id":"justificativa","label":"Justificativa da Necessidade de Performance","type":"text","required":true},
     {"id":"gestor_aprovador","label":"Gestor Aprovador","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 9.3 Devolução de Equipamento/Offboarding
  ('5e1a17e3-2222-0000-0000-000000000093', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000009',
   'Devolução de Equipamento/Offboarding', 'Recebimento e conferência de ativos de TI de funcionários desligados do hospital', NULL, NULL,
   '[
     {"id":"nome_colaborador_desligado","label":"Nome do Colaborador Desligado","type":"text","required":true},
     {"id":"data_desligamento","label":"Data de Desligamento","type":"date","required":true},
     {"id":"equipamentos_devolver","label":"Lista de Equipamentos/Patrimônios","type":"text","required":true},
     {"id":"responsavel_devolucao","label":"Responsável pela entrega","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- ==========================================
  -- Categoria 10: Compras e Licenciamento (Beta Hospital)
  -- ==========================================
  -- 10.1 Renovação de Licença Adobe
  ('5e1a17e3-2222-0000-0000-000000000101', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000010',
   'Renovação de Licença Adobe', 'Compra ou renovação de licenças de produtos Adobe (Photoshop, Acrobat, etc.)', NULL, NULL,
   '[
     {"id":"usuario_licenca","label":"E-mail do Usuário da Licença","type":"text","required":true},
     {"id":"tipo_licenca","label":"Tipo de Licença Adobe","type":"select","required":true,"options":["Creative Cloud Todos os Apps","Acrobat Pro","Photoshop Single App","Illustrator Single App"]},
     {"id":"centro_custo","label":"Centro de Custo","type":"text","required":true},
     {"id":"aprovador_financeiro","label":"Gestor/Aprovador","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 10.2 Solicitação de Periférico Adicional
  ('5e1a17e3-2222-0000-0000-000000000102', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000010',
   'Solicitação de Periférico Adicional', 'Requisição de periféricos extras (mouses, teclados, suportes e adaptadores)', NULL, NULL,
   '[
     {"id":"tipo_periferico","label":"Periférico Solicitado","type":"select","required":true,"options":["Mouse sem Fio","Teclado sem Fio","Suporte articulado monitor","Hub USB-C"]},
     {"id":"justificativa","label":"Justificativa","type":"text","required":true},
     {"id":"centro_custo","label":"Centro de Custo","type":"text","required":true},
     {"id":"aprovador","label":"Gestor Aprovador","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb),

  -- 10.3 Compra de Software Específico
  ('5e1a17e3-2222-0000-0000-000000000103', '5e1a0002-2222-2222-2222-222222222222', '5e1a47c0-2222-0000-0000-000000000010',
   'Compra de Software Específico', 'Orçamento e aquisição de licenças de software não padronizados pela corporação', NULL, NULL,
   '[
     {"id":"nome_software","label":"Nome do Software e Fabricante","type":"text","required":true},
     {"id":"link_software","label":"Link do Fabricante / Preço Estimado","type":"text","required":false},
     {"id":"justificativa_negocio","label":"Justificativa de Uso para o Negócio","type":"text","required":true},
     {"id":"centro_custo","label":"Centro de Custo para Faturamento","type":"text","required":true},
     {"id":"gestor_aprovador","label":"Gestor Aprovador","type":"text","required":true}
   ]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  fixed_priority = EXCLUDED.fixed_priority, sla_calendar_id = EXCLUDED.sla_calendar_id,
  form_fields = EXCLUDED.form_fields, ui_config = EXCLUDED.ui_config;

-- ─── 11B. ASSOCIAÇÃO DO CATÁLOGO AOS GRUPOS SOLUCIONADORES ───
-- Atualizar grupos nos incidentes (catalog_service_symptoms)
UPDATE public.catalog_service_symptoms 
SET assignment_group_id = 
  CASE 
    WHEN id IN ('5e1ac55a-1111-0000-0000-000000000001', '5e1ac55a-1111-0000-0000-000000000002', '5e1ac55a-1111-0000-0000-000000000003') THEN '5e1a0001-8888-8888-8888-111111111111'::uuid
    WHEN id IN ('5e1ac55a-1111-0000-0000-000000000004', '5e1ac55a-1111-0000-0000-000000000005', '5e1ac55a-1111-0000-0000-000000000006') THEN '5e1a0001-8888-8888-8888-222222222222'::uuid
    WHEN id IN ('5e1ac55a-1111-0000-0000-000000000007', '5e1ac55a-1111-0000-0000-000000000008', '5e1ac55a-1111-0000-0000-000000000009') THEN '5e1a0001-8888-8888-8888-333333333333'::uuid
    WHEN id IN ('5e1ac55a-2222-0000-0000-000000000004', '5e1ac55a-2222-0000-0000-000000000005', '5e1ac55a-2222-0000-0000-000000000006') THEN '5e1a0002-8888-8888-8888-111111111111'::uuid
    WHEN id IN ('5e1ac55a-2222-0000-0000-000000000007', '5e1ac55a-2222-0000-0000-000000000008', '5e1ac55a-2222-0000-0000-000000000009') THEN '5e1a0002-8888-8888-8888-222222222222'::uuid
  END
WHERE id IN (
  '5e1ac55a-1111-0000-0000-000000000001', '5e1ac55a-1111-0000-0000-000000000002', '5e1ac55a-1111-0000-0000-000000000003',
  '5e1ac55a-1111-0000-0000-000000000004', '5e1ac55a-1111-0000-0000-000000000005', '5e1ac55a-1111-0000-0000-000000000006',
  '5e1ac55a-1111-0000-0000-000000000007', '5e1ac55a-1111-0000-0000-000000000008', '5e1ac55a-1111-0000-0000-000000000009',
  '5e1ac55a-2222-0000-0000-000000000004', '5e1ac55a-2222-0000-0000-000000000005', '5e1ac55a-2222-0000-0000-000000000006',
  '5e1ac55a-2222-0000-0000-000000000007', '5e1ac55a-2222-0000-0000-000000000008', '5e1ac55a-2222-0000-0000-000000000009'
);

-- Atualizar grupos nas requisições (request_items)
UPDATE public.request_items 
SET assignment_group_id = 
  CASE 
    WHEN id IN ('5e1a17e3-1111-0000-0000-000000000061', '5e1a17e3-1111-0000-0000-000000000062', '5e1a17e3-1111-0000-0000-000000000063') THEN '5e1a0001-8888-8888-8888-444444444444'::uuid
    WHEN id IN ('5e1a17e3-1111-0000-0000-000000000071', '5e1a17e3-1111-0000-0000-000000000072', '5e1a17e3-1111-0000-0000-000000000073') THEN '5e1a0001-8888-8888-8888-555555555555'::uuid
    WHEN id IN ('5e1a17e3-2222-0000-0000-000000000081', '5e1a17e3-2222-0000-0000-000000000082', '5e1a17e3-2222-0000-0000-000000000083') THEN '5e1a0002-8888-8888-8888-333333333333'::uuid
    WHEN id IN ('5e1a17e3-2222-0000-0000-000000000091', '5e1a17e3-2222-0000-0000-000000000092', '5e1a17e3-2222-0000-0000-000000000093') THEN '5e1a0002-8888-8888-8888-444444444444'::uuid
    WHEN id IN ('5e1a17e3-2222-0000-0000-000000000101', '5e1a17e3-2222-0000-0000-000000000102', '5e1a17e3-2222-0000-0000-000000000103') THEN '5e1a0002-8888-8888-8888-555555555555'::uuid
  END
WHERE id IN (
  '5e1a17e3-1111-0000-0000-000000000061', '5e1a17e3-1111-0000-0000-000000000062', '5e1a17e3-1111-0000-0000-000000000063',
  '5e1a17e3-1111-0000-0000-000000000071', '5e1a17e3-1111-0000-0000-000000000072', '5e1a17e3-1111-0000-0000-000000000073',
  '5e1a17e3-2222-0000-0000-000000000081', '5e1a17e3-2222-0000-0000-000000000082', '5e1a17e3-2222-0000-0000-000000000083',
  '5e1a17e3-2222-0000-0000-000000000091', '5e1a17e3-2222-0000-0000-000000000092', '5e1a17e3-2222-0000-0000-000000000093',
  '5e1a17e3-2222-0000-0000-000000000101', '5e1a17e3-2222-0000-0000-000000000102', '5e1a17e3-2222-0000-0000-000000000103'
);

-- ════════════════════════════════════════════════════════════
-- 12. CHAMADOS DE EXEMPLO (consomem o catálogo)
-- ════════════════════════════════════════════════════════════

-- INC-A1 (Alpha Tech) · Queda de link → override calendário 24x7 e P1 (fixed_priority = 1)
INSERT INTO public.incidents (
  id, company_id, ticket_type, short_description, description, category,
  caller_id, caller_name, impact, urgency, state,
  catalog_service_id, symptom_id, form_data
) VALUES (
  '5e1a0c00-0000-0000-0000-000000000001', '5e1a0001-1111-1111-1111-111111111111', 'incident',
  'Queda total do link dedicado', 'Link de internet dedicado fora do ar na matriz.', 'Network',
  '5e1ad000-0000-0000-0000-0000000000c1', 'Alice Alpha', 'High', 'High', 'New',
  '5e1a5e57-1111-0000-0000-000000000001',
  (SELECT id FROM public.system_symptoms WHERE name = 'Queda de Link Dedicado'),
  '{"circuito": "CIR-ALP-4471", "operadora": "Embratel", "impacto_negocio": "Matriz da engenharia sem comunicação com datacenter"}'::jsonb
);

-- INC-B1 (Beta Hospital) · Falha na Emissão de Nota Fiscal → override P1 e calendário default (24x7)
INSERT INTO public.incidents (
  id, company_id, ticket_type, short_description, description, category,
  caller_id, caller_name, impact, urgency, state,
  assigned_to_id, assigned_to_name, responded_at,
  catalog_service_id, symptom_id, form_data
) VALUES (
  '5e1a0c00-0000-0000-0000-000000000002', '5e1a0002-2222-2222-2222-222222222222', 'incident',
  'Erro ao emitir nota fiscal de internação', 'Sistema de faturamento rejeitando lotes SEFAZ.', 'Software',
  '5e1ad000-0000-0000-0000-0000000000c3', 'Bia Beta', 'Low', 'Low', 'In Progress',
  '5e1ad000-0000-0000-0000-0000000000a2', 'Bruno Allied', now(),
  '5e1a5e57-2222-0000-0000-000000000004',
  (SELECT id FROM public.system_symptoms WHERE name = 'Falha na Emissão de Nota Fiscal'),
  '{"numero_pedido": "PED-6619-A", "cliente_paciente": "Dona Maria Conceição", "codigo_retorno": "Rejeição 203: Emissor não autorizado para o serviço"}'::jsonb
);

-- INC-A2 (Alpha Tech) · Notebook não liga/Tela Azul → depois PENDENTE (testa paused_at)
INSERT INTO public.incidents (
  id, company_id, ticket_type, short_description, description, category,
  caller_id, caller_name, impact, urgency, state,
  assigned_to_id, assigned_to_name, responded_at,
  catalog_service_id, symptom_id, form_data
) VALUES (
  '5e1a0c00-0000-0000-0000-000000000003', '5e1a0001-1111-1111-1111-111111111111', 'incident',
  'Notebook não liga (BSOD recorrente)', 'Notebook dando tela azul logo após o login no Windows.', 'Hardware',
  '5e1ad000-0000-0000-0000-0000000000c2', 'Aldo Alpha', 'Medium', 'Medium', 'In Progress',
  '5e1ad000-0000-0000-0000-0000000000a1', 'Ana Allied', now(),
  '5e1a5e57-1111-0000-0000-000000000002',
  (SELECT id FROM public.system_symptoms WHERE name = 'Notebook não liga/Tela Azul'),
  '{"patrimonio": "NB-ALP-0098", "comportamento": "Dá tela azul (BSOD)", "codigo_erro": "0x0000007E"}'::jsonb
);

UPDATE public.incidents
   SET state = 'On Hold',
       pending_reason_id = '5e1ae000-0000-0000-0000-0000000001a1',
       pending_reason = 'Aguardando Usuário'
 WHERE id = '5e1a0c00-0000-0000-0000-000000000003';

-- INC-A3 (Alpha Tech) · Sem catálogo, sob gestão do CLIENTE (Regra de Ouro → SLA congelado)
INSERT INTO public.incidents (
  id, company_id, ticket_type, short_description, description, category,
  caller_id, caller_name, impact, urgency, state,
  assigned_to_id, assigned_to_name, responded_at
) VALUES (
  '5e1a0c00-0000-0000-0000-000000000004', '5e1a0001-1111-1111-1111-111111111111', 'incident',
  'Ajuste em sistema interno de engenharia', 'Tratado pelo time interno da Alpha — relógio Allied congelado.', 'Software',
  '5e1ad000-0000-0000-0000-0000000000c1', 'Alice Alpha', 'High', 'High', 'In Progress',
  '5e1ad000-0000-0000-0000-0000000000b1', 'Carla Alpha (Interno)', now()
);

-- REQ-A1 (Alpha Tech) · Criação de Novo Usuário/E-mail
INSERT INTO public.incidents (
  id, company_id, ticket_type, short_description, description, category,
  caller_id, caller_name, impact, urgency, state,
  request_item_id, form_data
) VALUES (
  '5e1a0c00-0000-0000-0000-000000000005', '5e1a0001-1111-1111-1111-111111111111', 'request',
  'Criação de Novo Usuário/E-mail', 'Provisionamento de conta de rede e mailbox para novo dev.', 'Inquiry',
  '5e1ad000-0000-0000-0000-0000000000c2', 'Aldo Alpha', 'Low', 'Medium', 'New',
  '5e1a17e3-1111-0000-0000-000000000061',
  '{"nome_completo": "João da Silva", "centro_custo": "ENG-42", "cargo": "Engenheiro de Software", "gestor_aprovador": "Carlos Souza", "data_admissao": "2026-06-15"}'::jsonb
);

-- REQ-B1 (Alpha Tech) · VIP Dispositivo de Diretor → override fixed_priority = 1 (P1)
INSERT INTO public.incidents (
  id, company_id, ticket_type, short_description, description, category,
  caller_id, caller_name, impact, urgency, state,
  request_item_id, form_data
) VALUES (
  '5e1a0c00-0000-0000-0000-000000000006', '5e1a0001-1111-1111-1111-111111111111', 'request',
  'Configuração de iPad do board', 'Configuração executiva prioritária para o conselho.', 'Inquiry',
  '5e1ad000-0000-0000-0000-0000000000c1', 'Alice Alpha', 'Low', 'Low', 'New',
  '5e1a17e3-1111-0000-0000-000000000071',
  '{"nome_diretor": "Dra. Helena (CEO)", "dispositivo_tipo": "iPad", "detalhes_config": "Acesso ao e-mail institucional e VPN pré-instalados", "data_entrega": "Hoje às 17:00"}'::jsonb
);

-- REQ-B2 (Beta Hospital) · Kit Onboarding Completo (SLA padrão)
INSERT INTO public.incidents (
  id, company_id, ticket_type, short_description, description, category,
  caller_id, caller_name, impact, urgency, state,
  request_item_id, form_data
) VALUES (
  '5e1a0c00-0000-0000-0000-000000000007', '5e1a0002-2222-2222-2222-222222222222', 'request',
  'Solicitação de Kit Onboarding de Novo Enfermeiro', 'Kit padrão com crachá, acesso ao PEP e ramal.', 'Inquiry',
  '5e1ad000-0000-0000-0000-0000000000c3', 'Bia Beta', 'Medium', 'Medium', 'New',
  '5e1a17e3-2222-0000-0000-000000000081',
  '{"nome_completo": "Mariana Souza", "cargo": "Enfermeira Chefe", "centro_custo": "ENF-03", "perfil_equipamento": "Perfil Assistencial/Enfermagem", "aprovador": "Dr. Roberto Silva"}'::jsonb
);

COMMIT;
