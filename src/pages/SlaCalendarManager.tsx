import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, CalendarDays, Clock, Save, AlertCircle, Sun } from 'lucide-react'
import { slaCalendarsService } from '../lib/services'
import { useToast } from '../context'
import type { SlaCalendarRow, SlaCalendarShiftRow, SlaCalendarHolidayRow } from '../lib/database.types'

const getMsg = (e: unknown): string => {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown }
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.details === 'string' && o.details) return o.details
  }
  return e instanceof Error ? e.message : 'Falha na operação.'
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function SlaCalendarManager({
  companyId,
  defaultCalendarId,
  onSetDefault,
}: {
  companyId: string
  defaultCalendarId?: string | null
  onSetDefault?: (calendarId: string) => void
}) {
  const { toast } = useToast()
  const [calendars, setCalendars] = useState<SlaCalendarRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [shifts, setShifts] = useState<SlaCalendarShiftRow[]>([])
  const [holidays, setHolidays] = useState<SlaCalendarHolidayRow[]>([])
  const [subTab, setSubTab] = useState<'shifts' | 'holidays'>('shifts')

  // Novo calendário
  const [newName, setNewName] = useState('')

  // Editor do calendário selecionado
  const selected = calendars.find(c => c.id === selectedId) ?? null
  const [editName, setEditName] = useState('')
  const [editTz, setEditTz] = useState('America/Sao_Paulo')
  const [editIs24x7, setEditIs24x7] = useState(false)
  const [savingCal, setSavingCal] = useState(false)

  // Form de turno
  const [shiftWeekday, setShiftWeekday] = useState(1)
  const [shiftStart, setShiftStart] = useState('08:00')
  const [shiftEnd, setShiftEnd] = useState('18:00')

  // Form de feriado
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')

  const loadCalendars = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError(null)
    try {
      const rows = await slaCalendarsService.list(companyId)
      setCalendars(rows)
      setSelectedId(prev => prev && rows.some(r => r.id === prev) ? prev : (rows[0]?.id ?? null))
    } catch (e) {
      setError(getMsg(e))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { loadCalendars() }, [loadCalendars])

  // Sincroniza o editor + carrega turnos/feriados quando troca o selecionado.
  useEffect(() => {
    if (!selected) { setShifts([]); setHolidays([]); return }
    setEditName(selected.name)
    setEditTz(selected.timezone)
    setEditIs24x7(selected.is_24x7)
    let cancelled = false
    Promise.all([
      slaCalendarsService.listShifts(selected.id, companyId),
      slaCalendarsService.listHolidays(selected.id, companyId),
    ]).then(([s, h]) => {
      if (!cancelled) { setShifts(s); setHolidays(h) }
    }).catch(e => { if (!cancelled) setError(getMsg(e)) })
    return () => { cancelled = true }
  }, [selectedId, companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Informe o nome do calendário.'); return }
    try {
      const created = await slaCalendarsService.create({ companyId, name: newName.trim() })
      setCalendars(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedId(created.id)
      setNewName('')
      toast.success('Calendário criado.')
    } catch (e) { toast.error(getMsg(e)) }
  }

  const handleSaveCalendar = async () => {
    if (!selected) return
    if (!editName.trim()) { toast.error('Informe o nome do calendário.'); return }
    setSavingCal(true); setError(null)
    try {
      const updated = await slaCalendarsService.update(selected.id, companyId, {
        name: editName.trim(), timezone: editTz.trim() || 'America/Sao_Paulo', is_24x7: editIs24x7,
      })
      setCalendars(prev => prev.map(c => c.id === updated.id ? updated : c))
      toast.success('Calendário atualizado.')
    } catch (e) { const m = getMsg(e); setError(m); toast.error(m) } finally { setSavingCal(false) }
  }

  const toggle24x7 = async (val: boolean) => {
    if (!selected) return
    setEditIs24x7(val)
    try {
      const updated = await slaCalendarsService.update(selected.id, companyId, {
        is_24x7: val,
      })
      setCalendars(prev => prev.map(c => c.id === updated.id ? updated : c))
      toast.success(val ? 'Calendário alterado para 24x7.' : 'Calendário alterado para Horário Comercial.')
    } catch (e) {
      toast.error(getMsg(e))
      setEditIs24x7(!val)
    }
  }

  const handleDeleteCalendar = async () => {
    if (!selected) return
    if (!confirm(`Excluir o calendário "${selected.name}" e seus turnos/feriados?`)) return
    try {
      await slaCalendarsService.remove(selected.id, companyId)
      setCalendars(prev => prev.filter(c => c.id !== selected.id))
      setSelectedId(null)
      toast.success('Calendário excluído.')
    } catch (e) { toast.error(getMsg(e)) }
  }

  const handleAddShift = async () => {
    if (!selected) return
    if (shiftEnd <= shiftStart) { toast.error('A hora de término deve ser maior que a de início.'); return }
    try {
      const created = await slaCalendarsService.addShift({
        companyId, calendarId: selected.id, weekday: shiftWeekday, startTime: shiftStart, endTime: shiftEnd,
      })
      setShifts(prev => [...prev, created].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)))
      toast.success('Turno adicionado.')
    } catch (e) { toast.error(getMsg(e)) }
  }

  const handleRemoveShift = async (id: string) => {
    try {
      await slaCalendarsService.removeShift(id, companyId)
      setShifts(prev => prev.filter(s => s.id !== id))
    } catch (e) { toast.error(getMsg(e)) }
  }

  const handleAddHoliday = async () => {
    if (!selected) return
    if (!holidayDate) { toast.error('Informe a data do feriado.'); return }
    try {
      const created = await slaCalendarsService.addHoliday({
        companyId, calendarId: selected.id, holiday: holidayDate, name: holidayName.trim() || null,
      })
      setHolidays(prev => [...prev, created].sort((a, b) => a.holiday.localeCompare(b.holiday)))
      setHolidayDate(''); setHolidayName('')
      toast.success('Feriado adicionado.')
    } catch (e) { toast.error(getMsg(e)) }
  }

  const handleRemoveHoliday = async (id: string) => {
    try {
      await slaCalendarsService.removeHoliday(id, companyId)
      setHolidays(prev => prev.filter(h => h.id !== id))
    } catch (e) { toast.error(getMsg(e)) }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Lista de calendários */}
        <aside className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 h-fit">
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Calendários</div>
          {loading ? (
            <p className="px-2 py-3 text-sm text-slate-400 animate-pulse">Carregando…</p>
          ) : calendars.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-400">Nenhum calendário.</p>
          ) : (
                <div className="space-y-1">
                  {calendars.map(c => {
                    const isDefault = defaultCalendarId === c.id
                    return (
                    <button key={c.id} onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between group
                        ${selectedId === c.id ? 'bg-primary-container text-on-primary-container font-bold border border-primary/30' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                      <div>
                        <span className="block">{c.name}</span>
                        {isDefault && <span className="text-[10px] uppercase font-bold text-emerald-600 mt-0.5 block">Padrão</span>}
                      </div>
                      <span className="text-xs font-medium opacity-60">
                        {c.is_24x7 ? '24x7' : 'Comercial'}
                      </span>
                    </button>
                    )
                  })}
                </div>
          )}
          <div className="mx-1 my-2 border-t border-slate-100" />
          <div className="flex items-center gap-2 px-1">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Novo calendário…"
              className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={handleCreate} className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shrink-0" title="Criar">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Editor do calendário selecionado */}
        <div className="min-w-0 space-y-4">
          {!selected ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center text-slate-400">
              Selecione ou crie um calendário para configurar turnos e feriados.
            </div>
          ) : (
            <>
              {/* Dados do calendário */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nome</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fuso horário</label>
                    <input value={editTz} onChange={e => setEditTz(e.target.value)} placeholder="America/Sao_Paulo"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="mt-1 text-[11px] text-slate-400">Fuso usado para calcular os turnos deste calendário. Ex.: America/Sao_Paulo, America/Manaus.</p>
                  </div>
                  <div className="md:col-span-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none py-2.5">
                      <input type="checkbox" checked={editIs24x7} onChange={e => toggle24x7(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm font-medium text-slate-700">24x7 (sem turnos)</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <div className="flex gap-2">
                    {defaultCalendarId === selected.id ? (
                      <span className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200">
                        <CalendarDays className="w-4 h-4" /> Calendário Padrão da Empresa
                      </span>
                    ) : (
                      <button onClick={() => onSetDefault?.(selected.id)} className="flex items-center gap-1.5 px-3 py-2 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 text-sm font-semibold rounded-xl transition-colors">
                        Definir como Padrão
                      </button>
                    )}
                    <button onClick={handleDeleteCalendar} className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-xl transition-colors">
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  </div>
                  <button onClick={handleSaveCalendar} disabled={savingCal} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
                    <Save className="w-4 h-4" /> {savingCal ? 'Salvando…' : 'Salvar Calendário'}
                  </button>
                </div>
              </div>

              {/* Sub-abas Turnos / Feriados */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex border-b border-slate-100">
                  {([['shifts', 'Turnos Semanais'], ['holidays', 'Feriados']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setSubTab(key)}
                      className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${subTab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {subTab === 'shifts' && (
                  <div className="p-6 space-y-4">
                    {editIs24x7 ? (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
                        <Sun className="w-4 h-4 shrink-0" /> Calendário 24x7: o SLA corre o tempo todo, sem necessidade de turnos.
                      </div>
                    ) : (
                      <>
                        {/* Editor dinâmico: adicionar turno */}
                        <div className="flex flex-wrap items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dia da Semana</label>
                            <select value={shiftWeekday} onChange={e => setShiftWeekday(Number(e.target.value))}
                              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                              {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Início</label>
                            <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)}
                              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Término</label>
                            <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)}
                              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <button onClick={handleAddShift} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
                            <Plus className="w-4 h-4" /> Adicionar Turno
                          </button>
                        </div>

                        {/* Lista de turnos */}
                        {shifts.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-4">Nenhum turno cadastrado. Adicione ao menos um dia útil.</p>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                            {shifts.map(s => (
                              <div key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="font-semibold text-slate-700 w-24">{WEEKDAYS[s.weekday]}</span>
                                <span className="text-slate-600">{s.start_time?.slice(0, 5)} — {s.end_time?.slice(0, 5)}</span>
                                <button onClick={() => handleRemoveShift(s.id)} className="ml-auto p-1.5 text-red-600/70 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors" title="Remover">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {subTab === 'holidays' && (
                  <div className="p-6 space-y-4">
                    <div className="flex flex-wrap items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data</label>
                        <input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)}
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Descrição (opcional)</label>
                        <input value={holidayName} onChange={e => setHolidayName(e.target.value)} placeholder="Ex.: Natal"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <button onClick={handleAddHoliday} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
                        <Plus className="w-4 h-4" /> Adicionar Feriado
                      </button>
                    </div>

                    {holidays.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">Nenhum feriado cadastrado.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                        {holidays.map(h => (
                          <div key={h.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                            <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-700 w-28">{h.holiday}</span>
                            <span className="text-slate-500">{h.name ?? '—'}</span>
                            <button onClick={() => handleRemoveHoliday(h.id)} className="ml-auto p-1.5 text-red-600/70 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors" title="Remover">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
