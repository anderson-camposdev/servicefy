import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, X, Pencil, AlertCircle } from 'lucide-react'
import { pendingReasonsService } from '../lib/services'
import { useToast } from '../context'
import type { PendingReasonRow } from '../lib/database.types'

const getMsg = (e: unknown): string => {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown }
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.details === 'string' && o.details) return o.details
  }
  return e instanceof Error ? e.message : 'Falha na operação.'
}

/** Gera um slug estável a partir do nome (sem acento, minúsculo, com hífens). */
const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export default function PendingReasonManager({ companyId }: { companyId: string }) {
  const { toast } = useToast()
  const [reasons, setReasons] = useState<PendingReasonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formulário (criação OU edição quando editingId !== null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [requiresCustomerAction, setRequiresCustomerAction] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError(null)
    try {
      setReasons(await pendingReasonsService.listAll(companyId))
    } catch (e) {
      setError(getMsg(e))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  // Slug auto-derivado do nome enquanto o usuário não o editar manualmente.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  const resetForm = () => {
    setEditingId(null); setName(''); setSlug(''); setSlugTouched(false); setRequiresCustomerAction(false)
  }

  const startEdit = (r: PendingReasonRow) => {
    setEditingId(r.id); setName(r.name); setSlug(r.slug); setSlugTouched(true)
    setRequiresCustomerAction(r.requires_customer_action)
  }

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) {
      const msg = 'Informe o nome do motivo.'; setError(msg); toast.error(msg); return
    }
    setSaving(true); setError(null)
    try {
      if (editingId) {
        const updated = await pendingReasonsService.update(editingId, companyId, {
          name: name.trim(), slug: slug.trim(), requires_customer_action: requiresCustomerAction,
        })
        setReasons(prev => prev.map(r => r.id === editingId ? updated : r))
        toast.success('Motivo atualizado.')
      } else {
        const created = await pendingReasonsService.create({
          companyId, name: name.trim(), slug: slug.trim(), requiresCustomerAction,
        })
        setReasons(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Motivo cadastrado.')
      }
      resetForm()
    } catch (e) {
      const msg = getMsg(e); setError(msg); toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (r: PendingReasonRow) => {
    if (!confirm(`Excluir o motivo "${r.name}"?`)) return
    try {
      await pendingReasonsService.remove(r.id, companyId)
      setReasons(prev => prev.filter(x => x.id !== r.id))
      if (editingId === r.id) resetForm()
      toast.success('Motivo excluído.')
    } catch (e) {
      const msg = getMsg(e); setError(msg); toast.error(msg)
    }
  }

  const toggleActive = async (r: PendingReasonRow) => {
    try {
      const updated = await pendingReasonsService.update(r.id, companyId, { active: !r.active })
      setReasons(prev => prev.map(x => x.id === r.id ? updated : x))
    } catch (e) {
      toast.error(getMsg(e))
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Formulário */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4">{editingId ? 'Editar Motivo' : 'Novo Motivo de Pendência'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nome do Motivo</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex.: Aguardando Usuário"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Slug (gerado automaticamente)</label>
            <input
              value={slug}
              onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true) }}
              placeholder="aguardando-usuario"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-3">
            <label className="flex items-center gap-2 cursor-pointer select-none py-2.5">
              <input
                type="checkbox"
                checked={requiresCustomerAction}
                onChange={e => setRequiresCustomerAction(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-slate-700">Exige Ação do Usuário?</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          {editingId && (
            <button onClick={resetForm} className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-xl transition-colors">
              <X className="w-4 h-4" /> Cancelar
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
            {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {saving ? 'Salvando…' : (editingId ? 'Salvar' : 'Adicionar')}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <th className="px-5 py-3 text-left">Motivo</th>
              <th className="px-5 py-3 text-left">Slug</th>
              <th className="px-5 py-3 text-center">Exige Ação do Usuário</th>
              <th className="px-5 py-3 text-center">Ativo</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400 animate-pulse">Carregando…</td></tr>
            ) : reasons.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Nenhum motivo cadastrado.</td></tr>
            ) : reasons.map(r => (
              <tr key={r.id} className="text-slate-600 hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{r.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{r.slug}</td>
                <td className="px-5 py-3 text-center">
                  {r.requires_customer_action
                    ? <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Sim</span>
                    : <span className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Não</span>}
                </td>
                <td className="px-5 py-3 text-center">
                  <button onClick={() => toggleActive(r)} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {r.active ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => startEdit(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
