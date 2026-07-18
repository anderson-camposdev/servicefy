export function getTenantInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'SF'
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase()
}

export function presentAuthError(error: string | null | undefined): string {
  const normalized = (error ?? '').trim().toLocaleLowerCase('pt-BR')
  if (!normalized) return ''

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('email or password')
  ) {
    return 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Seu e-mail ainda não foi confirmado. Consulte sua caixa de entrada ou fale com o administrador.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('too many attempts')
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.'
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Não foi possível conectar ao serviço de autenticação. Verifique sua conexão e tente novamente.'
  }

  return 'Não foi possível entrar. Tente novamente ou fale com a equipe responsável pelo atendimento.'
}
