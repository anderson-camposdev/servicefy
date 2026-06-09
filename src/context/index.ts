// Contextos React da aplicação.
// O contexto de tenant (white-label) vive em src/tenant e é
// reexportado aqui para um ponto de importação único.
export {
  TenantProvider,
  useTenant,
  type TenantContextValue,
  type TenantStatus,
} from '../tenant'
