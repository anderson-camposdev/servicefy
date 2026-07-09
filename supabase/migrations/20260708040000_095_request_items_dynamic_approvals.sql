-- 1. Adicionar manager_id na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Adicionar approval_type na tabela request_items com as opções suportadas
ALTER TABLE public.request_items ADD COLUMN IF NOT EXISTS approval_type TEXT NOT NULL DEFAULT 'group' CHECK (approval_type IN ('group', 'manager', 'department_head'));

-- 3. Atualizar validação de configuração no request_items
CREATE OR REPLACE FUNCTION public.validate_request_item_approval_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.requires_approval AND NEW.approval_type = 'group' AND NEW.approval_group_id IS NULL THEN
    RAISE EXCEPTION 'Item com aprovação por grupo precisa de um grupo aprovador';
  END IF;
  IF NEW.approval_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.assignment_groups g
    WHERE g.id = NEW.approval_group_id
      AND g.company_id = NEW.company_id
      AND g.is_active = true
  ) THEN
    RAISE EXCEPTION 'Grupo aprovador inválido ou pertencente a outro tenant';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Atualizar preparação do ticket de aprovação
CREATE OR REPLACE FUNCTION public.tg_prepare_request_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.request_items;
  v_requester public.profiles;
  v_approver_count INT := 0;
  v_dept_manager UUID;
  v_dept_alt UUID;
BEGIN
  IF NEW.ticket_type <> 'request' OR NEW.request_item_id IS NULL THEN
    NEW.approval_status := 'not_required';
    RETURN NEW;
  END IF;

  SELECT * INTO v_item FROM public.request_items WHERE id = NEW.request_item_id;
  IF v_item.id IS NULL OR v_item.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Item de requisição inválido ou pertencente a outro tenant';
  END IF;

  IF NOT v_item.requires_approval THEN
    NEW.approval_status := 'not_required';
    RETURN NEW;
  END IF;

  SELECT * INTO v_requester FROM public.profiles WHERE id = NEW.caller_id;

  -- 4.1 Contar aprovadores elegíveis com base no tipo
  IF v_item.approval_type = 'manager' THEN
    IF v_requester.manager_id IS NOT NULL THEN
      SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_requester.manager_id AND active = true;
    END IF;
    IF v_approver_count = 0 AND v_requester.alternate_manager_id IS NOT NULL THEN
      SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_requester.alternate_manager_id AND active = true;
    END IF;

  ELSIF v_item.approval_type = 'department_head' THEN
    IF v_requester.department IS NOT NULL THEN
      SELECT manager_id, alternate_manager_id INTO v_dept_manager, v_dept_alt
        FROM public.departments
       WHERE name = v_requester.department AND company_id = NEW.company_id AND active = true LIMIT 1;
       
      IF v_dept_manager IS NOT NULL THEN
        SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_dept_manager AND active = true;
      END IF;
      IF v_approver_count = 0 AND v_dept_alt IS NOT NULL THEN
        SELECT count(*) INTO v_approver_count FROM public.profiles WHERE id = v_dept_alt AND active = true;
      END IF;
    END IF;
  END IF;

  -- 4.2 Fallback para o grupo aprovador
  IF v_approver_count = 0 AND v_item.approval_group_id IS NOT NULL THEN
    SELECT count(*) INTO v_approver_count
    FROM public.user_groups ug
    JOIN public.profiles p ON p.id = ug.user_id
    WHERE ug.group_id = v_item.approval_group_id
      AND p.company_id = NEW.company_id
      AND p.active = true
      AND p.role::text <> 'end_user';
  END IF;

  IF v_approver_count = 0 THEN
    RAISE EXCEPTION 'Aprovação necessária, mas nenhum aprovador ativo foi encontrado (Gestor/Departamento/Grupo)';
  END IF;

  NEW.approval_status := 'pending';
  RETURN NEW;
END;
$$;

-- 5. Atualizar criação dos registros na tabela request_approvals
CREATE OR REPLACE FUNCTION public.tg_create_request_approvals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.request_items;
  v_requester public.profiles;
  v_approver_id UUID := NULL;
  v_dept_manager UUID;
  v_dept_alt UUID;
BEGIN
  IF NEW.ticket_type = 'request' AND NEW.approval_status = 'pending' THEN
    SELECT * INTO v_item FROM public.request_items WHERE id = NEW.request_item_id;
    SELECT * INTO v_requester FROM public.profiles WHERE id = NEW.caller_id;

    -- 5.1 Encontrar aprovador dinâmico
    IF v_item.approval_type = 'manager' THEN
      IF v_requester.manager_id IS NOT NULL THEN
        SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_requester.manager_id AND active = true;
      END IF;
      IF v_approver_id IS NULL AND v_requester.alternate_manager_id IS NOT NULL THEN
        SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_requester.alternate_manager_id AND active = true;
      END IF;

    ELSIF v_item.approval_type = 'department_head' THEN
      IF v_requester.department IS NOT NULL THEN
        SELECT manager_id, alternate_manager_id INTO v_dept_manager, v_dept_alt
          FROM public.departments
         WHERE name = v_requester.department AND company_id = NEW.company_id AND active = true LIMIT 1;
         
        IF v_dept_manager IS NOT NULL THEN
          SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_dept_manager AND active = true;
        END IF;
        IF v_approver_id IS NULL AND v_dept_alt IS NOT NULL THEN
          SELECT id INTO v_approver_id FROM public.profiles WHERE id = v_dept_alt AND active = true;
        END IF;
      END IF;
    END IF;

    -- 5.2 Gravar aprovação
    IF v_approver_id IS NOT NULL THEN
      INSERT INTO public.request_approvals (company_id, incident_id, approver_id)
      VALUES (NEW.company_id, NEW.id, v_approver_id)
      ON CONFLICT (incident_id, approver_id) DO NOTHING;

      INSERT INTO public.notifications
        (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
      VALUES (
        v_approver_id,
        'Nova aprovação pendente',
        'A requisição ' || NEW.number || ' aguarda sua decisão.',
        'info',
        NEW.id,
        'request'
      );
    -- 5.3 Fallback ou tipo 'group'
    ELSIF v_item.approval_group_id IS NOT NULL THEN
      INSERT INTO public.request_approvals (company_id, incident_id, approver_id)
      SELECT NEW.company_id, NEW.id, p.id
      FROM public.user_groups ug
      JOIN public.profiles p ON p.id = ug.user_id
      WHERE ug.group_id = v_item.approval_group_id
        AND p.company_id = NEW.company_id
        AND p.active = true
        AND p.role::text <> 'end_user'
      ON CONFLICT (incident_id, approver_id) DO NOTHING;

      INSERT INTO public.notifications
        (user_id, title, message, type, linked_ticket_id, linked_ticket_type)
      SELECT
        p.id,
        'Nova aprovação pendente',
        'A requisição ' || NEW.number || ' aguarda sua decisão.',
        'info',
        NEW.id,
        'request'
      FROM public.user_groups ug
      JOIN public.profiles p ON p.id = ug.user_id
      WHERE ug.group_id = v_item.approval_group_id
        AND p.company_id = NEW.company_id
        AND p.active = true
        AND p.role::text <> 'end_user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
