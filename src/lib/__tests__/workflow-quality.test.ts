import { describe, expect, it } from 'vitest'
import { evaluateWorkflowQuality, getDefaultWorkflowActionParams } from '../workflow-quality'

const validWorkflow = {
  name: 'Escalonar P1',
  triggerEvent: 'incident_created',
  conditions: [{ value: 'P1 - Critical' }],
  actions: [{ type: 'assign_group', params: { group: 'Plantão N2' } }],
}

describe('evaluateWorkflowQuality', () => {
  it('considera pronta uma automação completa', () => {
    expect(evaluateWorkflowQuality(validWorkflow)).toMatchObject({
      ready: true,
      completedSections: 4,
      issues: [],
    })
  })

  it('explica campos ausentes por seção', () => {
    const report = evaluateWorkflowQuality({
      ...validWorkflow,
      name: ' ',
      conditions: [{ value: '' }],
      actions: [],
    })

    expect(report.ready).toBe(false)
    expect(report.completedSections).toBe(1)
    expect(report.issues.map(issue => issue.section)).toEqual(['identity', 'conditions', 'actions'])
  })

  it('valida parâmetros obrigatórios de cada ação', () => {
    const report = evaluateWorkflowQuality({
      ...validWorkflow,
      actions: [{ type: 'send_email', params: { recipients: '', template: '' } }],
    })

    expect(report.issues[0]?.message).toContain('destinatário e template')
  })

  it('exige URL HTTPS válida para webhook', () => {
    const report = evaluateWorkflowQuality({
      ...validWorkflow,
      actions: [{ type: 'webhook', params: { url: 'http://localhost/hook', method: 'POST' } }],
    })

    expect(report.issues).toContainEqual({
      section: 'actions',
      message: 'Use uma URL HTTPS válida na ação 1.',
    })
  })

  it('rejeita atraso igual ou menor que zero', () => {
    const report = evaluateWorkflowQuality({
      ...validWorkflow,
      actions: [{ type: 'delay', params: { amount: '0', unit: 'hours' } }],
    })

    expect(report.issues[0]?.message).toContain('maior que zero')
  })

  it('exige configuração completa para gatilho agendado', () => {
    const report = evaluateWorkflowQuality({
      ...validWorkflow,
      triggerEvent: 'scheduled',
      scheduleConfig: { frequency: 'daily', time: '' },
    })

    expect(report.issues).toContainEqual({
      section: 'trigger',
      message: 'Defina frequência e horário do agendamento.',
    })
  })

  it('materializa padrões exibidos para ações com valores iniciais', () => {
    expect(getDefaultWorkflowActionParams('delay')).toEqual({ amount: '1', unit: 'hours' })
    expect(getDefaultWorkflowActionParams('webhook')).toEqual({ method: 'POST' })
    expect(getDefaultWorkflowActionParams('escalate')).toEqual({ level: '2' })
  })
})
