// ============================================================
// Flowfy ITSM — Database Type Definitions
// Auto-maintained: keep in sync with Supabase schema
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// ─── Enums ────────────────────────────────────────────────────
export type TicketPriority   = 'P1 - Critical' | 'P2 - High' | 'P3 - Moderate' | 'P4 - Low'
export type UserRole         = 'sysadmin' | 'company_admin' | 'agent' | 'end_user' | 'technician' | 'area_manager' | 'it_manager' | 'client_manager' | 'cio'
export type IncidentState    = 'New' | 'In Progress' | 'On Hold' | 'Pending User' | 'Resolved' | 'Closed'
export type IncidentCategory = 'Hardware' | 'Software' | 'Network' | 'Database' | 'Security' | 'Inquiry' | 'Other'
export type RequestState     = 'Draft' | 'Awaiting Approval' | 'Approved' | 'In Fulfillment' | 'Fulfilled' | 'Rejected' | 'Cancelled'
export type ProblemState     = 'New' | 'Under Investigation' | 'Root Cause Identified' | 'Known Error' | 'Resolved' | 'Closed'
export type ChangeType       = 'Standard' | 'Normal' | 'Emergency'
export type ChangeRisk       = 'Low' | 'Medium' | 'High' | 'Critical'
export type ChangeState      = 'Draft' | 'Awaiting CAB Approval' | 'CAB Approved' | 'CAB Rejected' | 'Scheduled' | 'In Implementation' | 'Completed' | 'Failed' | 'Cancelled'

// ─── Row shapes ───────────────────────────────────────────────
export interface CompanyRow {
  id: string
  name: string
  domain: string
  active: boolean
  logo_url: string | null
  primary_color: string
  accent_color: string
  bg_color: string
  welcome_title: string
  welcome_subtitle: string
  allow_local_login: boolean
  sso_providers: Json
  created_at: string
  updated_at: string
  schema_name: string | null
  // Licenças Concorrentes
  concurrent_licenses: number
  license_plan: string
  license_expires_at: string | null
  license_alert_threshold: number
}

