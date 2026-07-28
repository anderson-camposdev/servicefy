const TOKEN_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g

export const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

/**
 * Templates são conteúdo administrativo do tenant, não código. Tanto o texto
 * cadastrado quanto os valores do chamado são tratados como texto simples.
 */
export const interpolateText = (template, payload) =>
  String(template ?? '').replace(TOKEN_PATTERN, (_, key) => String(payload[key] ?? ''))

export const normalizeSubject = (template, payload, fallbackSubject) => {
  const normalized = interpolateText(template, payload)
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return (normalized || fallbackSubject).slice(0, 255)
}

export const renderTenantTemplate = (
  template,
  payload,
  { fallbackSubject, fallbackFooter = '' },
) => {
  const subject = normalizeSubject(template.subject_template, payload, fallbackSubject)
  const bodyText = interpolateText(template.body_template, payload).trim()
  const bodyHtml = escapeHtml(bodyText).replace(/\r\n?|\n/g, '<br>')

  return {
    subject,
    html: '<div style="font-family:system-ui,sans-serif;color:#0f172a">'
      + `<p style="margin:0;line-height:1.6">${bodyHtml}</p>`
      + fallbackFooter
      + '</div>',
  }
}
