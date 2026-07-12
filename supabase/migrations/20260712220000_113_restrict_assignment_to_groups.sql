-- ServiceFY — Alinhamento ITIL v4: Assignment Engine deixa de atribuir analista
-- individual automaticamente na criação do ticket.
--
-- ITIL v4 trata o roteamento inicial como responsabilidade do grupo de
-- atendimento (service desk / grupo funcional), não de uma pessoa. A
-- distribuição por menor carga implementada na Fase 14 (Passo 3 de
-- tg_triage_incident, migration 109) já resolvia o grupo corretamente, mas em
-- seguida também escolhia um analista automaticamente — o ticket nascia
-- "roubando" a fila de um analista específico antes que o grupo pudesse
-- triar/priorizar manualmente. Esta migration remove só o Passo 3: a cascata
-- de grupo (sintoma -> domínio de serviço -> grupo padrão do tenant) e a
-- sincronização assignment_group_id/assigned_group_id permanecem intactas.

CREATE OR REPLACE FUNCTION public.tg_triage_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  -- ── Passo 1: roteamento de grupo (só corre se o chamador não informou um) ──
  IF NEW.assignment_group_id IS NULL THEN

    -- 1a) Grupo do sintoma escolhido — o critério mais específico disponível
    --     hoje no catálogo (a coluna já existia, nunca tinha sido lida).
    IF NEW.catalog_symptom_id IS NOT NULL THEN
      SELECT auto_assign_group_id INTO v_group_id
        FROM public.incident_catalog_symptoms
       WHERE id = NEW.catalog_symptom_id
         AND company_id = NEW.company_id;
    END IF;

    -- 1b) Domínio de serviço "TI" do tenant. Todo incidente aberto por este
    --     fluxo é, por definição do catálogo atual (ver Fase 14, análise),
    --     do domínio de TI — não existe service_domain_id em tickets/incidentes
    --     (só em cases) para resolver de outra forma.
    IF v_group_id IS NULL THEN
      SELECT default_assignment_group_id INTO v_group_id
        FROM public.service_domains
       WHERE company_id = NEW.company_id AND key = 'it';
    END IF;

    -- 1c) Fallback final: grupo marcado como padrão de triagem do tenant.
    IF v_group_id IS NULL THEN
      SELECT id INTO v_group_id
        FROM public.assignment_groups
       WHERE company_id = NEW.company_id
         AND is_default_triage = true
         AND is_active = true
       LIMIT 1;
    END IF;

    IF v_group_id IS NOT NULL THEN
      NEW.assignment_group_id := v_group_id;
      NEW.assigned_group_id := v_group_id; -- Passo 2: sincronização com a coluna legada.
      SELECT name INTO NEW.assigned_group_name
        FROM public.assignment_groups
       WHERE id = v_group_id AND company_id = NEW.company_id;
    END IF;
  END IF;

  -- Alinhamento ITIL v4: o ticket nasce atribuído ao grupo, nunca a um
  -- analista individual. A distribuição por menor carga (removida aqui)
  -- passa a ser responsabilidade de uma ação explícita dentro do grupo
  -- (auto-atribuição manual ou uma automação futura fora deste trigger).
  NEW.assigned_to_id := NULL;
  NEW.assigned_to_name := NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_triage_incident() IS 'Assignment Engine: cascata sintoma -> domínio de serviço -> grupo padrão de triagem. Alinhado ao ITIL v4 (migration 113): resolve estritamente o grupo de atendimento, nunca atribui analista individual automaticamente — assigned_to_id nasce sempre NULL. Todas as subqueries filtram company_id = NEW.company_id explicitamente (função SECURITY DEFINER, roda com bypass de RLS).';
