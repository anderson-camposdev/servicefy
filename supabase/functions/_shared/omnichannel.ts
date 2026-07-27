export type ChannelProvider =
  | 'microsoft_graph' | 'microsoft_teams' | 'gmail' | 'google_chat'
  | 'whatsapp_cloud' | 'imap_smtp' | 'portal' | 'api' | 'monitoring'

/**
 * Ajustes da conexão de Monitoramento (channel_connections.config).
 *
 * `correlationPattern` é o que impede a enxurrada: sem ele, e-mail de alerta
 * não tem conversationId, threadId nem References, cai no fallback de
 * messageId — único por e-mail — e cada repetição do MESMO alerta vira um
 * chamado novo. Com ele, o identificador do gatilho (ex.: {TRIGGER.ID} do
 * Zabbix) passa a ser a chave da conversa e as repetições se agrupam.
 */
export interface MonitoringConfig {
  /** Regex com 1 grupo de captura, aplicada a assunto + corpo. */
  correlationPattern?: string
  /** Regex que identifica a mensagem de recuperação (ex.: '^Resolved:'). */
  recoveryPattern?: string
  /** Regex com 1 grupo de captura para a severidade. */
  severityPattern?: string
}

export interface NormalizedInboundEvent {
  provider: ChannelProvider
  connectionId: string
  externalEventId: string
  externalConversationId: string
  externalMessageId: string
  sender: { externalId: string; email?: string; phone?: string; displayName?: string }
  recipients: string[]
  subject?: string
  text: string
  html?: string
  replyToMessageId?: string
  references: string[]
  attachments: Array<{ externalId: string; name: string; contentType: string; size?: number; url?: string }>
  occurredAt: string
  raw: unknown
}

const record = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? value as Record<string, any> : {}

export const normalizeWhatsApp = (payload: unknown, connectionId: string): NormalizedInboundEvent[] => {
  const root = record(payload)
  const value = root.entry?.[0]?.changes?.[0]?.value
  if (!value) return []
  const contact = value.contacts?.[0]
  return (value.messages ?? []).map((message: any) => ({
    provider: 'whatsapp_cloud',
    connectionId,
    externalEventId: message.id,
    externalConversationId: message.from,
    externalMessageId: message.id,
    sender: { externalId: message.from, phone: message.from, displayName: contact?.profile?.name },
    recipients: [value.metadata?.display_phone_number].filter(Boolean),
    text: message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? '',
    replyToMessageId: message.context?.id,
    references: message.context?.id ? [message.context.id] : [],
    attachments: ['image','document','audio','video'].includes(message.type)
      ? [{ externalId: message[message.type]?.id, name: message[message.type]?.filename ?? message.type, contentType: message[message.type]?.mime_type ?? 'application/octet-stream' }]
      : [],
    occurredAt: new Date(Number(message.timestamp) * 1000).toISOString(),
    raw: message,
  }))
}

export const normalizeGoogleChat = (payload: unknown, connectionId: string): NormalizedInboundEvent[] => {
  const event = record(payload)
  const message = event.chat?.messagePayload?.message ?? event.message
  if (!message) return []
  const sender = message.sender ?? event.user ?? {}
  return [{
    provider: 'google_chat',
    connectionId,
    externalEventId: event.eventTime ?? message.name,
    externalConversationId: message.space?.name ?? message.thread?.name ?? message.name,
    externalMessageId: message.name,
    sender: { externalId: sender.name ?? sender.email, email: sender.email, displayName: sender.displayName },
    recipients: [message.space?.name].filter(Boolean),
    text: message.argumentText ?? message.text ?? '',
    replyToMessageId: message.quotedMessageMetadata?.name,
    references: message.thread?.name ? [message.thread.name] : [],
    attachments: (message.attachment ?? []).map((item: any) => ({
      externalId: item.name, name: item.contentName ?? 'anexo',
      contentType: item.contentType ?? 'application/octet-stream', url: item.downloadUri,
    })),
    occurredAt: message.createTime ?? event.eventTime ?? new Date().toISOString(),
    raw: event,
  }]
}

export const normalizeTeams = (payload: unknown, connectionId: string): NormalizedInboundEvent[] => {
  const activity = record(payload)
  if (!activity.id) return []
  return [{
    provider: 'microsoft_teams',
    connectionId,
    externalEventId: activity.id,
    externalConversationId: activity.conversation?.id ?? activity.channelData?.channel?.id ?? activity.id,
    externalMessageId: activity.id,
    sender: { externalId: activity.from?.aadObjectId ?? activity.from?.id, displayName: activity.from?.name },
    recipients: [activity.recipient?.id].filter(Boolean),
    text: activity.text ?? '',
    replyToMessageId: activity.replyToId,
    references: activity.replyToId ? [activity.replyToId] : [],
    attachments: (activity.attachments ?? []).map((item: any, index: number) => ({
      externalId: item.contentUrl ?? String(index), name: item.name ?? 'anexo',
      contentType: item.contentType ?? 'application/octet-stream', url: item.contentUrl,
    })),
    occurredAt: activity.timestamp ?? new Date().toISOString(),
    raw: activity,
  }]
}

