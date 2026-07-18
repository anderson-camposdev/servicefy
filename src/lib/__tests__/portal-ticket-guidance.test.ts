import { describe, expect, it } from 'vitest'
import { getPortalTicketGuidance } from '../portal-ticket-guidance'

describe('getPortalTicketGuidance', () => {
  it('prioriza uma aprovação pendente antes do estado operacional', () => {
    const guidance = getPortalTicketGuidance({ state: 'New', approval_status: 'pending' })

    expect(guidance.title).toBe('Aguardando aprovação')
    expect(guidance.requiresUserAction).toBe(false)
  })

  it('explica quando a equipe precisa de resposta do solicitante', () => {
    const guidance = getPortalTicketGuidance({
      state: 'Pending User',
      pending_reason: 'Confirmar o equipamento afetado',
    })

    expect(guidance.eyebrow).toBe('Sua vez')
    expect(guidance.description).toContain('Confirmar o equipamento afetado')
    expect(guidance.requiresUserAction).toBe(true)
  })

  it('identifica o responsável quando o atendimento está em andamento', () => {
    const guidance = getPortalTicketGuidance({
      state: 'In Progress',
      assigned_to_name: 'Marina Costa',
    })

    expect(guidance.description).toContain('Marina Costa')
    expect(guidance.tone).toBe('progress')
  })

  it('não pede resposta do usuário quando existe dependência externa', () => {
    const guidance = getPortalTicketGuidance({
      state: 'On Hold',
      pending_reason: 'Aguardando fornecedor',
    })

    expect(guidance.title).toBe('Estamos aguardando uma dependência')
    expect(guidance.requiresUserAction).toBe(false)
  })

  it('orienta a conferir a solução em chamados resolvidos', () => {
    const guidance = getPortalTicketGuidance({ state: 'Resolved' })

    expect(guidance.tone).toBe('success')
    expect(guidance.description).toContain('Confira a solução')
  })
})
