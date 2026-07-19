import { describe, expect, it, vi } from 'vitest'
import { ABSOLUTE_ATTACHMENT_LIMIT_BYTES, openAttachmentPreview, validateAttachmentFile } from '../attachment-security'

const file = (name: string, type: string, size: number) => ({ name, type, size } as File)

describe('attachment security', () => {
  it('aceita somente formatos que podem ser visualizados no navegador', () => {
    expect(validateAttachmentFile(file('evidencia.pdf', 'application/pdf', 1024))).toEqual({ valid: true })
    expect(validateAttachmentFile(file('print.png', 'image/png', 1024))).toEqual({ valid: true })
    expect(validateAttachmentFile(file('planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024)).valid).toBe(false)
  })

  it('rejeita arquivo acima do teto absoluto mesmo com tipo permitido', () => {
    const result = validateAttachmentFile(file('grande.pdf', 'application/pdf', ABSOLUTE_ATTACHMENT_LIMIT_BYTES + 1))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('10 MB')
  })

  it('rejeita divergência entre extensão e MIME type', () => {
    expect(validateAttachmentFile(file('payload.pdf', 'application/x-msdownload', 1024)).valid).toBe(false)
    expect(validateAttachmentFile(file('payload.exe', 'application/pdf', 1024)).valid).toBe(false)
  })

  it('abre visualização em nova aba sem iniciar download', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    openAttachmentPreview('https://files.example/signed', 'evidencia.pdf')
    expect(open).toHaveBeenCalledWith('https://files.example/signed', '_blank', 'noopener,noreferrer')
  })
})
