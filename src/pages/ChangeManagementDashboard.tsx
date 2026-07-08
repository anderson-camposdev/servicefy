import { useState, useEffect, useMemo } from 'react'
import {
  Shuffle, Plus, Search, FileText, CheckCircle,
  Clock, ChevronLeft, ChevronRight, Filter,
  Check, X, CalendarRange, Users, ClipboardList
} from 'lucide-react'
import { changesService } from '../lib/services'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { useToast } from '../context'
import type { ChangeRow, ChangeType, ChangeRisk } from '../lib/database.types'
import { translateState } from '../lib/statusLabels'
import TicketDataTable from '../components/TicketDataTable'
import { CHANGE_FIELDS } from '../lib/ticketTableFields'

interface Profile {
  id: string
  name: string
  role: string
}

interface Incident {
  id: string
  title: string
  status: string
}

interface Problem {
  id: string
  title: string
  status: string
}

const RISK_COLORS: Record<ChangeRisk, string> = {
  Low: 'bg-blue-50 text-blue-700 border-blue-100',
  Medium: 'bg-amber-50 text-amber-700 border-amber-100',
  High: 'bg-orange-50 text-orange-700 border-orange-100',
  Critical: 'bg-rose-50 text-rose-700 border-rose-100',
}

export default function ChangeManagementDashboard({ companyId }: { companyId?: string }) {
  const { profile } = useAuth()
  const { toast } = useToast()
  
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'calendar' | 'cab'>('list')
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [riskFilter, setRiskFilter] = useState<string>('all')
  
  // Modal de Nova/Edição de Mudança
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingChange, setEditingChange] = useState<ChangeRow | null>(null)
  
  // Abas do formulário da Mudança (ServiceNow Style)
  const [formTab, setFormTab] = useState<'general' | 'planning' | 'schedule' | 'cab_tab' | 'relations'>('general')
  
  // Form State
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [justification, setJustification] = useState('')
  const [type, setType] = useState<ChangeType>('Normal')
  const [risk, setRisk] = useState<ChangeRisk>('Low')
  const [implementationPlan, setImplementationPlan] = useState('')
  const [testPlan, setTestPlan] = useState('')
  const [backoutPlan, setBackoutPlan] = useState('')
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [implementerId, setImplementerId] = useState('')
  const [implementerName, setImplementerName] = useState('')
  
  // Relações e aprovações
  const [cabApprovers, setCabApprovers] = useState<string[]>([])
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([])
  const [selectedProblemId, setSelectedProblemId] = useState('')

  // Banco de Dados Auxiliares
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  
  // Navegação do Calendário
  const [currentDate, setCurrentDate] = useState(new Date())

  // Carregar dados principais
  const fetchChanges = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const list = await changesService.list(companyId)
      setChanges(list)
    } catch (e: any) {
      toast.error('Erro ao carregar mudanças: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChanges()
  }, [companyId])

  // Carregar auxiliares do Supabase
  useEffect(() => {
    if (!companyId) return
    
    // Profiles/Analistas
    supabase.from('profiles').select('id, name, role').eq('company_id', companyId)
      .then(({ data }) => setProfiles((data || []) as Profile[]))
      
    // Incidentes do mesmo tenant
    supabase.from('incidents').select('id, title, status').eq('company_id', companyId)
      .then(({ data }) => setIncidents((data || []) as Incident[]))

    // Problemas do mesmo tenant
    supabase.from('problems').select('id, title, status').eq('company_id', companyId)
      .then(({ data }) => setProblems((data || []) as Problem[]))
  }, [companyId])

  // KPIs calculados
  const kpis = useMemo(() => {
    const total = changes.length
    const awaitingCAB = changes.filter(c => c.state === 'Awaiting CAB Approval').length
    const emergency = changes.filter(c => c.type === 'Emergency').length
    const highRisk = changes.filter(c => ['High', 'Critical'].includes(c.risk)).length
    const scheduled = changes.filter(c => c.state === 'Scheduled').length
    return { total, awaitingCAB, emergency, highRisk, scheduled }
  }, [changes])

  // Filtragem da lista
  const filteredChanges = useMemo(() => {
    return changes.filter(c => {
      const matchesSearch = c.number.toLowerCase().includes(search.toLowerCase()) ||
                            c.short_description.toLowerCase().includes(search.toLowerCase())
      const matchesType = typeFilter === 'all' || c.type === typeFilter
      const matchesRisk = riskFilter === 'all' || c.risk === riskFilter
      return matchesSearch && matchesType && matchesRisk
    })
  }, [changes, search, typeFilter, riskFilter])

  // Abrir Modal de Edição ou Criação
  const openForm = async (change?: ChangeRow) => {
    setFormTab('general')
    if (change) {
      setEditingChange(change)
      setShortDescription(change.short_description)
      setDescription(change.description || '')
      setJustification(change.justification || '')
      setType(change.type)
      setRisk(change.risk)
      setImplementationPlan(change.implementation_plan || '')
      setTestPlan(change.test_plan || '')
      setBackoutPlan(change.backout_plan || '')
      setWindowStart(change.change_window_start ? change.change_window_start.slice(0, 16) : '')
      setWindowEnd(change.change_window_end ? change.change_window_end.slice(0, 16) : '')
      setImplementerId(change.implementer_id || '')
      setImplementerName(change.implementer_name || '')
      setCabApprovers((change.cab_approvers || []) as string[])
      setSelectedProblemId(change.related_problem_id || '')
      
      const approvals = (change.cab_approvals || {}) as any
      const legacyIncidentIds = approvals._linked_incident_ids || []
      try {
        const incidentIds = await changesService.listIncidentIds(change.id)
        setSelectedIncidentIds(incidentIds.length > 0 ? incidentIds : legacyIncidentIds)
      } catch {
        setSelectedIncidentIds(legacyIncidentIds)
      }
    } else {
      setEditingChange(null)
      setShortDescription('')
      setDescription('')
      setJustification('')
      setType('Normal')
      setRisk('Low')
      setImplementationPlan('')
      setTestPlan('')
      setBackoutPlan('')
      setWindowStart('')
      setWindowEnd('')
      setImplementerId('')
      setImplementerName('')
      setCabApprovers([])
      setSelectedProblemId('')
      setSelectedIncidentIds([])
    }
    setIsModalOpen(true)
  }

  // Ação de Salvar Mudança (Criação/Edição)
  const handleSave = async () => {
    if (!companyId) return
    if (!shortDescription) {
      toast.error('O título/descrição curta é obrigatório')
      return
    }

    try {
      const payload: any = {
        companyId,
        shortDescription,
        description: description || null,
        justification: justification || null,
        type,
        risk,
        implementationPlan: implementationPlan || null,
        testPlan: testPlan || null,
        backoutPlan: backoutPlan || null,
        changeWindowStart: windowStart ? new Date(windowStart).toISOString() : null,
        changeWindowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
        requestedByName: profile?.name || 'Analista',
        requestedById: profile?.id,
        cabApprovers,
        cabApprovals: {},
        related_problem_id: selectedProblemId || null,
      }

      if (editingChange) {
        // Mapeia chaves para snake_case ao enviar na atualização direta
        const dbPayload: Partial<ChangeRow> = {
          short_description: shortDescription,
          description: description || null,
          justification: justification || null,
          type,
          risk,
          implementation_plan: implementationPlan || null,
          test_plan: testPlan || null,
          backout_plan: backoutPlan || null,
          change_window_start: windowStart ? new Date(windowStart).toISOString() : null,
          change_window_end: windowEnd ? new Date(windowEnd).toISOString() : null,
          implementer_id: implementerId || null,
          implementer_name: implementerName || null,
          cab_approvers: cabApprovers,
          related_problem_id: selectedProblemId || null,
        }

        await changesService.update(editingChange.id, companyId, dbPayload)
        await changesService.setIncidentLinks(editingChange.id, selectedIncidentIds)
        if (type !== editingChange.type && type === 'Standard') {
          await changesService.scheduleStandard(editingChange.id)
        }
        toast.success('Mudança atualizada com sucesso!')
      } else {
        // Se for Standard, já cria como Scheduled (auto-aprovada)
        if (type === 'Standard') {
          payload.state = 'Scheduled'
        } else {
          payload.state = 'Draft'
        }
        const created = await changesService.create(payload)
        await changesService.setIncidentLinks(created.id, selectedIncidentIds)
        toast.success('Solicitação de mudança registrada!')
      }
      setIsModalOpen(false)
      fetchChanges()
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message)
    }
  }

  // Solicitar Aprovação (Move de Draft para Assess / Awaiting CAB)
  const handleRequestApproval = async (change: ChangeRow) => {
    if (!companyId) return
    if (!change.cab_approvers || (change.cab_approvers as string[]).length === 0) {
      toast.error('Defina os aprovadores do CAB no formulário antes de enviar para aprovação.')
      return
    }
    try {
      await changesService.submitForCAB(change.id)
      toast.success('Mudança enviada para aprovação do CAB!')
      fetchChanges()
    } catch (e: any) {
      toast.error('Erro ao solicitar aprovação: ' + e.message)
    }
  }

  // Registrar voto do CAB
  const handleVote = async (changeId: string, approve: boolean) => {
    if (!companyId || !profile) return
    try {
      await changesService.submitApproval(changeId, approve)
      toast.success(approve ? 'Você aprovou a mudança!' : 'Você rejeitou a mudança.')
      fetchChanges()
    } catch (e: any) {
      toast.error('Erro ao registrar voto: ' + e.message)
    }
  }

  // Calendário Lógica
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    const days = []
    
    // Dias do mês anterior para preenchimento
    const startingDayOfWeek = firstDay.getDay()
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month, -i),
        isCurrentMonth: false,
      })
    }
    
    // Dias do mês atual
    const totalDays = lastDay.getDate()
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      })
    }
    
    return days
  }, [currentDate])

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

  return (
    <div className="p-5 space-y-3 h-full overflow-y-auto max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <Shuffle className="w-6 h-6 text-indigo-600 animate-spin-slow" />
            Gestão de Mudanças (ITIL)
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Planejamento, calendário de janelas e controle de aprovações do CAB estilo ServiceNow.
          </p>
        </div>
        <button
          onClick={() => openForm()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center gap-2 self-start md:self-auto shrink-0 cursor-pointer"
        >
          <Plus className="w-5 h-5" /> Nova Mudança
        </button>
      </div>

      {/* KPI Stats (compactos — a tabela abaixo é a prioridade de espaço) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Total de Mudanças</span>
          <span className="text-lg font-black text-slate-700">{kpis.total}</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Aguardando CAB</span>
          <span className="text-lg font-black text-amber-600">{kpis.awaitingCAB}</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Emergenciais</span>
          <span className="text-lg font-black text-rose-600">{kpis.emergency}</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Alto Risco</span>
          <span className="text-lg font-black text-orange-600">{kpis.highRisk}</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Agendadas</span>
          <span className="text-lg font-black text-blue-600">{kpis.scheduled}</span>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex border-b border-slate-200 gap-1">
        <button
          onClick={() => setActiveSubTab('list')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeSubTab === 'list' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardList className="w-4 h-4" /> Lista de Mudanças
        </button>
        <button
          onClick={() => setActiveSubTab('calendar')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeSubTab === 'calendar' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CalendarRange className="w-4 h-4" /> Calendário de Janelas
        </button>
        <button
          onClick={() => setActiveSubTab('cab')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors cursor-pointer relative ${
            activeSubTab === 'cab' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" /> Painel de Aprovadores do CAB
          {kpis.awaitingCAB > 0 && (
            <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
              {kpis.awaitingCAB}
            </span>
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm font-semibold">Carregando dados da governança...</span>
          </div>
        ) : activeSubTab === 'list' ? (
          // ─── LIST VIEW ───
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5" />
                <input
                  type="text"
                  placeholder="Buscar por número ou descrição..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <Filter className="w-3.5 h-3.5" /> FILTRAR:
                </div>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white outline-none"
                >
                  <option value="all">Todos os Tipos</option>
                  <option value="Normal">Normal</option>
                  <option value="Standard">Standard</option>
                  <option value="Emergency">Emergency</option>
                </select>
                <select
                  value={riskFilter}
                  onChange={e => setRiskFilter(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white outline-none"
                >
                  <option value="all">Todos os Riscos</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <TicketDataTable
              rows={filteredChanges}
              fields={CHANGE_FIELDS}
              storageKey="changes"
              getRowId={c => c.id}
              leadingCheckbox={false}
              emptyLabel="Nenhuma solicitação de mudança encontrada."
              actions={change => (
                <div className="flex items-center justify-end gap-2">
                  {change.state === 'Draft' && (
                    <button
                      onClick={() => handleRequestApproval(change)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Enviar CAB
                    </button>
                  )}
                  <button
                    onClick={() => openForm(change)}
                    className="border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer"
                  >
                    Abrir
                  </button>
                </div>
              )}
            />
          </div>
        ) : activeSubTab === 'calendar' ? (
          // ─── CALENDAR VIEW ───
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                Calendário de Mudanças e Janelas
              </h3>
              <div className="flex items-center gap-3">
                <button onClick={prevMonth} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <span className="text-sm font-bold text-slate-700 min-w-[120px] text-center capitalize">
                  {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden shadow-sm border border-slate-200">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                <div key={d} className="bg-slate-50 py-2.5 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {d}
                </div>
              ))}

              {daysInMonth.map((day, idx) => {
                const dayChanges = changes.filter(c => {
                  if (!c.change_window_start) return false
                  const start = new Date(c.change_window_start)
                  const end = c.change_window_end ? new Date(c.change_window_end) : start
                  
                  // Checa se intersecta (comparação diária com horas zeradas)
                  const checkDate = new Date(day.date)
                  checkDate.setHours(0,0,0,0)
                  const checkStart = new Date(start)
                  checkStart.setHours(0,0,0,0)
                  const checkEnd = new Date(end)
                  checkEnd.setHours(23,59,59,999)
                  
                  return checkDate >= checkStart && checkDate <= checkEnd
                })

                return (
                  <div
                    key={idx}
                    className={`min-h-[100px] bg-white p-1.5 border-t border-slate-100 flex flex-col justify-between transition-colors ${
                      day.isCurrentMonth ? '' : 'bg-slate-50/50 text-slate-400/70'
                    }`}
                  >
                    <span className="text-xs font-bold self-end text-slate-500">{day.date.getDate()}</span>
                    <div className="space-y-1 mt-1 flex-1 overflow-y-auto max-h-[70px] hide-scrollbar">
                      {dayChanges.map(change => (
                        <div
                          key={change.id}
                          onClick={() => openForm(change)}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border truncate cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all ${
                            change.type === 'Emergency' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                            change.type === 'Standard' ? 'bg-slate-50 border-slate-200 text-slate-600' :
                            'bg-indigo-50 border-indigo-200 text-indigo-700'
                          }`}
                          title={`${change.number}: ${change.short_description}`}
                        >
                          {change.number}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          // ─── CAB APPROVAL PANEL ───
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                Mudanças Aguardando Decisão do CAB
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Revise os planos de implementação/testes e vote na aprovação técnica da janela de mudança.
              </p>
            </div>

            {changes.filter(c => c.state === 'Awaiting CAB Approval').length === 0 ? (
              <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                Nenhuma mudança pendente de votação no Comitê de Avaliação de Mudanças (CAB).
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {changes.filter(c => c.state === 'Awaiting CAB Approval').map(change => {
                  const approvers = (change.cab_approvers || []) as string[]
                  const approvals = (change.cab_approvals || {}) as Record<string, string>
                  
                  // Analista atual é um aprovador?
                  const isCurrentApprover = profile && approvers.includes(profile.id)
                  const myVote = profile ? approvals[profile.id] : null

                  return (
                    <div key={change.id} className="border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-colors">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-mono font-bold text-slate-800 text-sm">{change.number}</span>
                        <span className={`text-[10px] px-2 py-0.5 border rounded-full font-bold ${RISK_COLORS[change.risk]}`}>
                          Risco: {change.risk}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-700">{change.short_description}</h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{change.justification || 'Sem justificativa fornecida.'}</p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-2 border border-slate-100">
                        <div className="flex justify-between">
                          <span className="font-bold text-slate-400 uppercase text-[9px]">Solicitante:</span>
                          <span className="text-slate-600 font-semibold">{change.requested_by_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold text-slate-400 uppercase text-[9px]">Janela Inicial:</span>
                          <span className="text-slate-600 font-semibold">
                            {change.change_window_start ? new Date(change.change_window_start).toLocaleString('pt-BR') : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Status de Votos do CAB */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Membros do CAB</span>
                        <div className="flex flex-wrap gap-2">
                          {approvers.map(appId => {
                            const name = profiles.find(p => p.id === appId)?.name || 'Membro CAB'
                            const vote = approvals[appId]
                            return (
                              <span
                                key={appId}
                                className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 ${
                                  vote === 'Approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                  vote === 'Rejected' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                                  'bg-slate-50 border-slate-200 text-slate-400'
                                }`}
                              >
                                {vote === 'Approved' ? <Check className="w-3 h-3" /> : vote === 'Rejected' ? <X className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                {name}
                              </span>
                            )
                          })}
                        </div>
                      </div>

                      {/* Ações de Voto */}
                      <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                        {isCurrentApprover ? (
                          myVote ? (
                            <span className="text-xs text-slate-400 font-semibold italic">
                              Você já votou como: <strong className={myVote === 'Approved' ? 'text-emerald-600' : 'text-rose-600'}>{myVote === 'Approved' ? 'Aprovado' : 'Rejeitado'}</strong>
                            </span>
                          ) : (
                            <div className="flex items-center gap-2 w-full">
                              <button
                                onClick={() => handleVote(change.id, false)}
                                className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs py-2 px-3 rounded-lg border border-rose-200 flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" /> Rejeitar
                              </button>
                              <button
                                onClick={() => handleVote(change.id, true)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" /> Aprovar
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 italic">Apenas membros do CAB podem aprovar esta janela.</span>
                        )}
                        <button
                          onClick={() => openForm(change)}
                          className="text-xs text-indigo-600 font-bold hover:underline"
                        >
                          Ver Detalhes →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL DO FORMULÁRIO AVANÇADO (SERVICENOW STYLE) ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  {editingChange ? `Detalhes da Mudança — ${editingChange.number}` : 'Abrir Registro de Mudança (Change Request)'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Definições ITIL de governança e janelas de manutenção.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ServiceNow Tabs Nav */}
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 pt-2 overflow-x-auto hide-scrollbar gap-1">
              <button
                onClick={() => setFormTab('general')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
                  formTab === 'general' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Geral
              </button>
              <button
                onClick={() => setFormTab('planning')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
                  formTab === 'planning' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Planejamento ITIL
              </button>
              <button
                onClick={() => setFormTab('schedule')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
                  formTab === 'schedule' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Janela e Agendamento
              </button>
              <button
                onClick={() => setFormTab('cab_tab')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
                  formTab === 'cab_tab' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Membros do CAB
              </button>
              <button
                onClick={() => setFormTab('relations')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
                  formTab === 'relations' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Relacionamentos e Vínculos
              </button>
            </div>

            {/* Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {formTab === 'general' ? (
                // ─── TAB: GERAL ───
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo de Mudança</label>
                      <select
                        value={type}
                        onChange={e => setType(e.target.value as ChangeType)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="Normal">Normal (Exige Aprovação do CAB)</option>
                        <option value="Standard">Standard (Pré-aprovada / Auto-aprovada)</option>
                        <option value="Emergency">Emergency (Emergencial / Voto Rápido)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avaliação de Risco</label>
                      <select
                        value={risk}
                        onChange={e => setRisk(e.target.value as ChangeRisk)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="Low">Low (Risco Baixo)</option>
                        <option value="Medium">Medium (Risco Médio)</option>
                        <option value="High">High (Risco Alto)</option>
                        <option value="Critical">Critical (Risco Crítico / CAB Obrigatório)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Título/Descrição Curta *</label>
                    <input
                      type="text"
                      placeholder="Ex: Autorização do cluster de banco de dados produção"
                      value={shortDescription}
                      onChange={e => setShortDescription(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Justificativa da Mudança</label>
                    <textarea
                      rows={3}
                      placeholder="Por que essa mudança é necessária? Qual o valor para o negócio?"
                      value={justification}
                      onChange={e => setJustification(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição Detalhada</label>
                    <textarea
                      rows={4}
                      placeholder="Descreva detalhadamente o escopo da mudança..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              ) : formTab === 'planning' ? (
                // ─── TAB: PLANEJAMENTO ITIL ───
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Plano de Implementação (Passo a passo)</label>
                    <textarea
                      rows={4}
                      placeholder="Ex: 1. Deploy da branch main; 2. Rodar migrations SQL; 3. Limpeza de cache..."
                      value={implementationPlan}
                      onChange={e => setImplementationPlan(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Plano de Testes (Como validar o sucesso?)</label>
                    <textarea
                      rows={3}
                      placeholder="Como garantir que a mudança funcionou conforme o planejado? Quais testes serão feitos?"
                      value={testPlan}
                      onChange={e => setTestPlan(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Plano de Retorno / Rollback (E se falhar?)</label>
                    <textarea
                      rows={3}
                      placeholder="Caso ocorra falhas críticas, qual a estratégia de retorno para o estado original estável?"
                      value={backoutPlan}
                      onChange={e => setBackoutPlan(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              ) : formTab === 'schedule' ? (
                // ─── TAB: AGENDAMENTO ───
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Início da Janela de Mudança</label>
                      <input
                        type="datetime-local"
                        value={windowStart}
                        onChange={e => setWindowStart(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Término da Janela de Mudança</label>
                      <input
                        type="datetime-local"
                        value={windowEnd}
                        onChange={e => setWindowEnd(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Implementador Designado</label>
                    <select
                      value={implementerId}
                      onChange={e => {
                        const prof = profiles.find(p => p.id === e.target.value)
                        setImplementerId(e.target.value)
                        setImplementerName(prof ? prof.name : '')
                      }}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Selecione o Implementador da Mudança...</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : formTab === 'cab_tab' ? (
                // ─── TAB: MEMBROS CAB ───
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Selecionar Aprovadores do CAB</label>
                    <p className="text-xs text-slate-400 -mt-1 mb-3">Marque os gestores responsáveis por validar tecnicamente esta janela de manutenção.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {profiles.map(p => {
                        const checked = cabApprovers.includes(p.id)
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center gap-2 px-3 py-2 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors ${
                              checked ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setCabApprovers(prev =>
                                  prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                )
                              }}
                              className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-700 truncate">{p.name}</span>
                              <span className="text-[9px] text-slate-400 truncate uppercase">{p.role}</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {editingChange && (
                    <div className="border-t border-slate-100 pt-4">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Votos Efetuados</label>
                      <div className="flex flex-wrap gap-2">
                        {cabApprovers.map(appId => {
                          const name = profiles.find(p => p.id === appId)?.name || 'Membro do CAB'
                          const vote = (editingChange.cab_approvals as Record<string, string>)?.[appId]
                          return (
                            <span
                              key={appId}
                              className={`text-[11px] px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 ${
                                vote === 'Approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                vote === 'Rejected' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                                'bg-slate-50 border-slate-200 text-slate-400'
                              }`}
                            >
                              {vote === 'Approved' ? <Check className="w-3.5 h-3.5" /> : vote === 'Rejected' ? <X className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                              {name}: {vote === 'Approved' ? 'Aprovou' : vote === 'Rejected' ? 'Rejeitou' : 'Pendente'}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // ─── TAB: RELACIONAMENTOS ───
                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vincular a um Problema ITIL</label>
                    <select
                      value={selectedProblemId}
                      onChange={e => setSelectedProblemId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Nenhum Problema Vinculado...</option>
                      {problems.map(p => (
                        <option key={p.id} value={p.id}>{p.id} — {p.title} ({p.status})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Vincular Incidentes Correlacionados</label>
                    <p className="text-xs text-slate-400 -mt-1 mb-3">Marque os incidentes de indisponibilidade que motivaram ou serão corrigidos por esta mudança.</p>
                    <div className="max-h-[220px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {incidents.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-xs">Nenhum incidente cadastrado no tenant.</div>
                      ) : (
                        incidents.map(inc => {
                          const checked = selectedIncidentIds.includes(inc.id)
                          return (
                            <label
                              key={inc.id}
                              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedIncidentIds(prev =>
                                    prev.includes(inc.id) ? prev.filter(id => id !== inc.id) : [...prev, inc.id]
                                  )
                                }}
                                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-700 truncate">{inc.title}</span>
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5">{inc.id} • Status: {inc.status}</span>
                              </div>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                {editingChange && (
                  <span className="text-xs text-slate-400 font-semibold">
                    Criador: {editingChange.requested_by_name} • Status: <strong className="text-indigo-600">{translateState(editingChange.state)}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-lg cursor-pointer"
                >
                  {editingChange ? 'Salvar Edições' : 'Criar Mudança'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
