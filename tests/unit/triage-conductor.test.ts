import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialState, renderTurn, nextTurn,
  type TriageCatalog, type TriageState, type TriageTurn,
} from '../../src/lib/triage-conductor.ts'

const catalog: TriageCatalog = {
  incidentCategories: [{ id: 'c1', name: 'Rede' }],
  incidentServices: [{ id: 's1', name: 'VPN', category_id: 'c1' }],
  incidentSymptoms: [{
    id: 'y1', system_symptom_id: 'sys-y1', service_id: 's1', name: 'Não conecta',
    form_fields: [{ id: 'f1', label: 'Sistema operacional', type: 'select', required: true, options: ['Windows', 'Mac'] }],
    sla_hours: 8, assignment_group_id: 'g1', assignment_group_name: 'Redes',
  }],
  requestCategories: [{ id: 'rc1', name: 'Acessos' }],
  requestSubcategories: [],
  requestItems: [{
    id: 'ri1', name: 'Novo e-mail', request_category_id: 'rc1', request_subcategory_id: null,
    form_fields: [{ id: 'rf1', label: 'Nome desejado', type: 'text', required: true }],
    assignment_group_id: 'g2', assignment_group_name: 'TI', requires_approval: true,
  }],
}

// Helper: drive the conversation from the initial menu through a list of inputs.
function run(inputs: string[]): TriageTurn {
  let turn = renderTurn(initialState(), catalog)
  for (const input of inputs) turn = nextTurn(turn.state, catalog, input)
  return turn
}

test('menu inicial oferece incidente, solicitação, consultar e humano', () => {
  const t = renderTurn(initialState(), catalog)
  assert.equal(t.inputType, 'choice')
  assert.deepEqual(t.options.map(o => o.id), ['incident', 'request', 'check_tickets', 'handoff'])
})

test('caminho feliz de incidente chega a readyToCreate com todos os campos', () => {
  const t = run([
    'incident',   // choose_type
    'Rede',       // inc_category (por rótulo)
    'VPN',        // inc_service
    '1',          // inc_symptom (por número)
    'High',       // inc_impact
    'Média',      // inc_urgency (por rótulo parcial)
    'Windows',    // inc_form (select obrigatório)
    'não abre nem com cabo', // inc_description
    'sim',        // inc_confirm
  ])
  assert.equal(t.readyToCreate, true)
  assert.equal(t.state.step, 'done')
  const s = t.state.selections
  assert.equal(s.ticketType, 'incident')
  // s.symptomId deve ser o sintoma MESTRE (system_symptoms), não o id da
  // linha catalog_service_symptoms (opção 'y1' escolhida na lista) — é isso
  // que incidents.symptom_id referencia via FK; usar o id errado aqui quebra
  // a criação do chamado com "insert or update... violates foreign key
  // constraint incidents_symptom_id_fkey" (bug real encontrado em produção).
  assert.equal(s.symptomId, 'sys-y1')
  assert.notEqual(s.symptomId, 'y1')
  assert.equal(s.impact, 'High')
  assert.equal(s.urgency, 'Medium')
  assert.equal(s.slaHours, 8)
  assert.equal(s.assignmentGroupId, 'g1')
  assert.equal(s.shortDescription, 'VPN — Não conecta')
  assert.equal(t.state.formAnswers['f1'], 'Windows')
  assert.equal(s.description, 'não abre nem com cabo')
})

test('caminho feliz de solicitação pula subcategoria e coleta campo de texto', () => {
  const t = run([
    'request',      // choose_type
    'Acessos',      // req_category (sem subcategoria → req_item)
    'Novo e-mail',  // req_item
    'joao.silva',   // req_form (texto obrigatório)
    'pular',        // req_description
    'sim',          // req_confirm
  ])
  assert.equal(t.readyToCreate, true)
  const s = t.state.selections
  assert.equal(s.ticketType, 'request')
  assert.equal(s.requestItemId, 'ri1')
  assert.equal(s.requiresApproval, true)
  assert.equal(t.state.formAnswers['rf1'], 'joao.silva')
})

test('campo obrigatório bloqueia "pular" e re-pergunta', () => {
  const before = run(['incident', 'Rede', 'VPN', '1', 'High', 'High'])
  assert.equal(before.state.step, 'inc_form')
  const t = nextTurn(before.state, catalog, 'pular')
  assert.equal(t.state.step, 'inc_form') // não avançou
  assert.match(t.prompt, /obrigat/i)
})

test('escolha inválida no menu re-pergunta sem sair do passo', () => {
  const t = nextTurn(initialState(), catalog, 'xyzabc')
  assert.equal(t.state.step, 'choose_type')
  assert.match(t.prompt, /não entendi/i)
  assert.equal(t.inputType, 'choice')
})

test('comando "cancelar" encerra a qualquer momento', () => {
  const before = run(['incident', 'Rede'])
  const t = nextTurn(before.state, catalog, 'cancelar')
  assert.equal(t.state.step, 'cancelled')
})

test('comando "recomeçar" volta ao menu inicial', () => {
  const before = run(['incident', 'Rede', 'VPN'])
  const t = nextTurn(before.state, catalog, 'recomeçar')
  assert.equal(t.state.step, 'choose_type')
})

test('comando "voltar" recua um passo', () => {
  const before = run(['incident', 'Rede']) // agora em inc_service
  assert.equal(before.state.step, 'inc_service')
  const t = nextTurn(before.state, catalog, 'voltar')
  assert.equal(t.state.step, 'inc_category')
})

