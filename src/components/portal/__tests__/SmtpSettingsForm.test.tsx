import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmtpSettingsForm } from '../SmtpSettingsForm'

const { mockFrom, mockMaybeSingle, mockUpsert, mockTestSmtpConnection } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockUpsert: vi.fn(),
  mockTestSmtpConnection: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('../../../lib/smtp', () => ({
  SMTP_ENCRYPTION_TYPES: ['tls', 'ssl', 'none'],
  testSmtpConnection: mockTestSmtpConnection,
}))

describe('SmtpSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
    mockTestSmtpConnection.mockResolvedValue({
      success: true,
      message: 'Conexão estabelecida com sucesso. E-mail de teste enviado.',
    })
    mockMaybeSingle.mockResolvedValue({
      data: {
        smtp_host: 'smtp.example.com',
        smtp_port: 587,
        smtp_user: 'mailer@example.com',
        from_email: 'support@example.com',
        from_name: 'Support',
        encryption_type: 'tls',
      },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
      })),
      upsert: mockUpsert,
    })
  })

  it('carrega as configurações do tenant e mantém a senha write-only', async () => {
    render(<SmtpSettingsForm companyId="company-123" />)

    expect(await screen.findByDisplayValue('smtp.example.com')).toBeTruthy()
    expect(screen.getByDisplayValue('587')).toBeTruthy()
    expect(screen.getByDisplayValue('mailer@example.com')).toBeTruthy()
    expect(screen.getByDisplayValue('support@example.com')).toBeTruthy()
    expect(screen.getByDisplayValue('Support')).toBeTruthy()
    expect(screen.getByDisplayValue('tls')).toBeTruthy()

    const password = screen.getByLabelText('Senha') as HTMLInputElement
    expect(password.type).toBe('password')
    expect(password.value).toBe('')
  })

  it('alterna a visibilidade da senha e salva o payload do tenant', async () => {
    render(<SmtpSettingsForm companyId="company-123" />)
    const password = await screen.findByLabelText('Senha') as HTMLInputElement

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(password.type).toBe('text')
    fireEvent.change(password, { target: { value: 'secret-value' } })
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'smtp.new.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações SMTP' }))

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1))
    const [payload, options] = mockUpsert.mock.calls[0]
    expect(payload).toEqual(expect.objectContaining({
      company_id: 'company-123',
      smtp_host: 'smtp.new.example.com',
      smtp_port: 587,
      encryption_type: 'tls',
    }))
    expect(Array.from(payload.smtp_password_encrypted)).toEqual(Array.from(new TextEncoder().encode('secret-value')))
    expect(options).toEqual({ onConflict: 'company_id' })
    expect(screen.getByText('Configurações SMTP salvas.')).toBeTruthy()
  })

  it('exibe erro quando a senha não é informada', async () => {
    render(<SmtpSettingsForm companyId="company-123" />)
    await screen.findByDisplayValue('smtp.example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações SMTP' }))

    expect(await screen.findByText('Informe a senha para salvar as configurações.')).toBeTruthy()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('testa a conexão e exibe o sucesso do envio', async () => {
    render(<SmtpSettingsForm companyId="company-123" />)
    const password = await screen.findByLabelText('Senha')

    fireEvent.change(password, { target: { value: 'secret-value' } })
    fireEvent.click(screen.getByRole('button', { name: 'Testar Conexão' }))

    await waitFor(() => expect(mockTestSmtpConnection).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-123',
      host: 'smtp.example.com',
      port: 587,
      password: 'secret-value',
      encryptionType: 'tls',
    })))
    expect(await screen.findByText('Conexão estabelecida com sucesso. E-mail de teste enviado.')).toBeTruthy()
  })

  it('exibe a falha retornada pelo handshake SMTP', async () => {
    mockTestSmtpConnection.mockRejectedValueOnce(new Error('Falha na conexão SMTP: autenticação recusada.'))
    render(<SmtpSettingsForm companyId="company-123" />)
    const password = await screen.findByLabelText('Senha')

    fireEvent.change(password, { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Testar Conexão' }))

    expect(await screen.findByText('Falha na conexão SMTP: autenticação recusada.')).toBeTruthy()
  })
})
