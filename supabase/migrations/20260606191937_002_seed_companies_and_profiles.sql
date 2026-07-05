-- ============================================================
-- FLOWFY ITSM — Seed: Companies, Groups, Profiles & Tickets
-- Migration: 002_seed_companies_and_profiles
-- ============================================================

-- COMPANIES
INSERT INTO companies (id, name, domain, logo_url, primary_color, accent_color, bg_color, welcome_title, welcome_subtitle, allow_local_login, sso_providers)
VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'Acme Corp',
  'acme.com',
  'https://api.dicebear.com/7.x/shapes/svg?seed=acme&backgroundColor=2563eb&size=64',
  '#2563EB','#3B82F6','#EFF6FF',
  'Central de Serviços Acme','Como podemos te ajudar hoje?',
  true,
  '[{"id":"msft","type":"microsoft","label":"Entrar com Microsoft","tenantId":"acme-tenant","enabled":true},{"id":"ad","type":"active_directory","label":"Active Directory","domain":"acme.local","enabled":true}]'::jsonb
),
(
  '22222222-2222-2222-2222-222222222222',
  'Globex IT',
  'globex.io',
  'https://api.dicebear.com/7.x/shapes/svg?seed=globex&backgroundColor=059669&size=64',
  '#059669','#10B981','#ECFDF5',
  'Suporte Globex IT','Soluções ágeis para o seu negócio.',
  false,
  '[{"id":"google","type":"google","label":"Entrar com Google Workspace","domain":"globex.io","enabled":true}]'::jsonb
),
(
  '33333333-3333-3333-3333-333333333333',
  'Initech Finance',
  'initech.com.br',
  'https://api.dicebear.com/7.x/shapes/svg?seed=initech&backgroundColor=d97706&size=64',
  '#D97706','#F59E0B','#FFFBEB',
  'Portal Financeiro Initech','Atendimento especializado para sua equipe financeira.',
  true,
  '[{"id":"msft","type":"microsoft","label":"Microsoft Entra ID","tenantId":"initech-tenant","enabled":true}]'::jsonb
);

-- GROUPS
INSERT INTO groups (id, company_id, name, description)
VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Infraestrutura Acme','Suporte de infraestrutura e servidores'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Service Desk Acme','Atendimento de 1o nivel'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222','TI Globex','Time de TI da Globex'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','33333333-3333-3333-3333-333333333333','Financeiro TI','Equipe de suporte financeiro');

-- PROFILES (valid UUIDs only)
INSERT INTO profiles (id, company_id, name, email, role, department, avatar_url)
VALUES
('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','11111111-1111-1111-1111-111111111111','Carlos Mendez','carlos.mendez@acme.com','sysadmin','TI','https://api.dicebear.com/7.x/avataaars/svg?seed=carlos'),
('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2','11111111-1111-1111-1111-111111111111','Ana Ferreira','ana.ferreira@acme.com','company_admin','Gestao TI','https://api.dicebear.com/7.x/avataaars/svg?seed=ana'),
('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','11111111-1111-1111-1111-111111111111','Roberto Lima','roberto.lima@acme.com','agent','Service Desk','https://api.dicebear.com/7.x/avataaars/svg?seed=roberto'),
('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','11111111-1111-1111-1111-111111111111','Juliana Costa','juliana.costa@acme.com','end_user','Financeiro','https://api.dicebear.com/7.x/avataaars/svg?seed=juliana'),
('e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5','22222222-2222-2222-2222-222222222222','Marcelo Souza','marcelo.souza@globex.io','company_admin','TI','https://api.dicebear.com/7.x/avataaars/svg?seed=marcelo'),
('f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6','22222222-2222-2222-2222-222222222222','Fernanda Rocha','fernanda.rocha@globex.io','agent','Suporte','https://api.dicebear.com/7.x/avataaars/svg?seed=fernanda'),
('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7','22222222-2222-2222-2222-222222222222','Diego Alves','diego.alves@globex.io','end_user','Vendas','https://api.dicebear.com/7.x/avataaars/svg?seed=diego'),
('b8b8b8b8-b8b8-b8b8-b8b8-b8b8b8b8b8b8','33333333-3333-3333-3333-333333333333','Patricia Nunes','patricia.nunes@initech.com.br','company_admin','TI Financeiro','https://api.dicebear.com/7.x/avataaars/svg?seed=patricia'),
('c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9','33333333-3333-3333-3333-333333333333','Igor Santos','igor.santos@initech.com.br','agent','Suporte Financeiro','https://api.dicebear.com/7.x/avataaars/svg?seed=igor'),
('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0','33333333-3333-3333-3333-333333333333','Beatriz Oliveira','beatriz.oliveira@initech.com.br','end_user','Controladoria','https://api.dicebear.com/7.x/avataaars/svg?seed=beatriz');

-- SLA POLICIES
INSERT INTO sla_policies (company_id, ticket_type, priority, response_time_mins, resolution_time_mins)
VALUES
('11111111-1111-1111-1111-111111111111','incident','P1 - Critical',15,240),
('11111111-1111-1111-1111-111111111111','incident','P2 - High',60,480),
('11111111-1111-1111-1111-111111111111','incident','P3 - Moderate',240,1440),
('11111111-1111-1111-1111-111111111111','incident','P4 - Low',480,4320),
('22222222-2222-2222-2222-222222222222','incident','P1 - Critical',30,480),
('22222222-2222-2222-2222-222222222222','incident','P2 - High',120,720),
('33333333-3333-3333-3333-333333333333','incident','P1 - Critical',15,120);

