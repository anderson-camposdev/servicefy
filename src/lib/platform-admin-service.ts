import { supabase } from './supabase'
import type { ModuleEntitlementRow } from './database.types'
import type { Json } from './database.generated'
import type { ChannelProvider } from './platform-foundation'

export interface SafeConnectionHealth {
  id: string
  provider: string
  name: string
  address: string | null
  enabled: boolean
  status: string
  subscriptionExpiresAt: string | null
  lastHealthCheckAt: string | null
  lastErrorCode: string | null
  rotationRequired: boolean
  /**
   * Ajustes do provider (regras de correlação da conexão de Monitoramento).
   * Precisa vir na listagem: sem isso, editar o nome de uma conexão salvaria
   * config vazio por cima e apagaria as regras do tenant sem aviso.
   */
  config: Record<string, unknown>
}

export interface SettingsOverview {
  entitlements: ModuleEntitlementRow[]
  connections: SafeConnectionHealth[]
}
export interface SaveConnectionInput {
  companyId: string
  connectionId?: string | null
  scope: 'tenant' | 'provider'
  provider: ChannelProvider
  name: string
  address?: string | null
  enabled: boolean
  config?: Record<string, unknown>
  secret?: string | null
}

export type ChannelMatchType = 'address' | 'alias' | 'domain' | 'phone' | 'external_identity' | 'default'

export interface ChannelRoute {
  id: string
  connection_id: string
  target_company_id: string
  priority: number
  match_type: ChannelMatchType
  match_value: string | null
  assignment_group_id: string | null
  enabled: boolean
  created_at: string
}

export interface SaveRouteInput {
  id?: string | null
  connectionId: string
  targetCompanyId: string
  priority: number
  matchType: ChannelMatchType
  matchValue: string | null
  assignmentGroupId: string | null
  enabled: boolean
}

export type TriageAction = 'assigned' | 'discarded' | 'reprocessed'

export interface ChannelTriageEvent {
  id: string
  company_id: string
  connection_id: string
  sender: string | null
  subject: string | null
  reason: 'ambiguous_route' | 'route_not_found' | 'invalid_tenant'
  status: 'pending' | 'assigned' | 'discarded' | 'reprocessed'
  resolved_company_id: string | null
  created_at: string
}

export interface ConnectionOption { id: string; name: string; provider: string }



export const platformAdminService = {
  async getSettingsOverview(companyId: string): Promise<SettingsOverview> {
    const [entitlementsResult, connectionsResult] = await Promise.all([
      supabase
        .from('company_module_entitlements')
        .select('*')
        .eq('company_id', companyId)
        .order('module_key'),
      supabase
        .from('channel_connections')
        .select('id,provider,name,address,enabled,status,subscription_expires_at,last_health_check_at,last_error_code,rotation_required,config')
        .eq('company_id', companyId)
        .order('provider'),
    ])

    if (entitlementsResult.error) throw entitlementsResult.error
    if (connectionsResult.error) throw connectionsResult.error

    return {
      entitlements: (entitlementsResult.data ?? []) as unknown as ModuleEntitlementRow[],
      connections: (connectionsResult.data ?? []).map(row => ({
        id: row.id,
        provider: row.provider,
        name: row.name,
        address: row.address,
        enabled: row.enabled,
        status: row.status,
        subscriptionExpiresAt: row.subscription_expires_at,
        lastHealthCheckAt: row.last_health_check_at,
        lastErrorCode: row.last_error_code,
        rotationRequired: row.rotation_required,
        config: (row.config ?? {}) as Record<string, unknown>,
      })),
    }
  },

  async listAuditEvents(companyId: string, limit = 100) {
    const { data, error } = await supabase
      .from('admin_audit_events')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },
  async saveConnection(input: SaveConnectionInput) {
    // p_connection_id/p_address não têm DEFAULT (migration de channel
    // connections), mas a RPC aceita NULL explicitamente (conexão nova /
    // provider sem endereço) — o gerador de tipos não expõe nullability de
    // parâmetro de RPC, só presença/DEFAULT.
    const { data, error } = await supabase.rpc('save_channel_connection', {
      p_company_id: input.companyId,
      p_connection_id: (input.connectionId ?? null) as unknown as string,
      p_scope: input.scope,
      p_provider: input.provider,
      p_name: input.name,
      p_address: (input.address ?? null) as unknown as string,
      p_enabled: input.enabled,
      p_config: (input.config ?? {}) as Json,
      p_secret: input.secret ?? undefined,
    })
    if (error) throw error
    return data
  },

  async revokeConnection(companyId: string, connectionId: string) {
    const { error } = await supabase.rpc('revoke_channel_connection', {
      p_company_id: companyId,
      p_connection_id: connectionId,
    })
    if (error) throw error
  },

  // ─── Rotas de canal (channel_routes; RLS por target_company_id) ─────────────
  async listConnectionOptions(companyId: string): Promise<ConnectionOption[]> {
    const { data, error } = await supabase
      .from('channel_connections')
      .select('id,name,provider')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw error
    return (data ?? []) as ConnectionOption[]
  },

  async listRoutes(companyId: string): Promise<ChannelRoute[]> {
    const { data, error } = await supabase
      .from('channel_routes')
      .select('id,connection_id,target_company_id,priority,match_type,match_value,assignment_group_id,enabled,created_at')
      .eq('target_company_id', companyId)
      .order('priority')
    if (error) throw error
    return (data ?? []) as ChannelRoute[]
  },

  async saveRoute(input: SaveRouteInput): Promise<ChannelRoute> {
    const payload = {
      connection_id: input.connectionId,
      target_company_id: input.targetCompanyId,
      priority: input.priority,
      match_type: input.matchType,
      match_value: input.matchType === 'default' ? null : (input.matchValue ?? null),
      assignment_group_id: input.assignmentGroupId,
      enabled: input.enabled,
    }
    const query = input.id
      ? supabase.from('channel_routes').update(payload).eq('id', input.id).select().single()
      : supabase.from('channel_routes').insert(payload).select().single()
    const { data, error } = await query
    if (error) throw error
    return data as ChannelRoute
  },

  async deleteRoute(id: string) {
    const { error } = await supabase.from('channel_routes').delete().eq('id', id)
    if (error) throw error
  },

  // ─── Triagem de eventos ambíguos ────────────────────────────────────────────
  async listTriage(companyId: string): Promise<ChannelTriageEvent[]> {
    const { data, error } = await supabase
      .from('channel_triage_events')
      .select('id,company_id,connection_id,sender,subject,reason,status,resolved_company_id,created_at')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as ChannelTriageEvent[]
  },

  async resolveTriage(id: string, action: TriageAction, targetCompanyId: string | null) {
    const { error } = await supabase.rpc('resolve_channel_triage', {
      p_id: id,
      p_action: action,
      p_target_company_id: targetCompanyId ?? undefined,
    })
    if (error) throw error
  },

}
