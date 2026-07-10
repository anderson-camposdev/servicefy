import type { ApiEndpoint, Notification } from '../types'

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

export const mockNotifications: Notification[] = [
  { id: 'notif-1', userId: 'u-sys-1', title: 'SLA Violado', message: 'INC0010002 ultrapassou o SLA de P1.', type: 'error', read: false, linkedTicketId: 'inc-2', linkedTicketType: 'incident', createdAt: hoursAgo(1) },
  { id: 'notif-2', userId: 'u-sys-1', title: 'Mudança Aguardando Aprovação', message: 'CHG0010001 precisa de aprovação no CAB.', type: 'warning', read: false, linkedTicketId: 'chg-1', linkedTicketType: 'change', createdAt: hoursAgo(4) },
  { id: 'notif-3', userId: 'u-sys-1', title: 'Nova Requisição', message: 'REQ0010001 aguarda aprovação de Notebook.', type: 'info', read: true, linkedTicketId: 'req-1', linkedTicketType: 'request', createdAt: hoursAgo(12) },
]

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
]
