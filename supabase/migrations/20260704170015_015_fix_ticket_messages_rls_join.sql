-- ============================================================
-- Flowfy ITSM — Migration 015
-- RLS de ticket_messages com JOIN explícito em profiles
--
-- Correção: caller_id referencia public.profiles.id (NÃO auth.uid()).
-- A identidade do Supabase Auth (auth.uid()) precisa ser mapeada para
-- o profile via profiles.auth_id = auth.uid(). As políticas abaixo
-- fazem esse JOIN explicitamente para o Cenário B (solicitante/end_user).
-- ============================================================

-- ─── DROP das políticas anteriores ────────────────────────────
DROP POLICY IF EXISTS select_ticket_messages ON public.ticket_messages;
DROP POLICY IF EXISTS insert_ticket_messages ON public.ticket_messages;
DROP POLICY IF EXISTS write_ticket_messages  ON public.ticket_messages; -- legado (013)

-- ─── SELECT ───────────────────────────────────────────────────
-- Cenário A (Equipe): provedor MSP OU mesma empresa, exceto end_user → vê tudo.
-- Cenário B (Solicitante): vê só mensagens PÚBLICAS dos chamados onde o
--   incidents.caller_id pertence ao SEU profile (profiles.auth_id = auth.uid()).
CREATE POLICY select_ticket_messages ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    -- Cenário A — Equipe
    (
      (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
      AND public.get_current_user_role() <> 'end_user'
    )
    OR
    -- Cenário B — Solicitante (JOIN explícito incidents → profiles)
    (
      is_internal = false
      AND EXISTS (
        SELECT 1
        FROM public.incidents i
        JOIN public.profiles p ON p.id = i.caller_id
        WHERE i.id = ticket_messages.incident_id
          AND p.auth_id = auth.uid()
      )
    )
  );

-- ─── INSERT ───────────────────────────────────────────────────
-- Equipe (provedor/mesma empresa) OU o próprio solicitante do chamado
-- (canal web do portal), validando o vínculo profiles.auth_id = auth.uid().
CREATE POLICY insert_ticket_messages ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR company_id = public.get_current_user_company_id()
    OR EXISTS (
      SELECT 1
      FROM public.incidents i
      JOIN public.profiles p ON p.id = i.caller_id
      WHERE i.id = ticket_messages.incident_id
        AND p.auth_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO IMPORTANTE (causa comum de falha residual):
-- O profile da solicitante PRECISA estar vinculado ao Auth. Se a coluna
-- auth_id estiver NULL, nenhuma política baseada em auth.uid() funcionará.
--
--   SELECT p.name, p.email, (p.auth_id IS NOT NULL) AS vinculado
--   FROM public.profiles p
--   WHERE p.email = 'juliana@acme.com';   -- ajuste o e-mail
--
-- Se "vinculado" = false, recrie/relinke o usuário no Auth (o trigger
-- handle_new_user faz a linkagem por e-mail no primeiro login real), ou:
--   UPDATE public.profiles SET auth_id = '<auth.users.id da Juliana>'
--   WHERE email = 'juliana@acme.com';
--
-- Conferir as políticas após aplicar:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'ticket_messages' ORDER BY policyname;
-- ────────────────────────────────────────────────────────────
