import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, ShoppingCart, ChevronLeft, Search, Check, Ticket, ArrowLeft, ShieldCheck } from 'lucide-react'
import { serviceCatalogService } from '../lib/services'
import { buildLabeledFormData, isEmptyFormValue, parseFormFields } from '../lib/catalogFormFields'
import { parseCatalogUiConfig } from '../lib/catalogUiConfig'
import { IMPACT_OPTIONS, URGENCY_OPTIONS } from '../lib/priority'
import CatalogIcon from './CatalogIcon'
import DynamicFormFields from './DynamicFormFields'
import type {
  CatalogCategoryRow, CatalogServiceRow, CatalogServiceSymptomRow,
  RequestCategoryRow, RequestItemRow, RequestFormField, IncidentRow,
} from '../lib/database.types'
import type { FormAnswers, FormFieldValue } from '../lib/catalogFormFields'
import { useTenant } from '../tenant/TenantContext'

export type CatalogUiConfig = {
  layout_style?: 'sephora_3d' | 'striped_3d' | 'default'
  background?: { type: 'image' | 'color' | 'pattern'; value: string }
  cards?: {
    id: string
    title: string
    description?: string
    image_url?: string
    action: 'incident' | 'request'
    style?: 'pill_label' | 'default'
  }[]
}

interface ServiceCatalogProps {
  companyId: string
  currentUserId: string
  currentUserName: string
  primaryColor: string
  catalogHeadline?: string
  catalogHeadlineColor?: string
  catalogHeadlineSize?: string
  greetingPrefix?: string
  greetingColor?: string
  onCreated?: (incident: IncidentRow) => void
  /** Navega para a aba "Meus Chamados" (botão da tela de confirmação). */
  onNavigateToTickets?: () => void
}

const getMsg = (e: unknown): string => {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown }
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.details === 'string' && o.details) return o.details
  }
  return e instanceof Error ? e.message : 'Erro ao carregar o catálogo.'
}
type Mode = null | 'incident' | 'request'

// Dados exibidos na tela de confirmação (capturados no momento do envio).
type DoneInfo = { number: string; service: string; priority: string; sla: string; ref: string }

// Gera um "Ref ID" curto e legível a partir do incidente real criado.
const makeRef = (inc: IncidentRow) => {
  const digits = (inc.number?.match(/\d+/g)?.join('') ?? '').slice(-4) || '0000'
  return `${inc.id.slice(0, 3)}-${digits}-flw`
}

// SLA estimado em horas a partir dos prazos do incidente (fallback amigável).
const slaFromInc = (inc: IncidentRow, fallback = 'Padrão') => {
  const dl = inc.sla_resolution_deadline || inc.sla_deadline
  if (dl && inc.created_at) {
    const h = Math.max(1, Math.round((new Date(dl).getTime() - new Date(inc.created_at).getTime()) / 3_600_000))
    return `${h}h`
  }
  return fallback
}

