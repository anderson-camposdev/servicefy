import { useState, useEffect, useCallback, useMemo } from 'react'
import { Save, Trash2, Globe, Lock, AlertCircle, Loader2, Plus, X, ListFilter, Layers, BarChart3, Download, ExternalLink } from 'lucide-react'
import { useTenant } from '../tenant'
import { useAuth } from '../auth'
import { useToast } from '../context'
import { biService, companiesService } from '../lib/services'

type FieldType = 'choice' | 'text' | 'date' | 'number'

interface ChoiceOption {
  value: string
  label: string
}

interface FieldConfig {
  label: string
  type: FieldType
  choices?: ChoiceOption[] | string[]
}

const FIELD_SCHEMA: Record<string, FieldConfig> = {
  current_status: {
    label: 'Status Atual',
    type: 'choice',
    choices: [
      { value: 'New', label: 'Novo (New)' },
      { value: 'In Progress', label: 'Em Atendimento (In Progress)' },
      { value: 'On Hold', label: 'Em Espera (On Hold)' },
      { value: 'Pending User', label: 'Pendente com Usuário (Pending User)' },
      { value: 'Resolved', label: 'Resolvido (Resolved)' },
      { value: 'Closed', label: 'Fechado (Closed)' }
    ]
  },
  ticket_type: {
    label: 'Tipo de Ticket',
    type: 'choice',
    choices: [
      { value: 'incident', label: 'Incidente' },
      { value: 'request', label: 'Requisição' }
    ]
  },
  client: {
    label: 'Cliente',
    type: 'choice',
    choices: [] // Preenchido dinamicamente para provedores
  },
  priority_level: {
    label: 'Prioridade',
    type: 'choice',
    choices: [
      { value: '1', label: 'P1 - Crítica' },
      { value: '2', label: 'P2 - Alta' },
      { value: '3', label: 'P3 - Média' },
      { value: '4', label: 'P4 - Baixa' },
      { value: '5', label: 'P5 - Planejada' }
    ]
  },
  impact: {
    label: 'Impacto',
    type: 'choice',
    choices: [
      { value: 'Low', label: 'Baixo (Apenas eu)' },
      { value: 'Medium', label: 'Médio (Meu departamento)' },
      { value: 'High', label: 'Alto (Toda a empresa)' },
      { value: 'Critical', label: 'Crítico (O negócio / Clientes)' }
    ]
  },
  urgency: {
    label: 'Urgência',
    type: 'choice',
    choices: [
      { value: 'Low', label: 'Baixa' },
      { value: 'Medium', label: 'Média' },
      { value: 'High', label: 'Alta' }
    ]
  },
  sla_response_status: {
    label: 'Status do SLA de Resposta',
    type: 'choice',
    choices: [
      { value: 'No Prazo', label: 'No Prazo' },
      { value: 'Estourado', label: 'Estourado' }
    ]
  },
  sla_resolution_status: {
    label: 'Status do SLA de Resolução',
    type: 'choice',
    choices: [
      { value: 'No Prazo', label: 'No Prazo' },
      { value: 'Estourado', label: 'Estourado' }
    ]
  },
  assigned_group_name: {
    label: 'Grupo Solucionador',
    type: 'choice',
    choices: [
      'Suporte Redes Alpha',
      'Suporte Hardware Alpha',
      'Segurança da Informação Alpha',
      'Gestão de Acessos Alpha',
      'Suporte VIP Alpha',
      'Sistemas & Banco de Dados Beta',
      'Telefonia & VoIP Beta',
      'Onboarding & Integração Beta',
      'Mudanças & Instalações Beta',
      'Compras & Licenciamento Beta'
    ]
  },
  assigned_to_name: {
    label: 'Analista Responsável',
    type: 'text'
  },
  category_l1: {
    label: 'Categoria N1 (Grupo)',
    type: 'choice',
    choices: [
      'Infraestrutura de Rede',
      'Hardware & Desktops',
      'Segurança da Informação',
      'Sistemas & ERP',
      'Telefonia e VoIP',
      'Integração de Novos Colaboradores',
      'Mudança e Movimentação',
      'Compras e Licenciamento'
    ]
  },
  category_l2: {
    label: 'Categoria N2 (Serviço)',
    type: 'text'
  },
  category_l3: {
    label: 'Categoria N3 (Sintoma)',
    type: 'text'
  },
  causa: {
    label: 'Causa do Incidente / Pendência',
    type: 'choice',
    choices: ['Links', 'Acessos', 'TOTVS', 'Outros']
  },
  title: {
    label: 'Título / Assunto',
    type: 'text'
  },
  description: {
    label: 'Descrição',
    type: 'text'
  },
  created_at: {
    label: 'Data de Criação',
    type: 'date'
  },
  closed_at: {
    label: 'Data de Fechamento',
    type: 'date'
  },
  updated_at: {
    label: 'Última Atualização',
    type: 'date'
  },
  time_to_resolution_minutes: {
    label: 'Tempo para Resolução (Minutos)',
    type: 'number'
  },
  aging_days: {
    label: 'Aging (Dias em Aberto)',
    type: 'number'
  }
}

const OPERATORS_BY_TYPE: Record<FieldType, { value: string; label: string }[]> = {
  choice: [
    { value: 'equals', label: 'É' },
    { value: 'not_equals', label: 'É Diferente' },
    { value: 'in', label: 'Um de' }
  ],
  text: [
    { value: 'contains', label: 'Contém' },
    { value: 'not_contains', label: 'Não Contém' },
    { value: 'starts_with', label: 'Começa Com' },
    { value: 'is_empty', label: 'Está Vazio' }
  ],
  date: [
    { value: 'today', label: 'Hoje' },
    { value: 'last_30_days', label: 'Últimos 30 Dias' },
    { value: 'between', label: 'Entre' }
  ],
  number: [
    { value: 'equals', label: 'Igual a' },
    { value: 'not_equals', label: 'Diferente de' },
    { value: 'greater_than', label: 'Maior que' },
    { value: 'less_than', label: 'Menor que' }
  ]
}

interface Condition {
  id: string
  field: string
  operator: string
  value: string
  value2?: string
}

export type VisualizationType = 'scorecard' | 'bar_chart' | 'donut_chart' | 'data_table' | 'line_chart' | 'aging_report' | 'heatmap'

export interface VisualizationConfig {
  type: VisualizationType
  groupBy?: string
  subGroupBy?: string
}

