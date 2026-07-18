type CurlEndpoint = {
  method: string
  path: string
  requestBody?: object
}

const MODULE_LABELS: Record<string, string> = {
  incidents: 'Incidentes',
  requests: 'Solicitações',
  problems: 'Problemas',
  changes: 'Mudanças',
  catalog: 'Catálogo',
  users: 'Usuários',
  companies: 'Integrações',
}

export function getApiModuleLabel(module: string) {
  return MODULE_LABELS[module] ?? 'Outros'
}

export function buildCurlExample(endpoint: CurlEndpoint) {
  const lines = [
    `curl --request ${endpoint.method} 'https://api.servicefy.com${endpoint.path}'`,
    "  --header 'Authorization: Bearer $SERVICEFY_API_KEY'",
    "  --header 'Content-Type: application/json'",
  ]

  if (endpoint.requestBody) {
    lines.push(`  --data '${JSON.stringify(endpoint.requestBody, null, 2)}'`)
  }

  return lines.join(' \\\n')
}

export function getWebhookHealth(isActive: boolean, consecutiveFailures: number) {
  if (!isActive) return { tone: 'inactive' as const, label: 'Pausado', detail: 'Entregas desativadas' }
  if (consecutiveFailures >= 5) return { tone: 'critical' as const, label: 'Entrega interrompida', detail: `${consecutiveFailures} falhas consecutivas` }
  if (consecutiveFailures > 0) return { tone: 'warning' as const, label: 'Requer atenção', detail: `${consecutiveFailures} falha${consecutiveFailures === 1 ? '' : 's'} consecutiva${consecutiveFailures === 1 ? '' : 's'}` }
  return { tone: 'healthy' as const, label: 'Operando', detail: 'Sem falhas recentes' }
}

export function validateWebhookDraft({
  targetUrl,
  events,
  secret,
  isNew,
}: {
  targetUrl: string
  events: string[]
  secret: string
  isNew: boolean
}) {
  try {
    const url = new URL(targetUrl.trim())
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) {
      return 'Use uma URL HTTPS pública para receber as entregas.'
    }
  } catch {
    return 'Use uma URL HTTPS pública para receber as entregas.'
  }

  if (events.length === 0) return 'Selecione ao menos um evento para assinar.'
  if ((isNew || secret.trim()) && secret.trim().length < 16) return 'Use um segredo com pelo menos 16 caracteres.'
  return null
}
