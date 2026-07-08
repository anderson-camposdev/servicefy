// ============================================================
// ServiceFY — Condutor de triagem do Service Desk (FSM determinística)
//
// "Cérebro" do agente do chat: uma máquina de estados PURA (sem React, sem
// Supabase, sem I/O) que conduz o usuário passo a passo até reunir tudo que
// é preciso para abrir um incidente ou uma solicitação com o máximo de
// informação. Determinística de propósito — é a própria trava: sempre
// oferece opções concretas, pergunta campo a campo e não avança sem o
// obrigatório. A criação real do chamado e a persistência acontecem fora
// daqui (TriageChat + serviços governados).
//
// Testável isoladamente: ver tests/unit/triage-conductor.test.ts.
// ============================================================

// ─── Tipos estruturais do catálogo (subconjunto do que a FSM precisa) ───────
// Deixados locais/estruturais para a FSM não depender do runtime do Supabase
// e poder ser testada com node --test sem transpilar todo o app.
export interface TriageFormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'datetime' | 'number' | 'date'
  required: boolean
  options?: string[]
}

export interface TriageCatalog {
  // Departamentos cadastrados no tenant (migration 046) — usados para o passo
  // de escolha de catálogo (TI é o padrão implícito; RH e demais só aparecem
  // se tiverem ao menos uma categoria vinculada, mesma regra do portal clássico).
  departments?: Array<{ id: string; name: string }>
  // Caminho de incidente (catalog_categories → catalog_services → catalog_service_symptoms)
  incidentCategories: Array<{ id: string; name: string; department_id?: string | null }>
  incidentServices: Array<{ id: string; name: string; category_id: string }>
  incidentSymptoms: Array<{
    /** id da linha catalog_service_symptoms (junção serviço×sintoma) — usado só para seleção na lista. */
    id: string
    /** id do sintoma mestre em system_symptoms — É este que incidents.symptom_id referencia (FK). */
    system_symptom_id: string
    service_id: string
    name: string
    form_fields: TriageFormField[]
    sla_hours: number
    assignment_group_id: string | null
    assignment_group_name: string | null
  }>
  // Caminho de solicitação (request_categories → request_subcategories → request_items)
  requestCategories: Array<{ id: string; name: string; department_id?: string | null }>
  requestSubcategories: Array<{ id: string; name: string; category_id: string }>
  requestItems: Array<{
    id: string
    name: string
    request_category_id: string | null
    request_subcategory_id: string | null
    form_fields: TriageFormField[]
    assignment_group_id: string | null
    assignment_group_name: string | null
    requires_approval: boolean
  }>
}

export type TriageStep =
  | 'choose_type' | 'choose_domain'
  | 'inc_category' | 'inc_service' | 'inc_symptom' | 'inc_impact' | 'inc_urgency'
  | 'inc_form' | 'inc_description' | 'inc_confirm'
  | 'req_category' | 'req_subcategory' | 'req_item' | 'req_form' | 'req_description' | 'req_confirm'
  | 'check_tickets' | 'handoff' | 'done' | 'cancelled'

export interface TriageSelections {
  ticketType?: 'incident' | 'request'
  /** undefined = catálogo padrão (TI/Global); setado = departamento explícito (RH etc.) */
  domainId?: string; domainName?: string
  categoryId?: string; categoryName?: string
  serviceId?: string; serviceName?: string
  symptomId?: string; symptomName?: string
  requestCategoryId?: string; requestCategoryName?: string
  requestSubcategoryId?: string; requestSubcategoryName?: string
  requestItemId?: string; requestItemName?: string
  assignmentGroupId?: string | null
  assignmentGroupName?: string | null
  slaHours?: number | null
  requiresApproval?: boolean
  impact?: 'Low' | 'Medium' | 'High' | 'Critical'
  urgency?: 'Low' | 'Medium' | 'High'
  shortDescription?: string
  description?: string
}

