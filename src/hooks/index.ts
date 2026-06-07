// Custom React hooks exports
export { useIncidents } from './useIncidents'
export { useAppData, useRequests, useProblems, useChanges, useCatalog } from './useDbData'
export { useLicense } from './useLicense'
export { useIncidentCatalog } from './useIncidentCatalog'
export { useRequestCatalog } from './useRequestCatalog'

export type { LicenseSession } from './useLicense'
export type { IncidentCatalogCascadeEntry, IncidentCatalogSelection, ComputedSLA } from './useIncidentCatalog'
export type { RequestCatalogCascadeEntry, RequestCatalogSelection } from './useRequestCatalog'
