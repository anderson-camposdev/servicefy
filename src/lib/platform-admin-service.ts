import { supabase } from './supabase'
import type { ModuleEntitlementRow } from './database.types'
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
        .select('id,provider,name,address,enabled,status,subscription_expires_at,last_health_check_at,last_error_code,rotation_required')
        .eq('company_id', companyId)
        .order('provider'),
    ])

    if (entitlementsResult.error) throw entitlementsResult.error
    if (connectionsResult.error) throw connectionsResult.error

    return {
      entitlements: entitlementsResult.data ?? [],
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
    const { data, error } = await supabase.rpc('save_channel_connection', {
      p_company_id: input.companyId,
      p_connection_id: input.connectionId ?? null,
      p_scope: input.scope,
      p_provider: input.provider,
      p_name: input.name,
      p_address: input.address ?? null,
      p_enabled: input.enabled,
      p_config: input.config ?? {},
      p_secret: input.secret ?? null,
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

}
