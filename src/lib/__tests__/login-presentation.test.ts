import { describe, expect, it } from 'vitest'
import { getTenantInitials, presentAuthError } from '../login-presentation'

describe('getTenantInitials', () => {
  it('usa até duas palavras do nome do tenant', () => {
    expect(getTenantInitials('Allied Tecnologia')).toBe('AT')
    expect(getTenantInitials('Acme')).toBe('A')
  })

  it('oferece fallback para nome vazio', () => {
    expect(getTenantInitials('  ')).toBe('SF')
  })
})

describe('presentAuthError', () => {
  it('traduz credenciais inválidas sem expor mensagem do provedor', () => {
    expect(presentAuthError('Invalid login credentials')).toBe(
      'E-mail ou senha incorretos. Confira os dados e tente novamente.',
    )
  })

  it('orienta confirmação de e-mail e limitação de tentativas', () => {
    expect(presentAuthError('Email not confirmed')).toContain('caixa de entrada')
    expect(presentAuthError('Too many requests')).toContain('Aguarde alguns minutos')
  })

  it('diferencia falha de rede e usa fallback seguro', () => {
    expect(presentAuthError('Failed to fetch')).toContain('Verifique sua conexão')
    expect(presentAuthError('Database detail: private')).not.toContain('Database detail')
  })
})