export default function ServiceCatalog({ companyId, currentUserId, currentUserName, primaryColor, catalogHeadline, catalogHeadlineColor, catalogHeadlineSize, greetingPrefix, greetingColor, onCreated, onNavigateToTickets }: ServiceCatalogProps) {
  const { tenant } = useTenant()
  const uiConfig = (tenant?.catalog_ui_config || {}) as CatalogUiConfig

  const [mode, setMode] = useState<Mode>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<DoneInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // Índice em memória (alimenta jornada + busca)
  const [categories, setCategories] = useState<CatalogCategoryRow[]>([])
  const [services, setServices] = useState<CatalogServiceRow[]>([])
  const [serviceSymptoms, setServiceSymptoms] = useState<CatalogServiceSymptomRow[]>([])
  const [reqCategories, setReqCategories] = useState<RequestCategoryRow[]>([])
  const [reqItems, setReqItems] = useState<RequestItemRow[]>([])

  // Seleções
  const [category, setCategory] = useState<CatalogCategoryRow | null>(null)
  const [service, setService] = useState<CatalogServiceRow | null>(null)
  const [symptom, setSymptom] = useState<CatalogServiceSymptomRow | null>(null)
  const [incDescription, setIncDescription] = useState('')
  const [impact, setImpact] = useState('Low')
  const [urgency, setUrgency] = useState('Low')
  const [incidentAnswers, setIncidentAnswers] = useState<FormAnswers>({})
  const [incidentFieldErrors, setIncidentFieldErrors] = useState<Record<string, string>>({})

  const [reqCategory, setReqCategory] = useState<RequestCategoryRow | null>(null)
  const [reqItem, setReqItem] = useState<RequestItemRow | null>(null)
  const [answers, setAnswers] = useState<FormAnswers>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Busca
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    let c = false
    setLoading(true); setError(null)
    Promise.all([
      serviceCatalogService.listCategories(companyId, { activeOnly: true }),
      serviceCatalogService.listServices(companyId, { activeOnly: true }),
      serviceCatalogService.listAllServiceSymptoms(companyId, { activeOnly: true }),
      serviceCatalogService.listRequestCategories(companyId, { activeOnly: true }),
      serviceCatalogService.listRequestItems(companyId, { activeOnly: true }),
    ]).then(([cats, svcs, syms, rcats, ritems]) => {
      if (c) return
      setCategories(cats); setServices(svcs); setServiceSymptoms(syms); setReqCategories(rcats); setReqItems(ritems)
    }).catch(e => { if (!c) setError(getMsg(e)) }).finally(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [companyId])

  // Derivações da jornada (filtragem em memória — instantâneo)
  const servicesForCat = useMemo(() => category ? services.filter(s => s.category_id === category.id) : [], [services, category])
  const symptomsForSvc = useMemo(() => service ? serviceSymptoms.filter(ss => ss.service_id === service.id) : [], [serviceSymptoms, service])
  const itemsForReqCat = useMemo(() => reqCategory ? reqItems.filter(it => it.request_category_id === reqCategory.id) : [], [reqItems, reqCategory])

  // Índices de busca
  const incIndex = useMemo(() => {
    const catById = new Map(categories.map(c => [c.id, c]))
    const svcById = new Map(services.map(s => [s.id, s]))
    return serviceSymptoms.map(ss => {
      const svc = svcById.get(ss.service_id)
      const cat = svc ? catById.get(svc.category_id) : undefined
      return { ss, svc, cat, label: `${ss.service?.name ?? svc?.name ?? ''} — ${ss.symptom?.name ?? ''}`, sub: cat?.name ?? '' }
    }).filter(r => r.svc && r.cat)
  }, [serviceSymptoms, services, categories])

  const reqIndex = useMemo(() => {
    const catById = new Map(reqCategories.map(c => [c.id, c]))
    return reqItems.map(it => ({ it, cat: catById.get(it.request_category_id), label: it.name, sub: catById.get(it.request_category_id)?.name ?? '' }))
      .filter(r => r.cat)
  }, [reqItems, reqCategories])

  const q = query.trim().toLowerCase()
  const incHits = q.length < 2 ? [] : incIndex.filter(r => `${r.label} ${r.sub}`.toLowerCase().includes(q)).slice(0, 6)
  const reqHits = q.length < 2 ? [] : reqIndex.filter(r => `${r.label} ${r.sub} ${r.it.description ?? ''}`.toLowerCase().includes(q)).slice(0, 6)

  const resetAll = () => {
    setMode(null); setCategory(null); setService(null); setSymptom(null); setIncDescription(''); setImpact('Low'); setUrgency('Low')
    setIncidentAnswers({}); setIncidentFieldErrors({})
    setReqCategory(null); setReqItem(null); setAnswers({}); setFieldErrors({})
  }
  const closeSearch = () => { setQuery(''); setShowResults(false) }
  const jumpIncident = (r: { ss: CatalogServiceSymptomRow; svc?: CatalogServiceRow; cat?: CatalogCategoryRow }) => {
    setMode('incident'); setCategory(r.cat ?? null); setService(r.svc ?? null); setSymptom(r.ss)
    setIncidentAnswers({}); setIncidentFieldErrors({}); setError(null); closeSearch()
  }
  const jumpRequest = (r: { it: RequestItemRow; cat?: RequestCategoryRow }) => {
    setMode('request'); setReqCategory(r.cat ?? null); setReqItem(r.it); setAnswers({}); setFieldErrors({}); setError(null); closeSearch()
  }

  const incidentFields = useMemo(
    () => symptom ? parseFormFields(symptom.form_fields) : [],
    [symptom],
  )

  const submitIncident = async () => {
    if (!service || !symptom) return
    const missingFields = incidentFields.filter(field => field.required && isEmptyFormValue(incidentAnswers[field.id]))
    if (missingFields.length > 0) {
      setIncidentFieldErrors(Object.fromEntries(missingFields.map(field => [field.id, 'Este campo é obrigatório.'])))
      setError('Preencha os campos obrigatórios destacados.')
      return
    }

    setSubmitting(true); setError(null)
    try {
      const inc = await serviceCatalogService.openRequest({
        companyId, serviceId: service.id, serviceName: service.name,
        symptomId: symptom.symptom_id, symptomName: symptom.symptom?.name ?? 'Sintoma',
        slaHours: symptom.sla_hours, assignmentGroupId: symptom.assignment_group_id, assignmentGroupName: symptom.group?.name ?? null,
        description: incDescription.trim() || undefined, callerId: currentUserId, callerName: currentUserName, impact, urgency,
        formData: buildLabeledFormData(incidentFields, incidentAnswers),
      })
      onCreated?.(inc)
      setDone({
        number: inc.number,
        service: service.name,
        priority: inc.priority ?? '—',
        sla: symptom.sla_hours != null ? `${symptom.sla_hours}h` : slaFromInc(inc, '—'),
        ref: makeRef(inc),
      })
      resetAll()
    } catch (e) { setError(getMsg(e)) } finally { setSubmitting(false) }
  }

  const reqFields: RequestFormField[] = useMemo(() => {
    if (!reqItem) return []
    return parseFormFields(reqItem.form_fields)
  }, [reqItem])

  const submitRequest = async () => {
    if (!reqItem) return
    const missingFields = reqFields.filter(field => field.required && isEmptyFormValue(answers[field.id]))
    if (missingFields.length > 0) {
      setFieldErrors(Object.fromEntries(missingFields.map(field => [field.id, 'Este campo é obrigatório.'])))
      setError('Preencha os campos obrigatórios destacados.')
      return
    }

    const formData = buildLabeledFormData(reqFields, answers)

    setSubmitting(true); setError(null)
    try {
      const inc = await serviceCatalogService.openServiceRequest({
        companyId, item: { id: reqItem.id, name: reqItem.name, assignment_group_id: reqItem.assignment_group_id, groupName: reqItem.group?.name ?? null },
        formData, callerId: currentUserId, callerName: currentUserName,
      })
      onCreated?.(inc)
      setDone({
        number: inc.number,
        service: reqItem.name,
        priority: inc.priority ?? 'Padrão',
        sla: slaFromInc(inc),
        ref: makeRef(inc),
      })
      resetAll()
    } catch (e) { setError(getMsg(e)) } finally { setSubmitting(false) }
  }

  if (done) {
    return (
      <div className="flex justify-center py-6">
        <div className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Barra de acento no topo */}
          <div className="h-1.5 w-full" style={{ backgroundColor: primaryColor }} />

          <div className="px-8 py-10 text-center">
            {/* Selo de sucesso */}
            <div className="mx-auto mb-6 flex items-center justify-center w-20 h-20 rounded-full" style={{ backgroundColor: `${primaryColor}1f` }}>
              <div className="flex items-center justify-center w-14 h-14 rounded-full shadow-lg" style={{ backgroundColor: primaryColor }}>
                <Check className="w-7 h-7 text-white" strokeWidth={3} />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-slate-800 mb-2">Solicitação Enviada com Sucesso!</h2>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-8">
              Seu chamado <b style={{ color: primaryColor }}>#{done.number}</b> foi registrado e nossa equipe técnica já está analisando.
            </p>

            {/* Resumo do chamado */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <InfoPill label="Serviço" value={done.service} />
              <InfoPill label="Prioridade" value={done.priority} dotColor={priorityDot(done.priority)} />
              <InfoPill label="SLA Estimado" value={done.sla} accentColor={primaryColor} />
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => { setDone(null); onNavigateToTickets?.() }}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 active:scale-[0.99] transition-all"
                style={{ backgroundColor: primaryColor }}
              >
                <Ticket className="w-4 h-4" /> Ir para Meus Chamados
              </button>
              <button
                onClick={() => setDone(null)}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar ao Catálogo
              </button>
            </div>
          </div>

          {/* Rodapé */}
          <div className="px-8 py-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Flowfy Security Protocol Active</span>
            <span className="font-mono">Ref ID: {done.ref}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* BUSCA PREDITIVA */}
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-sm font-semibold mb-1.5" style={{ color: greetingColor || primaryColor }}>{greetingPrefix || 'Olá'}, {currentUserName.split(' ')[0]}! 👋</p>
        <h1 className="text-3xl md:text-4xl font-extrabold mb-5 tracking-tight" style={{ color: catalogHeadlineColor || undefined, fontSize: catalogHeadlineSize || undefined }}>{catalogHeadline || 'Como podemos te ajudar hoje?'}</h1>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setShowResults(true) }}
            onFocus={() => setShowResults(true)}
            placeholder="Busque um problema ou serviço… (ex: VPN, notebook, acesso)"
            className="w-full h-13 pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white text-base shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
          {showResults && q.length >= 2 && (
            <div className="absolute z-30 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl text-left overflow-hidden max-h-[60vh] overflow-y-auto">
              {incHits.length === 0 && reqHits.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">Nada encontrado para “{query}”.</div>
              )}
              {incHits.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Reportar Problema (Incidentes)</div>
                  {incHits.map((r, i) => (
                    <button key={`i${i}`} onClick={() => jumpIncident(r)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left">
                      <CatalogIcon icon={r.ss.symptom?.icon} name={r.label} size={40} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{r.label}</div>
                        <div className="text-[11px] text-slate-400">{r.sub} · SLA {r.ss.sla_hours}h{r.ss.group?.name ? ` · ${r.ss.group.name}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {reqHits.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> Solicitar Serviços (Requisições)</div>
                  {reqHits.map((r, i) => (
                    <button key={`r${i}`} onClick={() => jumpRequest(r)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left">
                      <CatalogIcon icon={r.it.icon} name={r.label} size={40} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{r.label}</div>
                        <div className="text-[11px] text-slate-400">{r.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}
      {loading && <div className="text-center py-12 text-slate-400 animate-pulse">Carregando catálogo…</div>}

      {!loading && (
        // ─── PASSO 1: escolher a jornada ───
        !mode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {uiConfig?.cards && uiConfig.cards.length > 0 ? (
              uiConfig.cards.map((card, idx) => {
                if (card.style === 'pill_label') {
                  return (
                    <button
                      key={idx}
                      onClick={() => setMode(card.action)}
                      className="group relative flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 hover:border-slate-300 transition-all overflow-hidden h-[300px]"
                    >
                      {/* Efeito de listras padrão no fundo do card se for sephora_3d */}
                      {uiConfig.layout_style === 'sephora_3d' && (
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10px, #000 10px, #000 20px)' }} />
                      )}
                      
                      <div className="relative z-10 w-48 h-48 mb-6 flex items-center justify-center transition-transform group-hover:scale-110 duration-500">
                        {card.image_url ? (
                          <img src={card.image_url} alt={card.title} className="w-full h-full object-contain drop-shadow-2xl" />
                        ) : (
                          card.action === 'incident' ? <AlertTriangle className="w-20 h-20 text-rose-500 drop-shadow-lg" /> : <ShoppingCart className="w-20 h-20 text-indigo-500 drop-shadow-lg" />
                        )}
                      </div>
                      
                      <div className="absolute bottom-6 z-20 px-6 py-2.5 bg-slate-800 rounded-full text-white font-bold text-sm shadow-xl flex items-center gap-2 group-hover:bg-slate-900 transition-colors">
                        {card.title}
                      </div>
                    </button>
                  )
                }

                // Default dynamic style
                return (
                  <button key={idx} onClick={() => setMode(card.action)} className="group text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-8 hover:shadow-lg hover:-translate-y-0.5 transition-all" style={{ borderColor: primaryColor }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform" style={{ backgroundColor: `${primaryColor}1a`, color: primaryColor }}>
                       {card.image_url ? <img src={card.image_url} alt="" className="w-10 h-10 object-contain" /> : (card.action === 'incident' ? <AlertTriangle className="w-8 h-8" /> : <ShoppingCart className="w-8 h-8" />)}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">{card.title}</h2>
                    {card.description && <p className="text-sm text-slate-500 mt-2">{card.description}</p>}
                    <span className="mt-5 inline-flex items-center text-sm font-semibold" style={{ color: primaryColor }}>{card.action === 'incident' ? 'Abrir Incidente →' : 'Abrir Requisição →'}</span>
                  </button>
                )
              })
            ) : (
              // Fallback original para tenants sem config
              <>
                <button onClick={() => setMode('incident')} className="group text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-8 hover:shadow-lg hover:border-rose-200 hover:-translate-y-0.5 transition-all">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform"><AlertTriangle className="w-8 h-8" /></div>
                  <h2 className="text-xl font-bold text-slate-900">Reportar um Problema?</h2>
                  <p className="text-sm text-slate-500 mt-2">Algo está com erro, lento ou fora do ar. Vamos diagnosticar em 3 passos.</p>
                  <span className="mt-5 inline-flex items-center text-sm font-semibold text-rose-600">Abrir Incidente →</span>
                </button>
                <button onClick={() => setMode('request')} className="group text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-8 hover:shadow-lg hover:border-indigo-200 hover:-translate-y-0.5 transition-all">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform"><ShoppingCart className="w-8 h-8" /></div>
                  <h2 className="text-xl font-bold text-slate-900">Solicitar Algo / Serviço?</h2>
                  <p className="text-sm text-slate-500 mt-2">Pedir equipamentos, acessos ou serviços do catálogo da empresa.</p>
                  <span className="mt-5 inline-flex items-center text-sm font-semibold text-indigo-600">Abrir Requisição →</span>
                </button>
              </>
            )}
          </div>
        ) : mode === 'incident' ? (
          // ─── INCIDENTE ───
          <div className="space-y-2">
            <BackBtn onClick={() => (category ? (service ? (symptom ? setSymptom(null) : setService(null)) : setCategory(null)) : resetAll())} />
            {!category ? (
              <Grid>{categories.map(c => <Card key={c.id} icon={c.icon} name={c.name} desc={c.description} onClick={() => setCategory(c)} color={primaryColor} />)}{categories.length === 0 && <Empty>Nenhuma categoria de incidente.</Empty>}</Grid>
            ) : !service ? (
              <Grid>{servicesForCat.map(s => <Card key={s.id} icon={s.icon} name={s.name} desc={s.description} onClick={() => setService(s)} color={primaryColor} />)}{servicesForCat.length === 0 && <Empty>Nenhum serviço nesta categoria.</Empty>}</Grid>
            ) : !symptom ? (
              <Grid>{symptomsForSvc.map(ss => <Card key={ss.id} icon={ss.symptom?.icon} name={ss.symptom?.name ?? ''} desc={`SLA ${ss.sla_hours}h${ss.group?.name ? ` · ${ss.group.name}` : ''}`} uiConfig={ss.ui_config} onClick={() => { setSymptom(ss); setIncidentAnswers({}); setIncidentFieldErrors({}); setError(null) }} color={primaryColor} />)}{symptomsForSvc.length === 0 && <Empty>Nenhum sintoma configurado.</Empty>}</Grid>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-800">{service.name} — {symptom.symptom?.name}</h2>
                <DynamicFormFields
                  fields={incidentFields}
                  answers={incidentAnswers}
                  errors={incidentFieldErrors}
                  title="Informações do Incidente"
                  onChange={(fieldId: string, value: FormFieldValue) => {
                    setIncidentAnswers(current => ({ ...current, [fieldId]: value }))
                    setError(null)
                    setIncidentFieldErrors(current => {
                      if (!current[fieldId]) return current
                      const next = { ...current }
                      delete next[fieldId]
                      return next
                    })
                  }}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SelectField label="Quem é afetado? (Impacto)" value={impact} onChange={setImpact} options={IMPACT_OPTIONS} />
                  <SelectField label="Impacto no seu trabalho? (Urgência)" value={urgency} onChange={setUrgency} options={URGENCY_OPTIONS} />
                </div>
                <TextareaField label="Detalhes" value={incDescription} onChange={setIncDescription} placeholder="Descreva o que está acontecendo (opcional)…" />
                <SubmitBtn onClick={submitIncident} loading={submitting} color={primaryColor} label="Abrir Incidente" />
              </div>
            )}
          </div>
        ) : (
          // ─── REQUISIÇÃO ───
          <div className="space-y-2">
            <BackBtn onClick={() => (reqCategory ? (reqItem ? setReqItem(null) : setReqCategory(null)) : resetAll())} />
            {!reqCategory ? (
              <Grid>{reqCategories.map(c => <Card key={c.id} icon={c.icon} name={c.name} desc={c.description} onClick={() => setReqCategory(c)} color={primaryColor} />)}{reqCategories.length === 0 && <Empty>Nenhuma categoria de requisição.</Empty>}</Grid>
            ) : !reqItem ? (
              <Grid>{itemsForReqCat.map(it => <Card key={it.id} icon={it.icon} name={it.name} desc={it.description} uiConfig={it.ui_config} onClick={() => { setReqItem(it); setAnswers({}); setFieldErrors({}); setError(null) }} color={primaryColor} />)}{itemsForReqCat.length === 0 && <Empty>Nenhum item nesta categoria.</Empty>}</Grid>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <CatalogIcon icon={reqItem.icon} name={reqItem.name} size={parseCatalogUiConfig(reqItem.ui_config).iconSize} />
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{reqItem.name}</h2>
                    {reqItem.description && <p className="text-sm text-slate-500">{reqItem.description}</p>}
                    {reqItem.group?.name && <p className="text-[11px] text-slate-400 mt-0.5">Atendido por: {reqItem.group.name}</p>}
                  </div>
                </div>
                <DynamicFormFields
                  fields={reqFields}
                  answers={answers}
                  errors={fieldErrors}
                  title="Informações da Solicitação"
                  onChange={(fieldId: string, value: FormFieldValue) => {
                    setAnswers(current => ({ ...current, [fieldId]: value }))
                    setError(null)
                    setFieldErrors(current => {
                      if (!current[fieldId]) return current
                      const next = { ...current }
                      delete next[fieldId]
                      return next
                    })
                  }}
                />
                <SubmitBtn onClick={submitRequest} loading={submitting} color={primaryColor} label="Enviar Requisição" />
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

// ─── Subcomponentes ───

// Cor do "ponto" de prioridade na tela de confirmação.
function priorityDot(p: string): string {
  const t = (p || '').toLowerCase()
  if (t.includes('p1') || t.includes('crit')) return '#ef4444'
  if (t.includes('p2') || t.includes('high') || t.includes('alta')) return '#f97316'
  if (t.includes('p3') || t.includes('mod') || t.includes('medium') || t.includes('méd')) return '#f59e0b'
  if (t.includes('p4') || t.includes('low') || t.includes('baix')) return '#64748b'
  return '#64748b'
}

// Pílula de resumo (Serviço / Prioridade / SLA) da tela de confirmação.
function InfoPill({ label, value, dotColor, accentColor }: { label: string; value: string; dotColor?: string; accentColor?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3 py-3">
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 text-center">{label}</div>
      <div className="flex items-center justify-center gap-1.5 text-sm font-bold" style={{ color: accentColor ?? '#1e293b' }}>
        {dotColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div> }
function Empty({ children }: { children: React.ReactNode }) { return <div className="col-span-full text-center py-12 text-slate-400">{children}</div> }
function BackBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-1"><ChevronLeft className="w-4 h-4" /> Voltar</button>
}
function Card({ icon, name, desc, onClick, color, uiConfig }: { icon?: string | null; name: string; desc?: string | null; onClick: () => void; color: string; uiConfig?: CatalogServiceSymptomRow['ui_config'] | RequestItemRow['ui_config'] }) {
  const config = parseCatalogUiConfig(uiConfig)
  const buttonSizeClass = config.buttonSize === 'lg'
    ? 'px-5 py-2.5 text-sm'
    : config.buttonSize === 'md'
      ? 'px-4 py-2 text-sm'
      : 'px-3 py-1.5 text-xs'
  const buttonStyle = config.buttonStyle === 'solid'
    ? { backgroundColor: color, borderColor: color, color: '#fff' }
    : config.buttonStyle === 'outline'
      ? { backgroundColor: '#fff', borderColor: color, color }
      : { backgroundColor: 'transparent', borderColor: 'transparent', color }

  return (
    <button
      onClick={onClick}
      style={{ minHeight: Math.max(180, config.iconSize + 60) }}
      className={`group flex w-full items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg ${config.buttonPosition === 'bottom' ? 'flex-wrap' : ''}`}
    >
      <CatalogIcon icon={icon} name={name} size={config.iconSize} />
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold text-slate-800">{name}</div>
        {desc && <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">{desc}</div>}
        {config.buttonPosition === 'bottom' && (
          <span className={`mt-3 inline-flex items-center rounded-lg border font-bold transition-transform group-hover:translate-x-0.5 ${buttonSizeClass}`} style={buttonStyle}>
            {config.buttonLabel} →
          </span>
        )}
      </div>
      {config.buttonPosition === 'right' && (
        <span className={`shrink-0 rounded-lg border font-bold transition-transform group-hover:translate-x-0.5 ${buttonSizeClass}`} style={buttonStyle}>
          {config.buttonLabel} →
        </span>
      )}
    </button>
  )
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 bg-white shadow-sm font-medium">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
function TextareaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide">{label}</label>
      <textarea rows={4} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 resize-none bg-white shadow-sm" />
    </div>
  )
}
function SubmitBtn({ onClick, loading, color, label }: { onClick: () => void; loading: boolean; color: string; label: string }) {
  return <button onClick={onClick} disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 shadow-md disabled:opacity-50 transition-all" style={{ backgroundColor: color }}>{loading ? 'Enviando…' : label}</button>
}
