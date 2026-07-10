-- ServiceFY - Fase 9: privilégios mínimos para o worker interno de e-mail.
-- service_role não recebe acesso à credencial SMTP; ela permanece encapsulada na RPC 104.

GRANT EXECUTE ON FUNCTION public.claim_ticket_email_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ticket_email_delivery(uuid,text,text,text) TO service_role;
GRANT SELECT ON public.tenant_email_delivery_policies TO service_role;
