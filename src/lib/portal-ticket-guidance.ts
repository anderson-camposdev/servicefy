export type PortalGuidanceTone = 'info' | 'progress' | 'attention' | 'success' | 'danger'

interface PortalTicketLike {
  state: string
  approval_status?: 'not_required' | 'pending' | 'approved' | 'rejected'
  pending_reason?: string | null
  assigned_to_name?: string | null
  assigned_group_name?: string | null
  sla_breached?: boolean
}

export interface PortalTicketGuidance {
  eyebrow: string
  title: string
  description: string
  tone: PortalGuidanceTone
  requiresUserAction: boolean
}

export function getPortalTicketGuidance(ticket: PortalTicketLike): PortalTicketGuidance {
  if (ticket.approval_status === 'rejected') {
    return {
      eyebrow: 'Solicitação não aprovada',
      title: 'A aprovação foi recusada',
      description: 'Consulte a conversa para entender o motivo e, se necessário, abra uma nova solicitação com as informações corrigidas.',
      tone: 'danger',
      requiresUserAction: true,
    }
  }

  if (ticket.approval_status === 'pending') {
    return {
      eyebrow: 'Próxima etapa',
      title: 'Aguardando aprovação',
      description: 'A solicitação seguirá para atendimento assim que o responsável concluir a aprovação.',
      tone: 'attention',
      requiresUserAction: false,
    }
  }

  if (ticket.state === 'Pending User') {
    return {
      eyebrow: 'Sua vez',
      title: 'A equipe precisa da sua resposta',
      description: ticket.pending_reason
        ? `Motivo: ${ticket.pending_reason}. Responda na conversa para o atendimento continuar.`
        : 'Confira a última mensagem e responda na conversa para o atendimento continuar.',
      tone: 'attention',
      requiresUserAction: true,
    }
  }

  if (ticket.state === 'Resolved' || ticket.state === 'Closed') {
    return {
      eyebrow: 'Atendimento concluído',
      title: ticket.state === 'Resolved' ? 'A solução foi registrada' : 'Chamado encerrado',
      description: 'Confira a solução e avalie o atendimento. Se o problema voltou, abra um novo incidente para manter o histórico.',
      tone: 'success',
      requiresUserAction: false,
    }
  }

  if (ticket.state === 'On Hold') {
    return {
      eyebrow: 'Atendimento em espera',
      title: 'Estamos aguardando uma dependência',
      description: ticket.pending_reason
        ? `Motivo: ${ticket.pending_reason}. Você será avisado quando o atendimento avançar.`
        : 'A equipe está aguardando uma informação ou ação externa e avisará quando houver avanço.',
      tone: 'info',
      requiresUserAction: false,
    }
  }

  if (ticket.state === 'In Progress') {
    const owner = ticket.assigned_to_name || ticket.assigned_group_name
    return {
      eyebrow: 'Em atendimento',
      title: 'A equipe está trabalhando no chamado',
      description: owner
        ? `${owner} está responsável pelo atendimento. Acompanhe as atualizações pela conversa.`
        : 'O atendimento já começou. Acompanhe as atualizações pela conversa.',
      tone: ticket.sla_breached ? 'danger' : 'progress',
      requiresUserAction: false,
    }
  }

  return {
    eyebrow: 'Chamado recebido',
    title: 'Aguardando início do atendimento',
    description: 'O chamado está na fila da equipe responsável. Você será avisado quando houver uma atualização.',
    tone: ticket.sla_breached ? 'danger' : 'info',
    requiresUserAction: false,
  }
}
