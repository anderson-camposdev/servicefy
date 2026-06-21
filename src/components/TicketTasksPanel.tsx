import { useState, useEffect } from 'react'
import { Plus, ListTree, CheckCircle, Clock, XCircle, AlertCircle, Trash2 } from 'lucide-react'
import { ticketTasksService, assignmentGroupsService } from '../lib/services'
import type { TicketTaskRow, AssignmentGroupRow, ProfileRow } from '../lib/database.types'

interface TicketTasksPanelProps {
  companyId: string
  ticketId: string
  ticketType: 'incident' | 'request'
  groups: AssignmentGroupRow[]
}

export default function TicketTasksPanel({ companyId, ticketId, ticketType, groups }: TicketTasksPanelProps) {
  const [tasks, setTasks] = useState<TicketTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [shortDesc, setShortDesc] = useState('')
  const [desc, setDesc] = useState('')
  const [assignGroup, setAssignGroup] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [analysts, setAnalysts] = useState<ProfileRow[]>([])

  useEffect(() => {
    if (!assignGroup) {
      setAnalysts([])
      setAssignTo('')
      return
    }
    assignmentGroupsService.listMembers(assignGroup)
      .then(setAnalysts)
      .catch(console.error)
  }, [assignGroup])

  const loadTasks = async () => {
    setLoading(true); setError(null)
    try {
      const data = await ticketTasksService.listForTicket(ticketId, ticketType)
      setTasks(data)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar tarefas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [ticketId, ticketType])

  const handleCreate = async () => {
    if (!shortDesc.trim()) {
      setError('Resumo da tarefa é obrigatório.')
      return
    }
    setSubmitting(true); setError(null)
    try {
      const payload: Partial<TicketTaskRow> = {
        company_id: companyId,
        short_description: shortDesc,
        description: desc || null,
        state: 'Pending',
        assigned_group_id: assignGroup || null,
        assigned_to_id: assignTo || null,
      }
      if (ticketType === 'incident') payload.incident_id = ticketId
      else payload.request_id = ticketId

      await ticketTasksService.create(payload)
      await loadTasks()
      setIsAdding(false)
      setShortDesc(''); setDesc(''); setAssignGroup(''); setAssignTo('')
    } catch (e: any) {
      setError(e.message || 'Erro ao criar tarefa.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover esta tarefa?')) return
    try {
      await ticketTasksService.delete(id)
      await loadTasks()
    } catch (e: any) {
      setError(e.message || 'Erro ao remover tarefa.')
    }
  }

  const handleStateChange = async (id: string, newState: 'Pending' | 'Work in Progress' | 'Closed' | 'Canceled') => {
    try {
      await ticketTasksService.update(id, {
        state: newState,
        closed_at: (newState === 'Closed' || newState === 'Canceled') ? new Date().toISOString() : null
      })
      await loadTasks()
    } catch (e: any) {
      setError(e.message || 'Erro ao atualizar status.')
    }
  }

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'Pending': return <Clock className="w-4 h-4 text-amber-500" />
      case 'Work in Progress': return <AlertCircle className="w-4 h-4 text-sky-500" />
      case 'Closed': return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'Canceled': return <XCircle className="w-4 h-4 text-rose-500" />
      default: return null
    }
  }

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'Pending': return 'Pendente'
      case 'Work in Progress': return 'Em Progresso'
      case 'Closed': return 'Concluída'
      case 'Canceled': return 'Cancelada'
      default: return state
    }
  }

  if (loading && tasks.length === 0) return <div className="text-sm text-slate-500 animate-pulse">Carregando tarefas...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <ListTree className="w-4 h-4 text-slate-400" /> Tarefas Filhas ({tasks.length})
        </h3>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="flex items-center gap-1 text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-3 h-3" /> Nova Tarefa
          </button>
        )}
      </div>

      {error && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-100">{error}</div>}

      {isAdding && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Resumo (Obrigatório)</label>
            <input value={shortDesc} onChange={e => setShortDesc(e.target.value)} className="w-full text-sm border-slate-200 rounded-lg p-2" placeholder="O que precisa ser feito?" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Descrição</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full text-sm border-slate-200 rounded-lg p-2 resize-none" placeholder="Detalhes opcionais..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Grupo Responsável</label>
              <select value={assignGroup} onChange={e => setAssignGroup(e.target.value)} className="w-full text-sm border-slate-200 rounded-lg p-2">
                <option value="">(Nenhum)</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Atribuído a</label>
              <select value={assignTo} onChange={e => setAssignTo(e.target.value)} className="w-full text-sm border-slate-200 rounded-lg p-2">
                <option value="">(Ninguém)</option>
                {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreate} disabled={submitting} className="flex-1 text-xs font-bold bg-primary text-on-primary py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
              {submitting ? 'Salvando...' : 'Salvar Tarefa'}
            </button>
            <button onClick={() => setIsAdding(false)} disabled={submitting} className="px-4 text-xs font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !isAdding ? (
        <div className="text-xs text-center p-6 border border-dashed border-slate-200 rounded-xl text-slate-400">
          Nenhuma tarefa associada a este chamado.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(t => (
            <div key={t.id} className="border border-slate-200 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold font-mono text-slate-400">{t.number}</span>
                    <span className="text-sm font-bold text-slate-800">{t.short_description}</span>
                  </div>
                  {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={t.state}
                    onChange={e => handleStateChange(t.id, e.target.value as any)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 pr-6 outline-none font-semibold text-slate-600 focus:ring-1 focus:ring-primary"
                  >
                    <option value="Pending">Pendente</option>
                    <option value="Work in Progress">Em Progresso</option>
                    <option value="Closed">Concluída</option>
                    <option value="Canceled">Cancelada</option>
                  </select>
                  <button onClick={() => handleDelete(t.id)} className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-[10px] uppercase font-bold text-slate-500 mt-3 pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1">
                  {getStateIcon(t.state)}
                  <span className={t.state === 'Closed' ? 'text-emerald-600' : t.state === 'Work in Progress' ? 'text-sky-600' : ''}>{getStateLabel(t.state)}</span>
                </span>
                {t.assigned_group_id && (
                  <span>Grupo: <span className="text-slate-700">{(t as any).assigned_group?.name || 'Desconhecido'}</span></span>
                )}
                {t.assigned_to_id && (
                  <span>Analista: <span className="text-slate-700">{(t as any).assigned_to?.name || 'Desconhecido'}</span></span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
