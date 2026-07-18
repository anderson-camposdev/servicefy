import { describe, expect, it } from 'vitest'
import {
  buildCurlExample,
  getApiModuleLabel,
  getWebhookHealth,
  validateWebhookDraft,
} from '../developer-experience'

describe('developer experience', () => {
  it('gera um exemplo curl pronto para copiar', () => {
    expect(buildCurlExample({
      method: 'POST',
      path: '/api/v1/incidents',
      requestBody: { shortDescription: 'Falha na VPN' },
    })).toContain("curl --request POST 'https://api.servicefy.com/api/v1/incidents'")
    expect(buildCurlExample({
      method: 'POST',
      path: '/api/v1/incidents',
      requestBody: { shortDescription: 'Falha na VPN' },
    })).toContain("Authorization: Bearer $SERVICEFY_API_KEY")
  })

  it('traduz os módulos técnicos para a linguagem da operação', () => {
    expect(getApiModuleLabel('incidents')).toBe('Incidentes')
    expect(getApiModuleLabel('companies')).toBe('Integrações')
    expect(getApiModuleLabel('unknown')).toBe('Outros')
  })

  it('classifica a saúde do webhook pelas falhas consecutivas', () => {
    expect(getWebhookHealth(true, 0)).toMatchObject({ tone: 'healthy', label: 'Operando' })
    expect(getWebhookHealth(true, 2)).toMatchObject({ tone: 'warning', label: 'Requer atenção' })
    expect(getWebhookHealth(true, 5)).toMatchObject({ tone: 'critical', label: 'Entrega interrompida' })
    expect(getWebhookHealth(false, 0)).toMatchObject({ tone: 'inactive', label: 'Pausado' })
  })

  it('valida URL, evento e segredo antes de salvar', () => {
    expect(validateWebhookDraft({ targetUrl: 'http://localhost', events: [], secret: '', isNew: true }))
      .toBe('Use uma URL HTTPS pública para receber as entregas.')
    expect(validateWebhookDraft({ targetUrl: 'https://hooks.example.com', events: [], secret: '1234567890123456', isNew: true }))
      .toBe('Selecione ao menos um evento para assinar.')
    expect(validateWebhookDraft({ targetUrl: 'https://hooks.example.com', events: ['ticket.created'], secret: 'curto', isNew: true }))
      .toBe('Use um segredo com pelo menos 16 caracteres.')
    expect(validateWebhookDraft({ targetUrl: 'https://hooks.example.com', events: ['ticket.created'], secret: 'segredo-seguro-123', isNew: true }))
      .toBeNull()
  })
})
