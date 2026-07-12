-- ServiceFY — Fase 14: Assignment Engine (roteamento + distribuição automática).
--
-- Substitui tg_triage_incident (BEFORE INSERT ON tickets, migration 094), que
-- hoje só resolve o grupo via service_domains com key='it' fixo e nunca escolhe
-- um analista. Cascata nova de roteamento de grupo (mais específico → mais
-- genérico), sincronização com a coluna legada assigned_group_id, e distribuição
-- por menor carga dentro do grupo resolvido.

-- ─── Pré-requisito: flag de grupo padrão de triagem por tenant ──────────────
-- Não existia nenhuma forma de marcar "este é o grupo de fallback final do
-- tenant" — sem isso o passo 1c da cascata não tem onde buscar. Índice parcial
-- único garante no máximo um grupo padrão por tenant (nunca ambíguo).
ALTER TABLE public.assignment_groups
  ADD COLUMN IF NOT EXISTS is_default_triage boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_groups_default_triage
  ON public.assignment_groups(company_id)
  WHERE is_default_triage = true;

COMMENT ON COLUMN public.assignment_groups.is_default_triage IS 'Grupo de fallback final do Assignment Engine quando nenhuma regra mais específica (sintoma, domínio de serviço) resolve um grupo. No máximo um por tenant (ver índice parcial único).';

-- ─── Correção de bloqueador real: FK do sintoma também apontava para a
-- tabela errada ────────────────────────────────────────────────────────────
-- incident_catalog_symptoms.auto_assign_group_id — a própria coluna que o
-- Passo 1a lê — tinha a mesma FK errada para a tabela órfã "groups". Sem isso,
-- é literalmente impossível configurar o roteamento por sintoma: qualquer
-- tentativa de apontar para um assignment_groups.id real falha por violação
-- de FK. Sem dados órfãos a limpar aqui (coluna nunca tinha sido usada).
ALTER TABLE public.incident_catalog_symptoms
  DROP CONSTRAINT IF EXISTS incident_catalog_symptoms_auto_assign_group_id_fkey;

ALTER TABLE public.incident_catalog_symptoms
  ADD CONSTRAINT incident_catalog_symptoms_auto_assign_group_id_fkey
  FOREIGN KEY (auto_assign_group_id) REFERENCES public.assignment_groups(id) ON DELETE SET NULL;

-- ─── Correção de bloqueador real: FK de assigned_group_id apontava para a
-- tabela errada ────────────────────────────────────────────────────────────
-- Achado ao validar a cascata: tickets.assigned_group_id (a coluna "legada"
-- que o Passo 2 precisa sincronizar) tinha uma foreign key para "groups" — uma
-- tabela órfã e não relacionada (4 linhas de seed antigo, "Infraestrutura
-- Acme"/"Service Desk Acme"/etc., sem nenhuma referência no frontend), e não
-- para public.assignment_groups como sua coluna irmã assignment_group_id.
-- Sem esta correção, o Passo 2 (sincronizar assigned_group_id com o grupo
-- resolvido) falharia por violação de FK sempre que o grupo resolvido não
-- coincidisse por acaso com um id da tabela órfã. Realinhada com o mesmo
-- padrão (ON DELETE SET NULL) já usado por assignment_group_id.
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS incidents_assigned_group_id_fkey;

-- Dados de seed antigos referenciam a tabela órfã "groups" (ids fora de
-- assignment_groups) — nenhum desses tickets tem assignment_group_id (a coluna
-- canônica, lida pelo frontend) preenchido, então assigned_group_id já era
-- vestigial para eles. Zera antes de recriar a FK apontando para a tabela certa,
-- senão a criação da constraint falha por violação nos dados existentes.
--
-- Achado adicional ao validar esta migration: vários triggers de tickets
-- (herdados de antes da divisão polimórfica da migration 096) referenciam
-- colunas que só existem em incident_attributes/service_request_attributes
-- hoje (impact, urgency, request_item_id), e um deles causa recursão infinita
-- em UPDATE (trg_sync_incident_to_case ↔ tg_incidents_view_update). Isso é um
-- bug pré-existente e mais amplo do que esta migration — não é corrigido aqui,
-- só contornado localmente para este UPDATE de manutenção não disparar as
-- mesmas falhas. Reportado à parte para correção dedicada.
ALTER TABLE public.tickets DISABLE TRIGGER set_incident_priority_trigger;
ALTER TABLE public.tickets DISABLE TRIGGER tg_create_request_approvals;
ALTER TABLE public.tickets DISABLE TRIGGER tg_handle_sla_pause;
ALTER TABLE public.tickets DISABLE TRIGGER tg_prepare_request_approval;
ALTER TABLE public.tickets DISABLE TRIGGER trg_sync_incident_to_case;

UPDATE public.tickets t
   SET assigned_group_id = NULL
 WHERE t.assigned_group_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.assignment_groups ag WHERE ag.id = t.assigned_group_id);

ALTER TABLE public.tickets ENABLE TRIGGER set_incident_priority_trigger;
ALTER TABLE public.tickets ENABLE TRIGGER tg_create_request_approvals;
ALTER TABLE public.tickets ENABLE TRIGGER tg_handle_sla_pause;
ALTER TABLE public.tickets ENABLE TRIGGER tg_prepare_request_approval;
ALTER TABLE public.tickets ENABLE TRIGGER trg_sync_incident_to_case;

