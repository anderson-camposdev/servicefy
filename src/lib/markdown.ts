// ============================================================
// ServiceFY — Renderizador Markdown mínimo e seguro (sem deps).
// Seguro por construção: escapa TODO o HTML primeiro, depois aplica
// um subconjunto controlado de Markdown. Não há como injetar HTML/JS
// do conteúdo do artigo (defesa contra XSS armazenado). Links só
// http/https/mailto; nunca javascript:.
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHref(url: string): string | null {
  const u = url.trim()
  if (/^(https?:|mailto:)/i.test(u)) return u
  if (/^\//.test(u)) return u // caminho interno relativo
  return null
}

function inline(text: string): string {
  let out = escapeHtml(text)
  // código inline `x`
  out = out.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
  // negrito **x**
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`)
  // itálico *x* / _x_
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, p, c) => `${p}<em>${c}</em>`)
  out = out.replace(/\b_([^_\n]+)_\b/g, (_m, c) => `<em>${c}</em>`)
  // links [txt](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeHref(url)
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label
  })
  return out
}

/** Converte Markdown (subconjunto) em HTML já sanitizado. */
export function renderMarkdown(md: string): string {
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inUl = false, inOl = false, inCode = false
  const codeBuf: string[] = []

  const closeLists = () => {
    if (inUl) { html.push('</ul>'); inUl = false }
    if (inOl) { html.push('</ol>'); inOl = false }
  }

  for (const raw of lines) {
    const line = raw

    if (/^```/.test(line.trim())) {
      if (inCode) { html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`); codeBuf.length = 0; inCode = false }
      else { closeLists(); inCode = true }
      continue
    }
    if (inCode) { codeBuf.push(line); continue }

    if (!line.trim()) { closeLists(); continue }

    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { closeLists(); const lvl = h[1].length + 1; html.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue }

    if (/^\s*[-*]\s+/.test(line)) {
      if (!inUl) { closeLists(); html.push('<ul>'); inUl = true }
      html.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) { closeLists(); html.push('<ol>'); inOl = true }
      html.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`)
      continue
    }
    if (/^>\s?/.test(line)) { closeLists(); html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue }

    closeLists()
    html.push(`<p>${inline(line)}</p>`)
  }
  if (inCode) html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  closeLists()
  return html.join('\n')
}
