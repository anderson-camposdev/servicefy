export const ABSOLUTE_ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024
export const PREVIEWABLE_ATTACHMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'txt'] as const

const MIME_BY_EXTENSION: Record<(typeof PREVIEWABLE_ATTACHMENT_EXTENSIONS)[number], readonly string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  txt: ['text/plain'],
}

export type AttachmentValidation = { valid: true } | { valid: false; error: string }

export function validateAttachmentFile(file: Pick<File, 'name' | 'type' | 'size'>): AttachmentValidation {
  if (file.size <= 0) return { valid: false, error: 'O arquivo está vazio.' }
  if (file.size > ABSOLUTE_ATTACHMENT_LIMIT_BYTES) return { valid: false, error: 'O arquivo excede o limite máximo de 10 MB.' }

  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (!extension || !PREVIEWABLE_ATTACHMENT_EXTENSIONS.includes(extension as never)) {
    return { valid: false, error: 'Formato não permitido. Use PDF, PNG, JPG, JPEG ou TXT.' }
  }
  if (!MIME_BY_EXTENSION[extension as keyof typeof MIME_BY_EXTENSION].includes(file.type)) {
    return { valid: false, error: 'O conteúdo do arquivo não corresponde à extensão informada.' }
  }
  return { valid: true }
}

/** Abre somente uma URL temporária já autorizada; nunca cria ação de download. */
export function openAttachmentPreview(url: string, _filename: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}
