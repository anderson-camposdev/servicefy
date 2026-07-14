import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import AnalystCockpit from '../AnalystCockpit'

// Mock useAuth
vi.mock('../../auth', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', name: 'Analista Teste', role: 'agent' },
  }),
}))

// Mock useToast
vi.mock('../../context', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

// Mock services
const {
  mockGetById,
  mockListMessages,
  mockListGroups,
  mockListReasons,
  mockListMacros,
  mockGetCiForCase,
  mockPredictIncidentImpact
} = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockListMessages: vi.fn(),
  mockListGroups: vi.fn(),
  mockListReasons: vi.fn(),
  mockListMacros: vi.fn(),
  mockGetCiForCase: vi.fn(),
  mockPredictIncidentImpact: vi.fn(),
}))

vi.mock('../../lib/services', () => ({
  incidentsService: {
    getById: mockGetById,
    conduct: vi.fn(),
    startService: vi.fn(),
    subscribeToHistory: () => ({ unsubscribe: () => {} }),
  },
  messagesService: {
    listForTicket: mockListMessages,
    list: mockListMessages,
    subscribeToMessages: () => ({ unsubscribe: () => {} }),
    subscribeToIncident: () => ({ unsubscribe: () => {} }),
  },
  assignmentGroupsService: {
    list: mockListGroups,
    listActive: vi.fn().mockResolvedValue([]),
    listMembers: vi.fn().mockResolvedValue([]),
  },
  pendingReasonsService: {
    list: mockListReasons,
  },
  responseMacrosService: {
    list: mockListMacros,
  },
  ticketMacrosService: {
    list: vi.fn().mockResolvedValue([]),
    apply: vi.fn(),
  },
  cmdbService: {
    getCiForCase: mockGetCiForCase,
    predictIncidentImpact: mockPredictIncidentImpact,
  },
  slaEventsService: {
    list: vi.fn().mockResolvedValue([]),
    subscribeToIncident: () => ({ unsubscribe: () => {} }),
  },
}))

const TICKET_PROP = {
  id: 'INC0010003',
  title: 'VPN lenta apos atualizacao',
  status: 'In Progress',
  priority: 'P3 - Moderate',
  requester: 'Juliana Costa',
  department: 'Financeiro',
  client: 'Acme Corp',
  date: '10 min atrás',
  incidentId: 'c09d0ba8-971c-4544-8617-4aa0b2ed4174',
  companyId: '11111111-1111-1111-1111-111111111111',
  caseId: 'case-123',
}

const MOCK_TICKET_DETAIL = {
  id: 'c09d0ba8-971c-4544-8617-4aa0b2ed4174',
  number: 'INC0010003',
  company_id: '11111111-1111-1111-1111-111111111111',
  case_id: 'case-123',
  short_description: 'VPN lenta apos atualizacao',
  description: 'Descricao detalhada',
  priority: 'P3 - Moderate',
  state: 'In Progress',
  category: 'Network',
  caller_id: 'caller-1',
  caller_name: 'Juliana Costa',
  assigned_to_id: 'user-1',
  assigned_to_name: 'Analista Teste',
  assigned_group_id: 'group-1',
  assigned_group_name: 'Suporte N1',
  created_at: '2026-07-09T14:00:00.000Z',
  updated_at: '2026-07-09T14:00:00.000Z',
  history: [],
}

describe('AnalystCockpit — CMDB Impact Panel', () => {
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.clearAllMocks()

    // Default mock responses
    mockGetById.mockResolvedValue(MOCK_TICKET_DETAIL)
    mockListMessages.mockResolvedValue([])
    mockListGroups.mockResolvedValue([])
    mockListReasons.mockResolvedValue([])
    mockListMacros.mockResolvedValue([])
  })

  afterEach(() => {
    if (container) {
      document.body.removeChild(container)
      container = null
    }
  })

  it('deve exibir mensagem limpa se nao houver CI associado ao caso', async () => {
    mockGetCiForCase.mockResolvedValue(null)

    const root = createRoot(container!)
    await act(async () => {
      root.render(
        <AnalystCockpit
          ticket={TICKET_PROP}
        />
      )
    })

    // Aguarda carregar dados assincronos
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const emptyText = container!.querySelector('[data-testid="cmdb-impact-empty"]')
    expect(emptyText).toBeTruthy()
    expect(emptyText!.textContent).toContain('Nenhum impacto em cascata detectado')
  })

  it('deve renderizar a lista de CIs impactados com criticidade colorida correta', async () => {
    mockGetCiForCase.mockResolvedValue('ci-123')
    mockPredictIncidentImpact.mockResolvedValue([
      { ci_id: 'ci-1', ci_name: 'Banco de Dados Core', class_name: 'Database', criticality: 'critical', depth: 1, path: ['ci-1'] },
      { ci_id: 'ci-2', ci_name: 'Servidor Web API', class_name: 'Application', criticality: 'high', depth: 2, path: ['ci-1', 'ci-2'] },
      { ci_id: 'ci-3', ci_name: 'Roteador Switch', class_name: 'Network', criticality: 'low', depth: 3, path: ['ci-1', 'ci-2', 'ci-3'] }
    ])

    const root = createRoot(container!)
    await act(async () => {
      root.render(
        <AnalystCockpit
          ticket={TICKET_PROP}
        />
      )
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Verifica se os cards de impacto foram renderizados de acordo com a criticidade
    const criticalCard = container!.querySelector('[data-testid="cmdb-impact-card-critical"]')
    const highCard = container!.querySelector('[data-testid="cmdb-impact-card-high"]')
    const lowCard = container!.querySelector('[data-testid="cmdb-impact-card-low"]')

    expect(criticalCard).toBeTruthy()
    expect(criticalCard!.textContent).toContain('Banco de Dados Core')
    expect(criticalCard!.textContent).toContain('Nível 1')

    expect(highCard).toBeTruthy()
    expect(highCard!.textContent).toContain('Servidor Web API')
    expect(highCard!.textContent).toContain('Nível 2')

    expect(lowCard).toBeTruthy()
    expect(lowCard!.textContent).toContain('Roteador Switch')
    expect(lowCard!.textContent).toContain('Nível 3')
  })
})
