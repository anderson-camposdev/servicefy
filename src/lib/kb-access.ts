import type { UserRole } from './database.types'

// Mapa de capacidades de UI para a Base de Conhecimento. A segurança real
// está na RLS/RPC (ver migrations 131-133); isto é só conveniência de
// renderização condicional — espelha a máquina de estados de
// kb_set_article_status, não a substitui.

export type KbCapableRole = Extract<UserRole, 'sysadmin' | 'company_admin' | 'agent' | 'ops_manager' | 'governance_manager'>
export const KB_CAPABLE_ROLES: readonly KbCapableRole[] = ['sysadmin', 'company_admin', 'agent', 'ops_manager', 'governance_manager']

export const isKbCapableRole = (role: string | null | undefined): role is KbCapableRole =>
  (KB_CAPABLE_ROLES as readonly string[]).includes(role ?? '')

export type KbCapability =
  | 'kb.create_draft'
  | 'kb.edit_own'
  | 'kb.edit_any'
  | 'kb.submit_review'
  | 'kb.approve_publish'
  | 'kb.reject_to_draft'
  | 'kb.archive'
  | 'kb.unpublish'
  | 'kb.reinstate_archived'
  | 'kb.manage_grants'
  | 'kb.manage_categories'
  | 'kb.delete'

const AGENT_CAPS: KbCapability[] = ['kb.create_draft', 'kb.edit_own', 'kb.submit_review']

const OPS_MANAGER_CAPS: KbCapability[] = [
  ...AGENT_CAPS,
  'kb.edit_any', 'kb.approve_publish', 'kb.reject_to_draft', 'kb.archive', 'kb.unpublish',
]

const GOVERNANCE_MANAGER_CAPS: KbCapability[] = [
  ...OPS_MANAGER_CAPS,
  'kb.reinstate_archived', 'kb.manage_grants',
]

const ADMIN_CAPS: KbCapability[] = [
  ...GOVERNANCE_MANAGER_CAPS,
  'kb.manage_categories', 'kb.delete',
]

export const kbCapabilitiesFor = (role: string | null | undefined): KbCapability[] => {
  if (role === 'sysadmin' || role === 'company_admin') return ADMIN_CAPS
  if (role === 'governance_manager') return GOVERNANCE_MANAGER_CAPS
  if (role === 'ops_manager') return OPS_MANAGER_CAPS
  if (role === 'agent') return AGENT_CAPS
  return []
}

export const hasKbCapability = (role: string | null | undefined, capability: KbCapability): boolean =>
  kbCapabilitiesFor(role).includes(capability)

export const KB_ACCESS_DENIED_MESSAGE =
  'Esta área é exclusiva para Analistas, Gestores de Operação, Gestores de Governança e Administradores.'
