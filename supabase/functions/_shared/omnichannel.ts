export type ChannelProvider =
  | 'microsoft_graph' | 'microsoft_teams' | 'gmail' | 'google_chat'
  | 'whatsapp_cloud' | 'imap_smtp' | 'portal' | 'api'

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

export const normalizeInbound = (
  provider: ChannelProvider, payload: unknown, connectionId: string,
): NormalizedInboundEvent[] => {
  if (provider === 'whatsapp_cloud') return normalizeWhatsApp(payload, connectionId)
  if (provider === 'google_chat') return normalizeGoogleChat(payload, connectionId)
  if (provider === 'microsoft_teams') return normalizeTeams(payload, connectionId)
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
