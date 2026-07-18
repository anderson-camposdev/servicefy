export interface WorkflowConditionLike {
  value: string
}

export interface WorkflowActionLike {
  type: string
  params: Record<string, string>
}

export interface WorkflowQualityInput {
  name: string
  triggerEvent: string
  conditions: WorkflowConditionLike[]
  actions: WorkflowActionLike[]
  scheduleConfig?: { frequency: string; time: string }
}

export interface WorkflowQualityIssue {
  section: 'identity' | 'trigger' | 'conditions' | 'actions'
  message: string
}

export interface WorkflowQualityReport {
  ready: boolean
  completedSections: number
  totalSections: number
  issues: WorkflowQualityIssue[]
}

const REQUIRED_ACTION_PARAMS: Record<string, Array<{ key: string; label: string }>> = {
  assign_group: [{ key: 'group', label: 'grupo de destino' }],
  change_priority: [{ key: 'priority', label: 'nova prioridade' }],
  change_state: [{ key: 'state', label: 'novo estado' }],
  set_field: [{ key: 'field', label: 'campo' }, { key: 'value', label: 'valor' }],
  send_email: [{ key: 'recipients', label: 'destinatário' }, { key: 'template', label: 'template' }],
  send_notification: [{ key: 'message', label: 'mensagem' }],
  add_tag: [{ key: 'tag', label: 'tag' }],
  escalate: [{ key: 'level', label: 'nível de escalonamento' }],
  delay: [{ key: 'amount', label: 'tempo de espera' }, { key: 'unit', label: 'unidade de tempo' }],
  webhook: [{ key: 'url', label: 'URL' }, { key: 'method', label: 'método HTTP' }],
}

export function getDefaultWorkflowActionParams(type: string): Record<string, string> {
  if (type === 'escalate') return { level: '2' }
  if (type === 'delay') return { amount: '1', unit: 'hours' }
  if (type === 'webhook') return { method: 'POST' }
  return {}
}

export function evaluateWorkflowQuality(workflow: WorkflowQualityInput): WorkflowQualityReport {
  const issues: WorkflowQualityIssue[] = []

  if (!workflow.name.trim()) {
    issues.push({ section: 'identity', message: 'Dê um nome para identificar a automação.' })
  }

  if (!workflow.triggerEvent.trim()) {
    issues.push({ section: 'trigger', message: 'Escolha quando a automação deve iniciar.' })
  }

  if (workflow.triggerEvent === 'scheduled' && (!workflow.scheduleConfig?.frequency || !workflow.scheduleConfig.time)) {
    issues.push({ section: 'trigger', message: 'Defina frequência e horário do agendamento.' })
  }

  workflow.conditions.forEach((condition, index) => {
    if (!condition.value.trim()) {
      issues.push({ section: 'conditions', message: `Preencha o valor da condição ${index + 1}.` })
    }
  })

  if (workflow.actions.length === 0) {
    issues.push({ section: 'actions', message: 'Adicione pelo menos uma ação.' })
  }

  workflow.actions.forEach((action, index) => {
    const required = REQUIRED_ACTION_PARAMS[action.type] ?? []
    const missing = required.filter(({ key }) => !action.params[key]?.trim())
    if (missing.length > 0) {
      issues.push({
        section: 'actions',
        message: `Complete ${missing.map(item => item.label).join(' e ')} na ação ${index + 1}.`,
      })
    }

    if (action.type === 'webhook' && action.params.url?.trim() && !isSecureUrl(action.params.url)) {
      issues.push({ section: 'actions', message: `Use uma URL HTTPS válida na ação ${index + 1}.` })
    }

    if (action.type === 'delay' && action.params.amount?.trim()) {
      const amount = Number(action.params.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        issues.push({ section: 'actions', message: `Use um tempo de espera maior que zero na ação ${index + 1}.` })
      }
    }
  })

  const sectionsWithIssues = new Set(issues.map(issue => issue.section))
  return {
    ready: issues.length === 0,
    completedSections: 4 - sectionsWithIssues.size,
    totalSections: 4,
    issues,
  }
}

function isSecureUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
