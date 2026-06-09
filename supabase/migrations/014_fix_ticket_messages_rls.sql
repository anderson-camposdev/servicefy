-- ============================================================
-- Flowfy ITSM — Migration 014
-- Correção de acesso à ticket_messages para o Portal do Usuário
--
-- Sintoma: end_user (solicitante) recebia "permission denied" ao
-- ler as mensagens no portal.
--
-- Causas tratadas:
--   1) GRANT de tabela ausente para o papel authenticated.
--   2) Policy FOR ALL vazava SELECT (deixaria ver nota interna).
--   3) Leitura do end_user agora amarrada à POSSE do chamado
--      (incidents.caller_id), com is_internal = false.
-- ============================================================

-- ─── 1. Privilégios de tabela (RLS não concede grants) ────────
GRANT SELECT, INSERT ON public.ticket_messages TO authenticated;

-- ─── 2. Remove a policy FOR ALL que vazava SELECT ─────────────
DROP POLICY IF EXISTS write_ticket_messages ON public.ticket_messages;

-- Escrita: apenas INSERT. Provedor/equipe da empresa OU o próprio
-- solicitante do chamado (para responder pelo portal — canal web).
CREATE POLICY insert_ticket_messages ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR company_id = public.get_current_user_company_id()
    OR EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = ticket_messages.incident_id
        AND i.caller_id = public.get_current_profile_id()
    )
  );

-- ─── 3. SELECT explícito: equipe vê tudo; solicitante vê público ─
DROP POLICY IF EXISTS select_ticket_messages ON public.ticket_messages;
CREATE POLICY select_ticket_messages ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    -- Equipe (provedor OU mesma empresa, exceto end_user): vê tudo no escopo
    (
      (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
      AND public.get_current_user_role() <> 'end_user'
    )
    OR
    -- Solicitante (qualquer papel): só mensagens PÚBLICAS dos chamados dele
    (
      is_internal = false
      AND EXISTS (
        SELECT 1 FROM public.incidents i
        WHERE i.id = ticket_messages.incident_id
          AND i.caller_id = public.get_current_profile_id()
      )
    )
  );

-- ────────────────────────────────────────────────────────────
-- Verificação rápida:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'ticket_messages';
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'ticket_messages' ORDER BY policyname;
-- ────────────────────────────────────────────────────────────
