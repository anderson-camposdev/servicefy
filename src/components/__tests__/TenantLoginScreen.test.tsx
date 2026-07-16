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
    expect(screen.getByText('Ambiente protegido')).toBeTruthy()
    expect(screen.getByText('ServiceFY')).toBeTruthy()
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
})