test('"consultar meus chamados" sinaliza intent para reuso', () => {
  const t = nextTurn(initialState(), catalog, 'consultar')
  assert.equal(t.intent, 'check_tickets')
  assert.equal(t.inputType, 'terminal')
})

test('"falar com atendente" sinaliza handoff', () => {
  const t = nextTurn(initialState(), catalog, 'humano')
  assert.equal(t.intent, 'handoff')
})

test('catálogo sem categorias de incidente volta ao menu com aviso', () => {
  const empty: TriageCatalog = { ...catalog, incidentCategories: [], incidentServices: [], incidentSymptoms: [] }
  const start = renderTurn(initialState(), empty)
  const t = nextTurn(start.state, empty, 'incident')
  assert.equal(t.state.step, 'choose_type')
  assert.match(t.prompt, /recome/i)
})

// ─── Catálogo com departamentos (TI + RH) ────────────────────────────────────
const catalogWithDept: TriageCatalog = {
  departments: [{ id: 'd-ti', name: 'TI' }, { id: 'd-rh', name: 'RH' }],
  incidentCategories: [
    { id: 'c1', name: 'Rede', department_id: null }, // sem departamento = catálogo padrão (TI)
    { id: 'c-rh', name: 'Benefícios', department_id: 'd-rh' },
  ],
  incidentServices: [
    { id: 's1', name: 'VPN', category_id: 'c1' },
    { id: 's-rh', name: 'Plano de saúde', category_id: 'c-rh' },
  ],
  incidentSymptoms: [
    { id: 'y1', system_symptom_id: 'sys-y1', service_id: 's1', name: 'Não conecta', form_fields: [], sla_hours: 8, assignment_group_id: 'g1', assignment_group_name: 'Redes' },
    { id: 'y-rh', system_symptom_id: 'sys-y-rh', service_id: 's-rh', name: 'Dúvida sobre cobertura', form_fields: [], sla_hours: 24, assignment_group_id: 'g-rh', assignment_group_name: 'RH' },
  ],
  requestCategories: [
    { id: 'rc1', name: 'Acessos', department_id: null },
    { id: 'rc-rh', name: 'Documentos', department_id: 'd-rh' },
  ],
  requestSubcategories: [],
  requestItems: [
    { id: 'ri1', name: 'Novo e-mail', request_category_id: 'rc1', request_subcategory_id: null, form_fields: [], assignment_group_id: 'g2', assignment_group_name: 'TI', requires_approval: false },
    { id: 'ri-rh', name: 'Declaração de vínculo', request_category_id: 'rc-rh', request_subcategory_id: null, form_fields: [], assignment_group_id: 'g-rh', assignment_group_name: 'RH', requires_approval: false },
  ],
}

function runWith(cat: TriageCatalog, inputs: string[]): TriageTurn {
  let turn = renderTurn(initialState(), cat)
  for (const input of inputs) turn = nextTurn(turn.state, cat, input)
  return turn
}

test('com departamentos cadastrados, pergunta o catálogo antes da categoria', () => {
  const t = nextTurn(renderTurn(initialState(), catalogWithDept).state, catalogWithDept, 'incident')
  assert.equal(t.state.step, 'choose_domain')
  assert.deepEqual(t.options.map(o => o.label), ['TI / Catálogo padrão', 'RH'])
})

test('escolher TI mostra só as categorias do catálogo padrão (sem departamento)', () => {
  const t = runWith(catalogWithDept, ['incident', 'TI'])
  assert.equal(t.state.step, 'inc_category')
  assert.deepEqual(t.options.map(o => o.label), ['Rede'])
})

test('escolher RH mostra só as categorias vinculadas a RH', () => {
  const t = runWith(catalogWithDept, ['incident', 'RH'])
  assert.equal(t.state.step, 'inc_category')
  assert.deepEqual(t.options.map(o => o.label), ['Benefícios'])
})

test('caminho completo pelo catálogo de RH chega a readyToCreate e registra o domínio no resumo', () => {
  const confirmStep = runWith(catalogWithDept, [
    'incident', 'RH', 'Benefícios', 'Plano de saúde', '1', 'Low', 'Baixa', 'pular',
  ])
  assert.equal(confirmStep.state.step, 'inc_confirm')
  assert.match(confirmStep.prompt, /Catálogo: RH/)
  const t = nextTurn(confirmStep.state, catalogWithDept, 'sim')
  assert.equal(t.readyToCreate, true)
  assert.equal(t.state.selections.domainName, 'RH')
  assert.equal(t.state.selections.symptomId, 'sys-y-rh')
})

test('solicitação também filtra categorias por domínio (RH)', () => {
  const t = runWith(catalogWithDept, ['request', 'RH'])
  assert.equal(t.state.step, 'req_category')
  assert.deepEqual(t.options.map(o => o.label), ['Documentos'])
})

test('"voltar" a partir da categoria retorna à escolha de catálogo quando ela foi oferecida', () => {
  const atCategory = runWith(catalogWithDept, ['incident', 'TI'])
  assert.equal(atCategory.state.step, 'inc_category')
  const t = nextTurn(atCategory.state, catalogWithDept, 'voltar')
  assert.equal(t.state.step, 'choose_domain')
})

test('sem departamentos elegíveis (fixture original), não pergunta o catálogo', () => {
  const t = nextTurn(renderTurn(initialState(), catalog).state, catalog, 'incident')
  assert.equal(t.state.step, 'inc_category')
})
