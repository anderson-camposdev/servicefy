// ============================================================
// SERVICEFY ITSM — Mock Data Services
// Multi-Tenant | ITIL v4 | RBAC | Service Catalog | API Docs
// ============================================================

import type {
  Company, User, Group, Incident, ServiceRequest, Problem, Change,
  CatalogItem, ApiEndpoint, Notification,
} from '../types';

// ─── COMPANIES (Tenants) ─────────────────────────────────────

export const mockCompanies: Company[] = [
  {
    id: 'co-acme',
    name: 'Acme Corp',
    domain: 'acmecorp.com',
    active: true,
    createdAt: '2024-01-10T00:00:00Z',
    concurrentLicenses: 50,
    maxAnalystsLicenses: 20,
    licensePlan: 'enterprise' as const,
    branding: {
      primaryColor: '#1D4ED8',
      accentColor: '#3B82F6',
      backgroundColor: '#EFF6FF',
      welcomeTitle: 'Central de Serviços da Acme Corp',
      welcomeSubtitle: 'Sua solicitação é a nossa prioridade.',
      logoUrl: 'https://ui-avatars.com/api/?name=Acme+Corp&background=1D4ED8&color=fff&size=64&bold=true&font-size=0.33',
    },
    authConfig: {
      companyId: 'co-acme',
      allowLocalLogin: true,
      defaultProvider: 'microsoft',
      providers: [
        { id: 'sso-acme-ms', type: 'microsoft' as const, label: 'Microsoft 365', tenantId: 'acmecorp.onmicrosoft.com', clientId: 'a1b2-c3d4', enabled: true },
        { id: 'sso-acme-ad', type: 'active_directory' as const, label: 'Active Directory', domain: 'corp.acmecorp.com', ldapUrl: 'ldap://dc01.corp.acmecorp.com:389', enabled: true },
      ],
    },
  },
  {
    id: 'co-globex',
    name: 'Globex IT',
    domain: 'globex.io',
    active: true,
    createdAt: '2024-03-15T00:00:00Z',
    concurrentLicenses: 25,
    maxAnalystsLicenses: 10,
    licensePlan: 'professional' as const,
    branding: {
      primaryColor: '#059669',
      accentColor: '#10B981',
      backgroundColor: '#ECFDF5',
      welcomeTitle: 'Portal de Atendimento Globex IT',
      welcomeSubtitle: 'Soluções rápidas para a sua equipe.',
      logoUrl: 'https://ui-avatars.com/api/?name=Globex+IT&background=059669&color=fff&size=64&bold=true&font-size=0.33',
    },
    authConfig: {
      companyId: 'co-globex',
      allowLocalLogin: false,
      defaultProvider: 'google',
      providers: [
        { id: 'sso-globex-google', type: 'google' as const, label: 'Google Workspace', domain: 'globex.io', clientId: 'g5h6-i7j8', enabled: true },
      ],
    },
  },
  {
    id: 'co-initech',
    name: 'Initech Finance',
    domain: 'initech.com.br',
    active: true,
    createdAt: '2024-06-01T00:00:00Z',
    concurrentLicenses: 10,
    maxAnalystsLicenses: 3,
    licensePlan: 'starter' as const,
    branding: {
      primaryColor: '#B45309',
      accentColor: '#F59E0B',
      backgroundColor: '#FFFBEB',
      welcomeTitle: 'Help Desk — Initech Finance',
      welcomeSubtitle: 'Abertura rápida de chamados financeiros e de TI.',
      logoUrl: 'https://ui-avatars.com/api/?name=Initech&background=B45309&color=fff&size=64&bold=true&font-size=0.33',
    },
    authConfig: {
      companyId: 'co-initech',
      allowLocalLogin: true,
      providers: [
        { id: 'sso-initech-ms', type: 'microsoft' as const, label: 'Microsoft Entra ID', tenantId: 'initech.onmicrosoft.com', clientId: 'k9l0-m1n2', enabled: true },
        { id: 'sso-initech-google', type: 'google' as const, label: 'Google Workspace', domain: 'initech.com.br', clientId: 'o3p4-q5r6', enabled: false },
      ],
    },
  },
];