export interface ProfileRow {
  id: string
  auth_id: string | null
  company_id: string
  name: string
  email: string
  role: UserRole
  department: string | null
  phone: string | null
  avatar_url: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface GroupRow {
  id: string
  company_id: string
  name: string
  description: string | null
  created_at: string
}

export interface IncidentRow {
  id: string
  number: string
  company_id: string
  short_description: string
  description: string | null
  priority: TicketPriority
  state: IncidentState
  category: IncidentCategory
  caller_id: string | null
  caller_name: string
  assigned_to_id: string | null
  assigned_to_name: string | null
  assigned_group_id: string | null
  assigned_group_name: string | null
  sla_breached: boolean
  sla_deadline: string | null
  related_problem_id: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
}

export interface IncidentHistoryRow {
  id: string
  incident_id: string
  changed_by_id: string | null
  changed_by_name: string
  field_name: string
  old_value: string | null
  new_value: string | null
  comment: string | null
  is_public: boolean
  created_at: string
}

export interface ServiceRequestRow {
  id: string
  number: string
  company_id: string
  catalog_item_id: string | null
  catalog_item_name: string
  requester_id: string | null
  requester_name: string
  approver_id: string | null
  approver_name: string | null
  approved_at: string | null
  rejection_reason: string | null
  state: RequestState
  priority: TicketPriority
  form_data: Json
  cost: number | null
  currency: string | null
  assigned_to_id: string | null
  assigned_to_name: string | null
  created_at: string
  updated_at: string
  fulfilled_at: string | null
}

export interface ProblemRow {
  id: string
  number: string
  company_id: string
  short_description: string
  description: string | null
  priority: TicketPriority
  state: ProblemState
  category: IncidentCategory
  root_cause: string | null
  workaround: string | null
  known_error: boolean
  assigned_to_id: string | null
  assigned_to_name: string | null
  assigned_group_id: string | null
  assigned_group_name: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export interface ChangeRow {
  id: string
  number: string
  company_id: string
  short_description: string
  description: string | null
  justification: string | null
  type: ChangeType
  risk: ChangeRisk
  state: ChangeState
  implementation_plan: string | null
  test_plan: string | null
  backout_plan: string | null
  change_window_start: string | null
  change_window_end: string | null
  requested_by_id: string | null
  requested_by_name: string
  implementer_id: string | null
  implementer_name: string | null
  related_problem_id: string | null
  cab_approvers: Json
  cab_approvals: Json
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface CatalogItemRow {
  id: string
  company_id: string
  name: string
  description: string | null
  category: string
  icon: string
  estimated_delivery_days: number
  cost: number | null
  currency: string | null
  requires_approval: boolean
  visible_to_roles: UserRole[]
  form_fields: Json
  active: boolean
  created_at: string
}

export interface SLAPolicyRow {
  id: string
  company_id: string
  ticket_type: string
  priority: TicketPriority
  response_time_mins: number
  resolution_time_mins: number
  active: boolean
  created_at: string
}

export interface WorkflowRuleRow {
  id: string
  company_id: string
  ticket_type: string
  name: string
  description: string | null
  trigger_event: string
  conditions: Json
  actions: Json
  active: boolean
  priority_order: number
  created_at: string
}

export interface NotificationRow {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  read: boolean
  linked_ticket_id: string | null
  linked_ticket_type: string | null
  created_at: string
}

// ─── Catálogo Hierárquico de Incidentes (3 Níveis) ────────────
export interface IncidentCatalogItemRow {
  id: string
  company_id: string
  name: string
  description: string | null
  icon: string
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface IncidentCatalogSubitemRow {
  id: string
  item_id: string
  company_id: string
  name: string
  description: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface IncidentCatalogSymptomRow {
  id: string
  subitem_id: string
  item_id: string
  company_id: string
  name: string
  description: string | null
  sla_response_mins: number
  sla_resolution_mins: number
  default_priority: TicketPriority
  auto_assign_group_id: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ─── Catálogo Hierárquico de Requisições (2 Níveis) ─────────
export interface RequestCatalogItemRow {
  id: string
  company_id: string
  name: string
  description: string | null
  icon: string
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RequestCatalogSubitemRow {
  id: string
  item_id: string
  company_id: string
  name: string
  description: string | null
  requires_manager_approval: boolean
  approval_email_template: string | null
  estimated_delivery_days: number
  cost: number | null
  currency: string | null
  visible_to_roles: UserRole[]
  form_fields: Json
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ApprovalTokenRow {
  id: string
  request_id: string
  company_id: string
  approver_email: string
  approver_name: string | null
  token: string
  created_at: string
  expires_at: string
  used_at: string | null
  decision: 'approved' | 'rejected' | null
  rejection_reason: string | null
  ip_address: string | null
  user_agent: string | null
}

// ─── Sessões Ativas (Controle de Licenças) ─────────────────
export interface ActiveSessionRow {
  id: string
  company_id: string
  user_id: string
  session_token: string
  connected_at: string
  last_ping: string
  ip_address: string | null
  user_agent: string | null
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  disconnected_at: string | null
  disconnect_reason: string | null
}

// ─── Chatbot ───────────────────────────────────────────
export interface ChatbotWhitelistRow {
  id: string
  company_id: string
  user_id: string | null
  phone_e164: string
  whatsapp_enabled: boolean
  teams_enabled: boolean
  teams_user_id: string | null
  approved_at: string | null
  approved_by: string | null
  revoked_at: string | null
  revoked_reason: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ChatbotMessageRow {
  id: string
  company_id: string
  user_id: string | null
  channel: 'whatsapp' | 'teams' | 'web'
  direction: 'in' | 'out'
  sender_ref: string | null
  content: string
  metadata: Json
  linked_ticket_id: string | null
  linked_ticket_type: string | null
  processed: boolean
  processed_at: string | null
  created_at: string
}

export interface ChatbotBlockedAttemptRow {
  id: string
  phone_e164: string | null
  teams_user: string | null
  channel: 'whatsapp' | 'teams' | 'web'
  message: string | null
  block_reason: string
  raw_payload: Json | null
  attempted_at: string
}

export interface ChatbotConfigRow {
  id: string
  company_id: string
  whatsapp_enabled: boolean
  whatsapp_phone_number_id: string | null
  whatsapp_token: string | null
  whatsapp_webhook_secret: string | null
  teams_enabled: boolean
  teams_app_id: string | null
  teams_app_secret: string | null
  teams_tenant_id: string | null
  bot_name: string
  welcome_message: string | null
  unauthorized_message: string
  business_hours_start: string
  business_hours_end: string
  business_days: number[]
  outside_hours_message: string
  created_at: string
  updated_at: string
}

// ─── Database shape for typed client ──────────────────────────
export type Database = {
  public: {
    Tables: {
      companies:                  { Row: CompanyRow;                   Insert: Partial<CompanyRow>;                   Update: Partial<CompanyRow>;                   Relationships: [] }
      profiles:                   { Row: ProfileRow;                    Insert: Partial<ProfileRow>;                    Update: Partial<ProfileRow>;                    Relationships: [] }
      groups:                     { Row: GroupRow;                      Insert: Partial<GroupRow>;                      Update: Partial<GroupRow>;                      Relationships: [] }
      incidents:                  { Row: IncidentRow;                   Insert: Partial<IncidentRow>;                   Update: Partial<IncidentRow>;                   Relationships: [] }
      incident_history:           { Row: IncidentHistoryRow;            Insert: Partial<IncidentHistoryRow>;            Update: Partial<IncidentHistoryRow>;            Relationships: [] }
      service_requests:           { Row: ServiceRequestRow;             Insert: Partial<ServiceRequestRow>;             Update: Partial<ServiceRequestRow>;             Relationships: [] }
      problems:                   { Row: ProblemRow;                    Insert: Partial<ProblemRow>;                    Update: Partial<ProblemRow>;                    Relationships: [] }
      changes:                    { Row: ChangeRow;                     Insert: Partial<ChangeRow>;                     Update: Partial<ChangeRow>;                     Relationships: [] }
      catalog_items:              { Row: CatalogItemRow;                Insert: Partial<CatalogItemRow>;                Update: Partial<CatalogItemRow>;                Relationships: [] }
      sla_policies:               { Row: SLAPolicyRow;                  Insert: Partial<SLAPolicyRow>;                  Update: Partial<SLAPolicyRow>;                  Relationships: [] }
      workflow_rules:             { Row: WorkflowRuleRow;               Insert: Partial<WorkflowRuleRow>;               Update: Partial<WorkflowRuleRow>;               Relationships: [] }
      notifications:              { Row: NotificationRow;               Insert: Partial<NotificationRow>;               Update: Partial<NotificationRow>;               Relationships: [] }
      // ─ Novos: Catálogo Hierárquico de Incidentes
      incident_catalog_items:     { Row: IncidentCatalogItemRow;        Insert: Partial<IncidentCatalogItemRow>;        Update: Partial<IncidentCatalogItemRow>;        Relationships: [] }
      incident_catalog_subitems:  { Row: IncidentCatalogSubitemRow;     Insert: Partial<IncidentCatalogSubitemRow>;     Update: Partial<IncidentCatalogSubitemRow>;     Relationships: [] }
      incident_catalog_symptoms:  { Row: IncidentCatalogSymptomRow;     Insert: Partial<IncidentCatalogSymptomRow>;     Update: Partial<IncidentCatalogSymptomRow>;     Relationships: [] }
      // ─ Novos: Catálogo Hierárquico de Requisições
      request_catalog_items:      { Row: RequestCatalogItemRow;         Insert: Partial<RequestCatalogItemRow>;         Update: Partial<RequestCatalogItemRow>;         Relationships: [] }
      request_catalog_subitems:   { Row: RequestCatalogSubitemRow;      Insert: Partial<RequestCatalogSubitemRow>;      Update: Partial<RequestCatalogSubitemRow>;      Relationships: [] }
      approval_tokens:            { Row: ApprovalTokenRow;              Insert: Partial<ApprovalTokenRow>;              Update: Partial<ApprovalTokenRow>;              Relationships: [] }
      // ─ Novos: Licenças e Sessões
      active_sessions:            { Row: ActiveSessionRow;              Insert: Partial<ActiveSessionRow>;              Update: Partial<ActiveSessionRow>;              Relationships: [] }
      // ─ Novos: Chatbot
      chatbot_whitelist:          { Row: ChatbotWhitelistRow;           Insert: Partial<ChatbotWhitelistRow>;           Update: Partial<ChatbotWhitelistRow>;           Relationships: [] }
      chatbot_messages:           { Row: ChatbotMessageRow;             Insert: Partial<ChatbotMessageRow>;             Update: Partial<ChatbotMessageRow>;             Relationships: [] }
      chatbot_blocked_attempts:   { Row: ChatbotBlockedAttemptRow;      Insert: Partial<ChatbotBlockedAttemptRow>;      Update: Partial<ChatbotBlockedAttemptRow>;      Relationships: [] }
      chatbot_config:             { Row: ChatbotConfigRow;              Insert: Partial<ChatbotConfigRow>;              Update: Partial<ChatbotConfigRow>;              Relationships: [] }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      ticket_priority:   TicketPriority
      user_role:         UserRole
      incident_state:    IncidentState
      incident_category: IncidentCategory
      request_state:     RequestState
      problem_state:     ProblemState
      change_type:       ChangeType
      change_risk:       ChangeRisk
      change_state:      ChangeState
    }
  }
}
