import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Eye, EyeOff, FolderTree, Package } from 'lucide-react'
import { serviceCatalogService } from '../lib/services'
import type { CatalogCategoryRow, CatalogItemRow } from '../lib/database.types'

/**
 * CRUD rápido do Service Catalog (Design de Serviços — Admin).
 * Categorias (esquerda) e itens da categoria selecionada (direita).
 */
export default function CatalogManager({ companyId }: { companyId: string }) {
  const [categories, setCategories] = useState<CatalogCategoryRow[]>([])
  const [items, setItems] = useState<CatalogItemRow[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Forms
  const [newCat, setNewCat] = useState({ name: '', icon: '📦' })
  const [newItem, setNewItem] = useState({ name: '', description: '', sla_hours: 24 })

  const loadCategories = useCallback(async () => {
    setError(null)
    try {
      const cats = await serviceCatalogService.listCategories(companyId)
      setCategories(cats)
      if (!selectedCat && cats.length) setSelectedCat(cats[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar categorias.')
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedCat])

  useEffect(() => { loadCategories() }, [loadCategories])

  useEffect(() => {
    if (!selectedCat) { setItems([]); return }
    let cancelled = false
    serviceCatalogService.listItems(companyId, { categoryId: selectedCat })
      .then(rows => { if (!cancelled) setItems(rows) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar itens.') })
    return () => { cancelled = true }
  }, [companyId, selectedCat])

  const addCategory = async () => {
    if (!newCat.name.trim()) return
    try {
      const cat = await serviceCatalogService.createCategory({
        company_id: companyId, name: newCat.name.trim(), icon: newCat.icon || '📦',
        sort_order: categories.length, is_active: true,
      })
      setNewCat({ name: '', icon: '📦' })
      setCategories(prev => [...prev, cat])
      setSelectedCat(cat.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao criar categoria.') }
  }

  const toggleCategory = async (cat: CatalogCategoryRow) => {
    try {
      const upd = await serviceCatalogService.updateCategory(cat.id, { is_active: !cat.is_active })
      setCategories(prev => prev.map(c => c.id === cat.id ? upd : c))
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar.') }
  }

  const removeCategory = async (cat: CatalogCategoryRow) => {
    if (!confirm(`Excluir a categoria "${cat.name}"? Os itens ficarão sem categoria.`)) return
    try {
      await serviceCatalogService.deleteCategory(cat.id)
      setCategories(prev => prev.filter(c => c.id !== cat.id))
      if (selectedCat === cat.id) setSelectedCat(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao excluir.') }
  }

  const addItem = async () => {
    if (!newItem.name.trim() || !selectedCat) return
    const catName = categories.find(c => c.id === selectedCat)?.name ?? ''
    try {
      const item = await serviceCatalogService.createItem({
        company_id: companyId,
        category_id: selectedCat,
        category: catName,
        name: newItem.name.trim(),
        description: newItem.description.trim() || null,
        sla_hours: Number(newItem.sla_hours) || 24,
        icon: '🧩',
        estimated_delivery_days: Math.max(1, Math.ceil((Number(newItem.sla_hours) || 24) / 24)),
        requires_approval: false,
        visible_to_roles: ['end_user'],
        form_fields: [],
        active: true,
      } as Partial<CatalogItemRow>)
      setNewItem({ name: '', description: '', sla_hours: 24 })
      setItems(prev => [...prev, item])
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao criar item.') }
  }

  const toggleItem = async (item: CatalogItemRow) => {
    try {
      const upd = await serviceCatalogService.updateItem(item.id, { active: !item.active })
      setItems(prev => prev.map(i => i.id === item.id ? upd : i))
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar item.') }
  }

  if (loading) return <div className="text-center py-12 text-slate-400 animate-pulse">Carregando catálogo…</div>

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Categorias */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-700">Categorias</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {categories.map(cat => (
              <div
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${selectedCat === cat.id ? 'bg-indigo-50' : 'hover:bg-slate-50'} ${!cat.is_active ? 'opacity-50' : ''}`}
              >
                <span>{cat.icon}</span>
                <span className="text-sm font-medium text-slate-700 flex-1 truncate">{cat.name}</span>
                <button onClick={(e) => { e.stopPropagation(); toggleCategory(cat) }} title={cat.is_active ? 'Desativar' : 'Ativar'} className="p-1 text-slate-400 hover:text-indigo-600">
                  {cat.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeCategory(cat) }} title="Excluir" className="p-1 text-slate-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {categories.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">Nenhuma categoria.</div>}
          </div>
          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input value={newCat.icon} onChange={e => setNewCat({ ...newCat, icon: e.target.value })} className="w-12 text-center border border-slate-200 rounded-lg px-1 py-1.5 text-sm" />
            <input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nova categoria" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={addCategory} className="px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Itens da categoria */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-700">
              Itens {selectedCat ? `· ${categories.find(c => c.id === selectedCat)?.name ?? ''}` : ''}
            </h3>
          </div>

          {!selectedCat ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">Selecione uma categoria para gerenciar os itens.</div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {items.map(item => (
                  <div key={item.id} className={`px-4 py-3 flex items-center gap-3 ${!item.active ? 'opacity-50' : ''}`}>
                    <span className="text-lg">{item.icon || '🧩'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                      <div className="text-xs text-slate-400 truncate">{item.description || 'Sem descrição'} · SLA {item.sla_hours}h</div>
                    </div>
                    <button onClick={() => toggleItem(item)} title={item.active ? 'Desativar' : 'Ativar'} className="p-1.5 text-slate-400 hover:text-indigo-600">
                      {item.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
                {items.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-400">Nenhum item nesta categoria.</div>}
              </div>

              {/* Novo item */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
                <div className="flex gap-2">
                  <input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Nome do serviço (ex.: Reset de Senha)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2">
                    <span className="text-xs text-slate-400">SLA(h)</span>
                    <input type="number" min={1} value={newItem.sla_hours} onChange={e => setNewItem({ ...newItem, sla_hours: Number(e.target.value) })} className="w-14 py-2 text-sm outline-none" />
                  </div>
                  <button onClick={addItem} className="flex items-center gap-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"><Plus className="w-4 h-4" /> Add</button>
                </div>
                <input value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} placeholder="Descrição (opcional)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