-- CATALOG ITEMS
INSERT INTO catalog_items (company_id, name, description, category, icon, estimated_delivery_days, cost, requires_approval, form_fields)
VALUES
('11111111-1111-1111-1111-111111111111','Novo Notebook','Solicite um novo notebook corporativo.','Hardware','💻',10,4500.00,true,
 '[{"id":"f1","label":"Justificativa","type":"textarea","required":true},{"id":"f2","label":"Sistema Operacional","type":"select","options":["Windows 11","macOS","Ubuntu"],"required":true}]'::jsonb),
('11111111-1111-1111-1111-111111111111','Acesso VPN','Solicite acesso remoto via VPN corporativa.','Acesso','🔐',1,null,false,
 '[{"id":"f1","label":"Motivo do Acesso","type":"textarea","required":true},{"id":"f2","label":"Periodo","type":"select","options":["Temporario (30 dias)","Permanente"],"required":true}]'::jsonb);

-- INCIDENTS
INSERT INTO incidents (company_id, short_description, description, priority, state, category, caller_id, caller_name, assigned_to_id, assigned_to_name, assigned_group_id, assigned_group_name, sla_breached, sla_deadline)
VALUES
('11111111-1111-1111-1111-111111111111','Servidor de producao fora do ar','O servidor web principal esta retornando 503 para todos os clientes. Impacto total na operacao.','P1 - Critical','In Progress','Network','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','Juliana Costa','c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','Roberto Lima','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Infraestrutura Acme',true,NOW()-interval '2 hours'),
('11111111-1111-1111-1111-111111111111','Impressora do 3o andar sem comunicacao','A impressora HP LaserJet nao responde desde ontem.','P3 - Moderate','New','Hardware','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','Juliana Costa',null,null,null,null,false,NOW()+interval '5 hours'),
('11111111-1111-1111-1111-111111111111','VPN lenta apos atualizacao','Apos atualizacao do cliente VPN, conexao ficou lenta para todos os usuarios remotos.','P2 - High','In Progress','Network','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','Juliana Costa','c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','Roberto Lima','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Infraestrutura Acme',false,NOW()+interval '3 hours'),
('11111111-1111-1111-1111-111111111111','Erro no login do sistema ERP','Usuarios do modulo financeiro nao conseguem autenticar no ERP. Mensagem: Invalid token.','P2 - High','On Hold','Software','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','Juliana Costa','c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','Roberto Lima','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Service Desk Acme',true,NOW()-interval '30 minutes'),
('11111111-1111-1111-1111-111111111111','Monitor com tela piscando','Monitor da sala de reunioes A piscando intermitentemente.','P4 - Low','Resolved','Hardware','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','Juliana Costa','c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','Roberto Lima','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Service Desk Acme',false,NOW()-interval '1 day'),
('22222222-2222-2222-2222-222222222222','E-mail corporativo inacessivel','Todos os usuarios do dominio globex.io nao conseguem acessar o webmail.','P1 - Critical','New','Software','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7','Diego Alves','f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6','Fernanda Rocha','cccccccc-cccc-cccc-cccc-cccccccccccc','TI Globex',true,NOW()-interval '1 hour'),
('33333333-3333-3333-3333-333333333333','Sistema de cobranca travado','O modulo de cobranca do sistema financeiro esta travado, impedindo o fechamento do mes.','P1 - Critical','In Progress','Software','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0','Beatriz Oliveira','c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9','Igor Santos','dddddddd-dddd-dddd-dddd-dddddddddddd','Financeiro TI',false,NOW()+interval '2 hours');

-- SERVICE REQUESTS
INSERT INTO service_requests (company_id, catalog_item_name, requester_id, requester_name, approver_id, approver_name, state, priority, form_data, cost)
VALUES
('11111111-1111-1111-1111-111111111111','Novo Notebook','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','Juliana Costa','b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2','Ana Ferreira','Awaiting Approval','P3 - Moderate','{"Justificativa":"Notebook atual com 5 anos de uso."}'::jsonb,4500.00),
('11111111-1111-1111-1111-111111111111','Acesso VPN','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','Juliana Costa',null,null,'Fulfilled','P4 - Low','{"Motivo":"Trabalho remoto recorrente."}'::jsonb,null);

-- PROBLEMS
INSERT INTO problems (company_id, short_description, description, priority, state, category, root_cause, workaround, known_error, assigned_to_id, assigned_to_name)
VALUES
('11111111-1111-1111-1111-111111111111','Falhas recorrentes de rede no periodo noturno','Tres incidentes de rede registrados nos ultimos 15 dias, todos entre 23h e 02h.','P2 - High','Known Error','Network','Switch core com firmware desatualizado causando memory leak.','Reiniciar o switch core apos pico de uso.', true,'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','Roberto Lima'),
('11111111-1111-1111-1111-111111111111','Instabilidade no ERP apos patchs','Toda vez que um patch do ERP e aplicado, usuarios enfrentam falhas de login por 1-2h.','P2 - High','Under Investigation','Software',null,null,false,'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','Roberto Lima');

-- CHANGES
INSERT INTO changes (company_id, short_description, description, justification, type, risk, state, implementation_plan, test_plan, backout_plan, change_window_start, change_window_end, requested_by_name, cab_approvers, cab_approvals)
VALUES
('11111111-1111-1111-1111-111111111111','Atualizacao de firmware do Switch Core','Atualizacao do firmware do switch Cisco Catalyst 9300 para versao 17.9.4a.','Correcao do memory leak identificado no problema de rede recorrente.','Normal','High','Awaiting CAB Approval','1. Backup config. 2. Download firmware. 3. Aplicacao via IOS upgrade. 4. Verificacao 30 min.','Ping continuo para 10 hosts criticos durante janela.','Rollback para versao anterior via boot manual (5 min downtime).',NOW()+interval '3 days',NOW()+interval '3 days 2 hours','Ana Ferreira','["b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2","a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"]'::jsonb,'{"b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2":true}'::jsonb);;
