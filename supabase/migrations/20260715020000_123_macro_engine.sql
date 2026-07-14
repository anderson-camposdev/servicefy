-- ServiceFY — Fase 26: Motor de Macros (Quick Actions).
--
-- Distinto de response_macros (migration 074, respostas em texto/canned
-- replies) — ticket_macros muda estado/atributos do ticket (Quick Actions),
-- opcionalmente com uma nota. Ver análise no commit para o mapeamento
-- completo de operations.

CREATE TABLE IF NOT EXISTS public.ticket_macros (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Lista fixa e explícita de campos (ver RPC) — nenhum SQL dinâmico em
  -- lugar nenhum, mesmo sendo JSONB. Formato:
  --   { "set_fields": { "state": "...", "assignment_group_id": "...", ... },
  --     "add_comment": { "body": "...", "is_internal": true } }
  operations jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_macros_company_name_key UNIQUE (company_id, name),
  CONSTRAINT ticket_macros_operations_is_object CHECK (jsonb_typeof(operations) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ticket_macros_company ON public.ticket_macros(company_id, is_active, name);

ALTER TABLE public.ticket_macros ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro da equipe interna do próprio tenant (mesmo
-- padrão de select_response_macros) — um analista só lê macros do próprio
-- company_id, nunca de outro tenant.
CREATE POLICY select_ticket_macros ON public.ticket_macros
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.is_current_user_ticket_staff())
  );

-- Escrita: só administração (mesmo padrão de write_response_macros).
CREATE POLICY write_ticket_macros ON public.ticket_macros
  FOR ALL TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = ANY (ARRAY['sysadmin','company_admin','it_manager']))
  )
  WITH CHECK (
    public.is_current_user_msp_admin()
    OR (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = ANY (ARRAY['sysadmin','company_admin','it_manager']))
  );

-- ─── RPC: aplica a macro através da view incidents (dispara a cascata de
-- triggers já embutidos: SLA, governança de resolução, KEDB, notificações,
-- webhooks outbound) — nunca via tickets diretamente, ao contrário de
-- outras RPCs internas desta sessão que bypassam a view de propósito. Aqui
-- o objetivo É disparar a cascata. ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_ticket_macro(p_ticket_id uuid, p_macro_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_current_user_company_id();
  v_profile_id uuid := public.get_current_profile_id();
  v_profile_name text;
  v_macro public.ticket_macros;
  v_ticket public.tickets;
  v_set_fields jsonb;
  v_comment jsonb;
  v_group_id uuid;
  v_group_name text;
  v_body text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida: empresa não resolvida.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_current_user_ticket_staff() THEN
    RAISE EXCEPTION 'Acesso restrito à equipe interna.' USING ERRCODE = '42501';
  END IF;

  -- Valida a macro E o ticket contra o MESMO company_id antes de qualquer
  -- mutação — um macro_id válido não basta se o ticket for de outro tenant
  -- (e vice-versa).
  SELECT * INTO v_macro FROM public.ticket_macros
   WHERE id = p_macro_id AND company_id = v_company_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Macro não encontrada ou inativa.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_ticket FROM public.tickets
   WHERE id = p_ticket_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  SELECT name INTO v_profile_name FROM public.profiles WHERE id = v_profile_id AND company_id = v_company_id;

  v_set_fields := v_macro.operations->'set_fields';
  v_comment := v_macro.operations->'add_comment';

  IF v_set_fields IS NULL AND v_comment IS NULL THEN
    RAISE EXCEPTION 'Macro sem operações configuradas.' USING ERRCODE = '22023';
  END IF;

  -- ── set_fields: lista fixa e explícita, cada chave extraída e tipada
  -- individualmente — nenhum SQL dinâmico. ──────────────────────────────
  IF v_set_fields IS NOT NULL AND jsonb_typeof(v_set_fields) = 'object' THEN
    IF v_set_fields ? 'assignment_group_id' THEN
      SELECT id, name INTO v_group_id, v_group_name
        FROM public.assignment_groups
       WHERE id = (v_set_fields->>'assignment_group_id')::uuid AND company_id = v_company_id;
      IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Grupo de atendimento da macro não pertence a este tenant.' USING ERRCODE = '42501';
      END IF;
    END IF;

    UPDATE public.incidents SET
      state = COALESCE((v_set_fields->>'state')::incident_state, state),
      assignment_group_id = COALESCE(v_group_id, assignment_group_id),
      assigned_group_id = COALESCE(v_group_id, assigned_group_id),
      assigned_group_name = COALESCE(v_group_name, assigned_group_name),
      priority = COALESCE((v_set_fields->>'priority')::ticket_priority, priority),
      resolution_code = COALESCE(v_set_fields->>'resolution_code', resolution_code),
      resolution_notes = COALESCE(v_set_fields->>'resolution_notes', resolution_notes),
      pending_reason_id = COALESCE((v_set_fields->>'pending_reason_id')::uuid, pending_reason_id),
      kb_candidate = COALESCE((v_set_fields->>'kb_candidate')::boolean, kb_candidate)
    WHERE id = p_ticket_id;
  END IF;

  -- ── add_comment: INSERT normal em ticket_messages (não SQL bruto) para
  -- as triggers dessa tabela disparem também. ────────────────────────────
  IF v_comment IS NOT NULL AND jsonb_typeof(v_comment) = 'object' THEN
    v_body := v_comment->>'body';
    IF NULLIF(trim(v_body), '') IS NULL THEN
      RAISE EXCEPTION 'Macro com add_comment sem corpo de texto.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.ticket_messages (incident_id, company_id, case_id, sender_id, sender_name, actor_type, body, is_internal)
    VALUES (
      p_ticket_id, v_company_id, v_ticket.case_id, v_profile_id, COALESCE(v_profile_name, 'Analista'),
      'analyst', v_body, COALESCE((v_comment->>'is_internal')::boolean, true)
    );
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id;
  RETURN v_ticket;
END;
$$;

COMMENT ON FUNCTION public.apply_ticket_macro(uuid, uuid) IS 'Fase 26: aplica uma ticket_macro (operations.set_fields/add_comment) num ticket. Valida macro e ticket contra o mesmo company_id antes de qualquer mutação. Escreve via a view incidents (não tickets diretamente) para disparar a cascata de triggers já embutidos: governança de resolução, consolidação de SLA, automação de KEDB, notificações e webhooks outbound.';

REVOKE ALL ON FUNCTION public.apply_ticket_macro(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_ticket_macro(uuid, uuid) TO authenticated;
