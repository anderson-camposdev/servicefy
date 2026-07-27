\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);

SELECT id AS co FROM public.companies ORDER BY created_at LIMIT 1 \gset

-- Conexão de monitoramento com fechamento automático ligado
INSERT INTO public.channel_connections (id, company_id, scope, provider, name, address, enabled, status, config)
VALUES ('11110000-0000-0000-0000-000000000001', :'co', 'tenant', 'monitoring',
        'Zabbix Producao', 'zabbix@acme.test', true, 'healthy',
        '{"on_recovery":"resolve"}'::jsonb);

-- Conexão idêntica, mas configurada para só notificar
INSERT INTO public.channel_connections (id, company_id, scope, provider, name, address, enabled, status, config)
VALUES ('11110000-0000-0000-0000-000000000002', :'co', 'tenant', 'monitoring',
        'Zabbix Homolog', 'zabbix-hml@acme.test', true, 'healthy',
        '{"on_recovery":"notify"}'::jsonb);

-- Helper: simula o gateway gravando uma mensagem de alerta e materializando.
CREATE OR REPLACE FUNCTION pg_temp.alerta(
  p_conn uuid, p_trigger text, p_texto text, p_sev text, p_recovery boolean
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_conv uuid; v_msg uuid; v_co uuid;
BEGIN
  SELECT company_id INTO v_co FROM public.channel_connections WHERE id = p_conn;

  INSERT INTO public.conversations (company_id, connection_id, external_conversation_id, subject, last_message_at)
  VALUES (v_co, p_conn, p_trigger, p_texto, now())
  ON CONFLICT (connection_id, external_conversation_id)
    DO UPDATE SET last_message_at = now()
  RETURNING id INTO v_conv;

  INSERT INTO public.channel_messages (
    company_id, conversation_id, connection_id, external_event_id, external_message_id,
    direction, subject, body_text, delivery_status, raw_payload, occurred_at)
  VALUES (v_co, v_conv, p_conn, gen_random_uuid()::text, gen_random_uuid()::text,
          'inbound', p_texto, p_texto, 'delivered',
          jsonb_build_object('servicefy_alert',
            jsonb_build_object('severity', p_sev, 'is_recovery', p_recovery,
                               'correlation_key', p_trigger)),
          now())
  RETURNING id INTO v_msg;

  RETURN public.materialize_channel_message(v_msg);
END $$;

\echo ''
\echo '════ 1) MESMO GATILHO 5 VEZES — deve gerar UM chamado, nao cinco ════'
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-4711','Link WAN caiu','Disaster',false) ->> 'incidentNumber' AS n1;
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-4711','Link WAN caiu','Disaster',false) ->> 'incidentNumber' AS n2;
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-4711','Link WAN caiu','Disaster',false) ->> 'incidentNumber' AS n3;
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-4711','Link WAN caiu','Disaster',false) ->> 'incidentNumber' AS n4;
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-4711','Link WAN caiu','Disaster',false) ->> 'incidentNumber' AS n5;

SELECT count(DISTINCT id) AS chamados_criados,
       (SELECT count(*) FROM public.ticket_messages tm
         WHERE tm.incident_id = (SELECT id FROM public.tickets WHERE opened_via='monitoring' AND short_description='Link WAN caiu')) AS mensagens_no_chamado,
       CASE WHEN count(DISTINCT id) = 1 THEN 'OK — correlacionou' ELSE '*** FALHOU ***' END AS veredito
FROM public.tickets WHERE opened_via = 'monitoring' AND short_description = 'Link WAN caiu';

\echo ''
\echo '════ 2) SEVERIDADE chega na categoria (motor de automacao le category) ════'
SELECT number, category, tags, priority,
       CASE WHEN category = 'Monitoramento / Disaster' THEN 'OK' ELSE '*** FALHOU ***' END AS veredito
FROM public.incidents WHERE short_description = 'Link WAN caiu';

\echo ''
\echo '════ 3) RECUPERACAO com on_recovery=resolve — deve FECHAR o mesmo chamado ════'
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-4711','Resolved: Link WAN normalizado','Disaster',true) AS resultado;
SELECT number, state, resolution_code, left(resolution_notes,40) AS notas,
       CASE WHEN state::text='Resolved' THEN 'OK — fechou' ELSE '*** NAO FECHOU ***' END AS veredito
FROM public.tickets WHERE short_description = 'Link WAN caiu';

\echo ''
\echo '════ 4) RECUPERACAO com on_recovery=notify — NAO pode fechar ════'
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000002','TRG-9001','Disco cheio','Warning',false) ->> 'incidentNumber' AS abriu;
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000002','TRG-9001','Resolved: Disco liberado','Warning',true) ->> 'status' AS recuperou;
SELECT number, state,
       CASE WHEN state::text = 'New' THEN 'OK — manteve aberto' ELSE '*** FECHOU INDEVIDAMENTE ***' END AS veredito
FROM public.tickets WHERE short_description = 'Disco cheio';

\echo ''
\echo '════ 5) RECUPERACAO ORFA (sem chamado aberto) — nao pode abrir chamado ════'
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-NUNCA-VISTO','Resolved: algo que nunca alertou','Info',true) ->> 'status' AS status_orfa;
SELECT count(*) AS chamados_criados,
       CASE WHEN count(*) = 0 THEN 'OK — nao abriu' ELSE '*** ABRIU CHAMADO DE RUIDO ***' END AS veredito
FROM public.tickets WHERE short_description LIKE 'Resolved: algo que nunca%';

\echo ''
\echo '════ 6) GATILHOS DIFERENTES continuam sendo chamados diferentes ════'
SELECT pg_temp.alerta('11110000-0000-0000-0000-000000000001','TRG-5555','Servidor DB sem resposta','High',false) ->> 'incidentNumber' AS outro;
SELECT count(*) AS total_distintos,
       CASE WHEN count(*) = 2 THEN 'OK — nao agrupou demais' ELSE '*** AGRUPOU ERRADO ***' END AS veredito
FROM public.tickets WHERE opened_via='monitoring' AND state::text <> 'Resolved';

ROLLBACK;