export const normalizeEmail = (
  payload: unknown,
  connectionId: string,
  provider: 'microsoft_graph' | 'gmail' | 'imap_smtp',
): NormalizedInboundEvent[] => {
  const mail = record(payload)
  const messageId = mail.internetMessageId ?? mail.message_id ?? mail['message-id'] ?? mail.id
  if (!messageId) return []
  const from = mail.from?.emailAddress ?? mail.from ?? {}
  const senderEmail = typeof from === 'string'
    ? (from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? from)
    : from.address ?? from.email ?? String(mail.sender ?? '')
  const references = Array.isArray(mail.references) ? mail.references : String(mail.references ?? '').split(/\s+/).filter(Boolean)
  return [{
    provider, connectionId,
    externalEventId: mail.event_id ?? mail.historyId ?? messageId,
    externalConversationId: mail.conversationId ?? mail.threadId ?? references.at(-1) ?? messageId,
    externalMessageId: messageId,
    sender: { externalId: senderEmail, email: senderEmail, displayName: from.name },
    recipients: (mail.toRecipients ?? mail.to ?? []).flatMap((item: any) => item?.emailAddress?.address ?? item?.address ?? item),
    subject: mail.subject,
    text: mail.body?.contentType === 'text' ? mail.body.content : mail.text ?? mail.textBody ?? '',
    html: mail.body?.contentType === 'html' ? mail.body.content : mail.html ?? mail.htmlBody,
    replyToMessageId: mail.inReplyTo ?? mail['in-reply-to'],
    references,
    attachments: (mail.attachments ?? []).map((item: any) => ({
      externalId: item.id ?? item.contentId, name: item.name ?? item.filename ?? 'anexo',
      contentType: item.contentType ?? item.content_type ?? 'application/octet-stream',
      size: item.size, url: item.url,
    })),
    occurredAt: mail.receivedDateTime ?? mail.date ?? new Date().toISOString(),
    raw: mail,
  }]
}

/** Aplica a regex e devolve o 1º grupo de captura (ou o casamento inteiro). */
const firstMatch = (pattern: string | undefined, text: string): string | undefined => {
  if (!pattern) return undefined
  try {
    const found = new RegExp(pattern, 'im').exec(text)
    return found ? (found[1] ?? found[0]) : undefined
  } catch {
    // Regex inválida vinda da configuração do tenant não pode derrubar a
    // ingestão: sem correlação o alerta ainda vira chamado, só não agrupa.
    return undefined
  }
}

/**
 * Alerta de ferramenta de monitoramento (Zabbix, PRTG, Datadog…).
 *
 * Aceita tanto o e-mail normalizado quanto JSON estruturado do webhook. A
 * diferença para os demais canais está em duas decisões:
 *
 *  • a conversa é identificada pelo GATILHO, não pela mensagem — é isso que
 *    faz 40 oscilações do mesmo alerta virarem 40 mensagens num chamado em
 *    vez de 40 chamados;
 *  • severidade e sinal de recuperação viajam em `raw.servicefy_alert`, de
 *    onde materialize_channel_message os lê.
 */
export const normalizeMonitoring = (
  payload: unknown,
  connectionId: string,
  config: MonitoringConfig = {},
): NormalizedInboundEvent[] => {
  const source = record(payload)
  const base = normalizeEmail(source, connectionId, 'imap_smtp')[0]
    ?? {
      provider: 'imap_smtp' as const, connectionId,
      externalEventId: String(source.event_id ?? crypto.randomUUID()),
      externalConversationId: '', externalMessageId: String(source.message_id ?? crypto.randomUUID()),
      sender: { externalId: 'monitoring' }, recipients: [], subject: String(source.subject ?? ''),
      text: String(source.text ?? source.message ?? ''), references: [] as string[],
      attachments: [], occurredAt: new Date().toISOString(), raw: source,
    }

  const haystack = `${base.subject ?? ''}\n${base.text ?? ''}`

  // Campo explícito do webhook tem precedência sobre a regex do e-mail:
  // quem manda JSON estruturado não deveria depender de parsing de texto.
  const correlationKey = String(source.correlation_key ?? '').trim()
    || firstMatch(config.correlationPattern, haystack)
    || base.externalConversationId

  const severity = String(source.severity ?? '').trim()
    || firstMatch(config.severityPattern, haystack)
    || undefined

  const isRecovery = typeof source.is_recovery === 'boolean'
    ? source.is_recovery
    : Boolean(config.recoveryPattern && firstMatch(config.recoveryPattern, haystack))

  return [{
    ...base,
    provider: 'monitoring',
    externalConversationId: correlationKey,
    sender: {
      ...base.sender,
      displayName: base.sender.displayName ?? 'Monitoramento',
    },
    raw: {
      ...record(base.raw),
      servicefy_alert: {
        correlation_key: correlationKey,
        severity: severity ?? null,
        is_recovery: isRecovery,
      },
    },
  }]
}