export interface TriageState {
  step: TriageStep
  selections: TriageSelections
  formFields: TriageFormField[]
  formCursor: number
  formAnswers: Record<string, string | boolean | string[]>
  // pendências de múltipla escolha (checkbox com options) em construção
  multiPending?: string[]
}

export interface TriageOption { id: string; label: string }

export type TriageInputType = 'choice' | 'text' | 'multi' | 'confirm' | 'terminal'

export interface TriageTurn {
  state: TriageState
  prompt: string
  options: TriageOption[]
  inputType: TriageInputType
  /** Pronto para criar o chamado: TriageChat chama o serviço de criação. */
  readyToCreate: boolean
  /** Sinais para TriageChat reusar comportamentos existentes. */
  intent?: 'check_tickets' | 'handoff'
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const IMPACT_OPTIONS: TriageOption[] = [
  { id: 'Low', label: 'Baixo — só eu' },
  { id: 'Medium', label: 'Médio — minha equipe' },
  { id: 'High', label: 'Alto — vários times/departamentos' },
  { id: 'Critical', label: 'Crítico — toda a empresa' },
]
const URGENCY_OPTIONS: TriageOption[] = [
  { id: 'Low', label: 'Baixa — posso esperar' },
  { id: 'Medium', label: 'Média — atrapalha meu trabalho' },
  { id: 'High', label: 'Alta — estou parado' },
]

const GLOBAL_HELP = ' (você pode dizer "voltar", "recomeçar" ou "cancelar" a qualquer momento)'

// TI é o catálogo padrão (mesma convenção do portal clássico, UserPortalLayout.tsx):
// categorias sem departamento (Global) ou explicitamente do departamento "TI" entram
// no catálogo padrão, sem exigir escolha. Departamentos como RH, Financeiro etc. só
// aparecem quando têm ao menos uma categoria vinculada — e aí sim são oferecidos.
const TI_ID = '__ti__'
function isNonItDepartment(name: string): boolean {
  const n = name.trim().toLowerCase()
  return n !== 'ti' && n !== 't.i.' && n !== 'tecnologia da informação' && n !== 'infraestrutura de ti'
}

/** Departamentos elegíveis para o passo de escolha de catálogo (com categorias vinculadas, exceto TI). */
function domainOptions(catalog: TriageCatalog): TriageOption[] {
  const counts = new Map<string, number>()
  for (const c of catalog.incidentCategories) if (c.department_id) counts.set(c.department_id, (counts.get(c.department_id) ?? 0) + 1)
  for (const c of catalog.requestCategories) if (c.department_id) counts.set(c.department_id, (counts.get(c.department_id) ?? 0) + 1)
  return (catalog.departments ?? [])
    .filter(d => counts.has(d.id) && isNonItDepartment(d.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => ({ id: d.id, label: d.name }))
}

/** Uma categoria pertence ao domínio selecionado (undefined/TI_ID = catálogo padrão). */
function belongsToDomain(departmentId: string | null | undefined, domainId: string | undefined, catalog: TriageCatalog): boolean {
  if (!domainId) {
    if (!departmentId) return true
    const dept = (catalog.departments ?? []).find(d => d.id === departmentId)
    return !dept || !isNonItDepartment(dept.name)
  }
  return departmentId === domainId
}

export function initialState(): TriageState {
  return { step: 'choose_type', selections: {}, formFields: [], formCursor: 0, formAnswers: {} }
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/** Resolve a escolha do usuário: casa por id exato, por número (1-based) ou por rótulo. */
function resolveChoice(input: string, options: TriageOption[]): TriageOption | null {
  const n = norm(input)
  if (!n) return null
  const byId = options.find(o => norm(o.id) === n)
  if (byId) return byId
  const asNum = Number(n)
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= options.length) return options[asNum - 1]
  const byLabel = options.find(o => norm(o.label) === n || norm(o.label).startsWith(n))
  if (byLabel) return byLabel
  // casamento parcial por conter o texto (ajuda quando o usuário digita parte do nome)
  const partial = options.filter(o => norm(o.label).includes(n))
  return partial.length === 1 ? partial[0] : null
}

function menuTurn(state: TriageState): TriageTurn {
  const options: TriageOption[] = [
    { id: 'incident', label: 'Abrir um incidente (algo parou/quebrou)' },
    { id: 'request', label: 'Fazer uma solicitação (pedir um serviço/acesso)' },
    { id: 'check_tickets', label: 'Consultar meus chamados' },
    { id: 'handoff', label: 'Falar com um atendente humano' },
  ]
  return {
    state,
    prompt: 'Olá! Sou o assistente de triagem. Vou te fazer algumas perguntas para abrir seu chamado com todas as informações. O que você precisa hoje?',
    options,
    inputType: 'choice',
    readyToCreate: false,
  }
}

function choiceTurn(state: TriageState, prompt: string, options: TriageOption[]): TriageTurn {
  return { state, prompt: prompt + GLOBAL_HELP, options, inputType: 'choice', readyToCreate: false }
}

function textTurn(state: TriageState, prompt: string): TriageTurn {
  return { state, prompt: prompt + GLOBAL_HELP, options: [], inputType: 'text', readyToCreate: false }
}

// ─── Montagem de cada passo (pergunta atual) ────────────────────────────────
export function renderTurn(state: TriageState, catalog: TriageCatalog): TriageTurn {
  const s = state.selections
  switch (state.step) {
    case 'choose_type':
      return menuTurn(state)

    case 'choose_domain': {
      const opts = [{ id: TI_ID, label: 'TI / Catálogo padrão' }, ...domainOptions(catalog)]
      return choiceTurn(state, 'Qual catálogo de serviços você quer usar?', opts)
    }

    case 'inc_category': {
      const opts = catalog.incidentCategories.filter(c => belongsToDomain(c.department_id, s.domainId, catalog)).map(c => ({ id: c.id, label: c.name }))
      if (opts.length === 0) return backToMenu('Ainda não há categorias de incidente configuradas para esse catálogo. Vamos recomeçar.')
      return choiceTurn(state, 'Qual a categoria do problema?', opts)
    }
    case 'inc_service': {
      const opts = catalog.incidentServices.filter(x => x.category_id === s.categoryId).map(x => ({ id: x.id, label: x.name }))
      if (opts.length === 0) return backToMenu('Não há serviços nessa categoria. Vamos recomeçar.')
      return choiceTurn(state, `Dentro de "${s.categoryName}", qual serviço está com problema?`, opts)
    }
    case 'inc_symptom': {
      const opts = catalog.incidentSymptoms.filter(x => x.service_id === s.serviceId).map(x => ({ id: x.id, label: x.name }))
      if (opts.length === 0) return backToMenu('Não há sintomas cadastrados para esse serviço. Vamos recomeçar.')
      return choiceTurn(state, `O que está acontecendo com "${s.serviceName}"?`, opts)
    }
    case 'inc_impact':
      return choiceTurn(state, 'Quem é afetado por esse problema?', IMPACT_OPTIONS)
    case 'inc_urgency':
      return choiceTurn(state, 'Qual a urgência para você agora?', URGENCY_OPTIONS)

    case 'req_category': {
      const opts = catalog.requestCategories.filter(c => belongsToDomain(c.department_id, s.domainId, catalog)).map(c => ({ id: c.id, label: c.name }))
      if (opts.length === 0) return backToMenu('Ainda não há categorias de solicitação configuradas para esse catálogo. Vamos recomeçar.')
      return choiceTurn(state, 'Sobre o que é a sua solicitação?', opts)
    }
    case 'req_subcategory': {
      const opts = catalog.requestSubcategories.filter(x => x.category_id === s.requestCategoryId).map(x => ({ id: x.id, label: x.name }))
      // sem subcategoria: o avanço já pulou este passo; se cair aqui vazio, volta
      if (opts.length === 0) return backToMenu('Vamos recomeçar.')
      return choiceTurn(state, `Em "${s.requestCategoryName}", qual a subcategoria?`, opts)
    }
    case 'req_item': {
      const opts = itemsForRequest(state, catalog).map(x => ({ id: x.id, label: x.name }))
      if (opts.length === 0) return backToMenu('Não há itens disponíveis aqui. Vamos recomeçar.')
      return choiceTurn(state, 'Qual item você precisa?', opts)
    }

    case 'inc_form':
    case 'req_form':
      return renderFormField(state)

    case 'inc_description':
    case 'req_description':
      return textTurn(state, 'Quer descrever o problema com mais detalhes? Isso ajuda muito o atendente. (ou diga "pular")')

    case 'inc_confirm':
    case 'req_confirm':
      return { state, prompt: buildSummary(state), options: [{ id: 'sim', label: 'Confirmar e abrir' }, { id: 'nao', label: 'Cancelar' }], inputType: 'confirm', readyToCreate: false }

    case 'check_tickets':
      return { state, prompt: '', options: [], inputType: 'terminal', readyToCreate: false, intent: 'check_tickets' }
    case 'handoff':
      return { state, prompt: 'Vou te transferir para um atendente humano. Em breve alguém continua o atendimento por aqui.', options: [], inputType: 'terminal', readyToCreate: false, intent: 'handoff' }
    case 'cancelled':
      return { state, prompt: 'Tudo bem, cancelei o atendimento. Quando quiser, é só recomeçar. 🙂', options: [{ id: 'recomecar', label: 'Recomeçar' }], inputType: 'choice', readyToCreate: false }
    case 'done':
      return { state, prompt: '', options: [], inputType: 'terminal', readyToCreate: false }
  }
}

function renderFormField(state: TriageState): TriageTurn {
  const field = state.formFields[state.formCursor]
  if (!field) {
    // não deveria acontecer (advance controla o cursor), mas é seguro
    return textTurn(state, 'Certo.')
  }
  const req = field.required ? ' (obrigatório)' : ' (opcional — diga "pular")'
  if (field.type === 'select' && field.options && field.options.length > 0) {
    return choiceTurn(state, `${field.label}${req}`, field.options.map(o => ({ id: o, label: o })))
  }
  if (field.type === 'checkbox' && field.options && field.options.length > 0) {
    return {
      state,
      prompt: `${field.label}${req} — escolha uma ou mais (ex.: "1,3"), ou "pronto" quando terminar.` + GLOBAL_HELP,
      options: field.options.map(o => ({ id: o, label: o })),
      inputType: 'multi',
      readyToCreate: false,
    }
  }
  if (field.type === 'checkbox') {
    return choiceTurn(state, `${field.label}${req}`, [{ id: 'sim', label: 'Sim' }, { id: 'nao', label: 'Não' }])
  }
  // text / textarea / number / date / datetime
  return textTurn(state, `${field.label}${req}`)
}

// ─── Transição de estado (processa a resposta do usuário) ───────────────────
export function nextTurn(state: TriageState, catalog: TriageCatalog, userInput: string): TriageTurn {
  const raw = userInput ?? ''
  const cmd = norm(raw)

  // Comandos globais (travas de navegação) — sempre disponíveis.
  if (['cancelar', 'cancela', 'sair'].includes(cmd)) {
    return renderTurn({ ...initialState(), step: 'cancelled' }, catalog)
  }
  if (['recomeçar', 'recomecar', 'reiniciar', 'menu', 'início', 'inicio'].includes(cmd)) {
    return renderTurn(initialState(), catalog)
  }
  if (['voltar', 'volta'].includes(cmd)) {
    return renderTurn(goBack(state, catalog), catalog)
  }

  return advance(state, catalog, raw).turn
}

interface AdvanceResult { state: TriageState; turn: TriageTurn }

function reject(state: TriageState, catalog: TriageCatalog, msg: string): AdvanceResult {
  const current = renderTurn(state, catalog)
  return { state, turn: { ...current, prompt: msg + '\n\n' + current.prompt } }
}

function advance(state: TriageState, catalog: TriageCatalog, raw: string): AdvanceResult {
  const s = { ...state.selections }
  switch (state.step) {
    case 'choose_type': {
      const opt = resolveChoice(raw, menuTurn(state).options)
      if (!opt) return reject(state, catalog, 'Não entendi. Escolha uma das opções abaixo:')
      if (opt.id === 'check_tickets') return step(state, catalog, 'check_tickets')
      if (opt.id === 'handoff') return step(state, catalog, 'handoff')
      const ticketType: 'incident' | 'request' = opt.id === 'incident' ? 'incident' : 'request'
      const withType = { ...state, selections: { ...s, ticketType } }
      // Só pergunta o catálogo (TI/RH/...) quando há de fato outro departamento
      // com categorias cadastradas — senão vai direto (catálogo padrão implícito).
      const hasDomains = domainOptions(catalog).length > 0
      return step(withType, catalog, hasDomains ? 'choose_domain' : (ticketType === 'incident' ? 'inc_category' : 'req_category'))
    }

    case 'choose_domain': {
      const opts = [{ id: TI_ID, label: 'TI / Catálogo padrão' }, ...domainOptions(catalog)]
      const opt = resolveChoice(raw, opts)
      if (!opt) return reject(state, catalog, 'Escolha um catálogo da lista:')
      if (opt.id === TI_ID) { delete s.domainId; delete s.domainName }
      else { s.domainId = opt.id; s.domainName = opt.label }
      return step({ ...state, selections: s }, catalog, s.ticketType === 'incident' ? 'inc_category' : 'req_category')
    }

    // ── Incidente ──
    case 'inc_category': {
      const opts = catalog.incidentCategories.filter(c => belongsToDomain(c.department_id, s.domainId, catalog)).map(c => ({ id: c.id, label: c.name }))
      const opt = resolveChoice(raw, opts)
      if (!opt) return reject(state, catalog, 'Escolha uma categoria da lista:')
      s.categoryId = opt.id; s.categoryName = opt.label
      return step({ ...state, selections: s }, catalog, 'inc_service')
    }
    case 'inc_service': {
      const opts = catalog.incidentServices.filter(x => x.category_id === s.categoryId).map(x => ({ id: x.id, label: x.name }))
      const opt = resolveChoice(raw, opts)
      if (!opt) return reject(state, catalog, 'Escolha um serviço da lista:')
      s.serviceId = opt.id; s.serviceName = opt.label
      return step({ ...state, selections: s }, catalog, 'inc_symptom')
    }
    case 'inc_symptom': {
      const sym = catalog.incidentSymptoms.filter(x => x.service_id === s.serviceId)
      const opt = resolveChoice(raw, sym.map(x => ({ id: x.id, label: x.name })))
      if (!opt) return reject(state, catalog, 'Escolha o que está acontecendo:')
      const chosen = sym.find(x => x.id === opt.id)!
      s.symptomId = chosen.system_symptom_id; s.symptomName = chosen.name
      s.slaHours = chosen.sla_hours
      s.assignmentGroupId = chosen.assignment_group_id
      s.assignmentGroupName = chosen.assignment_group_name
      s.shortDescription = `${s.serviceName} — ${chosen.name}`
      return step({ ...state, selections: s, formFields: chosen.form_fields, formCursor: 0, formAnswers: {} }, catalog, 'inc_impact')
    }
    case 'inc_impact': {
      const opt = resolveChoice(raw, IMPACT_OPTIONS)
      if (!opt) return reject(state, catalog, 'Escolha quem é afetado:')
      s.impact = opt.id as TriageSelections['impact']
      return step({ ...state, selections: s }, catalog, 'inc_urgency')
    }
    case 'inc_urgency': {
      const opt = resolveChoice(raw, URGENCY_OPTIONS)
      if (!opt) return reject(state, catalog, 'Escolha a urgência:')
      s.urgency = opt.id as TriageSelections['urgency']
      const withUrg = { ...state, selections: s }
      return state.formFields.length > 0 ? step(withUrg, catalog, 'inc_form') : step(withUrg, catalog, 'inc_description')
    }

    // ── Solicitação ──
    case 'req_category': {
      const opts = catalog.requestCategories.filter(c => belongsToDomain(c.department_id, s.domainId, catalog)).map(c => ({ id: c.id, label: c.name }))
      const opt = resolveChoice(raw, opts)
      if (!opt) return reject(state, catalog, 'Escolha uma categoria da lista:')
      s.requestCategoryId = opt.id; s.requestCategoryName = opt.label
      const hasSub = catalog.requestSubcategories.some(x => x.category_id === opt.id)
      return step({ ...state, selections: s }, catalog, hasSub ? 'req_subcategory' : 'req_item')
    }
    case 'req_subcategory': {
      const opts = catalog.requestSubcategories.filter(x => x.category_id === s.requestCategoryId).map(x => ({ id: x.id, label: x.name }))
      const opt = resolveChoice(raw, opts)
      if (!opt) return reject(state, catalog, 'Escolha uma subcategoria:')
      s.requestSubcategoryId = opt.id; s.requestSubcategoryName = opt.label
      return step({ ...state, selections: s }, catalog, 'req_item')
    }
    case 'req_item': {
      const items = itemsForRequest(state, catalog)
      const opt = resolveChoice(raw, items.map(x => ({ id: x.id, label: x.name })))
      if (!opt) return reject(state, catalog, 'Escolha um item da lista:')
      const chosen = items.find(x => x.id === opt.id)!
      s.requestItemId = chosen.id; s.requestItemName = chosen.name
      s.assignmentGroupId = chosen.assignment_group_id
      s.assignmentGroupName = chosen.assignment_group_name
      s.requiresApproval = chosen.requires_approval
      s.shortDescription = chosen.name
      const withItem = { ...state, selections: s, formFields: chosen.form_fields, formCursor: 0, formAnswers: {} }
      return chosen.form_fields.length > 0 ? step(withItem, catalog, 'req_form') : step(withItem, catalog, 'req_description')
    }

    // ── Campos dinâmicos (comum aos dois caminhos) ──
    case 'inc_form':
    case 'req_form':
      return advanceForm(state, catalog, raw)

    // ── Descrição livre ──
    case 'inc_description':
    case 'req_description': {
      const skip = ['pular', 'não', 'nao', 'skip', ''].includes(norm(raw))
      if (!skip) s.description = raw.trim()
      return step({ ...state, selections: s }, catalog, state.step === 'inc_description' ? 'inc_confirm' : 'req_confirm')
    }

    // ── Confirmação ──
    case 'inc_confirm':
    case 'req_confirm': {
      const opt = resolveChoice(raw, [{ id: 'sim', label: 'Confirmar e abrir' }, { id: 'nao', label: 'Cancelar' }])
      if (!opt) return reject(state, catalog, 'Só preciso de uma confirmação:')
      if (opt.id === 'nao') return step({ ...initialState(), step: 'cancelled' }, catalog, 'cancelled')
      const done: TriageState = { ...state, step: 'done' }
      return { state: done, turn: { state: done, prompt: '', options: [], inputType: 'terminal', readyToCreate: true } }
    }

    case 'cancelled': {
      // única saída é recomeçar
      return step(initialState(), catalog, 'choose_type')
    }
    default:
      return { state, turn: renderTurn(state, catalog) }
  }
}

function advanceForm(state: TriageState, catalog: TriageCatalog, raw: string): AdvanceResult {
  const field = state.formFields[state.formCursor]
  if (!field) return step(state, catalog, state.step === 'inc_form' ? 'inc_description' : 'req_description')
  const answers = { ...state.formAnswers }
  const input = raw.trim()
  const low = norm(raw)

  const isSkip = low === 'pular' || low === 'skip' || input === ''
  if (isSkip) {
    if (field.required) return reject(state, catalog, 'Esse campo é obrigatório, preciso de uma resposta.')
    return moveFormCursor(state, catalog)
  }

  if (field.type === 'select' && field.options && field.options.length > 0) {
    const opt = resolveChoice(raw, field.options.map(o => ({ id: o, label: o })))
    if (!opt) return reject(state, catalog, 'Escolha uma das opções:')
    answers[field.id] = opt.id
    return moveFormCursor({ ...state, formAnswers: answers }, catalog)
  }
  if (field.type === 'checkbox' && field.options && field.options.length > 0) {
    if (low === 'pronto' || low === 'ok') {
      const chosen = state.multiPending ?? []
      if (field.required && chosen.length === 0) return reject(state, catalog, 'Escolha ao menos uma opção antes de continuar.')
      answers[field.id] = chosen
      return moveFormCursor({ ...state, formAnswers: answers, multiPending: undefined }, catalog)
    }
    // interpreta "1,3" ou nomes separados por vírgula, acumulando
    const picks = raw.split(',').map(p => p.trim()).filter(Boolean)
    const resolved: string[] = [...(state.multiPending ?? [])]
    for (const p of picks) {
      const opt = resolveChoice(p, field.options.map(o => ({ id: o, label: o })))
      if (opt && !resolved.includes(opt.id)) resolved.push(opt.id)
    }
    if (resolved.length === (state.multiPending ?? []).length) return reject(state, catalog, 'Não reconheci essas opções. Tente pelos números (ex.: "1,3").')
    return { state: { ...state, multiPending: resolved }, turn: { ...renderTurn({ ...state, multiPending: resolved }, catalog), prompt: `Selecionado até agora: ${resolved.join(', ')}. Adicione mais ou diga "pronto".` } }
  }
  if (field.type === 'checkbox') {
    const opt = resolveChoice(raw, [{ id: 'sim', label: 'Sim' }, { id: 'nao', label: 'Não' }])
    if (!opt) return reject(state, catalog, 'Responda Sim ou Não:')
    answers[field.id] = opt.id === 'sim'
    return moveFormCursor({ ...state, formAnswers: answers }, catalog)
  }
  if (field.type === 'number') {
    if (!/^-?\d+([.,]\d+)?$/.test(input)) return reject(state, catalog, 'Preciso de um número válido:')
    answers[field.id] = input.replace(',', '.')
    return moveFormCursor({ ...state, formAnswers: answers }, catalog)
  }
  if (field.type === 'date' || field.type === 'datetime') {
    if (Number.isNaN(Date.parse(input))) return reject(state, catalog, 'Preciso de uma data válida (ex.: 2026-07-10):')
    answers[field.id] = input
    return moveFormCursor({ ...state, formAnswers: answers }, catalog)
  }
  // text / textarea
  answers[field.id] = input
  return moveFormCursor({ ...state, formAnswers: answers }, catalog)
}

function moveFormCursor(state: TriageState, catalog: TriageCatalog): AdvanceResult {
  const nextCursor = state.formCursor + 1
  if (nextCursor < state.formFields.length) {
    const ns = { ...state, formCursor: nextCursor, multiPending: undefined }
    return { state: ns, turn: renderTurn(ns, catalog) }
  }
  return step({ ...state, multiPending: undefined }, catalog, state.step === 'inc_form' ? 'inc_description' : 'req_description')
}

function step(state: TriageState, catalog: TriageCatalog, next: TriageStep): AdvanceResult {
  const ns = { ...state, step: next }
  return { state: ns, turn: renderTurn(ns, catalog) }
}

function backToMenu(msg: string): TriageTurn {
  const fresh = initialState()
  return { state: fresh, prompt: msg + '\n\n' + menuTurn(fresh).prompt, options: menuTurn(fresh).options, inputType: 'choice', readyToCreate: false }
}

// ─── Navegação "voltar" ─────────────────────────────────────────────────────
const BACK: Partial<Record<TriageStep, TriageStep>> = {
  choose_domain: 'choose_type',
  inc_service: 'inc_category', inc_symptom: 'inc_service',
  inc_impact: 'inc_symptom', inc_urgency: 'inc_impact', inc_form: 'inc_urgency',
  inc_description: 'inc_urgency', inc_confirm: 'inc_description',
  req_subcategory: 'req_category', req_item: 'req_subcategory',
  req_form: 'req_item', req_description: 'req_item', req_confirm: 'req_description',
}

function goBack(state: TriageState, catalog: TriageCatalog): TriageState {
  // Dentro do formulário, "voltar" recua um campo antes de sair do passo.
  if ((state.step === 'inc_form' || state.step === 'req_form') && state.formCursor > 0) {
    return { ...state, formCursor: state.formCursor - 1, multiPending: undefined }
  }
  // inc_category/req_category voltam para choose_domain só quando esse passo
  // de fato foi oferecido (há outros catálogos além de TI cadastrados) — senão
  // vão direto para choose_type, pulando um passo que nunca foi mostrado.
  if (state.step === 'inc_category' || state.step === 'req_category') {
    const prev = domainOptions(catalog).length > 0 ? 'choose_domain' : 'choose_type'
    return { ...state, step: prev, multiPending: undefined }
  }
  const prev = BACK[state.step] ?? 'choose_type'
  // Ao voltar para req_item quando não houver subcategoria, pula direto a req_category
  return { ...state, step: prev, multiPending: undefined }
}

// ─── Utilidades ─────────────────────────────────────────────────────────────
function itemsForRequest(state: TriageState, catalog: TriageCatalog) {
  const s = state.selections
  if (s.requestSubcategoryId) {
    return catalog.requestItems.filter(x => x.request_subcategory_id === s.requestSubcategoryId)
  }
  return catalog.requestItems.filter(x => x.request_category_id === s.requestCategoryId)
}

function buildSummary(state: TriageState): string {
  const s = state.selections
  const lines: string[] = ['Pronto! Revise o resumo antes de eu abrir o chamado:', '']
  lines.push(s.ticketType === 'incident' ? '• Tipo: Incidente' : '• Tipo: Solicitação')
  if (s.domainName) lines.push(`• Catálogo: ${s.domainName}`)
  if (s.ticketType === 'incident') {
    lines.push(`• Categoria: ${s.categoryName}`)
    lines.push(`• Serviço: ${s.serviceName}`)
    lines.push(`• Sintoma: ${s.symptomName}`)
    if (s.impact) lines.push(`• Impacto: ${labelImpact(s.impact)}`)
    if (s.urgency) lines.push(`• Urgência: ${labelUrgency(s.urgency)}`)
  } else {
    lines.push(`• Categoria: ${s.requestCategoryName}`)
    if (s.requestSubcategoryName) lines.push(`• Subcategoria: ${s.requestSubcategoryName}`)
    lines.push(`• Item: ${s.requestItemName}`)
    if (s.requiresApproval) lines.push('• Observação: este item passa por aprovação antes do atendimento.')
  }
  if (s.assignmentGroupName) lines.push(`• Equipe responsável: ${s.assignmentGroupName}`)
  const formLines = Object.entries(labeledAnswers(state))
  for (const [label, value] of formLines) lines.push(`• ${label}: ${value}`)
  if (s.description) lines.push(`• Detalhes: ${s.description}`)
  lines.push('', 'Posso abrir?')
  return lines.join('\n')
}

export function labeledAnswers(state: TriageState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of state.formFields) {
    const v = state.formAnswers[field.id]
    if (v === undefined) continue
    out[field.label] = typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : Array.isArray(v) ? v.join(', ') : String(v)
  }
  return out
}

function labelImpact(v: NonNullable<TriageSelections['impact']>): string {
  return IMPACT_OPTIONS.find(o => o.id === v)?.label ?? v
}
function labelUrgency(v: NonNullable<TriageSelections['urgency']>): string {
  return URGENCY_OPTIONS.find(o => o.id === v)?.label ?? v
}
