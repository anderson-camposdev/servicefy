-- ServiceFY — Gestão de Mudanças ganha vínculo com CMDB e detecção de
-- conflito de janela. Achados da auditoria ITSM: o CAB aprovava "às cegas"
-- sobre quais CIs a mudança afeta (sem isso, get_ci_impact/blast radius
-- nunca era consultado no fluxo de aprovação), e duas mudanças podiam ser
-- agendadas no mesmo período para o mesmo CI sem nenhum aviso.
--
-- Detecção é ADVISORY (retorna a lista de conflitos para a UI decidir o que
-- fazer), não um bloqueio duro no banco — uma mudança emergencial legítima
-- pode precisar prosseguir mesmo com sobreposição; a decisão fica com quem
-- agenda, mas agora ela é informada.

CREATE TABLE public.change_configuration_items (
  change_id uuid NOT NULL REFERENCES public.changes(id) ON DELETE CASCADE,
  ci_id uuid NOT NULL REFERENCES public.configuration_items(id) ON DELETE CASCADE,
  PRIMARY KEY (change_id, ci_id)
);

ALTER TABLE public.change_configuration_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_change_configuration_items ON public.change_configuration_items
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_msp_admin()
    OR EXISTS (
      SELECT 1 FROM public.changes c
      WHERE c.id = change_configuration_items.change_id
        AND c.company_id = public.get_current_user_company_id()
        AND public.is_current_user_change_reader()
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.change_configuration_items FROM PUBLIC, authenticated;
GRANT SELECT ON public.change_configuration_items TO authenticated;

CREATE OR REPLACE FUNCTION public.set_change_ci_links(
  p_change_id UUID,
  p_ci_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_change public.changes;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
   WHERE auth_id = auth.uid() AND active = true LIMIT 1;
  SELECT * INTO v_change FROM public.changes
   WHERE id = p_change_id FOR UPDATE;

  IF v_profile.id IS NULL OR v_change.id IS NULL THEN
    RAISE EXCEPTION 'Mudança ou perfil não encontrado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_current_user_msp_admin()
     AND (v_change.company_id IS DISTINCT FROM v_profile.company_id
          OR v_profile.role::text NOT IN ('sysadmin','company_admin','agent','ops_manager','governance_manager')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar relações da mudança' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_ci_ids, ARRAY[]::UUID[])) requested(id)
    LEFT JOIN public.configuration_items ci ON ci.id = requested.id
    WHERE ci.id IS NULL OR ci.company_id IS DISTINCT FROM v_change.company_id
  ) THEN
    RAISE EXCEPTION 'Item de configuração não existe ou pertence a outro tenant' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.change_configuration_items WHERE change_id = p_change_id;
  INSERT INTO public.change_configuration_items (change_id, ci_id)
  SELECT p_change_id, requested.id
  FROM (
    SELECT DISTINCT id
    FROM unnest(COALESCE(p_ci_ids, ARRAY[]::UUID[])) AS ids(id)
  ) requested;
END;
$$;

REVOKE ALL ON FUNCTION public.set_change_ci_links(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_change_ci_links(UUID, UUID[]) TO authenticated;

-- Conflitos de janela: outras mudanças (não canceladas/falhas) que
-- compartilham pelo menos um CI e cujo change_window se sobrepõe.
CREATE OR REPLACE FUNCTION public.get_change_window_conflicts(p_change_id UUID)
RETURNS TABLE (
  conflicting_change_id uuid,
  conflicting_change_number text,
  conflicting_change_short_description text,
  conflicting_change_state public.change_state,
  shared_ci_id uuid,
  shared_ci_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_change public.changes;
BEGIN
  SELECT * INTO v_change FROM public.changes WHERE id = p_change_id;
  IF v_change.id IS NULL THEN
    RAISE EXCEPTION 'Mudança não encontrada' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_current_user_msp_admin()
     AND (v_change.company_id IS DISTINCT FROM public.get_current_user_company_id()
          OR NOT public.is_current_user_change_reader()) THEN
    RAISE EXCEPTION 'Sem permissão para consultar esta mudança' USING ERRCODE = '42501';
  END IF;
  IF v_change.change_window_start IS NULL OR v_change.change_window_end IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    other.id, other.number, other.short_description, other.state,
    cci_mine.ci_id, ci.name
  FROM public.change_configuration_items cci_mine
  JOIN public.configuration_items ci ON ci.id = cci_mine.ci_id
  JOIN public.change_configuration_items cci_other ON cci_other.ci_id = cci_mine.ci_id AND cci_other.change_id <> p_change_id
  JOIN public.changes other ON other.id = cci_other.change_id
  WHERE cci_mine.change_id = p_change_id
    AND other.company_id = v_change.company_id
    AND other.state NOT IN ('Cancelled', 'Failed')
    AND other.change_window_start IS NOT NULL
    AND other.change_window_end IS NOT NULL
    AND other.change_window_start < v_change.change_window_end
    AND other.change_window_end > v_change.change_window_start;
END;
$$;

REVOKE ALL ON FUNCTION public.get_change_window_conflicts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_change_window_conflicts(UUID) TO authenticated;
