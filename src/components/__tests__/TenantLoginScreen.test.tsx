import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BRANDING, type TenantBranding } from '../../tenant/applyBranding'
import TenantLoginScreen from '../TenantLoginScreen'

const customBranding: TenantBranding = {
  ...DEFAULT_BRANDING,
  name: 'Allied Tecnologia',
  logoUrl: 'https://cdn.example.com/allied-logo.webp',
  backgroundUrl: 'https://cdn.example.com/allied-team.webp',
  primaryColor: 'Emerald',
  welcomeTitle: 'Tecnologia que mantém o seu negócio em movimento',
  welcomeSubtitle: 'Acesse chamados, serviços e conhecimento em um único lugar.',
}

afterEach(cleanup)

describe('TenantLoginScreen', () => {
  it('transforma os assets e textos do tenant em uma área de apresentação', () => {
    render(<TenantLoginScreen branding={customBranding} onSignIn={vi.fn()} />)

    expect(screen.getByText('Allied Tecnologia')).toBeTruthy()
    expect(screen.getByText(customBranding.welcomeTitle)).toBeTruthy()
    expect(screen.getByText(customBranding.welcomeSubtitle)).toBeTruthy()
    expect(screen.getByAltText('Logo Allied Tecnologia')).toBeTruthy()
    expect(screen.getByTestId('tenant-login-hero').getAttribute('style')).toContain('allied-team.webp')
  })

  it('mantém uma experiência completa com o branding padrão', () => {
    render(<TenantLoginScreen branding={DEFAULT_BRANDING} onSignIn={vi.fn()} />)

    expect(screen.getByLabelText('E-mail corporativo')).toBeTruthy()
    expect(screen.getByLabelText('Senha')).toBeTruthy()
    expect(screen.getByText('Conta corporativa')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'ServiceFY' })).toBeTruthy()
    expect(screen.getByText('ServiceFY')).toBeTruthy()
    expect(screen.getByText('Plataforma ITSM empresarial')).toBeTruthy()
    expect(screen.getByText('SLA sob controle')).toBeTruthy()
    expect(screen.getByText('Fluxos conectados')).toBeTruthy()
    expect(screen.getByText('Isolamento por empresa')).toBeTruthy()
  })

  it('preserva o logotipo do tenant sem substituí-lo pela marca do produto', () => {
    render(<TenantLoginScreen branding={customBranding} onSignIn={vi.fn()} />)

    expect(screen.getByAltText('Logo Allied Tecnologia')).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'ServiceFY' })).toBeNull()
  })

  it('valida credenciais antes de chamar a autenticação', async () => {
    const onSignIn = vi.fn()
    render(<TenantLoginScreen branding={customBranding} onSignIn={onSignIn} />)

    fireEvent.click(screen.getByRole('button', { name: 'Entrar na central' }))
    expect(screen.getByText('Informe e-mail e senha.')).toBeTruthy()
    expect(onSignIn).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('E-mail corporativo'), { target: { value: ' admin@allied.it ' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na central' }))

    expect(onSignIn).toHaveBeenCalledWith('admin@allied.it', 'secret')
  })

  it('oferece Google e Microsoft conforme a política do tenant', async () => {
    const onOAuth = vi.fn()
    render(
      <TenantLoginScreen
        branding={customBranding}
        onSignIn={vi.fn()}
        onOAuth={onOAuth}
        providers={['google', 'azure']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar com Microsoft' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Microsoft' }))

    expect(onOAuth).toHaveBeenNthCalledWith(1, 'google')
    await waitFor(() => expect(onOAuth).toHaveBeenNthCalledWith(2, 'azure'))
  })

  it('remove o formulário de senha quando o tenant exige SSO', () => {
    render(
      <TenantLoginScreen
        branding={customBranding}
        onSignIn={vi.fn()}
        onOAuth={vi.fn()}
        providers={['azure']}
        allowLocalLogin={false}
      />,
    )

    expect(screen.queryByLabelText('Senha')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Entrar na central' })).toBeNull()
    expect(screen.getByText('Sua empresa exige autenticação corporativa via SSO.')).toBeTruthy()
  })

  it('apresenta erro de autenticação em linguagem segura', () => {
    render(
      <TenantLoginScreen
        branding={customBranding}
        onSignIn={vi.fn()}
        authError="Invalid login credentials"
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('E-mail ou senha incorretos')
    expect(screen.queryByText('Invalid login credentials')).toBeNull()
  })

  it('substitui uma imagem de logo inválida pelas iniciais do tenant', () => {
    render(<TenantLoginScreen branding={customBranding} onSignIn={vi.fn()} />)

    fireEvent.error(screen.getByAltText('Logo Allied Tecnologia'))

    expect(screen.queryByAltText('Logo Allied Tecnologia')).toBeNull()
    expect(screen.getByText('AT')).toBeTruthy()
  })

  it('solicita recuperação sem revelar se a conta existe', async () => {
    const onRequestPasswordRecovery = vi.fn()
    render(
      <TenantLoginScreen
        branding={customBranding}
        onSignIn={vi.fn()}
        onRequestPasswordRecovery={onRequestPasswordRecovery}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    fireEvent.change(screen.getByLabelText('E-mail para recuperação'), { target: { value: ' user@allied.it ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }))

    await waitFor(() => expect(onRequestPasswordRecovery).toHaveBeenCalledWith('user@allied.it'))
    expect(screen.getByText(/Se houver uma conta elegível/)).toBeTruthy()
  })

  it('permite definir uma nova senha quando a sessão está em recuperação', async () => {
    const onUpdatePassword = vi.fn()
    render(
      <TenantLoginScreen
        branding={customBranding}
        onSignIn={vi.fn()}
        recoveryMode
        onUpdatePassword={onUpdatePassword}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'long-secure-password' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'long-secure-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar senha' }))

    await waitFor(() => expect(onUpdatePassword).toHaveBeenCalledWith('long-secure-password'))
  })
})