export const normalizeInbound = (
  provider: ChannelProvider, payload: unknown, connectionId: string,
  config: MonitoringConfig = {},
): NormalizedInboundEvent[] => {
  if (provider === 'whatsapp_cloud') return normalizeWhatsApp(payload, connectionId)
  if (provider === 'google_chat') return normalizeGoogleChat(payload, connectionId)
  if (provider === 'microsoft_teams') return normalizeTeams(payload, connectionId)
  if (provider === 'monitoring') {
    const source = record(payload)
    const alerts = source.alerts ?? source.messages ?? [source]
    return alerts.flatMap((alert: unknown) => normalizeMonitoring(alert, connectionId, config))
  }
  if (provider === 'microsoft_graph' || provider === 'gmail' || provider === 'imap_smtp') {
    const source = record(payload)
    const messages = source.messages ?? source.value ?? [source]
    return messages.flatMap((mail: unknown) => normalizeEmail(mail, connectionId, provider))
  }
  return []
}

export const routeValues = (event: NormalizedInboundEvent): string[] => [
  ...event.recipients, event.sender.email ?? '', event.sender.phone ?? '',
].filter(Boolean).map(value => value.toLowerCase())

// ─── OUTBOUND ────────────────────────────────────────────────────────────────
// Envio da resposta do analista de volta pelo canal de origem. Cada provider tem
// a estrutura do envio real esboçada, mas retorna `not_configured` até haver
// credenciais/registro de app. Quando implementado, cada branch faz a chamada
// HTTP real e retorna { status: 'sent', providerEventId } — sem tocar no resto.

export interface OutboundMessage {
  subject?: string | null
  body: string
  to: { external_id?: string | null; email?: string | null; phone?: string | null; display_name?: string | null }
}

export interface OutboundResult {
  status: 'sent' | 'not_configured' | 'failed'
  providerEventId?: string
  error?: string
}

const notConfigured = (provider: ChannelProvider): OutboundResult => ({
  status: 'not_configured',
  error: `Envio via ${provider} ainda não configurado (aguardando credenciais/registro de app).`,
})

export const sendOutbound = async (
  provider: ChannelProvider,
  message: OutboundMessage,
  _secret: string | null,
): Promise<OutboundResult> => {
  // Guarda de dados mínimos por canal — falha cedo com motivo claro.
  const needsPhone = provider === 'whatsapp_cloud'
  const needsEmail = provider === 'microsoft_graph' || provider === 'gmail' || provider === 'imap_smtp'
  if (needsPhone && !message.to.phone) return { status: 'failed', error: 'Destinatário sem telefone (WhatsApp).' }
  if (needsEmail && !message.to.email) return { status: 'failed', error: 'Destinatário sem e-mail.' }
  if (!message.body?.trim()) return { status: 'failed', error: 'Mensagem vazia.' }

  switch (provider) {
    case 'whatsapp_cloud':
      // Real: POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
      //   headers Authorization: Bearer {_secret}; body { messaging_product:'whatsapp', to, type:'text', text:{ body } }
      return notConfigured(provider)
    case 'microsoft_graph':
      // Real: POST https://graph.microsoft.com/v1.0/me/sendMail (token OAuth em _secret)
      return notConfigured(provider)
    case 'gmail':
      // Real: POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send (raw RFC822)
      return notConfigured(provider)
    case 'microsoft_teams':
      // Real: Bot Framework — POST {serviceUrl}/v3/conversations/{id}/activities
      return notConfigured(provider)
    case 'google_chat':
      // Real: POST https://chat.googleapis.com/v1/{space}/messages
      return notConfigured(provider)
    case 'imap_smtp':
      // Real: SMTP send (deno-smtp) ou provedor transacional (Resend/SendGrid)
      return notConfigured(provider)
    default:
      return notConfigured(provider)
  }
}
