// ============================================================
// ServiceFY ITSM — Multi-Tenant (White-Label)
// Barrel de exports do módulo de tenant.
// ============================================================

export {
  resolveTenant,
  getTenantSlug,
  extractSlugFromHostname,
  isCustomDomain,
  setTenantOverride,
  clearTenantOverride,
  BASE_DOMAIN,
  TENANT_STORAGE_KEY,
  TENANT_QUERY_PARAM,
  RESERVED_SUBDOMAINS,
} from './resolveTenant'
export type { ResolvedTenant, TenantSource } from './resolveTenant'

export { getTenantBySlug, getTenantByDomain, getTenantByHostname } from './tenantService'

export { provisionTenant } from './provisionTenant'
export type { ProvisionTenantInput } from './provisionTenant'

export {
  applyBranding,
  brandingFromCompany,
  DEFAULT_BRANDING,
} from './applyBranding'
export type { TenantBranding } from './applyBranding'

export { TenantProvider, useTenant } from './TenantContext'
export type { TenantContextValue, TenantStatus } from './TenantContext'
