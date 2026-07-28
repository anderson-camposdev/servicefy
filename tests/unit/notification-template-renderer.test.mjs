import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  interpolateText,
  normalizeSubject,
  renderTenantTemplate,
} from '../../supabase/functions/_shared/notification-template-renderer.mjs'

test('interpolação usa os valores do payload e remove variáveis desconhecidas', () => {
  assert.equal(
    interpolateText('Chamado {{ticket_number}} / {{missing}}', { ticket_number: 'INC001' }),
    'Chamado INC001 / ',
  )
})

test('corpo trata HTML do template e do payload como texto não executável', () => {
  const message = renderTenantTemplate(
    {
      subject_template: '[Acme] {{ticket_number}}',
      body_template: '<script>alert(1)</script>\nOlá {{caller_name}}',
    },
    {
      ticket_number: 'INC001',
      caller_name: '<img src=x onerror=alert(2)>',
    },
    { fallbackSubject: '[ServiceFY] Atualização' },
  )

  assert.equal(message.subject, '[Acme] INC001')
  assert.doesNotMatch(message.html, /<script|<img/i)
  assert.match(message.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(message.html, /&lt;img src=x onerror=alert\(2\)&gt;/)
  assert.match(message.html, /<br>/)
})

test('assunto não aceita quebra de cabeçalho e respeita o fallback', () => {
  assert.equal(
    normalizeSubject('Acme\r\nBcc: atacante@example.com', {}, 'Padrão'),
    'Acme Bcc: atacante@example.com',
  )
  assert.equal(normalizeSubject(' \n ', {}, 'Padrão'), 'Padrão')
})

test('cada tenant pode definir sua própria marca sem alterar o fallback do produto', () => {
  const acme = renderTenantTemplate(
    { subject_template: '[Acme Support] {{ticket_number}}', body_template: 'Olá' },
    { ticket_number: 'INC002' },
    { fallbackSubject: '[ServiceFY] Atualização' },
  )
  const beta = renderTenantTemplate(
    { subject_template: '[Beta Desk] {{ticket_number}}', body_template: 'Olá' },
    { ticket_number: 'INC002' },
    { fallbackSubject: '[ServiceFY] Atualização' },
  )

  assert.equal(acme.subject, '[Acme Support] INC002')
  assert.equal(beta.subject, '[Beta Desk] INC002')
})
