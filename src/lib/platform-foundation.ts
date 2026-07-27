export type SettingsCategoryKey =
  | 'organization' | 'service_management' | 'sla_contracts' | 'channels'
  | 'knowledge_ai' | 'cmdb' | 'portal_brand' | 'security'
  | 'integrations' | 'analytics_licensing'

export type SettingsModuleStatus = 'enabled' | 'locked' | 'attention' | 'coming_soon'

export interface SettingsSection {
  key: string
  category: SettingsCategoryKey
  title: string
  description: string
  keywords: string[]
  status: SettingsModuleStatus
  entitlementKey: string
  legacyTab?: string
  appView?: 'api-docs' | 'workflows' | 'estatisticas'
  capabilities: string[]
}

export interface ModuleEntitlement {
  companyId: string
  moduleKey: string
  enabled: boolean
  source: 'plan' | 'trial' | 'override'
  startsAt?: string | null
  endsAt?: string | null
}

export type ChannelProvider =
  | 'microsoft_graph' | 'microsoft_teams' | 'gmail' | 'google_chat'
  | 'whatsapp_cloud' | 'imap_smtp' | 'portal' | 'api' | 'monitoring'
export type ChannelKind = 'email' | 'chat' | 'whatsapp' | 'portal' | 'api'
export type ChannelConnectionScope = 'tenant' | 'provider'

export interface ChannelCapabilities {
  inbound: boolean
  outbound: boolean
  attachments: boolean
  cards: boolean
  readReceipts: boolean
  reactions: boolean
  threads: boolean
  templates: boolean
}

export interface NormalizedInboundEvent {
  provider: ChannelProvider
  connectionId: string
  externalEventId: string
  externalConversationId: string
  externalMessageId: string
  sender: { externalId: string; email?: string; phone?: string; displayName?: string }
  recipients: string[]
  subject?: string
  text: string
  html?: string
  attachments: Array<{ externalId: string; name: string; contentType: string; size?: number; url?: string }>
  replyToMessageId?: string
  references: string[]
  occurredAt: string
  raw: unknown
}

export interface OutboundMessage {
  companyId: string
  connectionId: string
  conversationId: string
  recipientExternalIds: string[]
  text: string
  html?: string
  templateKey?: string
  attachments?: Array<{ name: string; contentType: string; url: string }>
  correlationId: string
}

export interface DeliveryResult {
  accepted: boolean
  externalMessageId?: string
  retryable: boolean
  status: 'sent' | 'queued' | 'failed'
  errorCode?: string
  errorMessage?: string
}

export interface ChannelHealth {
  ok: boolean
  checkedAt: string
  expiresAt?: string
  warnings: string[]
}

export interface ChannelAdapter {
  provider: ChannelProvider
  capabilities: ChannelCapabilities
  verifyWebhook(headers: Headers, payload: unknown): Promise<boolean>
  normalizeInbound(payload: unknown): Promise<NormalizedInboundEvent[]>
  send(message: OutboundMessage): Promise<DeliveryResult>
  renewSubscription?(): Promise<ChannelHealth>
  testConnection(): Promise<ChannelHealth>
}

export type ServiceDomainPrivacy = 'standard' | 'private' | 'restricted'

export interface ServiceDomain {
  id: string
  companyId: string
  key: string
  name: string
  description?: string | null
  privacy: ServiceDomainPrivacy
  active: boolean
}

export interface CaseType {
  id: string
  companyId: string
  serviceDomainId: string
  key: string
  name: string
  specialization: 'incident' | 'request' | 'general'
  initialState: string
  active: boolean
}

export interface Case {
  id: string
  companyId: string
  serviceDomainId: string
  caseTypeId: string
  number: string
  title: string
  description?: string | null
  state: string
  priority: number
  requesterId?: string | null
  assignedToId?: string | null
  assignmentGroupId?: string | null
  visibility: ServiceDomainPrivacy
  formData: Record<string, unknown>
  sourceChannel: ChannelProvider | 'manual'
  createdAt: string
  updatedAt: string
}

export interface CaseAccessGrant {
  caseId: string
  subjectType: 'profile' | 'group'
  subjectId: string
  permission: 'read' | 'collaborate' | 'manage'
  expiresAt?: string | null
}

export type CILifecycle = 'planned' | 'active' | 'maintenance' | 'retired' | 'disposed'

export interface CIClass {
  id: string
  companyId: string
  key: string
  name: string
  parentId?: string | null
  schema: Record<string, unknown>
}

export interface ConfigurationItem {
  id: string
  companyId: string
  classId: string
  name: string
  assetTag?: string | null
  serialNumber?: string | null
  lifecycle: CILifecycle
  criticality: 'low' | 'medium' | 'high' | 'critical'
  attributes: Record<string, unknown>
  primarySourceId?: string | null
  lastDiscoveredAt?: string | null
}

export interface CIRelationship {
  id: string
  companyId: string
  sourceCiId: string
  targetCiId: string
  relationshipTypeId: string
  attributes: Record<string, unknown>
}

export interface DiscoverySource {
  id: string
  companyId: string
  provider: 'manual' | 'csv' | 'api' | 'intune' | 'entra' | 'active_directory' | 'google_directory' | 'azure' | 'aws' | 'vmware' | 'snmp'
  name: string
  precedence: number
  enabled: boolean
  lastSyncAt?: string | null
}

export interface ReconciliationResult {
  sourceId: string
  externalId: string
  action: 'created' | 'updated' | 'unchanged' | 'conflict' | 'ignored'
  configurationItemId?: string
  matchedBy?: 'external_id' | 'serial_number' | 'asset_tag' | 'hostname' | 'manual'
  conflicts: string[]
}