interface BIReport {
  id: string
  name: string
  chart_type: string
  query_config: {
    dateRange: string
    metricType: string
    conditions: Condition[]
    visualization?: VisualizationConfig
    is_pinned?: boolean
  }
  is_public: boolean
  created_at: string
}

interface TicketBI {
  id: string
  number: string
  short_description: string
  created_at: string
  resolved_at: string | null
  closed_at: string | null
  state: string
  ticket_type: 'incident' | 'request'
  sla_breached: boolean
  priority_level: number
  assigned_group_name: string | null
  category: string
  company_id: string
  catalog_services: { name: string } | null
  system_symptoms: { name: string } | null
  caller_name: string | null
  impact?: string | null
  urgency?: string | null
  description?: string | null
  assigned_to_name?: string | null
  updated_at?: string | null
  is_response_breached?: boolean | null
}

interface TicketBIExtended extends TicketBI {
  client: string
  clientId: string
  causa: string
  agingDays: number
  agingGroup: '0-1 Dia' | '2-3 Dias' | '+3 Dias'
  timeToResolutionMinutes: number
}



// Enriquecimento do chamado com o CLIENTE REAL (empresa dona do chamado,
// resolvida pelo company_id contra a lista de empresas do Supabase) + a causa
// inferida e o aging. Sem dados fictícios.
const enrichTicket = (t: TicketBI, companyNameById: Record<string, string>): TicketBIExtended => {
  const clientId = t.company_id
  const client = companyNameById[t.company_id] || 'Cliente não identificado'

  let causa = 'Outros'
  const desc = (t.short_description || '').toLowerCase()
  const cat = (t.category || '').toLowerCase()
  if (desc.includes('link') || desc.includes('wi-fi') || desc.includes('wifi') || desc.includes('vpn') || desc.includes('internet') || desc.includes('rede') || cat.includes('network') || cat.includes('rede')) {
    causa = 'Links'
  } else if (desc.includes('acesso') || desc.includes('senha') || desc.includes('permissao') || desc.includes('bloqueio') || desc.includes('login') || desc.includes('crachá') || cat.includes('segurança') || cat.includes('security')) {
    causa = 'Acessos'
  } else if (desc.includes('erp') || desc.includes('nota fiscal') || desc.includes('banco') || desc.includes('faturamento') || desc.includes('totvs') || desc.includes('timeout') || cat.includes('software') || cat.includes('sistema')) {
    causa = 'TOTVS'
  }

  const createdDate = new Date(t.created_at)
  const refDate = t.resolved_at ? new Date(t.resolved_at) : (t.closed_at ? new Date(t.closed_at) : new Date())
  const diffTime = Math.max(0, refDate.getTime() - createdDate.getTime())
  const agingDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  let agingGroup: '0-1 Dia' | '2-3 Dias' | '+3 Dias' = '0-1 Dia'
  if (agingDays > 3) agingGroup = '+3 Dias'
  else if (agingDays >= 2) agingGroup = '2-3 Dias'

  let timeToResolutionMinutes = 0
  if (t.resolved_at) {
    timeToResolutionMinutes = Math.max(0, Math.floor((new Date(t.resolved_at).getTime() - createdDate.getTime()) / 60000))
  }

  return {
    ...t,
    client,
    clientId,
    causa,
    agingDays,
    agingGroup,
    timeToResolutionMinutes
  }
}

const getFieldValue = (ticket: TicketBIExtended, field: string): string | number | boolean | null => {
  if (field === 'current_status') return ticket.state
  if (field === 'priority_level') return ticket.priority_level
  if (field === 'ticket_type') return ticket.ticket_type
  if (field === 'impact') return ticket.impact ?? ''
  if (field === 'urgency') return ticket.urgency ?? ''
  if (field === 'sla_response_status') return ticket.is_response_breached ? 'Estourado' : 'No Prazo'
  if (field === 'sla_resolution_status') return ticket.sla_breached ? 'Estourado' : 'No Prazo'
  if (field === 'client') return ticket.client
  if (field === 'causa') return ticket.causa
  if (field === 'assigned_group_name') return ticket.assigned_group_name || 'Não Atribuído'
  if (field === 'assigned_to_name') return ticket.assigned_to_name || 'Não Atribuído'
  if (field === 'category_l1') return ticket.category || 'Outros'
  if (field === 'category_l2') return ticket.catalog_services?.name || 'Geral'
  if (field === 'category_l3') return ticket.system_symptoms?.name || 'Geral'
  if (field === 'title') return ticket.short_description ?? ''
  if (field === 'description') return ticket.description ?? ''
  if (field === 'created_at') return ticket.created_at
  if (field === 'closed_at') return ticket.closed_at
  if (field === 'updated_at') return ticket.updated_at ?? ''
  if (field === 'time_to_resolution_minutes') return ticket.timeToResolutionMinutes
  if (field === 'aging_days') return ticket.agingDays
  return null
}

const matchCondition = (ticket: TicketBIExtended, cond: Condition): boolean => {
  if (!cond.field) return true

  const config = FIELD_SCHEMA[cond.field]
  if (!config) return true

  // 'client' filtra pelo ID real da empresa (o dropdown usa value=id);
  // os demais campos (e o agrupamento dos gráficos) seguem por valor legível.
  const fieldValue = cond.field === 'client' ? ticket.clientId : getFieldValue(ticket, cond.field)

  const valCompare = cond.value.toLowerCase()

  if (config.type === 'choice') {
    const actStr = String(fieldValue ?? '').toLowerCase()
    if (cond.operator === 'equals') {
      return actStr === valCompare
    }
    if (cond.operator === 'not_equals') {
      return actStr !== valCompare
    }
    if (cond.operator === 'in') {
      const parts = valCompare.split(',').map(p => p.trim()).filter(Boolean)
      return parts.length === 0 ? true : parts.includes(actStr)
    }
  }

  if (config.type === 'text') {
    const actStr = String(fieldValue ?? '').toLowerCase()
    if (cond.operator === 'contains') {
      return actStr.includes(valCompare)
    }
    if (cond.operator === 'not_contains') {
      return !actStr.includes(valCompare)
    }
    if (cond.operator === 'starts_with') {
      return actStr.startsWith(valCompare)
    }
    if (cond.operator === 'is_empty') {
      return !fieldValue || String(fieldValue).trim() === '' || fieldValue === 'Não Atribuído'
    }
  }

  if (config.type === 'date') {
    if (!fieldValue) return cond.operator === 'is_empty'
    const itemDate = new Date(fieldValue as string)
    const today = new Date()
    
    if (cond.operator === 'today') {
      return itemDate.toDateString() === today.toDateString()
    }
    if (cond.operator === 'last_30_days') {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return itemDate >= thirtyDaysAgo && itemDate <= today
    }
    if (cond.operator === 'between') {
      if (!cond.value) return true
      const start = new Date(cond.value + 'T00:00:00')
      const end = cond.value2 ? new Date(cond.value2 + 'T23:59:59') : new Date()
      return itemDate >= start && itemDate <= end
    }
  }

  if (config.type === 'number') {
    const actNum = Number(fieldValue ?? 0)
    const valNum = Number(cond.value ?? 0)
    if (cond.operator === 'equals') return actNum === valNum
    if (cond.operator === 'not_equals') return actNum !== valNum
    if (cond.operator === 'greater_than') return actNum > valNum
    if (cond.operator === 'less_than') return actNum < valNum
  }

  return true
}

