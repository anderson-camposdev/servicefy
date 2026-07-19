import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, ChevronRight, ChevronDown, FolderTree, Eye, EyeOff, ShoppingCart, BookOpen, X, CheckCircle, Loader, Building2, ArrowUp, ArrowDown, Layers, Palette, RefreshCw } from 'lucide-react'
import { serviceCatalogService, assignmentGroupsService, departmentsService, slaCalendarsService } from '../lib/services'
import { parseFormFields } from '../lib/catalogFormFields'
import IconPicker from '../components/IconPicker'
import FormTemplateManager from './FormTemplateManager'
import TemplateFormConfigurator from './TemplateFormConfigurator'
import { usePersistentState } from '../hooks/usePersistentState'
import { useTenant } from '../tenant/TenantContext'
import { companiesService } from '../lib/services'
import type { CatalogCategoryRow, CatalogServiceRow, SystemSymptomRow, CatalogServiceSymptomRow, AssignmentGroupRow, RequestCategoryRow, RequestSubcategoryRow, RequestItemRow, RequestFormField, FormTemplateRow, DepartmentRow, SlaCalendarRow } from '../lib/database.types'
import { INCIDENT_CATALOG_TEMPLATES, INCIDENT_HR_TEMPLATES, REQUEST_CATALOG_TEMPLATES, REQUEST_HR_TEMPLATES } from '../lib/catalog-templates'
import type { IncidentCategoryTemplate, RequestCategoryTemplate } from '../lib/catalog-templates'

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
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [calendars, setCalendars] = useState<SlaCalendarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set())
  const [expandedSvc, setExpandedSvc] = useState<Set<string>>(new Set())
  const [servicesByCat, setServicesByCat] = useState<Record<string, CatalogServiceRow[]>>({})
  const [ssByService, setSsByService] = useState<Record<string, CatalogServiceSymptomRow[]>>({})
  const [collapsedDept, setCollapsedDept] = useState<Set<string>>(new Set())
  const [showAppearance, setShowAppearance] = useState(false)
  const toggleDept = (key: string) => setCollapsedDept(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const NO_DEPT_KEY = '__none__'
  const groupedCategories = useMemo(() => {
    const groups = new Map<string, { dept: DepartmentRow | null; cats: CatalogCategoryRow[] }>()
    categories.forEach(cat => {
      const key = cat.department_id || NO_DEPT_KEY
      if (!groups.has(key)) {
        const dept = cat.department_id ? departments.find(d => d.id === cat.department_id) || null : null
        groups.set(key, { dept, cats: [] })
      }
      groups.get(key)!.cats.push(cat)
    })
    return Array.from(groups.entries()).sort(([keyA, a], [keyB, b]) => {
      if (keyA === NO_DEPT_KEY) return -1
      if (keyB === NO_DEPT_KEY) return 1
      return (a.dept?.name || '').localeCompare(b.dept?.name || '')
    })
  }, [categories, departments])

  const { tenant } = useTenant()
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [colorsSaved, setColorsSaved] = useState(false)

  // Local draft for color fields — avoids page reload mid-pick
  const existingCardSettings = (tenant?.catalog_ui_config as any)?.card_settings || {}
  const [localColors, setLocalColors] = useState({
    icon_bg_color: existingCardSettings.icon_bg_color || '',
    label_bg_color: existingCardSettings.label_bg_color || '',
    label_color: existingCardSettings.label_color || '',
  })

  // Rascunhos persistentes (imunes a reload forçado / Tab Discarding)
  const [newCat, setNewCat, clearNewCat] = usePersistentState('flowfy_draft_inc_category', { name: '', icon: '', department_id: '' })
  const [newSvc, setNewSvc] = usePersistentState<Record<string, { name: string; icon: string }>>('flowfy_draft_inc_service', {})

  // Biblioteca de templates de incidentes
  const [showIncidentLibrary, setShowIncidentLibrary] = useState(false)
  const [incidentLibTab, setIncidentLibTab] = useState<'ti' | 'rh'>('ti')
  const [importingIncidentId, setImportingIncidentId] = useState<string | null>(null)
  const [importedIncidentIds, setImportedIncidentIds] = useState<Set<string>>(new Set())

  const importIncidentTemplate = async (tpl: IncidentCategoryTemplate) => {
    setImportingIncidentId(tpl.id)
    try {
      const cat = await serviceCatalogService.createCategory({
        company_id: companyId, name: tpl.name, icon: tpl.icon, sort_order: categories.length, is_active: true, department_id: null,
      })
      for (const svcTpl of tpl.services) {
        const svc = await serviceCatalogService.createService({
          company_id: companyId, category_id: cat.id, name: svcTpl.name, icon: svcTpl.icon, sort_order: 0, is_active: true,
        })
        for (const symptomName of svcTpl.symptoms) {
          const sym = symptomsMaster.find(s => s.name === symptomName)
          if (sym) {
            await serviceCatalogService.upsertServiceSymptom({
              companyId, serviceId: svc.id, symptomId: sym.id, slaHours: 24, active: true,
            })
          }
        }
      }
      setImportedIncidentIds(prev => new Set([...prev, tpl.id]))
      await reload()
    } catch (e: any) {
      setError(e?.message || 'Falha ao importar template.')
    } finally {
      setImportingIncidentId(null)
    }
  }

  const reload = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      if (section === 'incident') {
        const [cats, syms, grps, formTemplates, depts, cals] = await Promise.all([
          serviceCatalogService.listCategories(companyId),
          serviceCatalogService.listSymptoms(),
          assignmentGroupsService.list(companyId),
          serviceCatalogService.listFormTemplates(companyId),
          departmentsService.list(companyId),
          slaCalendarsService.list(companyId),
        ])
        setCategories(cats)
        setSymptomsMaster(syms)
        setGroups(grps)
        setTemplates(formTemplates)
        setDepartments(depts)
        setCalendars(cals)
      } else if (section === 'request') {
        const [grps, formTemplates, depts, cals] = await Promise.all([
          assignmentGroupsService.list(companyId),
          serviceCatalogService.listFormTemplates(companyId),
          departmentsService.list(companyId),
          slaCalendarsService.list(companyId),
        ])
        setGroups(grps)
        setTemplates(formTemplates)
        setDepartments(depts)
        setCalendars(cals)
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
      const cat = await serviceCatalogService.createCategory({ company_id: companyId, name: newCat.name.trim(), icon: newCat.icon || '', sort_order: categories.length, is_active: true, department_id: newCat.department_id || null })
      clearNewCat(); setCategories(prev => [...prev, cat])
    } catch (e: any) { setError(e?.message || 'Falha ao criar categoria.') }
  }
  const toggleCategoryActive = async (c: CatalogCategoryRow) => {
    try { const u = await serviceCatalogService.updateCategory(c.id, { is_active: !c.is_active }); setCategories(prev => prev.map(x => x.id === c.id ? u : x)) }
    catch (e: any) { setError(e?.message || 'Falha ao atualizar.') }
  }
  const updateCategoryDepartment = async (c: CatalogCategoryRow, department_id: string | null) => {
    try {
      const updated = await serviceCatalogService.updateCategory(c.id, { department_id })
      setCategories(prev => prev.map(row => row.id === c.id ? updated : row))
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar o departamento da categoria.') }
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
    slaCalendarId: string | null,
    fixedPriority: number | null,
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
        slaCalendarId,
        fixedPriority,
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

  const updateGlobalSettings = async (updates: { icon_size?: string; font_size?: string; icon_bg_color?: string; label_color?: string; label_bg_color?: string }) => {
    if (!tenant) return
    setSavingGlobal(true)
    try {
      const newConfig = {
        ...(tenant.catalog_ui_config as Record<string, unknown> || {}),
        card_settings: {
          ...((tenant.catalog_ui_config as any)?.card_settings || {}),
          ...updates
        }
      }
      await companiesService.update(companyId, { catalog_ui_config: newConfig })
      window.location.reload()
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar configuração global.')
      setSavingGlobal(false)
    }
  }

  // Save only color fields without reloading (applied immediately via CSS var)
  const saveColors = async () => {
    if (!tenant) return
    setSavingGlobal(true)
    try {
      const newConfig = {
        ...(tenant.catalog_ui_config as Record<string, unknown> || {}),
        card_settings: {
          ...((tenant.catalog_ui_config as any)?.card_settings || {}),
          icon_bg_color: localColors.icon_bg_color || undefined,
          label_bg_color: localColors.label_bg_color || undefined,
          label_color: localColors.label_color || undefined,
        }
      }
      await companiesService.update(companyId, { catalog_ui_config: newConfig })
      setColorsSaved(true)
      setTimeout(() => setColorsSaved(false), 2000)
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar cores.')
    } finally {
      setSavingGlobal(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando catálogo…</div>

  return (
    <div className="space-y-5">
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-950">
            {section === 'incident' ? 'Incidentes e situações' : section === 'request' ? 'Solicitações e itens' : 'Modelos de formulário'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            {section === 'incident'
              ? 'Organize o caminho usado para reportar falhas e defina o atendimento de cada situação.'
              : section === 'request'
                ? 'Estruture categorias, itens, formulários, aprovações e responsáveis.'
                : 'Crie estruturas reutilizáveis para manter os formulários consistentes.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {section === 'incident' && (
            <span className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-surface-subtle px-3 text-xs font-semibold text-text-muted">
              {categories.filter(category => category.is_active).length} de {categories.length} categorias ativas
            </span>
          )}
          <button type="button" onClick={() => setShowAppearance(current => !current)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" aria-expanded={showAppearance}>
            <Palette className="h-4 w-4 text-slate-500" /> Aparência
          </button>
          <button type="button" onClick={reload} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <RefreshCw className="h-4 w-4 text-text-muted" /> Atualizar
          </button>
        </div>
      </header>

      {/* ── Estilo Global dos Cartões ── */}
      {showAppearance && <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="mb-2 text-base font-bold text-slate-950">Aparência dos cartões</h4>
        <p className="text-xs text-slate-500 mb-4">Estas configurações se aplicam a todas as categorias e itens do catálogo.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Tamanho do Ícone</label>
            <select
              disabled={savingGlobal}
              value={(tenant?.catalog_ui_config as any)?.card_settings?.icon_size || 'medium'}
              onChange={e => updateGlobalSettings({ icon_size: e.target.value as any })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white disabled:opacity-50"
            >
              <option value="small">Pequeno</option>
              <option value="medium">Médio (Padrão)</option>
              <option value="large">Grande</option>
              <option value="xlarge">Extra Grande</option>
            </select>
          </div>
          
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Tamanho da Fonte (Título)</label>
            <select
              disabled={savingGlobal}
              value={(tenant?.catalog_ui_config as any)?.card_settings?.font_size || 'medium'}
              onChange={e => updateGlobalSettings({ font_size: e.target.value as any })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white disabled:opacity-50"
            >
              <option value="small">Pequeno</option>
              <option value="medium">Normal (Padrão)</option>
              <option value="large">Grande</option>
            </select>
          </div>

          {/* Color: icon background */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Cor de Fundo do Ícone</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={localColors.icon_bg_color || '#eef2ff'}
                onChange={e => setLocalColors(prev => ({ ...prev, icon_bg_color: e.target.value }))}
                className="w-10 h-10 border-0 rounded-lg cursor-pointer p-0 bg-transparent"
              />
              <input
                type="text"
                value={localColors.icon_bg_color}
                placeholder="Ex: #eef2ff (vazio = padrão)"
                onChange={e => setLocalColors(prev => ({ ...prev, icon_bg_color: e.target.value }))}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 font-mono"
              />
              {localColors.icon_bg_color && (
                <button onClick={() => setLocalColors(prev => ({ ...prev, icon_bg_color: '' }))} className="text-xs text-slate-400 hover:text-red-500" title="Limpar">✕</button>
              )}
            </div>
          </div>

          {/* Color: label pill background */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Cor de Fundo da Pílula (Vitrine)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={localColors.label_bg_color || '#000000'}
                onChange={e => setLocalColors(prev => ({ ...prev, label_bg_color: e.target.value }))}
                className="w-10 h-10 border-0 rounded-lg cursor-pointer p-0 bg-transparent"
              />
              <input
                type="text"
                value={localColors.label_bg_color}
                placeholder="Ex: #000000 (vazio = preto)"
                onChange={e => setLocalColors(prev => ({ ...prev, label_bg_color: e.target.value }))}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Color: label text */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Cor do Texto da Pílula (Vitrine)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={localColors.label_color || '#ffffff'}
                onChange={e => setLocalColors(prev => ({ ...prev, label_color: e.target.value }))}
                className="w-10 h-10 border-0 rounded-lg cursor-pointer p-0 bg-transparent"
              />
              <input
                type="text"
                value={localColors.label_color}
                placeholder="Ex: #ffffff (vazio = branco)"
                onChange={e => setLocalColors(prev => ({ ...prev, label_color: e.target.value }))}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Save Colors Button - full width */}
          <div className="md:col-span-2 pt-2 flex items-center gap-3">
            <button
              onClick={saveColors}
              disabled={savingGlobal}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {savingGlobal ? 'Salvando...' : 'Salvar Cores'}
            </button>
            {colorsSaved && (
              <span className="text-sm text-emerald-600 font-semibold animate-pulse">✓ Cores salvas!</span>
            )}
          </div>
        </div>
      </div>}

      {section === 'templates' && <FormTemplateManager companyId={companyId} templates={templates} onChange={setTemplates} />}

      {section === 'request' && <RequestCatalogManager companyId={companyId} groups={groups} templates={templates} departments={departments} calendars={calendars} />}

      {section === 'incident' && (
      <>
      {/* Modal Biblioteca de Incidentes */}
      {showIncidentLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-800">Biblioteca de Templates — Incidentes</h2>
              </div>
              <button onClick={() => setShowIncidentLibrary(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {/* Abas */}
            <div className="flex border-b border-slate-100 px-5 gap-1 pt-2">
              {(['ti', 'rh'] as const).map(tab => (
                <button key={tab} onClick={() => setIncidentLibTab(tab)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${incidentLibTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'ti' ? '💻 TI / Infraestrutura' : '👥 Recursos Humanos'}
                </button>
              ))}
            </div>
            <p className="px-5 py-3 text-sm text-slate-500 border-b border-slate-100">
              {incidentLibTab === 'ti'
                ? 'Templates para TI / Microinformática. Importe para criar categorias, serviços e sintomas.'
                : 'Templates para RH. Cobre folha, benefícios, ponto e sistemas. Aplique a migration 052 antes de importar.'}
            </p>
            <div className="overflow-y-auto flex-1 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(incidentLibTab === 'ti' ? INCIDENT_CATALOG_TEMPLATES : INCIDENT_HR_TEMPLATES).map(tpl => {
                const imported = importedIncidentIds.has(tpl.id)
                const importing = importingIncidentId === tpl.id
                return (
                  <div key={tpl.id} className={`border rounded-xl p-4 flex flex-col gap-2 transition-all ${imported ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{tpl.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">{tpl.name}</p>
                        <p className="text-xs text-slate-500">{tpl.services.length} serviços · {tpl.services.reduce((s, v) => s + v.symptoms.length, 0)} sintomas</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{tpl.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tpl.services.map(s => (
                        <span key={s.name} className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{s.icon} {s.name}</span>
                      ))}
                    </div>
                    <button
                      onClick={() => importIncidentTemplate(tpl)}
                      disabled={importing || !!importingIncidentId}
                      className={`mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${imported ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'}`}
                    >
                      {importing ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Importando…</> : imported ? <><CheckCircle className="w-3.5 h-3.5" /> Importado</> : 'Importar'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-700 flex-1">Incidentes (Categoria › Serviço › Sintoma)</h3>
          <button onClick={() => setShowIncidentLibrary(true)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
            <BookOpen className="w-3.5 h-3.5" /> Biblioteca
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {groupedCategories.map(([deptKey, group]) => {
            const isCollapsed = collapsedDept.has(deptKey)
            return (
              <div key={deptKey}>
                {/* Cabeçalho do Departamento */}
                <button onClick={() => toggleDept(deptKey)} className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-100/70 hover:bg-slate-100 transition-colors text-left">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <span className="text-base">{group.dept?.icon || <Building2 className="w-4 h-4 text-slate-500" />}</span>
                  <span className="text-sm font-bold text-slate-700 flex-1">{group.dept?.name || 'TI (Padrão / Sem Departamento)'}</span>
                  <span className="text-xs text-slate-400 font-medium">{group.cats.length} categoria{group.cats.length !== 1 ? 's' : ''}</span>
                </button>

                {!isCollapsed && group.cats.map(cat => (
                  <div key={cat.id} className="border-t border-slate-50">
                    {/* Categoria */}
                    <div className={`flex items-center gap-2 pl-8 pr-3 py-2.5 ${!cat.is_active ? 'opacity-50' : ''}`}>
                      <button onClick={() => toggleCat(cat.id)} className="p-1 text-slate-400 hover:text-slate-700">
                        {expandedCat.has(cat.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <IconPicker value={cat.icon} onChange={icon => updateCategoryIcon(cat, icon)} companyId={companyId} label="" />
                      <span className="text-sm font-bold text-slate-800 flex-1">{cat.name}</span>
                      <select value={cat.department_id || ''} onChange={e => updateCategoryDepartment(cat, e.target.value || null)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white text-slate-600 max-w-[150px]">
                        <option value="">Área: Global</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button onClick={() => toggleCategoryActive(cat)} title={cat.is_active ? 'Desativar' : 'Ativar'} className="p-1 text-slate-400 hover:text-indigo-600">{cat.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                      <button onClick={() => removeCategory(cat)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>

                    {/* Serviços da categoria */}
                    {expandedCat.has(cat.id) && (
                      <div className="pl-14 pr-3 pb-3 space-y-2 bg-slate-50/50">
                        {(servicesByCat[cat.id] ?? []).map(svc => (
                          <div key={svc.id} className="bg-white border border-slate-200 rounded-xl">
                            <div className={`flex items-center gap-2 px-3 py-2 ${!svc.is_active ? 'opacity-50' : ''}`}>
                              <button onClick={() => toggleSvc(svc.id)} className="p-1 text-slate-400 hover:text-slate-700">
                                {expandedSvc.has(svc.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                              <IconPicker value={svc.icon} onChange={icon => updateServiceIcon(svc, icon)} companyId={companyId} label="" />
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
                                      calendars={calendars}
                                      onSave={(active, sla, groupId, fields, templateId, uiConfig, slaCalendarId, fixedPriority) => saveSymptom(svc.id, sym.id, active, sla, groupId, fields, templateId, uiConfig, slaCalendarId, fixedPriority)}
                                    />
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Novo serviço */}
                        <div className="flex items-center gap-3 w-full bg-slate-50/50 p-2 rounded-xl">
                          <div className="w-48 shrink-0">
                            <IconPicker value={newSvc[cat.id]?.icon ?? ''} onChange={icon => setNewSvc(p => ({ ...p, [cat.id]: { name: p[cat.id]?.name ?? '', icon } }))} companyId={companyId} label="" />
                          </div>
                          <div className="flex gap-2 flex-1">
                            <input value={newSvc[cat.id]?.name ?? ''} onChange={e => setNewSvc(p => ({ ...p, [cat.id]: { icon: p[cat.id]?.icon ?? '', name: e.target.value } }))} placeholder="Novo serviço" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={() => addService(cat.id)} className="px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"><Plus className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
          {categories.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">Nenhuma categoria.</div>}
        </div>

        {/* Nova categoria */}
        <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50">
          <IconPicker value={newCat.icon} onChange={icon => setNewCat({ ...newCat, icon })} companyId={companyId} label="Ícone da Categoria" />
          <div className="flex gap-2">
            <input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nova categoria" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            <select value={newCat.department_id || ''} onChange={e => setNewCat({ ...newCat, department_id: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white text-slate-600 max-w-[150px]">
              <option value="">Área: Global</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button onClick={addCategory} className="flex items-center gap-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"><Plus className="w-4 h-4" /> Categoria</button>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}

// Prioridades para o override de prioridade fixa (matriz ITIL 1-5)
const FIXED_PRIORITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'P1 - Crítica' },
  { value: 2, label: 'P2 - Alta' },
  { value: 3, label: 'P3 - Média' },
  { value: 4, label: 'P4 - Baixa' },
  { value: 5, label: 'P5 - Planejada' },
]

// Linha de configuração de um sintoma para um serviço (SLA + Grupo + governança + ativo)
function SymptomRow({ symptom, existing, groups, templates, calendars, onSave }: {
  symptom: SystemSymptomRow
  existing?: CatalogServiceSymptomRow
  groups: AssignmentGroupRow[]
  templates: FormTemplateRow[]
  calendars: SlaCalendarRow[]
  onSave: (active: boolean, slaHours: number, groupId: string, fields: RequestFormField[], templateId: string | null, uiConfig: CatalogServiceSymptomRow['ui_config'], slaCalendarId: string | null, fixedPriority: number | null) => Promise<CatalogServiceSymptomRow | null>
}) {
  const [active, setActive] = useState(existing?.active ?? false)
  const [sla, setSla] = useState(existing?.sla_hours ?? 24)
  const [groupId, setGroupId] = useState(existing?.assignment_group_id ?? '')
  const [slaCalendarId, setSlaCalendarId] = useState(existing?.sla_calendar_id ?? '')
  const [fixedPriority, setFixedPriority] = useState<string>(existing?.fixed_priority != null ? String(existing.fixed_priority) : '')
  const [dirty, setDirty] = useState(false)
  const [showFields, setShowFields] = useState(false)

  const mark = () => setDirty(true)

  useEffect(() => {
    setActive(existing?.active ?? false)
    setSla(existing?.sla_hours ?? 24)
    setGroupId(existing?.assignment_group_id ?? '')
    setSlaCalendarId(existing?.sla_calendar_id ?? '')
    setFixedPriority(existing?.fixed_priority != null ? String(existing.fixed_priority) : '')
    setDirty(false)
  }, [existing?.id, existing?.active, existing?.sla_hours, existing?.assignment_group_id, existing?.sla_calendar_id, existing?.fixed_priority])

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
        <select value={slaCalendarId} onChange={e => { setSlaCalendarId(e.target.value); mark() }} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[140px]" title="Calendário de SLA específico deste sintoma (vazio = padrão do tenant)">
          <option value="">Calendário: padrão</option>
          {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={fixedPriority} onChange={e => { setFixedPriority(e.target.value); mark() }} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[130px]" title="Força a prioridade do ticket (vazio = matriz Impacto×Urgência)">
          <option value="">Prioridade: matriz</option>
          {FIXED_PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setShowFields(current => !current)}
          className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100"
        >
          {showFields ? 'Fechar formulário' : 'Configurar formulário'}
        </button>
        <button
          onClick={async () => {
            const updated = await onSave(active, sla, groupId, parseFormFields(existing?.form_fields), existing?.form_template_id ?? null, existing?.ui_config ?? {}, slaCalendarId || null, fixedPriority ? Number(fixedPriority) : null)
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
            const updated = await onSave(active, sla, groupId, fields, templateId, existing?.ui_config ?? {}, slaCalendarId || null, fixedPriority ? Number(fixedPriority) : null)
            if (!updated) throw new Error('Falha ao salvar os campos do incidente.')
          }}
        />
      )}
    </div>
  )
}

// ════════════════ Gestor do Catálogo de REQUISIÇÕES (2 níveis) ═══════════════
function RequestCatalogManager({ companyId, groups, templates, departments, calendars }: { companyId: string; groups: AssignmentGroupRow[]; templates: FormTemplateRow[]; departments: DepartmentRow[]; calendars: SlaCalendarRow[] }) {
  const [cats, setCats] = useState<RequestCategoryRow[]>([])
  const [subcats, setSubcats] = useState<RequestSubcategoryRow[]>([])
  const [itemsByCat, setItemsByCat] = useState<Record<string, RequestItemRow[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedDept, setCollapsedDept] = useState<Set<string>>(new Set())
  const toggleDept = (key: string) => setCollapsedDept(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const NO_DEPT_KEY = '__none__'
  const groupedCats = useMemo(() => {
    const groups2 = new Map<string, { dept: DepartmentRow | null; cats: RequestCategoryRow[] }>()
    cats.forEach(cat => {
      const key = cat.department_id || NO_DEPT_KEY
      if (!groups2.has(key)) {
        const dept = cat.department_id ? departments.find(d => d.id === cat.department_id) || null : null
        groups2.set(key, { dept, cats: [] })
      }
      groups2.get(key)!.cats.push(cat)
    })
    return Array.from(groups2.entries()).sort(([keyA, a], [keyB, b]) => {
      if (keyA === NO_DEPT_KEY) return -1
      if (keyB === NO_DEPT_KEY) return 1
      return (a.dept?.name || '').localeCompare(b.dept?.name || '')
    })
  }, [cats, departments])
  // Rascunhos persistentes
  const [newCat, setNewCat, clearNewCat] = usePersistentState('flowfy_draft_req_category', { name: '', icon: '', department_id: '' })
  // Chave dos rascunhos de item: id da subcategoria OU o id da categoria (modo legado, sem subcategorias)
  const [newItem, setNewItem] = usePersistentState<Record<string, { name: string; icon: string }>>('flowfy_draft_req_item', {})
  const [newSubcat, setNewSubcat] = useState<Record<string, { name: string; icon: string }>>({})
  const [editFields, setEditFields] = useState<string | null>(null)

  // Biblioteca de templates de requisições
  const [showRequestLibrary, setShowRequestLibrary] = useState(false)
  const [requestLibTab, setRequestLibTab] = useState<'ti' | 'rh'>('ti')
  const [importingRequestId, setImportingRequestId] = useState<string | null>(null)
  const [importedRequestIds, setImportedRequestIds] = useState<Set<string>>(new Set())

  const importRequestTemplate = async (tpl: RequestCategoryTemplate) => {
    setImportingRequestId(tpl.id)
    try {
      const cat = await serviceCatalogService.createRequestCategory({
        company_id: companyId, name: tpl.name, icon: tpl.icon || null, active: true, sort_order: cats.length, department_id: null,
      })
      for (let i = 0; i < tpl.items.length; i++) {
        const it = tpl.items[i]
        await serviceCatalogService.createRequestItem({
          company_id: companyId, request_category_id: cat.id, name: it.name, icon: it.icon || null,
          description: it.description, form_fields: [], active: true, sort_order: i,
        })
      }
      setImportedRequestIds(prev => new Set([...prev, tpl.id]))
      setCats(prev => [...prev, cat])
    } catch (e: any) {
      setError(e?.message || 'Falha ao importar template.')
    } finally {
      setImportingRequestId(null)
    }
  }

  const load = useCallback(async () => {
    try {
      const [catRows, subcatRows] = await Promise.all([
        serviceCatalogService.listRequestCategories(companyId),
        serviceCatalogService.listRequestSubcategories(companyId),
      ])
      setCats(catRows)
      setSubcats(subcatRows)
    }
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
    try { const c = await serviceCatalogService.createRequestCategory({ company_id: companyId, name: newCat.name.trim(), icon: newCat.icon || null, active: true, sort_order: cats.length, department_id: newCat.department_id || null }); setCats(p => [...p, c]); clearNewCat() }
    catch (e: any) { setError(e?.message || 'Falha ao criar categoria.') }
  }
  const toggleCatActive = async (c: RequestCategoryRow) => {
    try { const u = await serviceCatalogService.updateRequestCategory(c.id, { active: !c.active }); setCats(p => p.map(x => x.id === c.id ? u : x)) } catch (e: any) { setError(e?.message) }
  }
  const updateCatDepartment = async (c: RequestCategoryRow, department_id: string | null) => {
    try {
      const updated = await serviceCatalogService.updateRequestCategory(c.id, { department_id })
      setCats(prev => prev.map(row => row.id === c.id ? updated : row))
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar o departamento da categoria.') }
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

  // ── Subcategorias (Nível 2 — migration 047) ──
  const subcatsForCat = useCallback(
    (catId: string) => subcats.filter(s => s.category_id === catId).sort((a, b) => a.sort_order - b.sort_order),
    [subcats],
  )

  const addSubcat = async (catId: string) => {
    const d = newSubcat[catId]
    if (!d?.name.trim()) return
    try {
      const sc = await serviceCatalogService.createRequestSubcategory({
        company_id: companyId, category_id: catId, name: d.name.trim(),
        icon: d.icon || null, active: true, sort_order: subcatsForCat(catId).length,
      })
      setSubcats(p => [...p, sc])
      setNewSubcat(p => { const n = { ...p }; delete n[catId]; return n })
    } catch (e: any) { setError(e?.message || 'Falha ao criar subcategoria.') }
  }

  const patchSubcat = async (sc: RequestSubcategoryRow, patch: Partial<RequestSubcategoryRow>) => {
    try {
      const updated = await serviceCatalogService.updateRequestSubcategory(sc.id, patch)
      setSubcats(p => p.map(x => x.id === sc.id ? updated : x))
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar subcategoria.') }
  }

  const delSubcat = async (sc: RequestSubcategoryRow) => {
    const orphanCount = (itemsByCat[sc.category_id] ?? []).filter(it => it.request_subcategory_id === sc.id).length
    const warn = orphanCount > 0 ? ` Os ${orphanCount} item(ns) dela ficarão "sem subcategoria".` : ''
    if (!confirm(`Excluir a subcategoria "${sc.name}"?${warn}`)) return
    try {
      await serviceCatalogService.deleteRequestSubcategory(sc.id)
      setSubcats(p => p.filter(x => x.id !== sc.id))
      // itens ficam órfãos (FK ON DELETE SET NULL) — recarrega para refletir
      if (itemsByCat[sc.category_id]) loadItems(sc.category_id)
    } catch (e: any) { setError(e?.message) }
  }

  const moveSubcat = async (sc: RequestSubcategoryRow, dir: -1 | 1) => {
    const siblings = subcatsForCat(sc.category_id)
    const idx = siblings.findIndex(x => x.id === sc.id)
    const target = siblings[idx + dir]
    if (!target) return
    try {
      const [a, b] = await Promise.all([
        serviceCatalogService.updateRequestSubcategory(sc.id, { sort_order: target.sort_order }),
        serviceCatalogService.updateRequestSubcategory(target.id, { sort_order: sc.sort_order }),
      ])
      setSubcats(p => p.map(x => x.id === a.id ? a : x.id === b.id ? b : x))
    } catch (e: any) { setError(e?.message || 'Falha ao reordenar.') }
  }

  const addItem = async (catId: string, subcatId?: string) => {
    const draftKey = subcatId ?? catId
    const d = newItem[draftKey]
    if (!d?.name.trim()) return
    try {
      const it = await serviceCatalogService.createRequestItem({
        company_id: companyId,
        request_category_id: catId,
        request_subcategory_id: subcatId ?? null,
        name: d.name.trim(), icon: d.icon || null, form_fields: [], active: true,
        sort_order: (itemsByCat[catId]?.length ?? 0),
      })
      setItemsByCat(p => ({ ...p, [catId]: [...(p[catId] ?? []), it] }))
      setNewItem(p => { const n = { ...p }; delete n[draftKey]; return n })
      setEditFields(it.id)
    } catch (e: any) { setError(e?.message || 'Falha ao criar item.') }
  }
  const patchItem = async (it: RequestItemRow, patch: Partial<RequestItemRow>) => {
    try {
      const updated = await serviceCatalogService.updateRequestItem(it.id, patch)
      const catKey = it.request_category_id ?? '' // itens legados podem não ter categoria (migration 047)
      setItemsByCat(p => ({ ...p, [catKey]: (p[catKey] ?? []).map(x => x.id === it.id ? updated : x) }))
      return updated
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar item.')
      return null
    }
  }
  const delItem = async (it: RequestItemRow) => {
    if (!confirm(`Excluir o item "${it.name}"?`)) return
    const catKey = it.request_category_id ?? ''
    try { await serviceCatalogService.deleteRequestItem(it.id); setItemsByCat(p => ({ ...p, [catKey]: (p[catKey] ?? []).filter(x => x.id !== it.id) })) } catch (e: any) { setError(e?.message) }
  }

  if (loading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando requisições…</div>

  return (
    <>
    {/* Modal Biblioteca de Requisições */}
    {showRequestLibrary && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-800">Biblioteca de Templates — Requisições</h2>
            </div>
            <button onClick={() => setShowRequestLibrary(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          {/* Abas */}
          <div className="flex border-b border-slate-100 px-5 gap-1 pt-2">
            {(['ti', 'rh'] as const).map(tab => (
              <button key={tab} onClick={() => setRequestLibTab(tab)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${requestLibTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab === 'ti' ? '💻 TI / Infraestrutura' : '👥 Recursos Humanos'}
              </button>
            ))}
          </div>
          <p className="px-5 py-3 text-sm text-slate-500 border-b border-slate-100">
            {requestLibTab === 'ti'
              ? 'Categorias e itens de requisições de TI. Clique em Importar para adicionar ao catálogo.'
              : 'Documentos, benefícios, jornada, carreira e desenvolvimento — solicitações do dia a dia de RH.'}
          </p>
          <div className="overflow-y-auto flex-1 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(requestLibTab === 'ti' ? REQUEST_CATALOG_TEMPLATES : REQUEST_HR_TEMPLATES).map(tpl => {
              const imported = importedRequestIds.has(tpl.id)
              const importing = importingRequestId === tpl.id
              return (
                <div key={tpl.id} className={`border rounded-xl p-4 flex flex-col gap-2 transition-all ${imported ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{tpl.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{tpl.name}</p>
                      <p className="text-xs text-slate-500">{tpl.items.length} itens</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{tpl.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tpl.items.map(it => (
                      <span key={it.name} className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{it.icon} {it.name}</span>
                    ))}
                  </div>
                  <button
                    onClick={() => importRequestTemplate(tpl)}
                    disabled={importing || !!importingRequestId}
                    className={`mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${imported ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'}`}
                  >
                    {importing ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Importando…</> : imported ? <><CheckCircle className="w-3.5 h-3.5" /> Importado</> : 'Importar'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )}

    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-indigo-600" />
        <h3 className="text-sm font-bold text-slate-700 flex-1">Requisições (Categoria › Subcategoria › Item)</h3>
        <button onClick={() => setShowRequestLibrary(true)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
          <BookOpen className="w-3.5 h-3.5" /> Biblioteca
        </button>
      </div>
      {error && <div className="m-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{error}</div>}

      <div className="divide-y divide-slate-100">
        {groupedCats.map(([deptKey, group]) => {
          const isCollapsed = collapsedDept.has(deptKey)
          return (
            <div key={deptKey}>
              {/* Cabeçalho do Departamento */}
              <button onClick={() => toggleDept(deptKey)} className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-100/70 hover:bg-slate-100 transition-colors text-left">
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                <span className="text-base">{group.dept?.icon || <Building2 className="w-4 h-4 text-slate-500" />}</span>
                <span className="text-sm font-bold text-slate-700 flex-1">{group.dept?.name || 'TI (Padrão / Sem Departamento)'}</span>
                <span className="text-xs text-slate-400 font-medium">{group.cats.length} categoria{group.cats.length !== 1 ? 's' : ''}</span>
              </button>

              {!isCollapsed && group.cats.map(cat => (
                <div key={cat.id} className="border-t border-slate-50">
                  <div className={`flex items-center gap-2 pl-8 pr-3 py-2.5 ${!cat.active ? 'opacity-50' : ''}`}>
                    <button onClick={() => toggle(cat.id)} className="p-1 text-slate-400 hover:text-slate-700">{expanded.has(cat.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
                    <IconPicker value={cat.icon} onChange={icon => updateCatIcon(cat, icon)} companyId={companyId} label="" />
                    <span className="text-sm font-bold text-slate-800 flex-1">{cat.name}</span>
                    <select value={cat.department_id || ''} onChange={e => updateCatDepartment(cat, e.target.value || null)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white text-slate-600 max-w-[150px]">
                      <option value="">Área: Global</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <button onClick={() => toggleCatActive(cat)} className="p-1 text-slate-400 hover:text-indigo-600">{cat.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                    <button onClick={() => delCat(cat)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>

                  {expanded.has(cat.id) && (() => {
                    const catSubcats = subcatsForCat(cat.id)
                    const catItems = itemsByCat[cat.id] ?? []
                    const legacyItems = catItems.filter(it => !it.request_subcategory_id)

                    const renderItemRow = (it: RequestItemRow) => (
                      <div key={it.id} className={`bg-white border border-slate-200 rounded-xl p-2.5 ${!it.active ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <IconPicker value={it.icon} onChange={icon => patchItem(it, { icon })} companyId={companyId} label="" />
                          <span className="text-sm font-semibold text-slate-700 flex-1 min-w-[120px]">{it.name}</span>
                          {catSubcats.length > 0 && (
                            <select value={it.request_subcategory_id ?? ''} onChange={e => patchItem(it, { request_subcategory_id: e.target.value || null })} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[130px]" title="Subcategoria do item">
                              <option value="">Sem subcategoria</option>
                              {catSubcats.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                            </select>
                          )}
                          <select value={it.assignment_group_id ?? ''} onChange={e => patchItem(it, { assignment_group_id: e.target.value || null })} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[140px]">
                            <option value="">Grupo Solucionador…</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                          <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              disabled={groups.length === 0}
                              checked={it.requires_approval ?? false}
                              onChange={e => patchItem(it, {
                                requires_approval: e.target.checked,
                                approval_type: e.target.checked ? (it.approval_type ?? 'group') : 'group',
                                approval_group_id: e.target.checked ? (it.approval_group_id ?? groups[0]?.id ?? null) : null,
                              })}
                            />
                            Exige aprovação
                          </label>
                          {it.requires_approval && (
                            <>
                              <select
                                value={it.approval_type ?? 'group'}
                                onChange={e => patchItem(it, {
                                  approval_type: e.target.value as 'group' | 'manager' | 'department_head',
                                  approval_group_id: e.target.value === 'group' && !it.approval_group_id ? (groups[0]?.id ?? null) : it.approval_group_id
                                })}
                                className="border border-amber-200 rounded px-2 py-1 text-xs bg-amber-50 min-w-[140px]"
                                title="Regra de aprovação"
                              >
                                <option value="group">Grupo aprovador</option>
                                <option value="manager">Gestor do solicitante</option>
                                <option value="department_head">Gestor do departamento</option>
                              </select>

                              <select
                                value={it.approval_group_id ?? ''}
                                onChange={e => patchItem(it, { approval_group_id: e.target.value || null })}
                                className="border border-amber-200 rounded px-2 py-1 text-xs bg-amber-50 min-w-[150px]"
                                title={it.approval_type === 'group' ? "Membros ativos deste grupo receberão a aprovação" : "Grupo de fallback caso o gestor não seja localizado"}
                              >
                                <option value="">{it.approval_type === 'group' ? "Grupo aprovador…" : "Grupo de fallback…"}</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                              </select>

                              {it.approval_type === 'group' && (
                                <select
                                  value={it.approval_mode ?? 'any'}
                                  onChange={e => patchItem(it, { approval_mode: e.target.value as 'any' | 'all' })}
                                  className="border border-amber-200 rounded px-2 py-1 text-xs bg-amber-50"
                                  title="Uma aprovação ou unanimidade do grupo"
                                >
                                  <option value="any">Qualquer membro</option>
                                  <option value="all">Todos os membros</option>
                                </select>
                              )}
                            </>
                          )}
                          <select value={it.sla_calendar_id ?? ''} onChange={e => patchItem(it, { sla_calendar_id: e.target.value || null })} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[130px]" title="Calendário de SLA específico deste item (vazio = padrão do tenant)">
                            <option value="">Calendário: padrão</option>
                            {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <select value={it.fixed_priority != null ? String(it.fixed_priority) : ''} onChange={e => patchItem(it, { fixed_priority: e.target.value ? Number(e.target.value) : null })} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[125px]" title="Força a prioridade do ticket (vazio = matriz Impacto×Urgência)">
                            <option value="">Prioridade: matriz</option>
                            {FIXED_PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                          <button onClick={() => setEditFields(editFields === it.id ? null : it.id)} className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100">
                            {editFields === it.id ? 'Fechar formulário' : 'Configurar formulário'}
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
                      </div>
                    )

                    const renderNewItemInput = (draftKey: string, subcatId?: string) => (
                      <div className="flex items-center gap-3 w-full bg-slate-50/50 p-2 rounded-xl">
                        <div className="w-48 shrink-0">
                          <IconPicker value={newItem[draftKey]?.icon ?? ''} onChange={icon => setNewItem(p => ({ ...p, [draftKey]: { name: p[draftKey]?.name ?? '', icon } }))} companyId={companyId} label="" />
                        </div>
                        <div className="flex gap-2 flex-1">
                          <input value={newItem[draftKey]?.name ?? ''} onChange={e => setNewItem(p => ({ ...p, [draftKey]: { icon: p[draftKey]?.icon ?? '', name: e.target.value } }))} placeholder="Novo item (ex: Solicitar Notebook)" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                          <button onClick={() => addItem(cat.id, subcatId)} className="px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"><Plus className="w-4 h-4" /></button>
                        </div>
                      </div>
                    )

                    return (
                      <div className="pl-14 pr-3 pb-3 space-y-3 bg-slate-50/50">
                        {/* ── Subcategorias (Nível 2) ── */}
                        {catSubcats.map((sc, si) => (
                          <div key={sc.id} className={`border border-indigo-100 rounded-xl bg-indigo-50/40 ${!sc.active ? 'opacity-60' : ''}`}>
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <IconPicker value={sc.icon} onChange={icon => patchSubcat(sc, { icon })} companyId={companyId} label="" />
                              <span className="text-sm font-bold text-slate-700 flex-1">{sc.name}</span>
                              <button onClick={() => moveSubcat(sc, -1)} disabled={si === 0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveSubcat(sc, 1)} disabled={si === catSubcats.length - 1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
                              <button onClick={() => patchSubcat(sc, { active: !sc.active })} className="p-1 text-slate-400 hover:text-indigo-600">{sc.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                              <button onClick={() => delSubcat(sc)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="px-2.5 pb-2.5 space-y-2">
                              {catItems.filter(it => it.request_subcategory_id === sc.id).map(renderItemRow)}
                              {renderNewItemInput(sc.id, sc.id)}
                            </div>
                          </div>
                        ))}

                        {/* ── Itens legados sem subcategoria ── */}
                        {catSubcats.length > 0 && legacyItems.length > 0 && (
                          <div className="border border-amber-200 rounded-xl bg-amber-50/50">
                            <div className="px-2.5 py-2 text-xs font-bold text-amber-700">
                              ⚠ Itens sem subcategoria — vincule-os para organizar a árvore do portal
                            </div>
                            <div className="px-2.5 pb-2.5 space-y-2">
                              {legacyItems.map(renderItemRow)}
                            </div>
                          </div>
                        )}

                        {/* Sem subcategorias: modo legado (itens direto na categoria) */}
                        {catSubcats.length === 0 && (
                          <div className="space-y-2">
                            {catItems.map(renderItemRow)}
                            {renderNewItemInput(cat.id)}
                          </div>
                        )}

                        {/* ── Nova subcategoria ── */}
                        <div className="flex items-center gap-3 w-full border border-dashed border-indigo-200 p-2 rounded-xl">
                          <div className="w-48 shrink-0">
                            <IconPicker value={newSubcat[cat.id]?.icon ?? ''} onChange={icon => setNewSubcat(p => ({ ...p, [cat.id]: { name: p[cat.id]?.name ?? '', icon } }))} companyId={companyId} label="" />
                          </div>
                          <div className="flex gap-2 flex-1">
                            <input value={newSubcat[cat.id]?.name ?? ''} onChange={e => setNewSubcat(p => ({ ...p, [cat.id]: { icon: p[cat.id]?.icon ?? '', name: e.target.value } }))} placeholder="Nova subcategoria (ex: Equipamentos)" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={() => addSubcat(cat.id)} className="flex items-center gap-1 px-2.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg"><Plus className="w-3.5 h-3.5" /> Subcategoria</button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          )
        })}
        {cats.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">Nenhuma categoria de requisição.</div>}
      </div>

      <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50">
        <IconPicker value={newCat.icon} onChange={icon => setNewCat({ ...newCat, icon })} companyId={companyId} label="Ícone da Categoria" />
        <div className="flex gap-2">
          <input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nova categoria de requisição" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <select value={newCat.department_id || ''} onChange={e => setNewCat({ ...newCat, department_id: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white text-slate-600 max-w-[150px]">
            <option value="">Área: Global</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={addCat} className="flex items-center gap-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"><Plus className="w-4 h-4" /> Categoria</button>
        </div>
      </div>
    </div>
    </>
  )
}
