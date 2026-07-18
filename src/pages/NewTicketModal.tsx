import { useState, useEffect, useMemo, useRef } from 'react'
import { X, AlertTriangle, ShoppingCart, Search, Zap, User } from 'lucide-react'
import { serviceCatalogService, incidentsService, profilesService } from '../lib/services'
import { parseFormFields, buildLabeledFormData, isEmptyFormValue } from '../lib/catalogFormFields'
import { priorityString, IMPACT_OPTIONS, URGENCY_OPTIONS } from '../lib/priority'
import type { FormAnswers, FormFieldValue } from '../lib/catalogFormFields'
import DynamicFormFields from './DynamicFormFields'
import type {
  ProfileRow, CatalogCategoryRow, CatalogServiceRow, CatalogServiceSymptomRow,
  RequestCategoryRow, RequestItemRow, IncidentRow,
} from '../lib/database.types'

interface NewTicketModalProps {
  open: boolean
  onClose: () => void
  companyId: string
  analyst: { id: string; name: string }
  onCreated?: (incident: IncidentRow) => void
  /** Esteira pré-selecionada ao abrir (Incidente x Requisição). */
  defaultTicketType?: 'incident' | 'request'
}

const getMsg = (e: unknown): string => {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown }
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.details === 'string' && o.details) return o.details
  }
  return e instanceof Error ? e.message : 'Falha ao abrir o chamado.'
}