// ─── GROUPS ───────────────────────────────────────────────────

export const mockGroups: Group[] = [
  { id: 'grp-acme-sd', name: 'Service Desk', companyId: 'co-acme' },
  { id: 'grp-acme-net', name: 'Redes e Infraestrutura', companyId: 'co-acme' },
  { id: 'grp-acme-db', name: 'Banco de Dados', companyId: 'co-acme' },
  { id: 'grp-globex-sd', name: 'Service Desk', companyId: 'co-globex' },
  { id: 'grp-globex-sec', name: 'Segurança da Informação', companyId: 'co-globex' },
  { id: 'grp-initech-sd', name: 'Help Desk', companyId: 'co-initech' },
];

// ─── USERS ────────────────────────────────────────────────────

export const mockUsers: User[] = [
  // SysAdmin (global)
  { id: 'u-sys-1', name: 'Anderson Campos', email: 'anderson@servicefy.com', role: 'sysadmin', companyId: 'co-acme', groupIds: [], department: 'Plataforma', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Anderson+Campos&background=10b981&color=fff' },
  // Acme Corp
  { id: 'u-acme-admin', name: 'Carla Mendes', email: 'carla.mendes@acmecorp.com', role: 'company_admin', companyId: 'co-acme', groupIds: [], department: 'TI', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Carla+Mendes&background=1D4ED8&color=fff' },
  { id: 'u-acme-ag1', name: 'Bruno Alves', email: 'bruno.alves@acmecorp.com', role: 'agent', companyId: 'co-acme', groupIds: ['grp-acme-sd', 'grp-acme-net'], department: 'TI', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Bruno+Alves&background=2563EB&color=fff' },
  { id: 'u-acme-ag2', name: 'Fernanda Costa', email: 'fernanda.costa@acmecorp.com', role: 'agent', companyId: 'co-acme', groupIds: ['grp-acme-db'], department: 'TI', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Fernanda+Costa&background=3B82F6&color=fff' },
  { id: 'u-acme-usr1', name: 'Rafael Lima', email: 'rafael.lima@acmecorp.com', role: 'end_user', companyId: 'co-acme', groupIds: [], department: 'Financeiro', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Rafael+Lima&background=93C5FD&color=1e3a8a' },
  { id: 'u-acme-usr2', name: 'Juliana Sousa', email: 'juliana.sousa@acmecorp.com', role: 'end_user', companyId: 'co-acme', groupIds: [], department: 'RH', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Juliana+Sousa&background=BFDBFE&color=1e3a8a' },
  // Globex IT
  { id: 'u-globex-admin', name: 'Thiago Rocha', email: 'thiago.rocha@globex.io', role: 'company_admin', companyId: 'co-globex', groupIds: [], department: 'TI', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Thiago+Rocha&background=059669&color=fff' },
  { id: 'u-globex-ag1', name: 'Mariana Ferreira', email: 'mariana.ferreira@globex.io', role: 'agent', companyId: 'co-globex', groupIds: ['grp-globex-sd', 'grp-globex-sec'], department: 'TI', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Mariana+Ferreira&background=10B981&color=fff' },
  { id: 'u-globex-usr1', name: 'Diego Martins', email: 'diego.martins@globex.io', role: 'end_user', companyId: 'co-globex', groupIds: [], department: 'Operações', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Diego+Martins&background=6EE7B7&color=065f46' },
  // Initech
  { id: 'u-initech-ag1', name: 'Patrícia Nunes', email: 'patricia.nunes@initech.com.br', role: 'agent', companyId: 'co-initech', groupIds: ['grp-initech-sd'], department: 'TI', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Patricia+Nunes&background=F59E0B&color=fff' },
  { id: 'u-initech-usr1', name: 'Eduardo Pinto', email: 'eduardo.pinto@initech.com.br', role: 'end_user', companyId: 'co-initech', groupIds: [], department: 'Compliance', active: true, avatarUrl: 'https://ui-avatars.com/api/?name=Eduardo+Pinto&background=FCD34D&color=92400e' },
];

// ─── INCIDENTS ────────────────────────────────────────────────

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export const mockIncidents: Incident[] = [
  {
    id: 'inc-1', number: 'INC0010001', companyId: 'co-acme',
    shortDescription: 'VPN corporativa instável — equipe do financeiro',
    description: 'Múltiplos usuários do financeiro relatam quedas de conexão VPN a cada 20-30 minutos.',
    priority: 'P2 - High', state: 'In Progress', category: 'Network',
    callerId: 'u-acme-usr1', callerName: 'Rafael Lima',
    assignedToId: 'u-acme-ag1', assignedToName: 'Bruno Alves',
    assignedGroupId: 'grp-acme-net', assignedGroupName: 'Redes e Infraestrutura',
    slaBreached: false, slaDeadline: hoursAgo(-4),
    comments: [{ id: 'c1', authorId: 'u-acme-ag1', authorName: 'Bruno Alves', content: 'Investigando configuração do firewall ASA.', isInternal: true, createdAt: hoursAgo(1) }],
    attachments: [], createdAt: hoursAgo(6), updatedAt: hoursAgo(1),
  },
  {
    id: 'inc-2', number: 'INC0010002', companyId: 'co-acme',
    shortDescription: 'Banco de dados Postgres — pool de conexões esgotado',
    description: 'Servidor PostgreSQL recusando novas conexões. Limite de max_connections atingido.',
    priority: 'P1 - Critical', state: 'New', category: 'Database',
    callerId: 'u-acme-admin', callerName: 'Carla Mendes',
    slaBreached: true, slaDeadline: hoursAgo(2),
    comments: [], attachments: [], createdAt: hoursAgo(3), updatedAt: hoursAgo(3),
  },
  {
    id: 'inc-3', number: 'INC0010003', companyId: 'co-acme',
    shortDescription: 'Impressora do RH não imprime',
    description: 'Impressora HP LaserJet M404 apresenta erro de driver após atualização do Windows.',
    priority: 'P4 - Low', state: 'On Hold', category: 'Hardware',
    callerId: 'u-acme-usr2', callerName: 'Juliana Sousa',
    assignedToId: 'u-acme-ag1', assignedToName: 'Bruno Alves',
    assignedGroupId: 'grp-acme-sd', assignedGroupName: 'Service Desk',
    slaBreached: false, slaDeadline: daysAgo(-2),
    comments: [{ id: 'c2', authorId: 'u-acme-ag1', authorName: 'Bruno Alves', content: 'Aguardando aprovação de compra do driver original.', isInternal: false, createdAt: daysAgo(1) }],
    attachments: [], createdAt: daysAgo(3), updatedAt: daysAgo(1),
  },
  {
    id: 'inc-4', number: 'INC0010004', companyId: 'co-acme',
    shortDescription: 'Falha de autenticação no portal interno',
    description: 'Usuários não conseguem logar no portal interno após atualização do AD.',
    priority: 'P1 - Critical', state: 'In Progress', category: 'Security',
    callerId: 'u-acme-usr1', callerName: 'Rafael Lima',
    assignedToId: 'u-acme-ag2', assignedToName: 'Fernanda Costa',
    assignedGroupId: 'grp-acme-db', assignedGroupName: 'Banco de Dados',
    slaBreached: false, slaDeadline: hoursAgo(-1),
    comments: [], attachments: [], createdAt: hoursAgo(2), updatedAt: hoursAgo(1),
  },
  {
    id: 'inc-5', number: 'INC0010005', companyId: 'co-globex',
    shortDescription: 'Ataque de phishing detectado — e-mail corporativo',
    description: 'Campanha de phishing direcionada a colaboradores de TI. 3 usuários clicaram no link.',
    priority: 'P1 - Critical', state: 'In Progress', category: 'Security',
    callerId: 'u-globex-admin', callerName: 'Thiago Rocha',
    assignedToId: 'u-globex-ag1', assignedToName: 'Mariana Ferreira',
    assignedGroupId: 'grp-globex-sec', assignedGroupName: 'Segurança da Informação',
    slaBreached: false, slaDeadline: hoursAgo(-2),
    comments: [], attachments: [], createdAt: hoursAgo(5), updatedAt: hoursAgo(2),
  },
  {
    id: 'inc-6', number: 'INC0010006', companyId: 'co-initech',
    shortDescription: 'Sistema de conciliação bancária fora do ar',
    description: 'Sistema de conciliação da área de contabilidade não responde desde as 08h.',
    priority: 'P1 - Critical', state: 'New', category: 'Software',
    callerId: 'u-initech-usr1', callerName: 'Eduardo Pinto',
    slaBreached: true, slaDeadline: hoursAgo(4),
    comments: [], attachments: [], createdAt: hoursAgo(6), updatedAt: hoursAgo(6),
  },
];

// ─── SERVICE CATALOG ──────────────────────────────────────────

export const mockCatalogItems: CatalogItem[] = [
  {
    id: 'cat-1', companyId: 'co-acme', name: 'Notebook Corporativo', description: 'Solicitação de novo equipamento portátil para colaboradores.', category: 'Equipamentos', icon: '💻', estimatedDeliveryDays: 5, cost: 4500, currency: 'BRL', requiresApproval: true, visibleToRoles: ['end_user', 'agent', 'company_admin'],
    formFields: [{ id: 'f1', label: 'Justificativa de Negócio', type: 'textarea', required: true }, { id: 'f2', label: 'Modelo Preferido', type: 'select', required: false, options: ['Dell Latitude', 'Lenovo ThinkPad', 'Apple MacBook'] }], active: true,
  },
  {
    id: 'cat-2', companyId: 'co-acme', name: 'Acesso VPN Remoto', description: 'Solicitação de perfil de acesso VPN para home-office.', category: 'Acesso', icon: '🔐', estimatedDeliveryDays: 1, requiresApproval: true, visibleToRoles: ['end_user', 'agent'],
    formFields: [{ id: 'f3', label: 'Justificativa do Acesso Remoto', type: 'textarea', required: true }, { id: 'f4', label: 'Data de Início', type: 'date', required: true }], active: true,
  },
  {
    id: 'cat-3', companyId: 'co-acme', name: 'Licença Microsoft 365', description: 'Licença individual do Microsoft 365 Business.', category: 'Software', icon: '📦', estimatedDeliveryDays: 2, cost: 89, currency: 'BRL', requiresApproval: false, visibleToRoles: ['end_user', 'agent'],
    formFields: [{ id: 'f5', label: 'Email corporativo do beneficiário', type: 'text', required: true }], active: true,
  },
  {
    id: 'cat-4', companyId: 'co-acme', name: 'Criação de Conta de Usuário', description: 'Criação de novo usuário no Active Directory e sistemas corporativos.', category: 'Acesso', icon: '👤', estimatedDeliveryDays: 1, requiresApproval: true, visibleToRoles: ['company_admin', 'agent'],
    formFields: [{ id: 'f6', label: 'Nome Completo', type: 'text', required: true }, { id: 'f7', label: 'Departamento', type: 'text', required: true }, { id: 'f8', label: 'Perfil de Acesso', type: 'select', required: true, options: ['Padrão', 'Administrador de Sistema', 'Somente Leitura'] }], active: true,
  },
  {
    id: 'cat-5', companyId: 'co-globex', name: 'Revisão de Segurança de Conta', description: 'Auditoria de permissões e acessos para conformidade.', category: 'Segurança', icon: '🛡️', estimatedDeliveryDays: 3, requiresApproval: false, visibleToRoles: ['end_user', 'agent'],
    formFields: [{ id: 'f9', label: 'Conta a ser revisada', type: 'text', required: true }], active: true,
  },
];

// ─── SERVICE REQUESTS ─────────────────────────────────────────

export const mockServiceRequests: ServiceRequest[] = [
  {
    id: 'req-1', number: 'REQ0010001', companyId: 'co-acme', catalogItemId: 'cat-1', catalogItemName: 'Notebook Corporativo', requesterId: 'u-acme-usr2', requesterName: 'Juliana Sousa', state: 'Awaiting Approval', priority: 'P3 - Moderate', formData: { 'Justificativa de Negócio': 'Equipamento atual com 5 anos de uso, teclado com teclas defeituosas.', 'Modelo Preferido': 'Lenovo ThinkPad' }, cost: 4500, currency: 'BRL', comments: [], createdAt: hoursAgo(12), updatedAt: hoursAgo(12),
  },
  {
    id: 'req-2', number: 'REQ0010002', companyId: 'co-acme', catalogItemId: 'cat-2', catalogItemName: 'Acesso VPN Remoto', requesterId: 'u-acme-usr1', requesterName: 'Rafael Lima', approverId: 'u-acme-admin', approverName: 'Carla Mendes', approvedAt: hoursAgo(8), state: 'In Fulfillment', priority: 'P3 - Moderate', formData: { 'Justificativa do Acesso Remoto': 'Trabalho remoto aprovado pela gestão.', 'Data de Início': '2026-06-07' }, assignedToId: 'u-acme-ag1', assignedToName: 'Bruno Alves', comments: [], createdAt: daysAgo(1), updatedAt: hoursAgo(8),
  },
  {
    id: 'req-3', number: 'REQ0010003', companyId: 'co-acme', catalogItemId: 'cat-3', catalogItemName: 'Licença Microsoft 365', requesterId: 'u-acme-usr2', requesterName: 'Juliana Sousa', state: 'Fulfilled', priority: 'P4 - Low', formData: { 'Email corporativo do beneficiário': 'juliana.sousa@acmecorp.com' }, cost: 89, currency: 'BRL', assignedToId: 'u-acme-ag2', assignedToName: 'Fernanda Costa', comments: [], createdAt: daysAgo(7), updatedAt: daysAgo(5), fulfilledAt: daysAgo(5),
  },
];

// ─── PROBLEMS ─────────────────────────────────────────────────

export const mockProblems: Problem[] = [
  {
    id: 'prb-1', number: 'PRB0010001', companyId: 'co-acme', shortDescription: 'Instabilidade recorrente na VPN — Firewall Cisco ASA', description: 'Análise de incidentes recorrentes de queda de VPN identifica falha em política de keep-alive do Firewall ASA.', priority: 'P2 - High', state: 'Root Cause Identified', category: 'Network', rootCause: 'Política de dead-peer-detection (DPD) com timeout abaixo do necessário para conexões de alta latência.', workaround: 'Reconectar manualmente à VPN. Evitar inatividade por mais de 10 minutos.', knownError: true, relatedIncidentIds: ['inc-1'], assignedToId: 'u-acme-ag1', assignedToName: 'Bruno Alves', assignedGroupId: 'grp-acme-net', assignedGroupName: 'Redes e Infraestrutura', comments: [], createdAt: daysAgo(5), updatedAt: hoursAgo(2),
  },
  {
    id: 'prb-2', number: 'PRB0010002', companyId: 'co-acme', shortDescription: 'Esgotamento de pool de conexões no PostgreSQL', description: 'Investigação de incidentes relacionados ao banco de dados detecta padrão de conexões não encerradas corretamente.', priority: 'P1 - Critical', state: 'Under Investigation', category: 'Database', knownError: false, relatedIncidentIds: ['inc-2'], assignedToId: 'u-acme-ag2', assignedToName: 'Fernanda Costa', assignedGroupId: 'grp-acme-db', assignedGroupName: 'Banco de Dados', comments: [], createdAt: hoursAgo(8), updatedAt: hoursAgo(1),
  },
  {
    id: 'prb-3', number: 'PRB0010003', companyId: 'co-globex', shortDescription: 'Vulnerabilidade de phishing por falta de MFA obrigatório', description: 'Usuários sem MFA ativado são mais suscetíveis a ataques de phishing direcionados ao domínio globex.io.', priority: 'P1 - Critical', state: 'Known Error', category: 'Security', rootCause: 'Política de MFA não aplicada a todos os usuários do Google Workspace. Onboarding de novos colaboradores sem ativação forçada.', workaround: 'Comunicar ativamente os usuários sem MFA para ativar Google Authenticator imediatamente.', knownError: true, relatedIncidentIds: ['inc-5'], assignedToId: 'u-globex-ag1', assignedToName: 'Mariana Ferreira', assignedGroupId: 'grp-globex-sec', assignedGroupName: 'Segurança da Informação', comments: [], createdAt: daysAgo(3), updatedAt: hoursAgo(6),
  },
];

// ─── CHANGES ──────────────────────────────────────────────────

export const mockChanges: Change[] = [
  {
    id: 'chg-1', number: 'CHG0010001', companyId: 'co-acme', shortDescription: 'Upgrade do Firewall Cisco ASA para versão 9.18', description: 'Atualização do firmware do firewall principal para corrigir vulnerabilidades e ajustar políticas de DPD.', justification: 'Correção do problema PRB0010001 — instabilidade de VPN. Firmware atual possui CVE documentado.', type: 'Normal', risk: 'Medium', state: 'Awaiting CAB Approval', implementationPlan: '1. Backup da configuração atual\n2. Manutenção programada às 02h\n3. Upload do firmware 9.18\n4. Reinicialização controlada\n5. Validação de conectividade', testPlan: 'Testar conectividade VPN com 5 usuários piloto antes de liberar para todos.', backoutPlan: 'Rollback para firmware anterior via ROMMON mode. Estimativa: 20 minutos.', changeWindow: { startAt: daysAgo(-3), endAt: daysAgo(-3) }, requestedById: 'u-acme-ag1', requestedByName: 'Bruno Alves', relatedIncidentIds: ['inc-1'], relatedProblemId: 'prb-1', cabApprovers: ['u-acme-admin', 'u-sys-1'], cabApprovals: {}, comments: [], createdAt: daysAgo(2), updatedAt: hoursAgo(4),
  },
  {
    id: 'chg-2', number: 'CHG0010002', companyId: 'co-acme', shortDescription: 'Aumento do max_connections no PostgreSQL 15', description: 'Ajuste do parâmetro max_connections de 100 para 300 e configuração do PgBouncer como connection pooler.', justification: 'Incidente crítico INC0010002 — esgotamento do pool de conexões impactou produção.', type: 'Emergency', risk: 'High', state: 'Scheduled', implementationPlan: '1. Snapshot do servidor de banco\n2. Editar postgresql.conf\n3. Instalar e configurar PgBouncer\n4. Reiniciar PostgreSQL\n5. Validar conexões', testPlan: 'Executar teste de carga com JMeter simulando 250 conexões simultâneas.', backoutPlan: 'Restaurar postgresql.conf original e reiniciar serviço. RTO estimado: 5 minutos.', changeWindow: { startAt: hoursAgo(-6), endAt: hoursAgo(-4) }, requestedById: 'u-acme-ag2', requestedByName: 'Fernanda Costa', relatedIncidentIds: ['inc-2'], relatedProblemId: 'prb-2', cabApprovers: ['u-acme-admin'], cabApprovals: { 'u-acme-admin': true }, comments: [], createdAt: hoursAgo(10), updatedAt: hoursAgo(2),
  },
  {
    id: 'chg-3', number: 'CHG0010003', companyId: 'co-globex', shortDescription: 'Ativação forçada de MFA em todos os usuários do Google Workspace', description: 'Aplicação de política de 2FA obrigatório para todos os perfis do domínio globex.io via Google Admin Console.', justification: 'Problema PRB0010003 identificou ausência de MFA como vetor de phishing.', type: 'Normal', risk: 'Low', state: 'CAB Approved', implementationPlan: '1. Exportar lista de usuários sem MFA\n2. Comunicar usuários com prazo de 48h\n3. Ativar enforcement no Admin Console\n4. Monitorar logins nas 24h seguintes', testPlan: 'Simular login sem MFA para confirmar bloqueio.', backoutPlan: 'Desativar enforcement no Google Admin Console. Ação imediata.', requestedById: 'u-globex-ag1', requestedByName: 'Mariana Ferreira', relatedIncidentIds: ['inc-5'], relatedProblemId: 'prb-3', cabApprovers: ['u-globex-admin'], cabApprovals: { 'u-globex-admin': true }, comments: [], createdAt: daysAgo(1), updatedAt: hoursAgo(3),
  },
];

// ─── NOTIFICATIONS ────────────────────────────────────────────

export const mockNotifications: Notification[] = [
  { id: 'notif-1', userId: 'u-sys-1', title: 'SLA Violado', message: 'INC0010002 ultrapassou o SLA de P1.', type: 'error', read: false, linkedTicketId: 'inc-2', linkedTicketType: 'incident', createdAt: hoursAgo(1) },
  { id: 'notif-2', userId: 'u-sys-1', title: 'Mudança Aguardando Aprovação', message: 'CHG0010001 precisa de aprovação no CAB.', type: 'warning', read: false, linkedTicketId: 'chg-1', linkedTicketType: 'change', createdAt: hoursAgo(4) },
  { id: 'notif-3', userId: 'u-sys-1', title: 'Nova Requisição', message: 'REQ0010001 aguarda aprovação de Notebook.', type: 'info', read: true, linkedTicketId: 'req-1', linkedTicketType: 'request', createdAt: hoursAgo(12) },
];

// ─── API ENDPOINTS DOCUMENTATION ──────────────────────────────

export const mockApiEndpoints: ApiEndpoint[] = [
  {
    id: 'api-inc-list', method: 'GET', path: '/api/v1/incidents', summary: 'Listar Incidentes', description: 'Retorna a lista de incidentes do tenant autenticado, com suporte a paginação e filtros.', module: 'incidents',
    responseExample: { data: [{ id: 'inc-1', number: 'INC0010001', priority: 'P2 - High', state: 'In Progress' }], meta: { total: 1, page: 1, perPage: 25 } },
    requiresAuth: true, authScopes: ['incidents:read'],
  },
  {
    id: 'api-inc-create', method: 'POST', path: '/api/v1/incidents', summary: 'Criar Incidente', description: 'Abre um novo incidente via integração externa (ex: monitoramento, e-mail, chatbot).', module: 'incidents',
    requestBody: { shortDescription: 'string', description: 'string', priority: 'P1 - Critical | P2 - High | P3 - Moderate | P4 - Low', category: 'Software | Hardware | Network | Database | Security', callerId: 'string (User ID)' },
    responseExample: { id: 'inc-new', number: 'INC0010099', state: 'New', createdAt: '2026-06-06T18:00:00Z' },
    requiresAuth: true, authScopes: ['incidents:write'],
  },
  {
    id: 'api-inc-update', method: 'PATCH', path: '/api/v1/incidents/:id', summary: 'Atualizar Incidente', description: 'Atualiza campos de um incidente existente, como estado ou atribuição.', module: 'incidents',
    requestBody: { state: 'string (opcional)', assignedToId: 'string (opcional)', priority: 'string (opcional)' },
    responseExample: { id: 'inc-1', state: 'Resolved', resolvedAt: '2026-06-06T20:00:00Z' },
    requiresAuth: true, authScopes: ['incidents:write'],
  },
  {
    id: 'api-req-create', method: 'POST', path: '/api/v1/requests', summary: 'Criar Requisição de Serviço', description: 'Envia uma nova requisição de serviço com base em um item do catálogo.', module: 'requests',
    requestBody: { catalogItemId: 'string', requesterId: 'string', formData: 'Record<string, any>', priority: 'string' },
    responseExample: { id: 'req-new', number: 'REQ0010050', state: 'Awaiting Approval' },
    requiresAuth: true, authScopes: ['requests:write'],
  },
  {
    id: 'api-chg-list', method: 'GET', path: '/api/v1/changes', summary: 'Listar Mudanças', description: 'Lista todas as mudanças do tenant com seus estados e detalhes de aprovação CAB.', module: 'changes',
    responseExample: { data: [{ id: 'chg-1', number: 'CHG0010001', type: 'Normal', risk: 'Medium', state: 'Awaiting CAB Approval' }], meta: { total: 1 } },
    requiresAuth: true, authScopes: ['changes:read'],
  },
  {
    id: 'api-catalog-list', method: 'GET', path: '/api/v1/catalog', summary: 'Catálogo de Serviços', description: 'Retorna os itens disponíveis no catálogo de serviços para o tenant e perfil autenticado.', module: 'catalog',
    responseExample: { data: [{ id: 'cat-1', name: 'Notebook Corporativo', category: 'Equipamentos', requiresApproval: true }] },
    requiresAuth: true, authScopes: ['catalog:read'],
  },
  {
    id: 'api-users-list', method: 'GET', path: '/api/v1/users', summary: 'Listar Usuários', description: 'Lista os usuários do tenant autenticado. Requer perfil company_admin ou sysadmin.', module: 'users',
    responseExample: { data: [{ id: 'u-1', name: 'Rafael Lima', role: 'end_user', department: 'Financeiro' }] },
    requiresAuth: true, authScopes: ['users:read'],
  },
  {
    id: 'api-webhook', method: 'POST', path: '/api/v1/webhooks', summary: 'Registrar Webhook', description: 'Registra uma URL de callback para receber notificações em tempo real (incident.created, change.approved, etc.).', module: 'companies',
    requestBody: { url: 'https://seu-sistema.com/servicefy-webhook', events: ['incident.created', 'incident.resolved', 'change.approved'], secret: 'string (HMAC signature secret)' },
    responseExample: { id: 'wh-1', url: 'https://seu-sistema.com/servicefy-webhook', events: ['incident.created'], active: true },
    requiresAuth: true, authScopes: ['webhooks:write'],
  },
];

// ─── Utility Helpers ─────────────────────────────────────────

export const getCompanyById = (id: string) => mockCompanies.find(c => c.id === id);
export const getUserById = (id: string) => mockUsers.find(u => u.id === id);
export const getUsersByCompany = (companyId: string) => mockUsers.filter(u => u.companyId === companyId);
export const getIncidentsByCompany = (companyId: string) => mockIncidents.filter(i => i.companyId === companyId);
export const getRequestsByCompany = (companyId: string) => mockServiceRequests.filter(r => r.companyId === companyId);
export const getProblemsByCompany = (companyId: string) => mockProblems.filter(p => p.companyId === companyId);
export const getChangesByCompany = (companyId: string) => mockChanges.filter(c => c.companyId === companyId);
export const getCatalogByCompany = (companyId: string) => mockCatalogItems.filter(c => c.companyId === companyId);
