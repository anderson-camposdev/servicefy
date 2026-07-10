import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmtpSettingsForm } from '../SmtpSettingsForm'

const { mockFrom, mockMaybeSingle, mockUpsert, mockInvoke } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockUpsert: vi.fn(),
  mockInvoke: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockInvoke },
  },
}))

function fillSmtpPassword(password = 'secret-value') {
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } })
}

describe('SmtpSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        message: 'Conexão estabelecida com sucesso. E-mail de teste enviado.',
      },
      error: null,
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
    fillSmtpPassword()
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'smtp.new.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Testar Conexão' }))
    await screen.findByRole('status')
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

  it('mantém o botão Salvar desabilitado até uma conexão SMTP ser validada', async () => {
    render(<SmtpSettingsForm companyId="company-123" />)
    await screen.findByDisplayValue('smtp.example.com')

    expect(screen.getByRole('button', { name: 'Salvar configurações SMTP' }).hasAttribute('disabled')).toBe(true)
  })

  it('exibe o toast de sucesso e habilita Salvar quando a Edge Function confirma a conexão', async () => {
    render(<SmtpSettingsForm companyId="company-123" />)
    await screen.findByLabelText('Senha')

    fillSmtpPassword()
    fireEvent.click(screen.getByRole('button', { name: 'Testar Conexão' }))

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('test-smtp-connection', {
      body: expect.objectContaining({
        companyId: 'company-123',
        host: 'smtp.example.com',
        port: 587,
        password: 'secret-value',
        encryptionType: 'tls',
      }),
    }))
    expect((await screen.findByRole('status')).textContent).toContain('Conexão estabelecida com sucesso. E-mail de teste enviado.')
    expect(screen.getByRole('button', { name: 'Salvar configurações SMTP' }).hasAttribute('disabled')).toBe(false)
  })

  it('exibe alerta de autenticação e mantém Salvar desabilitado quando a Edge Function falha', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Falha na conexão SMTP: autenticação recusada.' },
    })
    render(<SmtpSettingsForm companyId="company-123" />)
    await screen.findByLabelText('Senha')

    fillSmtpPassword('wrong-password')
    fireEvent.click(screen.getByRole('button', { name: 'Testar Conexão' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Falha na conexão SMTP: autenticação recusada.')
    expect(screen.getByRole('button', { name: 'Salvar configurações SMTP' }).hasAttribute('disabled')).toBe(true)
  })

  it('desabilita o botão e mostra estado de carregamento enquanto testa a conexão', async () => {
    let resolveInvoke: (value: { data: { success: boolean; message: string }; error: null }) => void = () => undefined
    mockInvoke.mockImplementationOnce(() => new Promise(resolve => { resolveInvoke = resolve }))
    render(<SmtpSettingsForm companyId="company-123" />)
    await screen.findByLabelText('Senha')

    fillSmtpPassword()
    fireEvent.click(screen.getByRole('button', { name: 'Testar Conexão' }))

    const testingButton = screen.getByRole('button', { name: 'Testar Conexão' }) as HTMLButtonElement
    expect(testingButton.disabled).toBe(true)
    expect(testingButton.textContent).toContain('Testando conexão...')

    resolveInvoke({ data: { success: true, message: 'ok' }, error: null })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Testar Conexão' }) as HTMLButtonElement).disabled).toBe(false))
  })
})