export default function FlowfyBI() {
  const { branding, tenant } = useTenant()
  const { company, session, role, isProvider } = useAuth()
  const { toast } = useToast()
  const primaryColor = branding.primaryColor

  const [dateRange, setDateRange] = useState('last_30_days')
  const [metricType, setMetricType] = useState('all')

  const [conditions, setConditions] = useState<Condition[]>([])
  
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('scorecard')
  const [visualizationGroupBy, setVisualizationGroupBy] = useState<string>('current_status')
  const [visualizationSubGroupBy, setVisualizationSubGroupBy] = useState<string>('')
  
  const [executedVisConfig, setExecutedVisConfig] = useState<VisualizationConfig | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [rawTickets, setRawTickets] = useState<TicketBI[]>([])
  const [filteredTickets, setFilteredTickets] = useState<TicketBIExtended[]>([])
  const [companiesMap, setCompaniesMap] = useState<Record<string, string>>({})

  const [savedReports, setSavedReports] = useState<BIReport[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [newReportName, setNewReportName] = useState('')
  const [newReportIsPublic, setNewReportIsPublic] = useState(false)
  const [newReportIsPinned, setNewReportIsPinned] = useState(false)
  const [savingReport, setSavingReport] = useState(false)

  const [hoveredSlice, setHoveredSlice] = useState<{ label: string; count: number; percent: number } | null>(null)
  const [drillDownData, setDrillDownData] = useState<{ label: string; tickets: TicketBIExtended[] } | null>(null)

  const currentNow = useMemo(() => Date.now(), [])

  const dynamicFieldSchema = useMemo(() => {
    const schema = { ...FIELD_SCHEMA }
    if (isProvider) {
      schema.client = {
        ...schema.client,
        // Opções vindas EXCLUSIVAMENTE das empresas reais do banco:
        // value = id real (usado no filtro/RLS), label = name real (exibido).
        choices: Object.entries(companiesMap)
          .map(([id, name]) => ({ value: id, label: name }))
          .sort((a, b) => a.label.localeCompare(b.label))
      }
    } else {
      delete schema['client'] // Esconde do tenant comum
    }
    return schema
  }, [isProvider, companiesMap])

  const fetchRawMetrics = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    setError(null)
    try {
      const data = await biService.getMetricsAndChartData(company.id, dateRange, metricType)
      const allCompanies = await companiesService.list()
      const cMap: Record<string, string> = {}
      allCompanies.forEach(c => {
        cMap[c.id] = c.name
      })
      setCompaniesMap(cMap)

      setRawTickets(data.tickets as TicketBI[])
    } catch (err: unknown) {
      console.error(err)
      setError('Erro ao extrair dados de performance do banco.')
    } finally {
      setLoading(false)
    }
  }, [company, dateRange, metricType])

  const fetchSavedReports = useCallback(async () => {
    if (!company?.id) return
    try {
      const reports = await biService.listReports(company.id)
      setSavedReports(reports as BIReport[])
    } catch (err: unknown) {
      console.error('Erro ao listar relatórios salvos:', err)
    }
  }, [company])

  useEffect(() => {
    void fetchRawMetrics()
    void fetchSavedReports()
  }, [fetchRawMetrics, fetchSavedReports])

  const handleApplyLocalFilters = useCallback(() => {
    const enriched = rawTickets.map(t => enrichTicket(t, companiesMap))
    
    if (conditions.length === 0) {
      setFilteredTickets(enriched)
      return
    }

    const filtered = enriched.filter(ticket => {
      return conditions.every(cond => matchCondition(ticket, cond))
    })

    setFilteredTickets(filtered)
  }, [conditions, rawTickets, companiesMap])

  const handleExecute = () => {
    handleApplyLocalFilters()
    setExecutedVisConfig({
      type: visualizationType,
      groupBy: visualizationGroupBy,
      subGroupBy: visualizationSubGroupBy
    })
  }

  useEffect(() => {
    handleApplyLocalFilters()
  }, [rawTickets, handleApplyLocalFilters])

  const handleAddCondition = () => {
    const newCond: Condition = {
      id: Math.random().toString(36).substring(2, 9),
      field: 'current_status',
      operator: 'equals',
      value: '',
      value2: ''
    }
    setConditions([...conditions, newCond])
  }

  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id))
  }

  const handleConditionChange = (id: string, key: keyof Condition, val: string) => {
    setConditions(conditions.map(c => {
      if (c.id === id) {
        if (key === 'field') {
          const config = FIELD_SCHEMA[val]
          const operators = OPERATORS_BY_TYPE[config.type]
          return { 
            ...c, 
            [key]: val, 
            operator: operators[0].value, 
            value: '', 
            value2: '' 
          }
        }
        return { ...c, [key]: val }
      }
      return c
    }))
  }

  const handleClearConditions = () => {
    setConditions([])
    const enriched = rawTickets.map(t => enrichTicket(t, companiesMap))
    setFilteredTickets(enriched)
  }

  const handleLoadReport = (report: BIReport) => {
    setDateRange(report.query_config.dateRange)
    setMetricType(report.query_config.metricType)
    if (report.query_config.conditions) {
      setConditions(report.query_config.conditions)
    } else {
      setConditions([])
    }
    
    if (report.query_config.visualization) {
      setVisualizationType(report.query_config.visualization.type)
      setVisualizationGroupBy(report.query_config.visualization.groupBy || 'current_status')
      setExecutedVisConfig(report.query_config.visualization)
    } else {
      setVisualizationType('scorecard')
      setExecutedVisConfig(null)
    }
  }

  const handleSaveReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReportName.trim()) { toast.error('Informe um nome para o relatório.'); return }
    if (!company?.id) { toast.error('Empresa não identificada na sessão. Recarregue a página.'); return }
    if (!session?.user?.id) { toast.error('Sessão de usuário inválida. Refaça o login para salvar.'); return }

    setSavingReport(true)
    try {
      await biService.saveReport({
        company_id: company.id,
        name: newReportName.trim(),
        chart_type: executedVisConfig?.type || 'scorecard',
        query_config: { 
          dateRange, 
          metricType, 
          conditions,
          visualization: executedVisConfig,
          is_pinned: newReportIsPinned
        },
        created_by: session.user.id,
        is_public: newReportIsPublic,
      })
      toast.success(`Relatório "${newReportName.trim()}" salvo com sucesso!`)
      setNewReportName('')
      setNewReportIsPublic(false)
      setShowSaveModal(false)
      void fetchSavedReports()
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string')
          ? (err as { message: string }).message
          : String(err)
      console.error('[FlowfyBI] Falha ao salvar relatório em bi_saved_reports:', err)
      toast.error(`Falha ao salvar relatório: ${msg}`)
    } finally {
      setSavingReport(false)
    }
  }

  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Excluir este relatório do BI?')) return
    try {
      await biService.deleteReport(id)
      toast.success('Relatório excluído.')
      void fetchSavedReports()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[FlowfyBI] Falha ao excluir relatório:', err)
      toast.error(`Erro ao excluir relatório: ${msg}`)
    }
  }

  const totalFiltered = filteredTickets.length

  const handleExportCSV = () => {
    if (filteredTickets.length === 0) {
      toast.error('Nenhum dado para exportar.')
      return
    }
    const headers = ['Número', 'Título', 'Status', 'Criado em', 'Resolvido em', 'Tempo Resolução (Min)', 'Cliente', 'Prioridade', 'Grupo Solucionador', 'Categoria']
    const rows = filteredTickets.map(t => [
      t.number,
      `"${(t.short_description || '').replace(/"/g, '""')}"`,
      t.state,
      new Date(t.created_at).toLocaleString(),
      t.resolved_at ? new Date(t.resolved_at).toLocaleString() : '',
      t.timeToResolutionMinutes || 0,
      `"${t.client}"`,
      t.priority_level,
      `"${t.assigned_group_name || ''}"`,
      `"${t.category || ''}"`
    ])
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `relatorio_flowfy_bi_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDrillDown = (label: string, fieldKey: string) => {
    const sliceTickets = filteredTickets.filter(t => {
      let val = getFieldValue(t, fieldKey)
      if (val === null || val === '') val = 'Não Definido'
      return String(val) === label
    })
    setDrillDownData({ label, tickets: sliceTickets })
  }

  const renderCanvas = () => {
    if (!executedVisConfig) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-white border border-dashed border-[#e1dfdd] rounded-lg p-8">
          <Layers className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm font-semibold">Nenhuma visualização executada</p>
          <p className="text-xs mt-1 text-center">Configure os filtros, escolha o visual no painel esquerdo e clique em <b>Executar Query</b>.</p>
        </div>
      )
    }

    if (executedVisConfig.type === 'scorecard') {
      return (
        <div className="bg-white border border-[#e1dfdd] rounded-sm p-8 shadow-2xs flex flex-col items-center justify-center min-h-[300px]">
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider block mb-2">Volume Filtrado (Scorecard)</span>
          <div className="text-[120px] leading-none font-extrabold tracking-tight text-[#12239E]">
            {loading ? <span className="text-slate-300">...</span> : totalFiltered}
          </div>
          <span className="text-xs text-slate-400 block mt-4">Registros correspondentes ao filtro atual</span>
        </div>
      )
    }

    if (executedVisConfig.type === 'data_table') {
      return (
        <div className="bg-white border border-[#e1dfdd] rounded-sm shadow-2xs flex flex-col flex-1 min-h-0">
          <div className="p-5 border-b border-[#e1dfdd] flex items-center justify-between bg-slate-50/70 shrink-0">
            <div>
              <h3 className="text-3xl font-bold text-slate-700 uppercase tracking-wider">Tabela de Dados</h3>
              <p className="text-xs text-slate-400 mt-1">Detalhamento analítico dos registros filtrados</p>
            </div>
            <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-0.5 rounded">
              {totalFiltered} registros
            </span>
          </div>
          <div className="overflow-auto flex-1 p-0">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10 shadow-sm">
                <tr className="border-b border-[#e1dfdd] text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4">Número</th>
                  <th className="py-2.5 px-4">Descrição</th>
                  <th className="py-2.5 px-4">Tipo</th>
                  <th className="py-2.5 px-4">Prioridade</th>
                  <th className="py-2.5 px-4">Grupo Solucionador</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">SLA</th>
                  <th className="py-2.5 px-4">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1dfdd] text-slate-700">
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400 italic">Processando informações...</td></tr>
                ) : filteredTickets.length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400 italic">Nenhum registro encontrado.</td></tr>
                ) : (
                  filteredTickets.map(ticket => {
                    const createdDate = new Date(ticket.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    return (
                      <tr key={ticket.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900 font-mono">{ticket.number || 'N/A'}</td>
                        <td className="py-2.5 px-4 max-w-xs truncate font-medium">{ticket.short_description || 'Sem descrição'}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${ticket.ticket_type === 'incident' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                            {ticket.ticket_type === 'incident' ? 'Incidente' : 'Requisição'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`font-bold ${ticket.priority_level === 1 ? 'text-red-600' : ticket.priority_level === 2 ? 'text-orange-500' : 'text-slate-500'}`}>
                            P{ticket.priority_level}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 font-medium">{ticket.assigned_group_name || 'Não Atribuído'}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-600">{ticket.state}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${ticket.sla_breached ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                            {ticket.sla_breached ? 'Estourado' : 'No Prazo'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 font-medium">{createdDate}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (executedVisConfig.type === 'donut_chart' || executedVisConfig.type === 'bar_chart') {
      const fieldKey = executedVisConfig.groupBy || 'current_status'
      const fieldLabel = FIELD_SCHEMA[fieldKey]?.label || fieldKey
      
      const counts: Record<string, { total: number; subs: Record<string, number> }> = {}
      filteredTickets.forEach(t => {
        let val = getFieldValue(t, fieldKey)
        if (val === null || val === '') val = 'Não Definido'
        const strVal = String(val)
        
        if (!counts[strVal]) counts[strVal] = { total: 0, subs: {} }
        counts[strVal].total++

        if (executedVisConfig.subGroupBy) {
           let sVal = getFieldValue(t, executedVisConfig.subGroupBy)
           if (sVal === null || sVal === '') sVal = 'Não Definido'
           const sStrVal = String(sVal)
           counts[strVal].subs[sStrVal] = (counts[strVal].subs[sStrVal] || 0) + 1
        }
      })

      const sortedData = Object.entries(counts)
        .map(([label, c]) => ({ label, count: c.total, subs: c.subs }))
        .sort((a, b) => b.count - a.count)

      if (sortedData.length === 0) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-white border border-[#e1dfdd] rounded-sm p-8 shadow-2xs">
            <span className="italic text-xs">Sem dados registrados para este agrupamento.</span>
          </div>
        )
      }

      if (executedVisConfig.type === 'donut_chart') {
        const colorsList = ['#118DFF', '#E66C37', '#14b8a6', '#f59e0b', '#12239E', '#94a3b8', '#ec4899', '#8b5cf6', '#64748b', '#0ea5e9']
        let accumulatedPercent = 0
        const total = sortedData.reduce((acc, c) => acc + c.count, 0)
        
        const slices = sortedData.map((d, idx) => {
          const percent = total > 0 ? d.count / total : 0
          const strokeDasharray = 314.16
          const strokeDashoffset = strokeDasharray - (percent * strokeDasharray)
          const rotation = (accumulatedPercent * 360) - 90
          accumulatedPercent += percent
          return { ...d, percent, strokeDasharray, strokeDashoffset, rotation, color: colorsList[idx % colorsList.length] }
        })

        return (
          <div className="bg-white border border-[#e1dfdd] rounded-sm p-8 shadow-2xs flex flex-col flex-1 min-h-[400px]">
            <h3 className="text-3xl font-bold text-slate-700 uppercase tracking-wider mb-1">Gráfico de Rosca</h3>
            <p className="text-xs text-slate-400 mb-8">Agrupado por: <span className="font-bold text-slate-600">{fieldLabel}</span></p>
            
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">Processando...</div>
            ) : (
              <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24 min-h-0">
                <div className="relative w-72 h-72 shrink-0">
                  <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible drop-shadow-sm">
                    {slices.map((slice, idx) => {
                      if (slice.percent === 0) return null
                      return (
                        <circle
                          key={idx}
                          cx="60"
                          cy="60"
                          r="45"
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth="22"
                          strokeDasharray={slice.strokeDasharray}
                          strokeDashoffset={slice.strokeDashoffset}
                          transform={`rotate(${slice.rotation} 60 60)`}
                          className="cursor-pointer hover:opacity-85 transition-opacity"
                          onClick={() => handleDrillDown(slice.label, fieldKey)}
                          onMouseEnter={() => setHoveredSlice({ label: slice.label, count: slice.count, percent: slice.percent })}
                          onMouseLeave={() => setHoveredSlice(null)}
                        />
                      )
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
                    <span className="text-4xl font-extrabold text-slate-700 mt-1">{total}</span>
                  </div>
                </div>

                <div className="w-full lg:max-w-md space-y-2 text-xs overflow-y-auto max-h-[300px] pr-2">
                  {slices.map((slice, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: slice.color }} />
                        <span className="font-bold text-slate-700 truncate">{slice.label}</span>
                      </div>
                      <div className="text-right shrink-0 ml-4 flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 text-sm">{slice.count}</span>
                        <span className="text-slate-400 text-[10px] w-8 text-right">({Math.round(slice.percent * 100)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hoveredSlice && (
              <div className="fixed z-50 bg-slate-900 text-white rounded-lg p-3 shadow-xl text-xs pointer-events-none border border-slate-700 animate-in fade-in duration-100" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                <div className="font-bold text-[13px]">{hoveredSlice.label}</div>
                <div className="text-[11px] text-slate-300 mt-1">{hoveredSlice.count} registros ({Math.round(hoveredSlice.percent * 100)}%)</div>
              </div>
            )}
          </div>
        )
      }

      if (executedVisConfig.type === 'bar_chart') {
        const maxVal = Math.max(...sortedData.map(c => c.count), 1)
        return (
          <div className="bg-white border border-[#e1dfdd] rounded-sm p-8 shadow-2xs flex flex-col flex-1 min-h-[400px]">
            <h3 className="text-3xl font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-slate-500" />
              Gráfico de Barras
            </h3>
            <p className="text-xs text-slate-400 mb-8">Agrupado por: <span className="font-bold text-slate-600">{fieldLabel}</span></p>
            
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">Processando...</div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-5 pr-2">
                {sortedData.map((c, i) => {
                  const percent = (c.count / maxVal) * 100
                  return (
                    <div key={i} className="space-y-1.5 group">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span className="truncate pr-4 font-bold">{c.label}</span>
                        <span className="shrink-0">{c.count} registros</span>
                      </div>
                      <div 
                        className="w-full bg-slate-100 rounded-sm h-7 overflow-hidden flex items-center cursor-pointer group-hover:ring-1 ring-slate-300 relative"
                        onClick={() => handleDrillDown(c.label, fieldKey)}
                      >
                        {executedVisConfig.subGroupBy && Object.keys(c.subs).length > 0 ? (
                          <div className="w-full h-full flex">
                            {Object.entries(c.subs).map(([sLabel, sCount], sIdx) => {
                              const sPercent = (sCount / maxVal) * 100
                              const subColors = ['#118DFF', '#E66C37', '#14b8a6', '#f59e0b', '#12239E', '#94a3b8']
                              return (
                                <div 
                                  key={sLabel} 
                                  title={`${sLabel}: ${sCount}`}
                                  className="h-full border-r border-white/20 transition-all duration-500 hover:brightness-110" 
                                  style={{ width: `${Math.max(sPercent, 0)}%`, backgroundColor: subColors[sIdx % subColors.length] }}
                                />
                              )
                            })}
                          </div>
                        ) : (
                          <div 
                            className="bg-[#118DFF] group-hover:bg-[#12239E] h-full rounded-sm transition-all duration-500 ease-out" 
                            style={{ width: `${Math.max(percent, 1)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      }
    }

    if (executedVisConfig.type === 'line_chart') {
      const datesMap: Record<string, { created: number; resolved: number; timestamp: number }> = {}
      filteredTickets.forEach(t => {
        const cd = new Date(t.created_at)
        const cKey = cd.toISOString().split('T')[0]
        if (!datesMap[cKey]) datesMap[cKey] = { created: 0, resolved: 0, timestamp: cd.getTime() }
        datesMap[cKey].created++
        
        if (t.resolved_at) {
          const rd = new Date(t.resolved_at)
          const rKey = rd.toISOString().split('T')[0]
          if (!datesMap[rKey]) datesMap[rKey] = { created: 0, resolved: 0, timestamp: rd.getTime() }
          datesMap[rKey].resolved++
        }
      })

      const trendData = Object.values(datesMap)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(d => ({
          label: new Date(d.timestamp).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
          created: d.created,
          resolved: d.resolved
        }))

      const maxVal = Math.max(...trendData.map(d => Math.max(d.created, d.resolved)), 1)
      const width = 800
      const height = 200
      const padding = 20
      const xStep = (width - padding * 2) / Math.max(trendData.length - 1, 1)

      const getPoints = (key: 'created' | 'resolved') => trendData.map((d, i) => {
        const x = padding + i * xStep
        const y = height - padding - (d[key] / maxVal) * (height - padding * 2)
        return `${x},${y}`
      }).join(' ')

      return (
        <div className="bg-white border border-[#e1dfdd] rounded-sm p-8 shadow-2xs flex flex-col flex-1 min-h-[400px]">
          <h3 className="text-3xl font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Layers className="w-6 h-6 text-slate-500" />
            Tendência Temporal (Burn-down)
          </h3>
          <p className="text-xs text-slate-400 mb-8">Criados vs Resolvidos por dia</p>
          
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">Processando...</div>
          ) : trendData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">Sem dados no período</div>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-6 overflow-x-auto">
              <div className="flex gap-6 mb-2 justify-center text-xs font-bold">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Criados ({trendData.reduce((acc, d) => acc + d.created, 0)})</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Resolvidos ({trendData.reduce((acc, d) => acc + d.resolved, 0)})</div>
              </div>
              <div className="min-w-[600px] w-full">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
                  {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                    const y = height - padding - pct * (height - padding * 2)
                    return <line key={pct} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
                  })}
                  <polyline points={getPoints('created')} fill="none" stroke="#3b82f6" strokeWidth="3" className="drop-shadow-sm" />
                  <polyline points={getPoints('resolved')} fill="none" stroke="#10b981" strokeWidth="3" className="drop-shadow-sm" />
                  {trendData.map((d, i) => {
                    const x = padding + i * xStep
                    const yC = height - padding - (d.created / maxVal) * (height - padding * 2)
                    const yR = height - padding - (d.resolved / maxVal) * (height - padding * 2)
                    return (
                      <g key={i}>
                        <circle cx={x} cy={yC} r="4" fill="#fff" stroke="#3b82f6" strokeWidth="2" />
                        <circle cx={x} cy={yR} r="4" fill="#fff" stroke="#10b981" strokeWidth="2" />
                        <text x={x} y={height} fontSize="10" fill="#64748b" textAnchor="middle" dy="15">{d.label}</text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          )}
        </div>
      )
    }

    if (executedVisConfig.type === 'aging_report') {
      const openTickets = filteredTickets.filter(t => !t.resolved_at && !t.closed_at)
      const buckets = [
        { label: '0-2 dias', min: 0, max: 2, count: 0, color: '#10b981' },
        { label: '3-5 dias', min: 3, max: 5, count: 0, color: '#f59e0b' },
        { label: '6-15 dias', min: 6, max: 15, count: 0, color: '#f97316' },
        { label: '+15 dias', min: 16, max: 99999, count: 0, color: '#ef4444' }
      ]
      const now = currentNow
      openTickets.forEach(t => {
        const days = Math.floor((now - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24))
        const b = buckets.find(b => days >= b.min && days <= b.max)
        if (b) b.count++
      })
      const maxVal = Math.max(...buckets.map(b => b.count), 1)

      return (
        <div className="bg-white border border-[#e1dfdd] rounded-sm p-8 shadow-2xs flex flex-col flex-1 min-h-[400px]">
          <h3 className="text-3xl font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-slate-500" />
            Aging Report
          </h3>
          <p className="text-xs text-slate-400 mb-8">Envelhecimento do Backlog (Apenas chamados abertos)</p>
          
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">Processando...</div>
          ) : openTickets.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">Nenhum chamado em aberto no backlog.</div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-5 pr-2 mt-4">
              {buckets.map((b, i) => {
                const percent = (b.count / maxVal) * 100
                return (
                  <div key={i} className="space-y-1.5 group">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span className="truncate pr-4 font-bold">{b.label}</span>
                      <span className="shrink-0">{b.count} chamados ({Math.round(b.count / openTickets.length * 100)}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-sm h-7 overflow-hidden flex items-center shadow-inner">
                      <div 
                        className="h-full rounded-sm transition-all duration-500 ease-out" 
                        style={{ width: `${Math.max(percent, 1)}%`, backgroundColor: b.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    if (executedVisConfig.type === 'heatmap') {
      const groupsMap: Record<string, { breached: number, met: number }> = {}
      
      filteredTickets.forEach(t => {
        const group = t.assigned_group_name || 'Sem Grupo'
        if (!groupsMap[group]) groupsMap[group] = { breached: 0, met: 0 }
        
        if (t.sla_breached) groupsMap[group].breached++
        else groupsMap[group].met++
      })

      const groupNames = Object.keys(groupsMap).sort()
      const maxCount = Math.max(...groupNames.flatMap(g => [groupsMap[g].breached, groupsMap[g].met]), 1)

      return (
        <div className="bg-white border border-[#e1dfdd] rounded-sm p-8 shadow-2xs flex flex-col flex-1 min-h-[400px]">
          <h3 className="text-3xl font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-slate-500" />
            SLA Heatmap
          </h3>
          <p className="text-xs text-slate-400 mb-8">Grupos Solucionadores vs Violação de SLA</p>
          
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">Processando...</div>
          ) : groupNames.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">Sem dados no período</div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr>
                    <th className="p-3 text-left font-bold text-slate-500 uppercase w-1/3">Grupo Solucionador</th>
                    <th className="p-3 text-center font-bold text-emerald-600 uppercase w-1/3">SLA no Prazo</th>
                    <th className="p-3 text-center font-bold text-red-600 uppercase w-1/3">SLA Violado</th>
                  </tr>
                </thead>
                <tbody>
                  {groupNames.map(group => {
                    const data = groupsMap[group]
                    return (
                      <tr key={group} className="border-t border-slate-100 group-hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700 truncate max-w-[150px]" title={group}>{group}</td>
                        <td className="p-1">
                          <div 
                            className="h-10 rounded-sm flex items-center justify-center font-bold transition-all hover:ring-2 ring-slate-300"
                            style={{ 
                              backgroundColor: data.met === 0 ? '#f8fafc' : `rgba(16, 185, 129, ${0.1 + (data.met / maxCount) * 0.9})`,
                              color: data.met > maxCount * 0.5 ? 'white' : '#059669'
                            }}
                          >
                            {data.met}
                          </div>
                        </td>
                        <td className="p-1">
                          <div 
                            className="h-10 rounded-sm flex items-center justify-center font-bold transition-all hover:ring-2 ring-slate-300"
                            style={{ 
                              backgroundColor: data.breached === 0 ? '#f8fafc' : `rgba(239, 68, 68, ${0.1 + (data.breached / maxCount) * 0.9})`,
                              color: data.breached > maxCount * 0.5 ? 'white' : '#dc2626'
                            }}
                          >
                            {data.breached}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-140px)] bg-[#f3f2f1] text-[#252423] font-sans antialiased">
      <aside className="w-80 border-r border-[#e1dfdd] bg-white p-5 flex flex-col gap-5 select-none shadow-xs shrink-0">
        <div>
          <h2 className="text-xs font-bold text-[#323130] uppercase tracking-wider flex items-center gap-1.5">
            <ListFilter className="w-4 h-4 text-slate-500" />
            FlowFY BI Builder
          </h2>
          <p className="text-[10px] text-slate-400 mt-0.5">Definição reativa de regras ITSM</p>
        </div>

        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 border-b border-[#f3f2f1]">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Condições Ativas</span>
            {conditions.length > 0 && (
              <button 
                onClick={handleClearConditions}
                className="text-[10px] font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
              >
                Limpar Tudo
              </button>
            )}
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            {conditions.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-[#e1dfdd] rounded-lg text-xs text-slate-400">
                Sem regras de filtragem aplicadas.
              </div>
            ) : (
              conditions.map(cond => {
                const config = dynamicFieldSchema[cond.field] || FIELD_SCHEMA[cond.field]
                const operators = config ? OPERATORS_BY_TYPE[config.type] : []

                return (
                  <div key={cond.id} className="p-3 bg-[#f8f9fa] border border-[#e1dfdd] rounded-lg space-y-2 relative group">
                    <button 
                      onClick={() => handleRemoveCondition(cond.id)}
                      className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Campo</label>
                      <select
                        value={cond.field}
                        onChange={e => handleConditionChange(cond.id, 'field', e.target.value)}
                        className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        {Object.entries(dynamicFieldSchema).map(([key, f]) => (
                          <option key={key} value={key}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Operador</label>
                      <select
                        value={cond.operator}
                        onChange={e => handleConditionChange(cond.id, 'operator', e.target.value)}
                        className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        {operators.map(op => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    </div>

                    {cond.operator !== 'is_empty' && cond.operator !== 'today' && cond.operator !== 'last_30_days' && (
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Valor</label>
                        {config?.type === 'choice' && cond.operator !== 'in' ? (
                          <select
                            value={cond.value}
                            onChange={e => handleConditionChange(cond.id, 'value', e.target.value)}
                            className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none"
                          >
                            <option value="">Selecione...</option>
                            {config.choices?.map(opt => {
                              const val = typeof opt === 'string' ? opt : opt.value
                              const lbl = typeof opt === 'string' ? opt : opt.label
                              return <option key={val} value={val}>{lbl}</option>
                            })}
                          </select>
                        ) : cond.operator === 'between' ? (
                          <div className="space-y-1.5">
                            <input
                              type="date"
                              value={cond.value}
                              onChange={e => handleConditionChange(cond.id, 'value', e.target.value)}
                              className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none"
                            />
                            <div className="text-[9px] text-center text-slate-400 font-bold uppercase">Até</div>
                            <input
                              type="date"
                              value={cond.value2 || ''}
                              onChange={e => handleConditionChange(cond.id, 'value2', e.target.value)}
                              className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none"
                            />
                          </div>
                        ) : config?.type === 'date' ? (
                          <input
                            type="date"
                            value={cond.value}
                            onChange={e => handleConditionChange(cond.id, 'value', e.target.value)}
                            className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none"
                          />
                        ) : config?.type === 'number' ? (
                          <input
                            type="number"
                            value={cond.value}
                            onChange={e => handleConditionChange(cond.id, 'value', e.target.value)}
                            className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder={cond.operator === 'in' ? "Valores separados por vírgula" : "Digite o valor..."}
                            value={cond.value}
                            onChange={e => handleConditionChange(cond.id, 'value', e.target.value)}
                            className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="border-t border-[#f3f2f1] pt-4 pb-1 space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Visualização (Widget/Gráfico)</label>
              <select
                value={visualizationType}
                onChange={e => setVisualizationType(e.target.value as VisualizationType)}
                className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
              >
                <option value="scorecard">Contador (Scorecard)</option>
                <option value="line_chart">Tendência (Burn-down)</option>
                <option value="bar_chart">Gráfico de Barras</option>
                <option value="donut_chart">Gráfico de Rosca</option>
                <option value="aging_report">Relatório de Aging</option>
                <option value="heatmap">SLA Heatmap</option>
                <option value="data_table">Tabela de Dados</option>
              </select>
            </div>

            {(visualizationType === 'bar_chart' || visualizationType === 'donut_chart') && (
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Agrupar por</label>
                <select
                  value={visualizationGroupBy}
                  onChange={e => setVisualizationGroupBy(e.target.value)}
                  className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
                >
                  {Object.entries(dynamicFieldSchema).map(([key, f]) => (
                    <option key={key} value={key}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}

            {visualizationType === 'bar_chart' && (
              <div className="mt-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Sub-Agrupamento (Stack)</label>
                <select
                  value={visualizationSubGroupBy}
                  onChange={e => setVisualizationSubGroupBy(e.target.value)}
                  className="w-full bg-white border border-[#e1dfdd] rounded px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
                >
                  <option value="">Nenhum</option>
                  {Object.entries(dynamicFieldSchema).map(([key, f]) => (
                    <option key={key} value={key}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            onClick={handleAddCondition}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#e1dfdd] bg-white text-slate-600 hover:bg-[#f3f2f1] text-xs font-bold transition-all cursor-pointer shadow-2xs mt-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Condição
          </button>

          <button
            onClick={handleExecute}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            Executar Query
          </button>
        </div>

        <div className="bg-[#f8f9fa] border border-[#e1dfdd] rounded-xl p-4 flex flex-col gap-2 min-h-[160px]">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modelos Salvos</h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[160px] pr-1">
            {savedReports.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs italic">Nenhum salvo.</div>
            ) : (
              savedReports.map(report => (
                <div 
                  key={report.id}
                  onClick={() => handleLoadReport(report)}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 cursor-pointer transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                      <span className="truncate">{report.name}</span>
                      {report.query_config.is_pinned && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-[4px] text-[9px] uppercase tracking-wider font-extrabold shrink-0">Pinned</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-400 mt-0.5">
                      {report.is_public ? <Globe className="w-2.5 h-2.5 text-emerald-500" /> : <Lock className="w-2.5 h-2.5 text-slate-400" />}
                      <span>{report.query_config.conditions?.length || 0} regras</span>
                    </div>
                  </div>
                  {(role !== 'agent' || report.is_public === false) && (
                    <button 
                      onClick={(e) => handleDeleteReport(report.id, e)}
                      className="text-slate-400 hover:text-red-500 p-1 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto flex flex-col gap-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#e1dfdd]">
          <div>
            <h1 className="text-5xl font-extrabold text-[#323130] tracking-tight">{tenant?.name || 'Performance Analytics'}</h1>
            <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mt-1.5">Self-Service BI Dashboard</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-[#e1dfdd] rounded px-3 py-1.5 shadow-2xs">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Período de Base:</span>
              <select
                value={dateRange}
                onChange={e => setDateRange(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
              >
                <option value="today">Hoje</option>
                <option value="last_7_days">Últimos 7 dias</option>
                <option value="last_15_days">Últimos 15 dias</option>
                <option value="last_30_days">Últimos 30 dias (Lim. Segurança)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white border border-[#e1dfdd] rounded px-3 py-1.5 shadow-2xs">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Tipo:</span>
              <select
                value={metricType}
                onChange={e => setMetricType(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
              >
                <option value="all">Todos os Chamados</option>
                <option value="incidents">Apenas Incidentes</option>
                <option value="requests">Apenas Requisições</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={handleExportCSV}
                disabled={filteredTickets.length === 0}
                className="bg-white border border-[#e1dfdd] hover:bg-[#f3f2f1] text-[#323130] text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                Exportar CSV
              </button>

              {role !== 'agent' && (
                <button 
                  onClick={() => setShowSaveModal(true)}
                  className="bg-white border border-[#e1dfdd] hover:bg-[#f3f2f1] text-[#323130] text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Save className="w-3.5 h-3.5 text-slate-400" />
                  Salvar Filtro
                </button>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {renderCanvas()}
      </main>

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-6 w-full max-w-md shadow-xl animate-in zoom-in-95 duration-150">
            <h2 className="text-sm font-bold text-slate-800">Salvar Modelo de Filtro</h2>
            <p className="text-xs text-slate-500 mt-1">Grave as configurações das condições e filtros ativos.</p>

            <form onSubmit={handleSaveReportSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nome do Relatório</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Volumetria de Incidentes P1"
                  value={newReportName}
                  onChange={e => setNewReportName(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-xs text-slate-700 bg-white focus:ring-1 focus:ring-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={newReportIsPublic}
                    onChange={e => setNewReportIsPublic(e.target.checked)}
                    className="rounded border-slate-200 text-indigo-600 focus:ring-indigo-500"
                    style={{ accentColor: primaryColor }}
                  />
                  <span className="text-xs font-semibold text-slate-700">Disponibilizar para Analistas (is_public)</span>
                </label>
                <p className="text-[10px] text-slate-400 mt-1 ml-6 leading-relaxed">
                  Quando marcado, o filtro de BI ficará público para visualização no tenant.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={newReportIsPinned}
                    onChange={e => setNewReportIsPinned(e.target.checked)}
                    className="rounded border-slate-200 text-indigo-600 focus:ring-indigo-500"
                    style={{ accentColor: primaryColor }}
                  />
                  <span className="text-xs font-semibold text-slate-700">Fixar no Global Dashboard (Home)</span>
                </label>
                <p className="text-[10px] text-slate-400 mt-1 ml-6 leading-relaxed">
                  Quando marcado, este relatório ganhará destaque como um pin (cartão) no seu Dashboard Inicial.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 text-xs">
                <button 
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={savingReport}
                  className="px-4 py-2 rounded text-white bg-slate-800 hover:bg-slate-700 font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow"
                >
                  {savingReport && <Loader2 className="w-3 h-3 animate-spin" />}
                  Salvar Relatório
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {drillDownData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col w-full max-w-6xl max-h-[90vh] animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-extrabold text-slate-800">
                  Exploração de Dados <span className="text-slate-400 font-medium ml-2">/ {drillDownData.label}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Exibindo {drillDownData.tickets.length} chamados filtrados por esta fatia.
                </p>
              </div>
              <button 
                onClick={() => setDrillDownData(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-bold text-slate-500 uppercase tracking-wider">Número</th>
                      <th className="py-3 px-4 font-bold text-slate-500 uppercase tracking-wider">Título</th>
                      <th className="py-3 px-4 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="py-3 px-4 font-bold text-slate-500 uppercase tracking-wider">Prioridade</th>
                      <th className="py-3 px-4 font-bold text-slate-500 uppercase tracking-wider">Criado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillDownData.tickets.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 group">
                        <td className="py-2.5 px-4 font-medium text-slate-700">
                          <a href={`/agent/ticket/${t.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
                            {t.number}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 truncate max-w-[300px]" title={t.short_description}>
                          {t.short_description}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {t.state}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 font-medium">P{t.priority_level}</td>
                        <td className="py-2.5 px-4 text-slate-500">{new Date(t.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
