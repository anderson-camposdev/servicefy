// ============================================================
// SERVICEFY ITSM — Type Definitions
// ITIL v4 | Multi-Tenant | RBAC | SSO | Service Catalog | API
// ============================================================

// ─── RBAC & Access Control ───────────────────────────────────

export type Role =
  | 'sysadmin'       // Administrador Global do Sistema
  | 'company_admin'  // Admin do Tenant/Empresa
  | 'agent'          // Agente / Técnico operacional
  | 'technician'     // Analista operacional
  | 'area_manager'   // Gerente de Torre Técnica (ex: Sistemas, Infra)
  | 'it_manager'     // Gerente Geral de TI / Operações
  | 'client_manager' // Gestor de Contrato no Cliente
  | 'cio'            // Executivo de TI
  | 'end_user';      // Usuário Final (abre chamados e vê catálogo)

export interface Group {
  id: string;
  name: string; // ex: "Service Desk", "Rede", "Banco de Dados"
  companyId: string;
}

// ─── SSO / Authentication ────────────────────────────────────

export type SSOProviderType = 'microsoft' | 'google' | 'active_directory';

export interface SSOProvider {
  id: string;
  type: SSOProviderType;
  label: string;
  tenantId?: string;      // Microsoft: Azure AD Tenant ID
  clientId?: string;      // OAuth Client ID
  domain?: string;        // Google Workspace domain / AD domain
  ldapUrl?: string;       // Active Directory: LDAP connection string
  enabled: boolean;
}

export interface AuthConfig {
  companyId: string;
  providers: SSOProvider[];
  allowLocalLogin: boolean; // Login manual com email/senha
  defaultProvider?: SSOProviderType;
}

// ─── Company / Tenant ────────────────────────────────────────

export interface CompanyBranding {
  themeName?: string; // ex: 'Ocean', 'Midnight'
  fontScale?: string; // ex: 'compact', 'standard', 'large', 'display'
  logoUrl?: string;
  backgroundUrl?: string;
  brandName?: string;     // nome de exibição customizado da marca
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  catalogHeadline?: string;
  greetingPrefix?: string;
  faviconUrl?: string;
  // Cores/tipografia vindas das colunas de branding da company (migrations 016/042/043/044)
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  titleColor?: string;
  titleFont?: string;
  titleSize?: string;
  subtitleColor?: string;
  subtitleFont?: string;
  subtitleSize?: string;
  catalogHeadlineColor?: string;
  catalogHeadlineSize?: string;
  greetingColor?: string;
}

export interface Company {
  id: string;
  name: string;
  slug?: string;
  domain: string;         // ex: 'acmecorp.com'
  /** Nome do tema white-label (coluna primary_color da company) — presente em objetos vindos direto do banco */
  primary_color?: string | null;
  branding: CompanyBranding;
  authConfig: AuthConfig;
  createdAt: string;
  active: boolean;
  // Licenças Concorrentes
  concurrentLicenses: number;
  licensePlan: 'starter' | 'professional' | 'enterprise';
  licenseExpiresAt?: string;
  // Fase 27 — Controle de Licenças de Analistas: eixo distinto de
  // concurrentLicenses (sessões simultâneas) — total de perfis ativos com
  // role agent/company_admin (seat licensing).
  maxAnalystsLicenses: number;
}

// ─── User ────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string;
  groupIds: string[];
  avatarUrl?: string;
  department?: string;
  phone?: string;          // Número no formato E.164 para chatbot whitelist
  chatbotEnabled?: boolean;
  active: boolean;
}

// ─── Shared Ticket Fields ────────────────────────────────────

export type TicketPriority = 'P1 - Critical' | 'P2 - High' | 'P3 - Moderate' | 'P4 - Low' | 'P5 - Planning';

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  isInternal: boolean; // Nota interna (só agentes) vs nota pública
  createdAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

// ─── ITIL MODULE 1: Incident Management ──────────────────────

export type IncidentState =
  | 'New'
  | 'In Progress'
  | 'On Hold'
  | 'Pending User'
  | 'Resolved'
  | 'Closed';

export type IncidentCategory =
  | 'Hardware'
  | 'Software'
  | 'Network'
  | 'Database'
  | 'Security'
  | 'Inquiry'
  | 'Other';

