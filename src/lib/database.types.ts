// ============================================================
// ServiceFY ITSM — Database Type Definitions
// Auto-maintained: keep in sync with Supabase schema
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// ─── Enums ────────────────────────────────────────────────────
export type TicketPriority   = 'P1 - Critical' | 'P2 - High' | 'P3 - Moderate' | 'P4 - Low' | 'P5 - Planning'
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
  slug: string
  is_provider_tenant: boolean
  active: boolean
  logo_url: string | null
  background_url: string | null
  primary_color: string
  secondary_color: string | null
  brand_name: string | null
  accent_color: string
  bg_color: string
  welcome_title: string
  welcome_subtitle: string
  title_color?: string | null
  title_font?: string | null
  title_size?: string | null
  subtitle_color?: string | null
  subtitle_font?: string | null
  subtitle_size?: string | null
  catalog_headline: string | null
  greeting_prefix: string | null
  greeting_color: string | null
  catalog_headline_color: string | null
  catalog_headline_size: string | null
  catalog_ui_config: Json | null
  allow_local_login: boolean
  sso_providers: Json
  created_at: string
  updated_at: string
  // Motor de SLA: calendário útil padrão do cliente (migration 032)
  default_sla_calendar_id: string | null
  // Licenças Concorrentes
  concurrent_licenses: number
  license_plan: string
  license_expires_at: string | null
  license_alert_threshold: number
  // Fase 27 — Controle de Licenças de Analistas (migration 124): eixo
  // distinto de concurrent_licenses (sessões simultâneas) — total de
  // perfis ativos com role agent/company_admin (seat licensing).
  max_analysts_licenses: number
}

