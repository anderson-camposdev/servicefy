-- ============================================================
-- 183 — Templates de notificação usados pelo worker de e-mail
--
-- Cada tenant recebe cinco templates iniciais. "[ServiceFY]" é apenas o
-- padrão de fábrica: assunto, nome e corpo continuam editáveis por tenant.
--
-- O corpo é texto simples. O worker escapa o template inteiro antes de gerar
-- HTML, preservando quebras de linha sem executar marcação cadastrada por um
-- administrador.
-- ============================================================

-- Compatibilidade com ambientes que executaram a primeira versão desta
-- migration: converte somente o corpo do seed HTML exato. Assuntos
-- personalizados pelo tenant não são modificados.
WITH event_catalog(event_key, event_label, legacy_body_md5, plain_extra) AS (
  VALUES
    ('ticket_opened',      'Novo chamado registrado',      'f868c18431c31525cb65bad4ee28c01e', ''),
    ('status_changed',     'Status do chamado atualizado', '4940afa151088ab77d78c203644d968e', ''),
    ('assignment_changed', 'Chamado atribuído a você',     'b7ed048e627a2f24b3da20afdee49a9b', ''),
    ('ticket_closed',      'Chamado fechado',              'd109ac60616b6dedabc84e24d2b425a7', ''),
    (
      'public_comment',
      'Nova atualização no chamado',
      '5b27eb761c04a6f2e99880d4ea65ffd5',
      E'\n\nMensagem de {{commenter_name}}:\n{{comment_body}}'
    )
), exact_defaults AS (
  SELECT
    event_key,
    event_label,
    legacy_body_md5,
    plain_extra,
    E'Olá {{caller_name}},\n\n%s\n\nChamado #{{ticket_number}}: {{short_description}}\n\nStatus atual: {{state}}%s' AS plain_body
  FROM event_catalog
)
UPDATE public.notification_templates AS template
   SET body_template = format(catalog.plain_body, catalog.event_label, catalog.plain_extra),
       updated_at = now()
  FROM exact_defaults AS catalog
 WHERE template.key = catalog.event_key
   AND template.channel = 'email'
   AND template.locale = 'pt-BR'
   AND md5(template.body_template) = catalog.legacy_body_md5;

CREATE OR REPLACE FUNCTION public.seed_notification_templates(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_event record;
  v_body_base constant text :=
    E'Olá {{caller_name}},\n\n%s\n\nChamado #{{ticket_number}}: {{short_description}}\n\nStatus atual: {{state}}%s';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Empresa não encontrada ao semear templates de notificação.';
  END IF;

  FOR v_event IN
    SELECT * FROM (VALUES
      ('ticket_opened',      'Novo chamado registrado',      ''),
      ('status_changed',     'Status do chamado atualizado', ''),
      ('assignment_changed', 'Chamado atribuído a você',     ''),
      ('ticket_closed',      'Chamado fechado',              ''),
      ('public_comment',     'Nova atualização no chamado',
        E'\n\nMensagem de {{commenter_name}}:\n{{comment_body}}')
    ) AS event_catalog(event_key, event_label, extra_body)
  LOOP
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
    VALUES (
      p_company_id,
      v_event.event_key,
      v_event.event_label,
      'email',
      'pt-BR',
      '[ServiceFY] ' || v_event.event_label || ' #{{ticket_number}}',
      format(v_body_base, v_event.event_label, v_event.extra_body),
      CASE
        WHEN v_event.event_key = 'public_comment' THEN
          '["ticket_number","short_description","state","caller_name","ticket_type","comment_body","commenter_name"]'::jsonb
        ELSE
          '["ticket_number","short_description","state","caller_name","ticket_type"]'::jsonb
      END,
      true
    )
    ON CONFLICT (company_id, key, channel, locale) DO NOTHING;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_notification_templates(uuid)
  FROM PUBLIC, anon, authenticated;

DO $seed_existing_companies$
DECLARE
  v_company record;
BEGIN
  FOR v_company IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_notification_templates(v_company.id);
  END LOOP;
END
$seed_existing_companies$;

CREATE OR REPLACE FUNCTION public.tg_seed_notification_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public.seed_notification_templates(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_seed_notification_templates()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_notification_templates ON public.companies;
CREATE TRIGGER trg_seed_notification_templates
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_seed_notification_templates();
