/**
 * Aplica a migration 183 dentro de uma transação descartável. A limpeza inicial
 * e o seed são sempre revertidos, inclusive se o psql encerrar por erro.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/20260727000000_183_seed_notification_templates.sql', import.meta.url),
  'utf8',
)

const verification = String.raw`
DO $verify$
DECLARE
  v_company_count bigint;
  v_template_count bigint;
BEGIN
  SELECT count(*) INTO v_company_count FROM public.companies;
  SELECT count(*) INTO v_template_count FROM public.notification_templates;

  IF v_template_count <> v_company_count * 5 THEN
    RAISE EXCEPTION 'Seed incompleto: % empresas e % templates.', v_company_count, v_template_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.notification_templates
     WHERE channel <> 'email'
        OR locale <> 'pt-BR'
        OR body_template ~ '<[^>]+>'
  ) THEN
    RAISE EXCEPTION 'Seed criou canal, idioma ou HTML fora do contrato.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.notification_templates
     WHERE key = 'public_comment'
       AND subject_template = '[Acme Suporte] Nova mensagem #{{ticket_number}}'
  ) THEN
    RAISE EXCEPTION 'Conversão do corpo alterou a marca personalizada do tenant.';
  END IF;

  IF has_function_privilege('anon', 'public.seed_notification_templates(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.seed_notification_templates(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tg_seed_notification_templates()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tg_seed_notification_templates()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Função SECURITY DEFINER permanece executável por role da API.';
  END IF;
END
$verify$;
`

const sql = `
BEGIN;
DELETE FROM public.notification_templates;
INSERT INTO public.notification_templates (
  company_id,
  key,
  name,
  channel,
  locale,
  subject_template,
  body_template,
  variables,
  enabled
)
SELECT
  id,
  'ticket_opened',
  'Novo chamado registrado',
  'email',
  'pt-BR',
  '[ServiceFY] Novo chamado registrado #{{ticket_number}}',
  '<div style="font-family:system-ui,sans-serif;color:#0f172a"><p>Olá {{caller_name}},</p><p><strong>Novo chamado registrado</strong></p><p>Chamado <strong>#{{ticket_number}}</strong>: {{short_description}}</p><p>Status atual: {{state}}</p></div>',
  '["ticket_number","short_description","state","caller_name","ticket_type"]'::jsonb,
  true
FROM public.companies
ORDER BY created_at
LIMIT 1;
INSERT INTO public.notification_templates (
  company_id,
  key,
  name,
  channel,
  locale,
  subject_template,
  body_template,
  variables,
  enabled
)
SELECT
  id,
  'public_comment',
  'Nova atualização no chamado',
  'email',
  'pt-BR',
  '[Acme Suporte] Nova mensagem #{{ticket_number}}',
  '<div style="font-family:system-ui,sans-serif;color:#0f172a"><p>Olá {{caller_name}},</p><p><strong>Nova atualização no chamado</strong></p><p>Chamado <strong>#{{ticket_number}}</strong>: {{short_description}}</p><p>Status atual: {{state}}</p><blockquote style="border-left:3px solid #4f46e5;margin:12px 0;padding:8px 12px;background:#f8fafc">{{comment_body}}</blockquote></div>',
  '["ticket_number","short_description","state","caller_name","ticket_type","comment_body","commenter_name"]'::jsonb,
  true
FROM public.companies
ORDER BY created_at
LIMIT 1;
${migration}
${verification}
ROLLBACK;
`

const output = execFileSync(
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
    '-v',
    'ON_ERROR_STOP=1',
  ],
  {
    encoding: 'utf8',
    input: sql,
    maxBuffer: 1 << 26,
  },
)

if (!output.includes('ROLLBACK')) {
  throw new Error('A validação não confirmou o rollback da transação.')
}

console.log('✅ Migration 183 validada em transação descartável; banco local preservado.')
