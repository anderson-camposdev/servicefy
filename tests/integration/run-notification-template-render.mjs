/**
 * Exercita o renderer usado pelo worker contra os templates do banco local.
 * O teste é somente leitura: não altera nem precisa restaurar dados do tenant.
 */
import { execFileSync } from 'node:child_process'

import { renderTenantTemplate } from '../../supabase/functions/_shared/notification-template-renderer.mjs'

const psql = sql => execFileSync(
  'docker',
  [
    'exec',
    '-i',
    'supabase_db_servicefy',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-t',
    '-A',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ],
  { encoding: 'utf8', maxBuffer: 1 << 26 },
).trim()

const companyId = psql('SELECT id FROM public.companies ORDER BY created_at LIMIT 1')
if (!companyId) throw new Error('O banco local não possui tenant para o teste de templates.')

const fetchTemplate = key => {
  const result = psql(`
    SELECT json_build_object(
      'subject_template', subject_template,
      'body_template', body_template
    )::text
      FROM public.notification_templates
     WHERE company_id = '${companyId}'
       AND key = '${key}'
       AND channel = 'email'
       AND locale = 'pt-BR'
       AND enabled
  `)
  if (!result) throw new Error(`Template local não encontrado: ${key}`)
  return JSON.parse(result)
}

const payload = {
  ticket_number: 'INC0001234',
  short_description: 'ERP fora do ar',
  state: 'Em atendimento',
  caller_name: 'Ana Souza',
  ticket_type: 'incident',
}

let failures = 0
const check = (name, ok, details = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${details ? ` — ${details}` : ''}`)
  if (!ok) failures++
}

console.log('\n── Renderer real + template do banco ──')
const stored = renderTenantTemplate(
  fetchTemplate('ticket_opened'),
  payload,
  { fallbackSubject: '[ServiceFY] Atualização do chamado' },
)
check('assunto interpola o número do chamado', stored.subject.includes('INC0001234'), stored.subject)
check(
  'corpo interpola solicitante e descrição',
  stored.html.includes('Ana Souza') && stored.html.includes('ERP fora do ar'),
)
check('nenhuma variável ficou exposta', !/\{\{/.test(stored.subject + stored.html))

console.log('\n── Marca configurável por tenant ──')
const customized = renderTenantTemplate(
  {
    subject_template: '[Acme Suporte] Chamado {{ticket_number}} aberto',
    body_template: 'Olá {{caller_name}},\n\nSeu chamado foi registrado.',
  },
  payload,
  { fallbackSubject: '[ServiceFY] Atualização do chamado' },
)
check(
  'a marca do tenant substitui o padrão do produto',
  customized.subject === '[Acme Suporte] Chamado INC0001234 aberto',
  customized.subject,
)

console.log('\n── Segurança do conteúdo administrativo ──')
const hostile = renderTenantTemplate(
  {
    subject_template: 'Aviso\r\nBcc: atacante@example.com',
    body_template: '<script>alert(1)</script>\nOlá {{caller_name}}',
  },
  { caller_name: '<img src=x onerror=alert(2)>' },
  { fallbackSubject: '[ServiceFY] Atualização do chamado' },
)
check('HTML do template e do payload não é executado', !/<script|<img/i.test(hostile.html), hostile.html)
check('quebra de cabeçalho não sobrevive no assunto', !/[\r\n]/.test(hostile.subject), hostile.subject)

console.log(failures === 0
  ? '\n✅ Templates: todas as verificações passaram.\n'
  : `\n❌ Templates: ${failures} falha(s).\n`)
if (failures) process.exitCode = 1