export interface Incident {
  id: string;
  number: string;           // INC0010001
  companyId: string;
  shortDescription: string;
  description: string;
  priority: TicketPriority;
  state: IncidentState;
  category: IncidentCategory;
  callerId: string;
  callerName: string;
  assignedToId?: string;
  assignedToName?: string;
  assignedGroupId?: string;
  assignedGroupName?: string;
  relatedProblemId?: string; // Link para Problema relacionado
  slaBreached: boolean;
  slaDeadline: string;
  comments: Comment[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

// ─── ITIL MODULE 2: Service Request Management ───────────────

export type RequestState =
  | 'Draft'
  | 'Awaiting Approval'
  | 'Approved'
  | 'In Fulfillment'
  | 'Fulfilled'
  | 'Rejected'
  | 'Cancelled';

export interface CatalogItem {
  id: string;
  companyId: string;
  name: string;
  description: string;
  category: string;         // ex: 'Equipamentos', 'Acesso', 'Software'
  icon: string;             // emoji ou código de ícone
  estimatedDeliveryDays: number;
  cost?: number;
  currency?: string;
  requiresApproval: boolean;
  visibleToRoles: Role[];   // Controle de visibilidade por perfil
  formFields: CatalogFormField[];
  active: boolean;
}

export interface CatalogFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';
  required: boolean;
  options?: string[];       // Para campos do tipo 'select'
}

export interface ServiceRequest {
  id: string;
  number: string;           // REQ0010001
  companyId: string;
  catalogItemId: string;
  catalogItemName: string;
  requesterId: string;
  requesterName: string;
  approverId?: string;
  approverName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  state: RequestState;
  priority: TicketPriority;
  formData: Record<string, string | number | boolean>;
  cost?: number;
  currency?: string;
  assignedToId?: string;
  assignedToName?: string;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
  fulfilledAt?: string;
}

// ─── ITIL MODULE 3: Problem Management ───────────────────────

export type ProblemState =
  | 'New'
  | 'Under Investigation'
  | 'Root Cause Identified'
  | 'Known Error'
  | 'Resolved'
  | 'Closed';

export interface Problem {
  id: string;
  number: string;           // PRB0010001
  companyId: string;
  shortDescription: string;
  description: string;
  priority: TicketPriority;
  state: ProblemState;
  category: IncidentCategory;
  rootCause?: string;       // Análise da causa raiz (RCA)
  workaround?: string;      // Contorno temporário disponível
  knownError: boolean;      // Promovido para Known Error Database (KEDB)
  relatedIncidentIds: string[];
  assignedToId?: string;
  assignedToName?: string;
  assignedGroupId?: string;
  assignedGroupName?: string;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

// ─── ITIL MODULE 4: Change Enablement ────────────────────────

export type ChangeType = 'Standard' | 'Normal' | 'Emergency';
export type ChangeRisk = 'Low' | 'Medium' | 'High' | 'Critical';

export type ChangeState =
  | 'Draft'
  | 'Awaiting CAB Approval'
  | 'CAB Approved'
  | 'CAB Rejected'
  | 'Scheduled'
  | 'In Implementation'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export interface ChangeWindow {
  startAt: string;
  endAt: string;
}

export interface Change {
  id: string;
  number: string;           // CHG0010001
  companyId: string;
  shortDescription: string;
  description: string;
  justification: string;
  type: ChangeType;
  risk: ChangeRisk;
  state: ChangeState;
  implementationPlan: string;
  testPlan: string;
  backoutPlan: string;      // Plano de rollback obrigatório
  changeWindow?: ChangeWindow;
  requestedById: string;
  requestedByName: string;
  implementerId?: string;
  implementerName?: string;
  cabApprovers: string[];   // IDs dos aprovadores no CAB
  cabApprovals: Record<string, boolean>; // userId → aprovado/rejeitado
  relatedIncidentIds: string[];
  relatedProblemId?: string;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ─── Integration API Spec ─────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;             // ex: '/api/v1/incidents'
  summary: string;
  description: string;
  module: 'incidents' | 'requests' | 'problems' | 'changes' | 'catalog' | 'users' | 'companies';
  requestBody?: object;
  responseExample: object;
  requiresAuth: boolean;
  authScopes: string[];     // ex: ['incidents:write', 'incidents:read']
}

// ─── Notification ─────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  linkedTicketId?: string;
  linkedTicketType?: 'incident' | 'request' | 'problem' | 'change';
  createdAt: string;
}

// ─── App State Types ─────────────────────────────────────────

export type AppView =
  | 'login'
  | 'dashboard_incidents'
  | 'dashboard_requests'
  | 'dashboard_problems'
  | 'dashboard_changes'
  | 'approval_inbox'
  | 'user_portal'
  | 'api_docs'
  | 'admin_dashboard'
  | 'settings_governance'
  | 'flowfy_bi'
  | 'workflow_builder'
  | 'analytics_executive'
  | 'developer_settings';

// ─── Catálogo Hierárquico de Incidentes (3 Níveis + SLA) ─────

export interface IncidentCatalogItem {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  icon: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentCatalogSubitem {
  id: string;
  itemId: string;
  companyId: string;
  name: string;
  description?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentCatalogSymptom {
  id: string;
  subitemId: string;
  itemId: string;
  companyId: string;
  name: string;
  description?: string;
  // SLAs obrigatórios definidos no catálogo
  slaResponseMins: number;
  slaResolutionMins: number;
  defaultPriority: TicketPriority;
  autoAssignGroupId?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Estrutura em cascata para o seletor de abertura de incidente
export interface IncidentCatalogCascade {
  item: IncidentCatalogItem;
  subitems: Array<IncidentCatalogSubitem & {
    symptoms: IncidentCatalogSymptom[];
  }>;
}

// ─── Catálogo Hierárquico de Requisições (2 Níveis + Aprovação) ─

export interface RequestCatalogItem {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  icon: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestCatalogSubitem {
  id: string;
  itemId: string;
  companyId: string;
  name: string;
  description?: string;
  // Regra de negócio: aprovação do gestor via e-mail
  requiresManagerApproval: boolean;
  approvalEmailTemplate?: string;
  // Estimativa e custo
  estimatedDeliveryDays: number;
  cost?: number;
  currency?: string;
  // Visibilidade
  visibleToRoles: Role[];
  // Formulário dinâmico
  formFields: CatalogFormField[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestCatalogCascade {
  item: RequestCatalogItem;
  subitems: RequestCatalogSubitem[];
}

// Token de aprovação gerado para link no e-mail do gestor
export interface ApprovalToken {
  id: string;
  requestId: string;
  companyId: string;
  approverEmail: string;
  approverName?: string;
  token: string;           // UUID único para link de aprovação
  createdAt: string;
  expiresAt: string;       // 72h de validade
  usedAt?: string;
  decision?: 'approved' | 'rejected';
  rejectionReason?: string;
}

// ─── Controle de Licenças Concorrentes ───────────────────────

export interface LicenseStatus {
  companyId: string;
  companyName: string;
  licenseLimit: number;
  activeConnections: number;
  availableSlots: number;
  status: 'OK' | 'WARNING' | 'FULL';
  usagePct: number;
}

export interface ActiveSession {
  id: string;
  companyId: string;
  userId: string;
  sessionToken: string;
  connectedAt: string;
  lastPing: string;
  ipAddress?: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  disconnectedAt?: string;
  disconnectReason?: string;
}

// ─── Chatbot (WhatsApp / Microsoft Teams) ────────────────────

export type ChatbotChannel = 'whatsapp' | 'teams' | 'web';

export interface ChatbotWhitelistEntry {
  id: string;
  companyId: string;
  userId?: string;
  phoneE164: string;       // Número no padrão E.164 (+5511999990000)
  whatsappEnabled: boolean;
  teamsEnabled: boolean;
  teamsUserId?: string;
  approvedAt?: string;
  approvedBy?: string;
  revokedAt?: string;
  active: boolean;
  createdAt: string;
}

export interface ChatbotMessage {
  id: string;
  companyId: string;
  userId?: string;
  channel: ChatbotChannel;
  direction: 'in' | 'out';
  senderRef?: string;
  content: string;
  metadata: Record<string, unknown>;
  linkedTicketId?: string;
  linkedTicketType?: 'incident' | 'request' | 'problem' | 'change';
  processed: boolean;
  createdAt: string;
}

export interface ChatbotConfig {
  id: string;
  companyId: string;
  whatsappEnabled: boolean;
  whatsappPhoneNumberId?: string;
  teamsEnabled: boolean;
  teamsAppId?: string;
  botName: string;
  welcomeMessage?: string;
  unauthorizedMessage: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  outsideHoursMessage: string;
}

// ─── Resultado de verificação de autorização do chatbot ──────
export interface ChatbotAuthResult {
  authorized: boolean;
  reason?: string;
  userId?: string;
  entryId?: string;
}
