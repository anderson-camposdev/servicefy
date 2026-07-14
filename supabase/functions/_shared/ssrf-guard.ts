// ============================================================
// ServiceFY ITSM — Guarda de SSRF de linha de base para webhooks
// disparados a partir de dados configurados por tenants (URLs em
// workflow_rules.actions, outbound_webhooks, etc).
//
// Não é exaustiva (não resolve DNS nem protege contra
// redirecionamento/rebinding), mas bloqueia os alvos óbvios mais
// comuns (metadados de nuvem, loopback, redes privadas) antes de
// deixar o servidor fazer a requisição.
// ============================================================

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1'])

export function isBlockedTarget(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl)
    const host = hostname.toLowerCase()
    if (BLOCKED_HOSTNAMES.has(host)) return true
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
    if (/^169\.254\./.test(host)) return true
    return false
  } catch {
    return true
  }
}