export interface ProfileRow {
  id: string
  auth_id: string | null
  company_id: string
  name: string
  email: string
  role: UserRole
  // Analista híbrido (migration 033): consultoria vs time interno do cliente.
  profile_role: 'allied_analyst' | 'client_analyst' | null
  department: string | null
  phone: string | null
  avatar_url: string | null
  active: boolean
  manager_id: string | null
  alternate_manager_id: string | null
  job_title_id: string | null
  location_id: string | null
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

export interface AssignmentGroupRow {
  id: string
  company_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface UserGroupRow {
  user_id: string
  group_id: string
}

export interface IncidentRow {
  id: string
  number: string
  company_id: string
  case_id?: string | null
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
  assignment_group_id: string | null
  sla_breached: boolean
  sla_deadline: string | null
  related_problem_id: string | null
  created_at: string
  updated_at: string
  responded_at: string | null
  resolved_at: string | null
  closed_at: string | null
  // Encerramento padrão ServiceNow (migration 013)
  close_code: string | null
  close_notes: string | null
  // Fase 18 — Motor de Resolução Estruturada (migration 115)
  resolution_code: string | null
  resolution_notes: string | null
  kb_candidate: boolean
  // Service Catalog (migration 019)
  ticket_type: 'incident' | 'request'
  catalog_item_id: string | null
  impact?: 'Low' | 'Medium' | 'High' | 'Critical' | null
  urgency?: 'Low' | 'Medium' | 'High' | null
  // Motivo da pendência (migration 022) — obrigatório quando state = 'On Hold'
  pending_reason?: string | null
  // Roteamento do catálogo 3 níveis (migration 023)
  catalog_service_id?: string | null
  symptom_id?: string | null
  // Esteira de requisições (migration 024 + 047)
  request_item_id?: string | null
  request_subcategory_id?: string | null
  form_data?: Json | null
  // Motor de SLA: prioridade numérica + prazos projetados (migration 033)
  priority_level?: number | null
  sla_response_deadline?: string | null
  sla_resolution_deadline?: string | null
  sla_managed_by_client?: boolean
  // Motor de SLA: acumulador de pausa (migration 034)
  paused_at?: string | null
  accumulated_paused_time_minutes?: number
  // Motor de SLA: governança de pausa + breach (migration 035)
  pending_reason_id?: string | null
  is_response_breached?: boolean
  is_resolution_breached?: boolean
  // Motor de SLA: acumulador de reabertura (migration 054)
  accumulated_reopen_time_minutes?: number
  // Motor de SLA: guarda de idempotência do aviso <30min (migration 059)
  sla_warning_notified?: boolean
  // Motor de Automação: tags livres + canal de origem (migration 055)
  tags?: string[]
  opened_via?: 'portal' | 'manual' | 'email' | 'api' | null
  // Aprovação unificada de requisições (migration 072)
  approval_status?: 'not_required' | 'pending' | 'approved' | 'rejected'
  approval_decided_at?: string | null
}

// Motivos de pendência por tenant (migration 035).
export interface PendingReasonRow {
  id: string
  company_id: string
  name: string
  slug: string
  requires_customer_action: boolean
  active: boolean
  pauses_sla: boolean
  created_at: string
}

// Livro-caixa de eventos de SLA (migration 035).
export type SlaEventType =
  | 'response_start'
  | 'response_achieved'
  | 'resolution_start'
  | 'resolution_achieved'
  | 'paused'
  | 'resumed'
  | 'breached'
  | 'reopened'

export interface SlaEventRow {
  id: string
  incident_id: string
  event_type: SlaEventType
  metadata: Json
  created_at: string
}

/** Interações do chamado (chat público + notas internas). Migration 013. */
export type MessageActorType = 'analyst' | 'user' | 'system'

export interface TicketMessageRow {
  id: string
  incident_id: string
  company_id: string
  sender_id: string | null
  sender_name: string | null
  actor_type: MessageActorType
  body: string
  is_internal: boolean
  created_at: string
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

export interface PortalTicketDetail extends IncidentRow {
  catalog_category_name: string | null
  catalog_selection_name: string | null
}

// ─── Base de Conhecimento (migrations 079 + 082) ───────────────
export type KnowledgeStatus = 'draft' | 'review' | 'published' | 'archived'
export type KnowledgeVisibility = 'public' | 'tenant' | 'internal' | 'restricted'
export type KnowledgeUsage = 'suggested' | 'linked' | 'sent_to_user'
export type KnowledgeGrantSubject = 'profile' | 'group'

export interface KnowledgeCategoryRow {
  id: string
  company_id: string
  name: string
  slug: string
  service_domain_id: string | null
}

export interface KnowledgeArticleRow {
  id: string
  company_id: string
  category_id: string | null
  service_domain_id: string | null
  title: string
  slug: string
  summary: string | null
  body: string
  status: KnowledgeStatus
  visibility: KnowledgeVisibility
  author_id: string | null
  reviewer_id: string | null
  published_at: string | null
  version: number
  tags: string[]
  scheduled_at: string | null
  view_count: number
  deflection_count: number
  created_at: string
  updated_at: string
  // Fase 20 — Automação de KEDB (migration 117)
  source_ticket_id: string | null
}

export interface KnowledgeArticleFeedbackRow {
  id: string
  company_id: string
  article_id: string
  profile_id: string | null
  helpful: boolean
  comment: string | null
  created_at: string
}

export interface KnowledgeArticleVersionRow {
  id: string
  company_id: string
  article_id: string
  version: number
  title: string
  summary: string | null
  body: string
  status: KnowledgeStatus
  visibility: KnowledgeVisibility
  snapshot_by: string | null
  created_at: string
}

export interface KnowledgeArticleGrantRow {
  id: string
  company_id: string
  article_id: string
  subject_type: KnowledgeGrantSubject
  subject_id: string
  granted_by: string | null
  expires_at: string | null
  created_at: string
}

export interface KnowledgeArticleCaseRow {
  id: string
  company_id: string
  article_id: string
  case_id: string
  linked_by: string | null
  usage: KnowledgeUsage
  created_at: string
}

// ─── Agente Virtual transacional (migrations 079 + 085) ────────
export type VirtualAgentConfirmationStatus = 'not_required' | 'pending' | 'confirmed' | 'rejected'
export type VirtualAgentResultStatus = 'success' | 'failed' | 'transferred' | 'blocked' | 'pending'

export interface VirtualAgentActionRow {
  id: string
  company_id: string
  service_domain_id: string | null
  action_key: string
  name: string
  enabled: boolean
  requires_confirmation: boolean
  min_confidence: number
  /** { keywords: string[] } — casamento simples por palavra-chave (NLU por regras). */
  config: { keywords?: string[]; [key: string]: unknown }
}

export interface VirtualAgentExecutionRow {
  id: string
  company_id: string
  conversation_id: string | null
  case_id: string | null
  action_id: string | null
  identity_id: string | null
  intent: string | null
  confidence: number | null
  confirmation_status: VirtualAgentConfirmationStatus
  result_status: VirtualAgentResultStatus
  source_article_ids: string[]
  safe_input: Record<string, unknown>
  safe_output: Record<string, unknown>
  error_message: string | null
  created_at: string
}

/** Retorno das RPCs virtual_agent_process_message / virtual_agent_confirm_action. */
export interface VirtualAgentReply {
  conversationId?: string
  reply: string
  executionId?: string | null
  requiresConfirmation?: boolean
  confirmed?: boolean
}

/** Linha achatada retornada pela RPC kb_search_articles. */
export interface KnowledgeSearchResult {
  id: string
  title: string
  summary: string | null
  slug: string
  category_id: string | null
  service_domain_id: string | null
  visibility: KnowledgeVisibility
  status: KnowledgeStatus
  tags: string[]
  view_count: number
  updated_at: string
  rank: number
  total_count: number
}

// Fase 22 — Busca Omnichannel (migration 119)
export type GlobalSearchResultType = 'catalog' | 'kb_article'

export interface GlobalSearchResult {
  id: string
  type: GlobalSearchResultType
  title: string
  snippet: string | null
  rank: number
  slug: string | null
}

// Fase 26 — Motor de Macros / Quick Actions (migration 123)
export interface TicketMacroSetFields {
  state?: string
  assignment_group_id?: string
  priority?: string
  resolution_code?: string
  resolution_notes?: string
  pending_reason_id?: string
  kb_candidate?: boolean
}

export interface TicketMacroAddComment {
  body: string
  is_internal?: boolean
}

export interface TicketMacroOperations {
  set_fields?: TicketMacroSetFields
  add_comment?: TicketMacroAddComment
}

export interface TicketMacroRow {
  id: string
  company_id: string
  name: string
  description: string | null
  operations: TicketMacroOperations
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// Fase 25 — API Pública e Webhooks Outbound (migration 122)
export type OutboundWebhookEvent = 'ticket.created' | 'ticket.resolved'

export interface OutboundWebhookRow {
  id: string
  company_id: string
  target_url: string
  events_subscribed: OutboundWebhookEvent[]
  is_active: boolean
  consecutive_failures: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// Fase 23 — Analytics e Relatórios Executivos (migration 120)
export interface ExecutiveMetrics {
  period: { start: string; end: string }
  total_opened: number
  total_resolved: number
  sla_compliance_pct: number | null
  mttr_minutes: number | null
  mttr_hours: number | null
  by_status: Record<string, number>
}

/** Linha retornada pela RPC kb_suggest_for_case (cockpit). */
export interface KnowledgeSuggestion {
  id: string
  title: string
  summary: string | null
  slug: string
  visibility: KnowledgeVisibility
  rank: number
}

// ─── Motor de SLA: Calendário Útil por cliente (migration 032) ──

// ─── Departamentos e Tarefas (Migrations 046, 047, 048) ──────

export interface DepartmentRow {
  id: string
  company_id: string
  name: string
  description: string | null
  icon: string | null
  is_active: boolean
  sort_order: number
  visible_to_groups?: string[] | null
  ui_config?: Json | null
  created_at: string
  updated_at: string
}

export interface RequestSubcategoryRow {
  id: string
  company_id: string
  category_id: string
  name: string
  description: string | null
  icon: string | null
  active: boolean
  sort_order: number
  ui_config?: Json | null
  created_at: string
  updated_at: string
}

export interface TicketTaskRow {
  id: string
  company_id: string
  incident_id?: string | null
  request_id?: string | null
  parent_task_id?: string | null
  number: string
  short_description: string
  description: string | null
  state: 'Pending' | 'Work in Progress' | 'Closed' | 'Canceled'
  assigned_group_id?: string | null
  assigned_to_id?: string | null
  created_at: string
  updated_at: string
  closed_at?: string | null
}

export interface SlaCalendarRow {
  id: string
  company_id: string
  name: string
  timezone: string
  is_24x7: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface SlaCalendarShiftRow {
  id: string
  calendar_id: string
  /** 0=Domingo .. 6=Sábado (igual a EXTRACT(DOW)) */
  weekday: number
  start_time: string
  end_time: string
}

export interface SlaCalendarHolidayRow {
  id: string
  calendar_id: string
  holiday: string
  name: string | null
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
  category_id: string | null   // FK para catalog_categories (migration 019)
  sla_hours: number            // SLA padrão do serviço (migration 019)
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

/** Categoria da vitrine do Service Catalog (migration 019 + 046). */
export interface CatalogCategoryRow {
  id: string
  company_id: string
  department_id?: string | null
  name: string
  description: string | null
  icon: string
  sort_order: number
  is_active: boolean
  ui_config?: Json | null
  created_at: string
}

/** Nível 2 — Serviço (migration 023), vinculado a uma categoria. */
export interface CatalogServiceRow {
  id: string
  company_id: string
  category_id: string
  name: string
  description: string | null
  icon: string
  sort_order: number
  is_active: boolean
  ui_config?: Json | null
  created_at: string
}

/** Tabela mestre de sintomas universais (migration 023, global). */
export interface SystemSymptomRow {
  id: string
  name: string
  icon: string | null
  sort_order: number
}

/** Nível 3 — Junção Serviço × Sintoma com a governança (migration 023). */
export interface CatalogServiceSymptomRow {
  id: string
  company_id: string
  service_id: string
  symptom_id: string
  sla_hours: number
  assignment_group_id: string | null
  form_template_id: string | null
  form_fields: Json
  ui_config: Json
  active: boolean
  created_at: string
  // Overrides do motor de SLA (migration 033)
  sla_calendar_id?: string | null
  fixed_priority?: number | null
  // joins opcionais
  symptom?: SystemSymptomRow | null
  group?: { id: string; name: string } | null
  service?: { id: string; name: string; category_id: string; icon?: string | null } | null
}

/** Campo de formulário dinâmico de um item de requisição. */
export interface RequestFormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'datetime' | 'number' | 'date'
  required: boolean
  options?: string[]
}

export interface FormTemplateRow {
  id: string
  tenant_id: string
  name: string
  fields: Json
  created_at: string
  updated_at: string
}

/** Esteira de Requisições — Nível 1 (migration 024 + 046). */
export interface RequestCategoryRow {
  id: string
  company_id: string
  department_id?: string | null
  name: string
  description: string | null
  icon: string | null
  active: boolean
  sort_order: number
  ui_config?: Json | null
  created_at: string
}

/** Esteira de Requisições — Nível 3 (migration 024 + 047). */
export interface RequestItemRow {
  id: string
  company_id: string
  request_category_id?: string | null
  request_subcategory_id?: string | null
  name: string
  description: string | null
  icon: string | null
  form_template_id: string | null
  form_fields: Json
  ui_config: Json
  assignment_group_id: string | null
  active: boolean
  sort_order: number
  created_at: string
  // Overrides do motor de SLA (migration 033)
  sla_calendar_id?: string | null
  fixed_priority?: number | null
  // Aprovação por grupo (migration 072)
  requires_approval?: boolean
  approval_group_id?: string | null
  approval_mode?: 'any' | 'all'
  approval_type?: 'group' | 'manager' | 'department_head'
  // join opcional
  group?: { id: string; name: string } | null
}

export interface RequestApprovalRow {
  id: string
  company_id: string
  incident_id: string
  approver_id: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  decision_note: string | null
  decided_at: string | null
  created_at: string
  incident?: Pick<IncidentRow, 'id' | 'number' | 'short_description' | 'caller_name' | 'created_at' | 'approval_status'> | null
}

export interface CsatSurveyRow {
  id: string
  company_id: string
  incident_id: string
  requester_id: string
  status: 'pending' | 'submitted' | 'expired'
  rating: number | null
  comment: string | null
  sent_at: string
  submitted_at: string | null
  created_at: string
}

export interface ResponseMacroRow {
  id: string
  company_id: string
  name: string
  body: string
  visibility: 'public' | 'internal' | 'both'
  active: boolean
  usage_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// Política de SLA por tenant (migration 033) — prioridade numérica 1..5.
export interface SLAPolicyRow {
  id: string
  company_id: string
  priority: number
  response_time_minutes: number
  resolution_time_minutes: number
  active: boolean
  created_at: string
  updated_at: string
}

// Matriz de prioridade ITIL global (migration 033).
export interface SlaPriorityMatrixRow {
  id: string
  impact: 'low' | 'medium' | 'high'
  urgency: 'low' | 'medium' | 'high'
  resulting_priority: number
}

export interface WorkflowRuleRow {
  id: string
  company_id: string
  ticket_type: string
  name: string
  description: string | null
  trigger_event: string
  trigger_source: 'any' | 'portal' | 'email' | 'api'
  conditions: Json
  actions: Json
  active: boolean
  priority_order: number
  created_at: string
  updated_at: string
}

/** Motor de Automação: log real de execução (migration 056) — substitui o mock da UI. */
export interface WorkflowExecutionLogRow {
  id: string
  company_id: string
  rule_id: string | null
  rule_name: string
  incident_id: string | null
  incident_number: string | null
  trigger_event: string
  matched: boolean
  status: 'success' | 'error' | 'skipped' | 'partial'
  actions_summary: string | null
  duration_ms: number | null
  created_at: string
}

/** Motor de Automação: fila de ações assíncronas (migration 056). */
export interface WorkflowActionQueueRow {
  id: string
  company_id: string
  rule_id: string | null
  incident_id: string
  action: Json
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled'
  attempts: number
  max_attempts: number
  run_after: string
  last_error: string | null
  created_at: string
  processed_at: string | null
  claimed_at?: string | null
  chain_id?: string | null
  sequence_no?: number
}

export interface NotificationRow {
  id: string
  company_id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  read: boolean
  linked_ticket_id: string | null
  linked_ticket_type: string | null
  link: string | null
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
// ─── Fundação administrativa e Omnichannel ─────────────
export interface ModuleEntitlementRow {
  id: string
  company_id: string
  module_key: string
  enabled: boolean
  source: string
  starts_at: string | null
  ends_at: string | null
  limits: Json
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface AdminAuditEventRow {
  id: string
  company_id: string
  actor_profile_id: string | null
  actor_role: string
  action: string
  resource_type: string
  resource_id: string | null
  before_data: Json | null
  after_data: Json | null
  correlation_id: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface ChannelConnectionRow {
  id: string
  company_id: string
  scope: 'tenant' | 'provider'
  provider: 'microsoft_graph' | 'microsoft_teams' | 'gmail' | 'google_chat' | 'whatsapp_cloud' | 'imap_smtp' | 'portal' | 'api'
  name: string
  external_account_id: string | null
  address: string | null
  enabled: boolean
  status: 'disconnected' | 'connecting' | 'healthy' | 'degraded' | 'expired' | 'error'
  vault_secret_id: string | null
  config: Json
  capabilities: Json
  subscription_expires_at: string | null
  last_health_check_at: string | null
  last_error_code: string | null
  last_error_message: string | null
  rotation_required: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}


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
  whatsapp_vault_secret_id: string | null
  whatsapp_webhook_vault_secret_id: string | null
  teams_vault_secret_id: string | null
  rotation_required: boolean
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
      assignment_groups:          { Row: AssignmentGroupRow;            Insert: Partial<AssignmentGroupRow>;            Update: Partial<AssignmentGroupRow>;            Relationships: [] }
      user_groups:                { Row: UserGroupRow;                  Insert: UserGroupRow;                           Update: Partial<UserGroupRow>;                  Relationships: [] }
      incidents:                  { Row: IncidentRow;                   Insert: Partial<IncidentRow>;                   Update: Partial<IncidentRow>;                   Relationships: [] }
      request_approvals:          { Row: RequestApprovalRow;            Insert: Partial<RequestApprovalRow>;            Update: Partial<RequestApprovalRow>;            Relationships: [] }
      csat_surveys:               { Row: CsatSurveyRow;                 Insert: Partial<CsatSurveyRow>;                 Update: Partial<CsatSurveyRow>;                 Relationships: [] }
      response_macros:            { Row: ResponseMacroRow;              Insert: Partial<ResponseMacroRow>;              Update: Partial<ResponseMacroRow>;              Relationships: [] }
      incident_history:           { Row: IncidentHistoryRow;            Insert: Partial<IncidentHistoryRow>;            Update: Partial<IncidentHistoryRow>;            Relationships: [] }
      problems:                   { Row: ProblemRow;                    Insert: Partial<ProblemRow>;                    Update: Partial<ProblemRow>;                    Relationships: [] }
      changes:                    { Row: ChangeRow;                     Insert: Partial<ChangeRow>;                     Update: Partial<ChangeRow>;                     Relationships: [] }
      catalog_items:              { Row: CatalogItemRow;                Insert: Partial<CatalogItemRow>;                Update: Partial<CatalogItemRow>;                Relationships: [] }
      form_templates:             { Row: FormTemplateRow;               Insert: Partial<FormTemplateRow>;               Update: Partial<FormTemplateRow>;               Relationships: [] }
      sla_policies:               { Row: SLAPolicyRow;                  Insert: Partial<SLAPolicyRow>;                  Update: Partial<SLAPolicyRow>;                  Relationships: [] }
      // ─ Motor de SLA: Calendário Útil (migration 032)
      sla_calendars:              { Row: SlaCalendarRow;                Insert: Partial<SlaCalendarRow>;                Update: Partial<SlaCalendarRow>;                Relationships: [] }
      sla_calendar_shifts:        { Row: SlaCalendarShiftRow;           Insert: Partial<SlaCalendarShiftRow>;           Update: Partial<SlaCalendarShiftRow>;           Relationships: [] }
      sla_calendar_holidays:      { Row: SlaCalendarHolidayRow;         Insert: Partial<SlaCalendarHolidayRow>;         Update: Partial<SlaCalendarHolidayRow>;         Relationships: [] }
      // ─ Motor de SLA: Matriz de prioridade ITIL (migration 033)
      sla_priority_matrix:        { Row: SlaPriorityMatrixRow;          Insert: Partial<SlaPriorityMatrixRow>;          Update: Partial<SlaPriorityMatrixRow>;          Relationships: [] }
      // ─ Motor de SLA: Governança de pausa + ledger (migration 035)
      pending_reasons:            { Row: PendingReasonRow;              Insert: Partial<PendingReasonRow>;              Update: Partial<PendingReasonRow>;              Relationships: [] }
      sla_events:                 { Row: SlaEventRow;                   Insert: Partial<SlaEventRow>;                   Update: Partial<SlaEventRow>;                   Relationships: [] }
      workflow_rules:             { Row: WorkflowRuleRow;               Insert: Partial<WorkflowRuleRow>;               Update: Partial<WorkflowRuleRow>;               Relationships: [] }
      workflow_execution_log:     { Row: WorkflowExecutionLogRow;       Insert: Partial<WorkflowExecutionLogRow>;       Update: Partial<WorkflowExecutionLogRow>;       Relationships: [] }
      workflow_action_queue:      { Row: WorkflowActionQueueRow;        Insert: Partial<WorkflowActionQueueRow>;        Update: Partial<WorkflowActionQueueRow>;        Relationships: [] }
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
      company_module_entitlements: { Row: ModuleEntitlementRow;            Insert: Partial<ModuleEntitlementRow>;            Update: Partial<ModuleEntitlementRow>;            Relationships: [] }
      admin_audit_events:          { Row: AdminAuditEventRow;             Insert: Partial<AdminAuditEventRow>;             Update: Partial<AdminAuditEventRow>;             Relationships: [] }
      channel_connections:         { Row: ChannelConnectionRow;           Insert: Partial<ChannelConnectionRow>;           Update: Partial<ChannelConnectionRow>;           Relationships: [] }
      // ─ Novos: Chatbot
      chatbot_whitelist:          { Row: ChatbotWhitelistRow;           Insert: Partial<ChatbotWhitelistRow>;           Update: Partial<ChatbotWhitelistRow>;           Relationships: [] }
      chatbot_messages:           { Row: ChatbotMessageRow;             Insert: Partial<ChatbotMessageRow>;             Update: Partial<ChatbotMessageRow>;             Relationships: [] }
      chatbot_blocked_attempts:   { Row: ChatbotBlockedAttemptRow;      Insert: Partial<ChatbotBlockedAttemptRow>;      Update: Partial<ChatbotBlockedAttemptRow>;      Relationships: [] }
      chatbot_config:             { Row: ChatbotConfigRow;              Insert: Partial<ChatbotConfigRow>;              Update: Partial<ChatbotConfigRow>;              Relationships: [] }
    }
    Views: Record<string, never>
    Functions: {
      save_channel_connection: {
        Args: {
          p_company_id: string
          p_connection_id: string | null
          p_scope: 'tenant' | 'provider'
          p_provider: ChannelConnectionRow['provider']
          p_name: string
          p_address: string | null
          p_enabled: boolean
          p_config?: Json
          p_secret?: string | null
        }
        Returns: Json
      }
      revoke_channel_connection: {
        Args: { p_company_id: string; p_connection_id: string }
        Returns: undefined
      }
    }
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
