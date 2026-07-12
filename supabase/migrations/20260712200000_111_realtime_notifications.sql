-- ServiceFY — Fase 16: Notificações In-App Reativas via Supabase Realtime.
--
-- public.notifications já existia (criada antes desta fase), mas sem
-- company_id/link, com RLS mais permissivo que o desejado, e sem nenhum
-- GRANT UPDATE — "marcar como lida" já estava quebrado antes desta migration.

-- ─── 1) Schema: company_id + link ────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS link text;

-- Backfill: toda notificação já pertence a um profile, que pertence a uma
-- empresa — não há ambiguidade possível.
UPDATE public.notifications n
   SET company_id = p.company_id
  FROM public.profiles p
 WHERE p.id = n.user_id
   AND n.company_id IS NULL;

ALTER TABLE public.notifications ALTER COLUMN company_id SET NOT NULL;

COMMENT ON COLUMN public.notifications.link IS 'Rota relativa best-effort (ex.: /tickets/<id>). O app hoje navega por estado interno (activeView), não por URL — preparado para quando/se existir roteamento real; o frontend pode ignorar com segurança.';

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(company_id, user_id, created_at DESC)
  WHERE read = false;

-- ─── 2) RLS estrito: leitura e "marcar como lida" apenas da própria notificação ─
DROP POLICY IF EXISTS write_owner_policy ON public.notifications;
DROP POLICY IF EXISTS select_owner_policy ON public.notifications;

-- get_current_profile_id() (não auth.uid() puro): notifications.user_id
-- referencia profiles.id, e esse helper já resolve profiles.auth_id = auth.uid().
CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT TO authenticated
  USING (
    user_id = public.get_current_profile_id()
    AND company_id = public.get_current_user_company_id()
  );

CREATE POLICY notifications_update_own
  ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = public.get_current_profile_id()
    AND company_id = public.get_current_user_company_id()
  )
  WITH CHECK (
    user_id = public.get_current_profile_id()
    AND company_id = public.get_current_user_company_id()
  );

REVOKE ALL ON public.notifications FROM authenticated;
GRANT SELECT ON public.notifications TO authenticated;
-- Grant em nível de COLUNA: mesmo que a policy acima autorize a linha, o
-- Postgres ainda bloqueia qualquer UPDATE que toque uma coluna fora desta
-- lista — "só o campo read" é garantido pelo motor, não só pela intenção da
-- policy.
GRANT UPDATE (read) ON public.notifications TO authenticated;
-- Sem INSERT/DELETE para authenticated: notificações só são escritas por
-- triggers/RPCs SECURITY DEFINER (mesmo padrão de governança já usado no
-- resto do schema).

-- ─── 3) Trigger: notifica o analista quando um ticket é atribuído a ele ─────
CREATE OR REPLACE FUNCTION public.tg_notify_ticket_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    company_id, user_id, title, message, type, read,
    linked_ticket_id, linked_ticket_type, link
  ) VALUES (
    NEW.company_id, NEW.assigned_to_id, 'Novo ticket atribuído',
    'O ticket ' || NEW.number || ' foi direcionado para você.',
    'info', false,
    NEW.id, NEW.ticket_type::text, '/tickets/' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_notify_ticket_assignment() FROM public, anon, authenticated;

-- Duas triggers, não uma combinada: Postgres rejeita referência a OLD numa
-- WHEN clause de trigger que também dispara em INSERT (não existe OLD nesse
-- caso), mesmo que TG_OP fizesse o short-circuit em runtime — a validação da
-- WHEN clause acontece em CREATE TRIGGER, contra todos os eventos listados.
DROP TRIGGER IF EXISTS tg_notify_ticket_assignment_insert ON public.tickets;
CREATE TRIGGER tg_notify_ticket_assignment_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  WHEN (NEW.assigned_to_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_notify_ticket_assignment();

DROP TRIGGER IF EXISTS tg_notify_ticket_assignment_update ON public.tickets;
CREATE TRIGGER tg_notify_ticket_assignment_update
  AFTER UPDATE OF assigned_to_id ON public.tickets
  FOR EACH ROW
  WHEN (NEW.assigned_to_id IS NOT NULL AND OLD.assigned_to_id IS DISTINCT FROM NEW.assigned_to_id)
  EXECUTE FUNCTION public.tg_notify_ticket_assignment();
