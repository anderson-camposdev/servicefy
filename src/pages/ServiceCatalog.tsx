import { useState, useEffect } from 'react'
import { serviceCatalogService } from '../lib/services'
import type { CatalogCategoryRow, CatalogItemRow } from '../lib/database.types'

/**
 * Vitrine do Service Catalog (Portal do Usuário).
 * Navega por categorias → itens ativos → abre REQUISIÇÃO criando um
 * incident com ticket_type='request' + catalog_item_id (modelo unificado).
 */
interface ServiceCatalogProps {
  companyId: string
  currentUserId: string
  currentUserName: string
  primaryColor: string
}

export default function ServiceCatalog({ companyId, currentUserId, currentUserName, primaryColor }: ServiceCatalogProps) {
  const [categories, setCategories] = useState<CatalogCategoryRow[]>([])
  const [items, setItems] = useState<CatalogItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string>('all')

  const [selected, setSelected] = useState<CatalogItemRow | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      serviceCatalogService.listCategories(companyId, { activeOnly: true }),
      serviceCatalogService.listItems(companyId, { activeOnly: true }),
    ])
      .then(([cats, its]) => { if (!cancelled) { setCategories(cats); setItems(its) } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar o catálogo.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId])

  const visibleItems = activeCat === 'all' ? items : items.filter(i => i.category_id === activeCat)

  const submit = async () => {
    if (!selected) return
    setSubmitting(true); setError(null)
    try {
      const inc = await serviceCatalogService.openRequest({
        companyId,
        item: { id: selected.id, name: selected.name, category: selected.category },
        description: description.trim() || undefined,
        callerId: currentUserId,
        callerName: currentUserName,
      })
      setDone(inc.number)
      setSelected(null)
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir a requisição.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─ Sucesso ─
  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm text-center py-16 space-y-3">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-slate-800">Requisição aberta!</h2>
        <p className="text-slate-500 text-sm">Seu chamado <b className="font-mono">{done}</b> foi registrado e já está na fila do time.</p>
        <button onClick={() => setDone(null)} className="px-5 py-2 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 transition-all" style={{ backgroundColor: primaryColor }}>
          Nova Solicitação
        </button>
      </div>
    )
  }

  // ─ Formulário de abertura ─
  if (selected) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-start gap-4">
          <span className="text-4xl">{selected.icon || '🧩'}</span>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{selected.name}</h2>
            <p className="text-slate-500 text-sm mt-1">{selected.description}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-400">
              <span>⏱ SLA {selected.sla_hours}h</span>
              {selected.cost ? <span>💰 R$ {Number(selected.cost).toLocaleString('pt-BR')}</span> : null}
              {selected.requires_approval && <span>✅ Requer aprovação</span>}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-3">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Detalhes da solicitação</label>
          <textarea
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descreva o que você precisa (opcional)…"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 resize-none bg-white shadow-sm"
          />
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button onClick={() => { setSelected(null); setError(null) }} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">Voltar</button>
            <button onClick={submit} disabled={submitting} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 shadow-md disabled:opacity-50 transition-all" style={{ backgroundColor: primaryColor }}>
              {submitting ? 'Enviando…' : 'Abrir Requisição'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─ Vitrine ─
  return (
    <div className="space-y-5">
      {/* Filtro de categorias */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCat('all')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${activeCat === 'all' ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
          style={activeCat === 'all' ? { backgroundColor: primaryColor } : {}}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCat(cat.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${activeCat === cat.id ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
            style={activeCat === cat.id ? { backgroundColor: primaryColor } : {}}
          >
            <span>{cat.icon}</span> {cat.name}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-slate-400 animate-pulse">Carregando catálogo…</div>}
      {error && !loading && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map(item => {
            const catName = categories.find(c => c.id === item.category_id)?.name ?? item.category
            return (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all group"
              >
                <div className="text-3xl mb-3">{item.icon || '🧩'}</div>
                <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                <div className="text-slate-400 text-xs mt-1 line-clamp-2">{item.description}</div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">{catName}</span>
                  <span className="ml-auto text-[10px] font-bold text-slate-500">SLA {item.sla_hours}h</span>
                </div>
                <span className="mt-2 inline-flex items-center text-xs font-semibold group-hover:opacity-80" style={{ color: primaryColor }}>Solicitar →</span>
              </button>
            )
          })}
          {visibleItems.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400">Nenhum item disponível nesta categoria.</div>
          )}
        </div>
      )}
    </div>
  )
}
