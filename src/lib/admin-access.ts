import type { UserRole } from './database.types'

export type AdminRole = Extract<UserRole, 'sysadmin' | 'company_admin'>
export const ADMIN_ROLES: readonly AdminRole[] = ['sysadmin', 'company_admin']

export const isAdminRole = (role: string | null | undefined): role is AdminRole =>
  role === 'sysadmin' || role === 'company_admin'

export interface TenantAdminContext {
  role: string | null | undefined
  actorCompanyId: string | null | undefined
  targetCompanyId: string | null | undefined
}

export const canManageTenant = ({ role, actorCompanyId, targetCompanyId }: TenantAdminContext): boolean => {
  if (!isAdminRole(role) || !targetCompanyId) return false
  if (role === 'sysadmin') return true
  return Boolean(actorCompanyId && actorCompanyId === targetCompanyId)
}

const SECRET_KEY = /(secret|token|password|credential|private[_-]?key|client[_-]?secret|webhook[_-]?secret)/i

export const redactSecrets = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => redactSecrets(item)) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(item),
    ]),
  ) as T
}

export type AdminCapability =
  | 'settings.read' | 'settings.write' | 'tenant.select'
  | 'connection.manage' | 'connection.rotate_secret' | 'audit.read' | 'module.manage'

export const adminCapabilitiesFor = (role: string): AdminCapability[] => {
  if (role === 'sysadmin') return ['settings.read', 'settings.write', 'tenant.select', 'connection.manage', 'connection.rotate_secret', 'audit.read', 'module.manage']
  if (role === 'company_admin') return ['settings.read', 'settings.write', 'connection.manage', 'connection.rotate_secret', 'audit.read', 'module.manage']
  return []
}

export const hasAdminCapability = (role: string, capability: AdminCapability): boolean =>
  adminCapabilitiesFor(role).includes(capability)

export const ADMIN_ACCESS_DENIED_MESSAGE =
  'Esta área é exclusiva para o Administrador do Tenant e o Administrador Global do MSP.'

export const SECRET_NOT_RETRIEVABLE_MESSAGE =
  'Credenciais são write-only: podem ser testadas, substituídas ou revogadas, mas nunca reveladas.'
