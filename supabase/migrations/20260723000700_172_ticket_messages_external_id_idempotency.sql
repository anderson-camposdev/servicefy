-- ServiceFY — idempotência para o caminho legado de handle-inbound-email.
--
-- Achado no pente fino de 2026-07-23: quando a requisição não traz
-- connectionId (fallback "loop legado", sem passar pelo omnichannel-gateway),
-- a edge function localiza o ticket pelo número extraído do assunto e
-- insere direto em ticket_messages — sem checar nenhuma chave de
-- deduplicação. Provedores de inbound email (SendGrid/Postmark/Resend)
-- reentregam webhook em timeout/erro 5xx; qualquer redelivery nesse
-- caminho cria um comentário duplicado visível no ticket. O caminho
-- principal (omnichannel-gateway -> materialize_channel_message) já é
-- idempotente via UNIQUE(connection_id, external_message_id) em
-- channel_messages — ticket_messages nunca teve coluna equivalente.

ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS external_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_messages_incident_external_id
  ON public.ticket_messages (incident_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

COMMENT ON COLUMN public.ticket_messages.external_message_id IS
  'Message-ID (ou equivalente) do provedor de origem, quando disponível — permite deduplicar redelivery de webhook. NULL para mensagens sem origem externa rastreável (analista, sistema).';
