export const SSO_PROVIDERS = ['google', 'azure'] as const
export type SsoProvider = typeof SSO_PROVIDERS[number]

const isSsoProvider = (value: unknown): value is SsoProvider =>
  typeof value === 'string' && SSO_PROVIDERS.includes(value as SsoProvider)

const providerFromLegacyObject = (value: object): SsoProvider | null => {
  const record = value as Record<string, unknown>
  if (record.enabled === false) return null
  const candidate = typeof record.id === 'string' ? record.id : record.type
  if (typeof candidate !== 'string') return null
  const normalized = candidate.toLowerCase().replace(/^oauth_/, '')
  return isSsoProvider(normalized) ? normalized : null
}

/** Lê o contrato canônico e o JSON legado sem introduzir `any`. */
export function normalizeSsoProviders(value: unknown): SsoProvider[] {
  if (!Array.isArray(value)) return []
  const providers = value.flatMap(item => {
    if (isSsoProvider(item)) return [item]
    if (item && typeof item === 'object') {
      const provider = providerFromLegacyObject(item)
      return provider ? [provider] : []
    }
    return []
  })
  return Array.from(new Set(providers))
}
