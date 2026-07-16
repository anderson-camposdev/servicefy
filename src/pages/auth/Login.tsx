import TenantLoginScreen from '../../components/TenantLoginScreen'
import { useAuth } from '../../auth'
import { useBranding } from '../../context'
import { SSO_PROVIDERS, normalizeSsoProviders } from '../../lib/sso'
import { useTenant } from '../../tenant'

export default function Login() {
  const { branding } = useBranding()
  const { tenant, status: tenantStatus } = useTenant()
  const {
    signIn,
    signInWithProvider,
    status: authStatus,
    error: authError,
  } = useAuth()

  const providers = tenantStatus === 'not-found'
    ? []
    : tenant
      ? normalizeSsoProviders(tenant.sso_providers)
      : [...SSO_PROVIDERS]

  return (
    <TenantLoginScreen
      branding={branding}
      onSignIn={signIn}
      onOAuth={signInWithProvider}
      providers={providers}
      allowLocalLogin={tenant?.allow_local_login ?? true}
      authError={authError}
      loading={authStatus === 'loading'}
      tenantNotFound={tenantStatus === 'not-found'}
    />
  )
}
