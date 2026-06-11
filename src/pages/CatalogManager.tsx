import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronRight, ChevronDown, FolderTree, Eye, EyeOff, ShoppingCart, SlidersHorizontal } from 'lucide-react'
import { serviceCatalogService, assignmentGroupsService } from '../lib/services'
import { parseFormFields } from '../lib/catalogFormFields'
import IconUpload from './IconUpload'
import CatalogCardCanvas from './CatalogCardCanvas'
import FormTemplateManager from './FormTemplateManager'
import TemplateFormConfigurator from './TemplateFormConfigurator'
import { usePersistentState } from '../hooks/usePersistentState'
import type { CatalogCategoryRow, CatalogServiceRow, SystemSymptomRow, CatalogServiceSymptomRow, AssignmentGroupRow, RequestCategoryRow, RequestItemRow, RequestFormField, FormTemplateRow } from '../lib/database.types'

/**
 * CRUD do Service Catalog em árvore (Admin):
 *   Categoria > Serviço > Sintomas (com SLA + Grupo Solucionador).
 */
export type CatalogManagerSection = 'incident' | 'request' | 'templates'

export default function CatalogManager({ companyId, section = 'incident' }: { companyId: string; section?: CatalogManagerSection }) {
  const [categories, setCategories] = useState<CatalogCategoryRow[]>([])
  const [symptomsMaster, setSymptomsMaster] = useState<SystemSymptomRow[]>([])
  const [groups, setGroups] = useState<AssignmentGroupRow[]>([])
  const [templates, setTemplates] = useState<FormTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set())
  const [expandedSvc, setExpandedSvc] = useState<Set<string>>(new Set())
  const [servicesByCat, setServicesByCat] = useState<Record<string, CatalogServiceRow[]>>({})
  const [ssByService, setSsByService] = useState<Record<string, CatalogServiceSymptomRow[]>>({})

  // Rascunhos persistentes (imunes a reload forçado / Tab Discarding)
  const [newCat, setNewCat, clearNewCat] = usePersistentState('flowfy_draft_inc_category', { name: '', icon: '' })
  const [newSvc, setNewSvc] = usePersistentState<Record<string, { name: string; icon: string }>>('flowfy_draft_inc_service', {})

  const reload = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      if (section === 'incident') {
        const [cats, syms, grps, formTemplates] = await Promise.all([
          serviceCatalogService.listCategories(companyId),
          serviceCatalogService.listSymptoms(),
          assignmentGroupsService.list(companyId),
          serviceCatalogService.listFormTemplates(companyId),
        ])
        setCategories(cats)
        setSymptomsMaster(syms)
        setGroups(grps)
        setTemplates(formTemplates)
      } else if (section === 'request') {
        const [grps, formTemplates] = await Promise.all([
          assignmentGroupsService.list(companyId),
          serviceCatalogService.listFormTemplates(companyId),
        ])
        setGroups(grps)
        setTemplates(formTemplates)
      } else {
        setTemplates(await serviceCatalogService.listFormTemplates(companyId))
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar o catálogo.')
    } finally {
      setLoading(false)
    }
  }, [companyId, section])

  useEffect(() => { reload() }, [reload])

  const loadServices = useCallback(async (catId: string) => {
    try {
      const rows = await serviceCatalogService.listServices(companyId, { categoryId: catId })
      setServicesByCat(prev => ({ ...prev, [catId]: rows }))
    } catch (e: any) { setError(e?.message || 'Erro ao carregar serviços.') }
  }, [companyId])

  const loadSymptoms = useCallback(async (svcId: string) => {
    try {
      const rows = await serviceCatalogService.listServiceSymptoms(svcId)
      setSsByService(prev => ({ ...prev, [svcId]: rows }))
    } catch (e: any) { setError(e?.message || 'Erro ao carregar sintomas.') }
  }, [])

  const toggleCat = (catId: string) => {
    setExpandedCat(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else { next.add(catId); if (!servicesByCat[catId]) loadServices(catId) }
      return next
    })
  }
  const toggleSvc = (svcId: string) => {
    setExpandedSvc(prev => {
      const next = new Set(prev)
      if (next.has(svcId)) next.delete(svcId)
      else { next.add(svcId); if (!ssByService[svcId]) loadSymptoms(svcId) }
      return next
    })
  }

  // ─ Categorias ─
  const addCategory = async () => {
    if (!newCat.name.trim()) return
    try {
      const cat = await serviceCatalogService.createCategory({ company_id: companyId, name: newCat.name.trim(), icon: newCat.icon || '', sort_order: categories.length, is_active: true })
      clearNewCat(); setCategories(prev => [...prev, cat])
    } catch (e: any) { setError(e?.message || 'Falha ao criar categoria.') }
  }
  const toggleCategoryActive = async (c: CatalogCategoryRow) => {
    try { const u = await serviceCatalogService.updateCategory(c.id, { is_active: !c.is_active }); setCategories(prev => prev.map(x => x.id === c.id ? u : x)) }
    catch (e: any) { setError(e?.message || 'Falha ao atualizar.') }
  }
  const updateCategoryIcon = async (c: CatalogCategoryRow, icon: string) => {
    try {
      const updated = await serviceCatalogService.updateCategory(c.id, { icon })
      setCategories(prev => prev.map(row => row.id === c.id ? updated : row))
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar o ícone da categoria.') }
  }
  const removeCategory = async (c: CatalogCategoryRow) => {
    if (!confirm(`Excluir a categoria "${c.name}" e seus serviços?`)) return
    try { await serviceCatalogService.deleteCategory(c.id); setCategories(prev => prev.filter(x => x.id !== c.id)) }
    catch (e: any) { setError(e?.message || 'Falha ao excluir.') }
  }

  // ─ Serviços ─
  const addService = async (catId: string) => {
    const draft = newSvc[catId]
    if (!draft?.name.trim()) return
    try {
      const svc = await serviceCatalogService.createService({ company_id: companyId, category_id: catId, name: draft.name.trim(), icon: draft.icon || '', sort_order: (servicesByCat[catId]?.length ?? 0), is_active: true })
      setServicesByCat(prev => ({ ...prev, [catId]: [...(prev[catId] ?? []), svc] }))
      setNewSvc(prev => { const n = { ...prev }; delete n[catId]; return n })
    } catch (e: any) { setError(e?.message || 'Falha ao criar serviço.') }
  }
  const toggleServiceActive = async (svc: CatalogServiceRow) => {
    try {
      const u = await serviceCatalogService.updateService(svc.id, { is_active: !svc.is_active })
      setServicesByCat(prev => ({ ...prev, [svc.category_id]: (prev[svc.category_id] ?? []).map(x => x.id === svc.id ? u : x) }))
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar.') }
  }
  const updateServiceIcon = async (svc: CatalogServiceRow, icon: string) => {
    try {
      const updated = await serviceCatalogService.updateService(svc.id, { icon })
      setServicesByCat(prev => ({
        ...prev,
        [svc.category_id]: (prev[svc.category_id] ?? []).map(row => row.id === svc.id ? updated : row),
      }))
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar o ícone do serviço.') }
  }
  const removeService = async (svc: CatalogServiceRow) => {
    if (!confirm(`Excluir o serviço "${svc.name}"?`)) return
    try {
      await serviceCatalogService.deleteService(svc.id)
      setServicesByCat(prev => ({ ...prev, [svc.category_id]: (prev[svc.category_id] ?? []).filter(x => x.id !== svc.id) }))
    } catch (e: any) { setError(e?.message || 'Falha ao excluir.') }
  }

  // ─ Sintomas (junção) ─
  const saveSymptom = async (
    svcId: string,
    symptomId: string,
    active: boolean,
    slaHours: number,
    groupId: string,
    formFields: RequestFormField[],
    formTemplateId: string | null,
    uiConfig: CatalogServiceSymptomRow['ui_config'],
  ): Promise<CatalogServiceSymptomRow | null> => {
    try {
      const row = await serviceCatalogService.upsertServiceSymptom({
        companyId,
        serviceId: svcId,
        symptomId,
        slaHours,
        assignmentGroupId: groupId || null,
        active,
        formFields,
        formTemplateId,
        uiConfig,
      })
      setSsByService(prev => {
        const list = prev[svcId] ?? []
        const idx = list.findIndex(r => r.symptom_id === symptomId)
        const next = idx >= 0 ? list.map(r => r.symptom_id === symptomId ? row : r) : [...list, row]
        return { ...prev, [svcId]: next }
      })
      return row
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar sintoma.')
      return null
    }
  }

  if (loading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando catálogo…</div>

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

      {section === 'templates' && <FormTemplateManager companyId={companyId} templates={templates} onChange={setTemplates} />}

      {section === 'request' && <RequestCatalogManager companyId={companyId} groups={groups} templates={templates} />}

      {section === 'incident' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-700">Incidentes (Categoria › Serviço › Sintoma)</h3>
        </div>

        <div className="divide-y divide-slate-100">
          {categories.map(cat => (
            <div key={cat.id}>
              {/* Categoria */}
              <div className={`flex items-center gap-2 px-3 py-2.5 ${!cat.is_active ? 'opacity-50' : ''}`}>
                <button onClick={() => toggleCat(cat.id)} className="p-1 text-slate-400 hover:text-slate-700">
                  {expandedCat.has(cat.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <IconUpload value={cat.icon} onChange={icon => updateCategoryIcon(cat, icon)} companyId={companyId} compact />
                <span className="text-sm font-bold text-slate-800 flex-1">{cat.name}</span>
                <button onClick={() => toggleCategoryActive(cat)} title={cat.is_active ? 'Desativar' : 'Ativar'} className="p-1 text-slate-400 hover:text-indigo-600">{cat.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                <button onClick={() => removeCategory(cat)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>

              {/* Serviços da categoria */}
              {expandedCat.has(cat.id) && (
                <div className="pl-8 pr-3 pb-3 space-y-2 bg-slate-50/50">
                  {(servicesByCat[cat.id] ?? []).map(svc => (
                    <div key={svc.id} className="bg-white border border-slate-200 rounded-xl">
                      <div className={`flex items-center gap-2 px-3 py-2 ${!svc.is_active ? 'opacity-50' : ''}`}>
                        <button onClick={() => toggleSvc(svc.id)} className="p-1 text-slate-400 hover:text-slate-700">
                          {expandedSvc.has(svc.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <IconUpload value={svc.icon} onChange={icon => updateServiceIcon(svc, icon)} companyId={companyId} compact />
                        <span className="text-sm font-semibold text-slate-700 flex-1">{svc.name}</span>
                        <button onClick={() => toggleServiceActive(svc)} className="p-1 text-slate-400 hover:text-indigo-600">{svc.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                        <button onClick={() => removeService(svc)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>

                      {/* Sintomas do serviço (governança) */}
                      {expandedSvc.has(svc.id) && (
                        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                          {symptomsMaster.map(sym => {
                            const existing = (ssByService[svc.id] ?? []).find(r => r.symptom_id === sym.id)
                            return (
                              <SymptomRow
                                key={sym.id}
                                symptom={sym}
                                existing={existing}
                                groups={groups}
                                templates={templates}
                                onSave={(active, sla, groupId, fields, templateId, uiConfig) => saveSymptom(svc.id, sym.id, active, sla, groupId, fields, templateId, uiConfig)}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Novo serviço */}
                  <div className="pt-1 space-y-2 border-t border-slate-100">
                    <IconUpload value={newSvc[cat.id]?.icon ?? ''} onChange={icon => setNewSvc(p => ({ ...p, [cat.id]: { name: p[cat.id]?.name ?? '', icon } }))} companyId={companyId} />
                    <div className="flex gap-2">
                      <input value={newSvc[cat.id]?.name ?? ''} onChange={e => setNewSvc(p => ({ ...p, [cat.id]: { icon: p[cat.id]?.icon ?? '', name: e.target.value } }))} placeholder="Novo serviço" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button onClick={() => addService(cat.id)} className="px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {categories.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">Nenhuma categoria.</div>}
        </div>

        {/* Nova categoria */}
        <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50">
          <IconUpload value={newCat.icon} onChange={icon => setNewCat({ ...newCat, icon })} companyId={companyId} />
          <div className="flex gap-2">
            <input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nova categoria" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={addCategory} className="flex items-center gap-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"><Plus className="w-4 h-4" /> Categoria</button>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

// Linha de configuração de um sintoma para um serviço (SLA + Grupo + ativo)
function SymptomRow({ symptom, existing, groups, templates, onSave }: {
  symptom: SystemSymptomRow
  existing?: CatalogServiceSymptomRow
  groups: AssignmentGroupRow[]
  templates: FormTemplateRow[]
  onSave: (active: boolean, slaHours: number, groupId: string, fields: RequestFormField[], templateId: string | null, uiConfig: CatalogServiceSymptomRow['ui_config']) => Promise<CatalogServiceSymptomRow | null>
}) {
  const [active, setActive] = useState(existing?.active ?? false)
  const [sla, setSla] = useState(existing?.sla_hours ?? 24)
  const [groupId, setGroupId] = useState(existing?.assignment_group_id ?? '')
  const [dirty, setDirty] = useState(false)
  const [showFields, setShowFields] = useState(false)
  const [showCanvas, setShowCanvas] = useState(false)

  const mark = () => setDirty(true)

  useEffect(() => {
    setActive(existing?.active ?? false)
    setSla(existing?.sla_hours ?? 24)
    setGroupId(existing?.assignment_group_id ?? '')
    setDirty(false)
  }, [existing?.id, existing?.active, existing?.sla_hours, existing?.assignment_group_id])

  return (
    <div className={`rounded-lg border p-2 ${active ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 flex-1 min-w-[160px] cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => { setActive(e.target.checked); mark() }} className="rounded border-slate-300" />
          <span className="text-sm">{symptom.icon} {symptom.name}</span>
        </label>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          SLA
          <input type="number" min={1} value={sla} onChange={e => { setSla(Number(e.target.value)); mark() }} className="w-16 border border-slate-200 rounded px-2 py-1 text-sm" /> h
        </div>
        <select value={groupId} onChange={e => { setGroupId(e.target.value); mark() }} className="border border-slate-200 rounded px-2 py-1 text-sm bg-white min-w-[150px]">
          <option value="">Grupo Solucionador…</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setShowFields(current => !current)}
          className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100"
        >
          {showFields ? 'Fechar formulário' : 'Configurar formulário'}
        </button>
        <button
          type="button"
          onClick={() => setShowCanvas(current => !current)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-lg hover:bg-violet-100"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> {showCanvas ? 'Fechar Canvas' : 'Canvas do Card'}
        </button>
        <button
          onClick={async () => {
            const updated = await onSave(active, sla, groupId, parseFormFields(existing?.form_fields), existing?.form_template_id ?? null, existing?.ui_config ?? {})
            if (updated) setDirty(false)
          }}
          disabled={!dirty}
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40"
        >
          Salvar
        </button>
      </div>
      {showFields && (
        <TemplateFormConfigurator
          entityKey={`${symptom.id}:${existing?.id ?? 'new'}`}
          value={existing?.form_fields ?? []}
          templateId={existing?.form_template_id}
          templates={templates}
          onSave={async (fields, templateId) => {
            const updated = await onSave(active, sla, groupId, fields, templateId, existing?.ui_config ?? {})
            if (!updated) throw new Error('Falha ao salvar os campos do incidente.')
          }}
        />
      )}
      {showCanvas && (
        <CatalogCardCanvas
          name={symptom.name}
          icon={symptom.icon}
          value={existing?.ui_config}
          onSave={async config => {
            const updated = await onSave(
              active,
              sla,
              groupId,
              parseFormFields(existing?.form_fields),
              existing?.form_template_id ?? null,
              config as unknown as CatalogServiceSymptomRow['ui_config'],
            )
            if (!updated) throw new Error('Falha ao salvar o Canvas do incidente.')
          }}
        />
      )}
    </div>
  )
}

// ════════════════ Gestor do Catálogo de REQUISIÇÕES (2 níveis) ═══════════════
function RequestCatalogManager({ companyId, groups, templates }: { companyId: string; groups: AssignmentGroupRow[]; templates: FormTemplateRow[] }) {
  const [cats, setCats] = useState<RequestCategoryRow[]>([])
  const [itemsByCat, setItemsByCat] = useState<Record<string, RequestItemRow[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Rascunhos persistentes
  const [newCat, setNewCat, clearNewCat] = usePersistentState('flowfy_draft_req_category', { name: '', icon: '' })
  const [newItem, setNewItem] = usePersistentState<Record<string, { name: string; icon: string }>>('flowfy_draft_req_item', {})
  const [editFields, setEditFields] = useState<string | null>(null)
  const [editCanvas, setEditCanvas] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setCats(await serviceCatalogService.listRequestCategories(companyId)) }
    catch (e: any) { setError(e?.message || 'Erro ao carregar requisições.') }
    finally { setLoading(false) }
  }, [companyId])
  useEffect(() => { load() }, [load])

  const loadItems = useCallback(async (catId: string) => {
    try { const rows = await serviceCatalogService.listRequestItems(companyId, { categoryId: catId }); setItemsByCat(p => ({ ...p, [catId]: rows })) }
    catch (e: any) { setError(e?.message || 'Erro ao carregar itens.') }
  }, [companyId])

  const toggle = (catId: string) => setExpanded(prev => {
    const n = new Set(prev)
    if (n.has(catId)) n.delete(catId); else { n.add(catId); if (!itemsByCat[catId]) loadItems(catId) }
    return n
  })

  const addCat = async () => {
    if (!newCat.name.trim()) return
    try { const c = await serviceCatalogService.createRequestCategory({ company_id: companyId, name: newCat.name.trim(), icon: newCat.icon || null, active: true, sort_order: cats.length }); setCats(p => [...p, c]); clearNewCat() }
    catch (e: any) { setError(e?.message || 'Falha ao criar categoria.') }
  }
  const toggleCatActive = async (c: RequestCategoryRow) => {
    try { const u = await serviceCatalogService.updateRequestCategory(c.id, { active: !c.active }); setCats(p => p.map(x => x.id === c.id ? u : x)) } catch (e: any) { setError(e?.message) }
  }
  const updateCatIcon = async (c: RequestCategoryRow, icon: string) => {
    try {
      const updated = await serviceCatalogService.updateRequestCategory(c.id, { icon })
      setCats(prev => prev.map(row => row.id === c.id ? updated : row))
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar o ícone da categoria.') }
  }
  const delCat = async (c: RequestCategoryRow) => {
    if (!confirm(`Excluir a categoria "${c.name}" e seus itens?`)) return
    try { await serviceCatalogService.deleteRequestCategory(c.id); setCats(p => p.filter(x => x.id !== c.id)) } catch (e: any) { setError(e?.message) }
  }

  const addItem = async (catId: string) => {
    const d = newItem[catId]
    if (!d?.name.trim()) return
    try {
      const it = await serviceCatalogService.createRequestItem({ company_id: companyId, request_category_id: catId, name: d.name.trim(), icon: d.icon || null, form_fields: [], active: true, sort_order: (itemsByCat[catId]?.length ?? 0) })
      setItemsByCat(p => ({ ...p, [catId]: [...(p[catId] ?? []), it] }))
      setNewItem(p => { const n = { ...p }; delete n[catId]; return n })
      setEditFields(it.id)
    } catch (e: any) { setError(e?.message || 'Falha ao criar item.') }
  }
  const patchItem = async (it: RequestItemRow, patch: Partial<RequestItemRow>) => {
    try {
      const updated = await serviceCatalogService.updateRequestItem(it.id, patch)
      setItemsByCat(p => ({ ...p, [it.request_category_id]: (p[it.request_category_id] ?? []).map(x => x.id === it.id ? updated : x) }))
      return updated
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar item.')
      return null
    }
  }
  const delItem = async (it: RequestItemRow) => {
    if (!confirm(`Excluir o item "${it.name}"?`)) return
    try { await serviceCatalogService.deleteRequestItem(it.id); setItemsByCat(p => ({ ...p, [it.request_category_id]: (p[it.request_category_id] ?? []).filter(x => x.id !== it.id) })) } catch (e: any) { setError(e?.message) }
  }

  if (loading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando requisições…</div>

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-indigo-600" />
        <h3 className="text-sm font-bold text-slate-700">Requisições (Categoria › Item)</h3>
      </div>
      {error && <div className="m-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{error}</div>}

      <div className="divide-y divide-slate-100">
        {cats.map(cat => (
          <div key={cat.id}>
            <div className={`flex items-center gap-2 px-3 py-2.5 ${!cat.active ? 'opacity-50' : ''}`}>
              <button onClick={() => toggle(cat.id)} className="p-1 text-slate-400 hover:text-slate-700">{expanded.has(cat.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
              <IconUpload value={cat.icon} onChange={icon => updateCatIcon(cat, icon)} companyId={companyId} compact />
              <span className="text-sm font-bold text-slate-800 flex-1">{cat.name}</span>
              <button onClick={() => toggleCatActive(cat)} className="p-1 text-slate-400 hover:text-indigo-600">{cat.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
              <button onClick={() => delCat(cat)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>

            {expanded.has(cat.id) && (
              <div className="pl-8 pr-3 pb-3 space-y-2 bg-slate-50/50">
                {(itemsByCat[cat.id] ?? []).map(it => (
                  <div key={it.id} className={`bg-white border border-slate-200 rounded-xl p-2.5 ${!it.active ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <IconUpload value={it.icon} onChange={icon => patchItem(it, { icon })} companyId={companyId} compact />
                      <span className="text-sm font-semibold text-slate-700 flex-1 min-w-[120px]">{it.name}</span>
                      <select value={it.assignment_group_id ?? ''} onChange={e => patchItem(it, { assignment_group_id: e.target.value || null })} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[140px]">
                        <option value="">Grupo Solucionador…</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <button onClick={() => setEditFields(editFields === it.id ? null : it.id)} className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100">
                        {editFields === it.id ? 'Fechar formulário' : 'Configurar formulário'}
                      </button>
                      <button onClick={() => setEditCanvas(editCanvas === it.id ? null : it.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-lg hover:bg-violet-100">
                        <SlidersHorizontal className="h-3.5 w-3.5" /> {editCanvas === it.id ? 'Fechar Canvas' : 'Canvas do Card'}
                      </button>
                      <button onClick={() => patchItem(it, { active: !it.active })} className="p-1 text-slate-400 hover:text-indigo-600">{it.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                      <button onClick={() => delItem(it)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    {editFields === it.id && (
                      <TemplateFormConfigurator
                        entityKey={it.id}
                        value={it.form_fields}
                        templateId={it.form_template_id}
                        templates={templates}
                        onSave={async (fields, templateId) => {
                          const updated = await patchItem(it, {
                            form_fields: fields as unknown as RequestItemRow['form_fields'],
                            form_template_id: templateId,
                          })
                          if (!updated) throw new Error('Falha ao salvar os campos.')
                        }}
                      />
                    )}
                    {editCanvas === it.id && (
                      <CatalogCardCanvas
                        name={it.name}
                        icon={it.icon}
                        value={it.ui_config}
                        onSave={async config => {
                          const updated = await patchItem(it, {
                            ui_config: config as unknown as RequestItemRow['ui_config'],
                          })
                          if (!updated) throw new Error('Falha ao salvar o Canvas da requisição.')
                        }}
                      />
                    )}
                  </div>
                ))}

                {/* Novo item */}
                <div className="pt-1 space-y-2 border-t border-slate-100">
                  <IconUpload value={newItem[cat.id]?.icon ?? ''} onChange={icon => setNewItem(p => ({ ...p, [cat.id]: { name: p[cat.id]?.name ?? '', icon } }))} companyId={companyId} />
                  <div className="flex gap-2">
                    <input value={newItem[cat.id]?.name ?? ''} onChange={e => setNewItem(p => ({ ...p, [cat.id]: { icon: p[cat.id]?.icon ?? '', name: e.target.value } }))} placeholder="Novo item (ex: Solicitar Notebook)" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={() => addItem(cat.id)} className="px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {cats.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">Nenhuma categoria de requisição.</div>}
      </div>

      <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50">
        <IconUpload value={newCat.icon} onChange={icon => setNewCat({ ...newCat, icon })} companyId={companyId} />
        <div className="flex gap-2">
          <input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nova categoria de requisição" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={addCat} className="flex items-center gap-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"><Plus className="w-4 h-4" /> Categoria</button>
        </div>
      </div>
    </div>
  )
}