-- ─── Correção de bloqueador real: a view "incidents" descartava o grupo e o
-- sintoma no INSERT ──────────────────────────────────────────────────────────
-- Achado ao validar o Passo 1a (roteamento por sintoma) fim a fim pelo caminho
-- real do app (.from('incidents').insert(...), não INSERT direto em tickets):
-- tg_incidents_view_insert() (INSTEAD OF INSERT ON incidents, migration 096)
-- nunca incluía assignment_group_id nem catalog_symptom_id na lista de colunas
-- do INSERT aninhado em public.tickets — qualquer grupo informado explicitamente
-- pelo chamador era descartado, e catalog_symptom_id chegava sempre NULL a
-- tg_triage_incident, tornando o Passo 1a permanentemente inalcançável pelo
-- fluxo real de abertura de chamado. Também faltavam catalog_item_id/
-- catalog_subitem_id/catalog_service_id/symptom_id, usados pela tela de
-- abertura para exibir o item do catálogo escolhido.
CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.tickets (
    id, number, company_id, ticket_type, short_description, description,
    priority, state, caller_id, caller_name, assigned_to_id, assigned_to_name,
    assigned_group_id, assigned_group_name, assignment_group_id, sla_breached,
    sla_response_deadline, sla_resolution_deadline, responded_at, resolved_at, closed_at,
    created_at, updated_at, approval_status,
    catalog_symptom_id, catalog_item_id, catalog_subitem_id, catalog_service_id, symptom_id
  ) VALUES (
    COALESCE(NEW.id, uuid_generate_v4()), NEW.number, NEW.company_id,
    COALESCE(NEW.ticket_type, 'incident')::ticket_type_enum, NEW.short_description, NEW.description,
    NEW.priority, NEW.state, NEW.caller_id, NEW.caller_name, NEW.assigned_to_id, NEW.assigned_to_name,
    NEW.assigned_group_id, NEW.assigned_group_name, NEW.assignment_group_id, NEW.sla_breached,
    NEW.sla_response_deadline, NEW.sla_resolution_deadline, NEW.responded_at, NEW.resolved_at, NEW.closed_at,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()), COALESCE(NEW.approval_status, 'not_required'),
    NEW.catalog_symptom_id, NEW.catalog_item_id, NEW.catalog_subitem_id, NEW.catalog_service_id, NEW.symptom_id
  ) RETURNING id INTO NEW.id;

  IF COALESCE(NEW.ticket_type, 'incident') = 'incident' THEN
    INSERT INTO public.incident_attributes (
      ticket_id, company_id, category, impact, urgency, root_cause, workaround, is_major_incident, related_problem_id
    ) VALUES (
      NEW.id, NEW.company_id, COALESCE(NEW.category, 'Software'), NEW.impact, NEW.urgency, NEW.root_cause, NEW.workaround, COALESCE(NEW.is_major_incident, false), NEW.related_problem_id
    );
  ELSIF NEW.ticket_type = 'request' THEN
    INSERT INTO public.service_request_attributes (
      ticket_id, company_id, request_item_id, form_data, cost, currency
    ) VALUES (
      NEW.id, NEW.company_id, NEW.request_item_id, COALESCE(NEW.form_data, '{}'::jsonb), NEW.cost, NEW.currency
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_assigned_group_id_fkey
  FOREIGN KEY (assigned_group_id) REFERENCES public.assignment_groups(id) ON DELETE SET NULL;

-- ─── Função do trigger (cascata de roteamento + distribuição) ───────────────
CREATE OR REPLACE FUNCTION public.tg_triage_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_assignee_id uuid;
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

  -- ── Passo 3: distribuição por menor carga dentro do grupo resolvido ────────
  -- Roda sempre que há grupo (resolvido acima OU já informado pelo chamador) e
  -- ainda não há analista definido. Menor carga em vez de round-robin: stateless,
  -- sem ponteiro de rodízio para sincronizar sob concorrência, e reaproveita o
  -- índice parcial idx_tickets_assignment (company_id, assigned_to_id,
  -- assigned_group_id) WHERE resolved_at IS NULL já existente. Desempate por
  -- p.id para resultado determinístico (testável) quando duas cargas empatam.
  IF NEW.assignment_group_id IS NOT NULL AND NEW.assigned_to_id IS NULL THEN
    SELECT p.id INTO v_assignee_id
      FROM public.user_groups ug
      JOIN public.profiles p
        ON p.id = ug.user_id
       AND p.active = true
       AND p.company_id = NEW.company_id
      LEFT JOIN public.tickets t
        ON t.assigned_to_id = p.id
       AND t.resolved_at IS NULL
       AND t.company_id = NEW.company_id
     WHERE ug.group_id = NEW.assignment_group_id
     GROUP BY p.id
     ORDER BY COUNT(t.id) ASC, p.id ASC
     LIMIT 1;

    IF v_assignee_id IS NOT NULL THEN
      NEW.assigned_to_id := v_assignee_id;
      SELECT name INTO NEW.assigned_to_name
        FROM public.profiles
       WHERE id = v_assignee_id AND company_id = NEW.company_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_triage_incident() IS 'Assignment Engine (Fase 14): cascata sintoma -> domínio de serviço -> grupo padrão de triagem, seguida de distribuição de analista por menor carga aberta. Todas as subqueries filtram company_id = NEW.company_id explicitamente (função SECURITY DEFINER, roda com bypass de RLS).';

-- O trigger BEFORE INSERT ON tickets já existe (migration 094) e continua
-- apontando para esta mesma função por nome — CREATE OR REPLACE acima já é
-- suficiente, não é preciso recriar o trigger.