export default function NewTicketModal({ open, onClose, companyId, analyst, onCreated, defaultTicketType = 'incident' }: NewTicketModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Dados do catálogo + solicitantes
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [categories, setCategories] = useState<CatalogCategoryRow[]>([])
  const [services, setServices] = useState<CatalogServiceRow[]>([])
  const [serviceSymptoms, setServiceSymptoms] = useState<CatalogServiceSymptomRow[]>([])
  const [reqCategories, setReqCategories] = useState<RequestCategoryRow[]>([])
  const [reqItems, setReqItems] = useState<RequestItemRow[]>([])

  // Solicitante (combobox)
  const [callerQuery, setCallerQuery] = useState('')
  const [caller, setCaller] = useState<ProfileRow | null>(null)
  const [showCallerList, setShowCallerList] = useState(false)
  const callerRef = useRef<HTMLDivElement>(null)

  // Esteira + cascata
  const [ticketType, setTicketType] = useState<'incident' | 'request'>(defaultTicketType)
  const [categoryId, setCategoryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [symptomId, setSymptomId] = useState('')
  const [reqCategoryId, setReqCategoryId] = useState('')
  const [reqItemId, setReqItemId] = useState('')

  // Detalhes
  const [description, setDescription] = useState('')
  const [impact, setImpact] = useState('Low')
  const [urgency, setUrgency] = useState('Low')
  const [answers, setAnswers] = useState<FormAnswers>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [startNow, setStartNow] = useState(true)

  // Carrega dados ao abrir
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true); setError(null)
    Promise.all([
      profilesService.listByCompany(companyId),
      serviceCatalogService.listCategories(companyId, { activeOnly: true }),
      serviceCatalogService.listServices(companyId, { activeOnly: true }),
      serviceCatalogService.listAllServiceSymptoms(companyId, { activeOnly: true }),
      serviceCatalogService.listRequestCategories(companyId, { activeOnly: true }),
      serviceCatalogService.listRequestItems(companyId, { activeOnly: true }),
    ]).then(([profs, cats, svcs, syms, rcats, ritems]) => {
      if (cancelled) return
      setProfiles(profs); setCategories(cats); setServices(svcs); setServiceSymptoms(syms); setReqCategories(rcats); setReqItems(ritems)
    }).catch(e => { if (!cancelled) setError(getMsg(e)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, companyId])

  // Fecha o dropdown do solicitante ao clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (callerRef.current && !callerRef.current.contains(e.target as Node)) setShowCallerList(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const resetForm = () => {
    setCaller(null); setCallerQuery(''); setTicketType(defaultTicketType)
    setCategoryId(''); setServiceId(''); setSymptomId(''); setReqCategoryId(''); setReqItemId('')
    setDescription(''); setImpact('Low'); setUrgency('Low'); setAnswers({}); setFieldErrors({}); setStartNow(true); setError(null)
  }
  const close = () => { resetForm(); onClose() }

  // Derivações
  const filteredProfiles = useMemo(() => {
    const q = callerQuery.trim().toLowerCase()
    const base = profiles
    return (q ? base.filter(p => `${p.name} ${p.email}`.toLowerCase().includes(q)) : base).slice(0, 8)
  }, [profiles, callerQuery])

  const svcForCat = useMemo(() => services.filter(s => s.category_id === categoryId), [services, categoryId])
  const symsForSvc = useMemo(() => serviceSymptoms.filter(ss => ss.service_id === serviceId), [serviceSymptoms, serviceId])
  const itemsForReqCat = useMemo(() => reqItems.filter(it => it.request_category_id === reqCategoryId), [reqItems, reqCategoryId])

  const selectedSymptom = useMemo(() => symsForSvc.find(ss => ss.id === symptomId) ?? null, [symsForSvc, symptomId])
  const selectedReqItem = useMemo(() => itemsForReqCat.find(it => it.id === reqItemId) ?? null, [itemsForReqCat, reqItemId])

  const finalNodeSelected = ticketType === 'incident' ? Boolean(selectedSymptom) : Boolean(selectedReqItem)
  const fields = useMemo(() => {
    if (ticketType === 'incident') return selectedSymptom ? parseFormFields(selectedSymptom.form_fields) : []
    return selectedReqItem ? parseFormFields(selectedReqItem.form_fields) : []
  }, [ticketType, selectedSymptom, selectedReqItem])

  const setAnswer = (id: string, value: FormFieldValue) => {
    setAnswers(a => ({ ...a, [id]: value }))
    setFieldErrors(e => { if (!e[id]) return e; const n = { ...e }; delete n[id]; return n })
  }

  const submit = async () => {
    setError(null)
    if (!caller) { setError('Selecione o usuário solicitante.'); return }
    if (!finalNodeSelected) { setError(`Selecione o ${ticketType === 'incident' ? 'sintoma' : 'item'} do catálogo.`); return }
    const missing = fields.filter(f => f.required && isEmptyFormValue(answers[f.id]))
    if (missing.length > 0) {
      setFieldErrors(Object.fromEntries(missing.map(f => [f.id, 'Este campo é obrigatório.'])))
      setError('Preencha os campos obrigatórios destacados.')
      return
    }

    setSubmitting(true)
    try {
      const svc = services.find(s => s.id === serviceId)
      const inc = await incidentsService.openManual({
        companyId,
        ticketType,
        callerId: caller.id,
        callerName: caller.name,
        shortDescription: ticketType === 'incident'
          ? `${svc?.name ?? 'Serviço'} — ${selectedSymptom?.symptom?.name ?? 'Sintoma'}`
          : (selectedReqItem?.name ?? 'Requisição'),
        description: description.trim() || null,
        catalogServiceId: ticketType === 'incident' ? serviceId : null,
        symptomId: ticketType === 'incident' ? (selectedSymptom?.symptom_id ?? null) : null,
        requestItemId: ticketType === 'request' ? reqItemId : null,
        assignmentGroupId: ticketType === 'incident' ? (selectedSymptom?.assignment_group_id ?? null) : (selectedReqItem?.assignment_group_id ?? null),
        assignmentGroupName: ticketType === 'incident' ? (selectedSymptom?.group?.name ?? null) : (selectedReqItem?.group?.name ?? null),
        slaHours: ticketType === 'incident' ? (selectedSymptom?.sla_hours ?? null) : null,
        impact: ticketType === 'incident' ? impact : null,
        urgency: ticketType === 'incident' ? urgency : null,
        priority: ticketType === 'incident' ? priorityString(impact, urgency) : 'P3 - Moderate',
        formData: buildLabeledFormData(fields, answers),
        startNow,
        analystId: analyst.id,
        analystName: analyst.name,
      })
      onCreated?.(inc)
      close()
    } catch (e) {
      setError(getMsg(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4 sm:p-8">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Novo Chamado</h2>
            <p className="text-xs text-slate-500">Abertura manual via atendimento telefônico / direto</p>
          </div>
          <button onClick={close} className="p-2 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {error && <div className="mx-6 mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

        {loading ? (
          <div className="py-16 text-center text-slate-400 animate-pulse">Carregando catálogo e solicitantes…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-h-[70vh] overflow-y-auto">
            {/* Coluna esquerda */}
            <div className="space-y-5">
              {/* Solicitante */}
              <div ref={callerRef} className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Usuário Solicitante <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={caller ? caller.name : callerQuery}
                    onChange={e => { setCaller(null); setCallerQuery(e.target.value); setShowCallerList(true) }}
                    onFocus={() => setShowCallerList(true)}
                    placeholder="Buscar por nome ou e-mail…"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                {showCallerList && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {filteredProfiles.length === 0 && <div className="px-3 py-3 text-xs text-slate-400 text-center">Nenhum usuário encontrado.</div>}
                    {filteredProfiles.map(p => (
                      <button key={p.id} onClick={() => { setCaller(p); setCallerQuery(p.name); setShowCallerList(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left">
                        <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0"><User className="w-3.5 h-3.5" /></span>
                        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800 truncate">{p.name}</span><span className="block text-[11px] text-slate-400 truncate">{p.email}{p.department ? ` · ${p.department}` : ''}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tipo de Esteira */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo de Esteira</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setTicketType('incident'); setReqCategoryId(''); setReqItemId(''); setAnswers({}); setFieldErrors({}) }} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    ticketType === 'incident'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-rose-200'
                  }`}>
                    <AlertTriangle className="w-4 h-4" /> Incidente
                  </button>
                  <button onClick={() => { setTicketType('request'); setCategoryId(''); setServiceId(''); setSymptomId(''); setAnswers({}); setFieldErrors({}) }} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    ticketType === 'request'
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-primary/30'
                  }`}>
                    <ShoppingCart className="w-4 h-4" /> Requisição
                  </button>
                </div>
              </div>

              {/* Cascata */}
              {ticketType === 'incident' ? (
                <div className="space-y-3">
                  <Select label="Categoria" value={categoryId} onChange={v => { setCategoryId(v); setServiceId(''); setSymptomId('') }} options={categories.map(c => [c.id, `${c.icon ?? ''} ${c.name}`.trim()])} placeholder="Selecione a categoria…" />
                  <Select label="Serviço" value={serviceId} onChange={v => { setServiceId(v); setSymptomId('') }} options={svcForCat.map(s => [s.id, s.name])} placeholder="Selecione o serviço…" disabled={!categoryId} />
                  <Select label="Sintoma" value={symptomId} onChange={v => { setSymptomId(v); setAnswers({}); setFieldErrors({}) }} options={symsForSvc.map(ss => [ss.id, `${ss.symptom?.name ?? ''}${ss.group?.name ? ` · ${ss.group.name}` : ''}`])} placeholder="Selecione o sintoma…" disabled={!serviceId} />
                </div>
              ) : (
                <div className="space-y-3">
                  <Select label="Categoria de Requisição" value={reqCategoryId} onChange={v => { setReqCategoryId(v); setReqItemId('') }} options={reqCategories.map(c => [c.id, c.name])} placeholder="Selecione a categoria…" />
                  <Select label="Item" value={reqItemId} onChange={v => { setReqItemId(v); setAnswers({}); setFieldErrors({}) }} options={itemsForReqCat.map(it => [it.id, `${it.name}${it.group?.name ? ` · ${it.group.name}` : ''}`])} placeholder="Selecione o item…" disabled={!reqCategoryId} />
                </div>
              )}

              {/* Impacto/Urgência (incidente) */}
              {ticketType === 'incident' && (
                <div className="grid grid-cols-1 gap-3">
                  <Select label="Impacto — Quem é afetado?" value={impact} onChange={setImpact} options={IMPACT_OPTIONS} />
                  <Select label="Urgência — Impacto no trabalho?" value={urgency} onChange={setUrgency} options={URGENCY_OPTIONS} />
                </div>
              )}

              {/* Switch Iniciar Atendimento */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">Iniciar Atendimento Imediatamente?</p>
                    <p className="text-[11px] text-slate-500">{startNow ? 'Nasce "Em Atendimento", atribuído a você, liquidando o SLA de Resposta.' : 'Nasce "Novo", sem responsável, na fila do grupo.'}</p>
                  </div>
                </div>
                <button onClick={() => setStartNow(v => !v)} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${startNow ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${startNow ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            {/* Coluna direita */}
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Descrição / Resumo do atendimento</label>
                <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Relate o que o usuário informou na ligação…" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
              </div>

              {finalNodeSelected ? (
                <DynamicFormFields fields={fields} answers={answers} errors={fieldErrors} onChange={setAnswer} title="Campos do atendimento" />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-xs text-slate-400">
                  Selecione o {ticketType === 'incident' ? 'sintoma' : 'item'} para carregar os campos configurados.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={close} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-white transition-colors">Cancelar</button>
          <button onClick={submit} disabled={submitting || loading} className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors">
            {submitting ? 'Abrindo…' : 'Abrir Chamado'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-medium">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
