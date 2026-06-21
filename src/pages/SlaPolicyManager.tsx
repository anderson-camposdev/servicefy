import { useState, useEffect, useCallback } from 'react'
import { Save, AlertCircle, Gauge } from 'lucide-react'
import { slaPolicyService } from '../lib/services'
import { useToast } from '../context'
import type { SLAPolicyRow } from '../lib/database.types'

const getMsg = (e: unknown): string => {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown }
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.details === 'string' && o.details) return o.details
  }
  return e instanceof Error ? e.message : 'Falha na operação.'
}

const PRIORITY_META: Record<number, { label: string; color: string }> = {
  1: { label: 'P1 · Crítica', color: 'bg-red-100 text-red-700' },
  2: { label: 'P2 · Alta',    color: 'bg-orange-100 text-orange-700' },
  3: { label: 'P3 · Média',   color: 'bg-amber-100 text-amber-700' },
  4: { label: 'P4 · Baixa',   color: 'bg-sky-100 text-sky-700' },
  5: { label: 'P5 · Planejada', color: 'bg-slate-100 text-slate-600' },
}

/** Converte minutos em rótulo legível (ex.: 240 → 4h, 1440 → 1d). */
const humanize = (mins: number): string => {
  if (!mins || mins <= 0) return '—'
  if (mins < 60) return `${mins}min`
  if (mins < 1440) return `${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h`
  return `${(mins / 1440).toFixed(mins % 1440 ? 1 : 0)}d`
}

interface DraftRow {
  response: string
  resolution: string
}

export default function SlaPolicyManager({ companyId }: { companyId: string }) {
  const { toast } = useToast()
  const [policies, setPolicies] = useState<SLAPolicyRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError(null)
    try {
      const rows = await slaPolicyService.list(companyId)
      setPolicies(rows)
      const d: Record<string, DraftRow> = {}
      rows.forEach(r => { d[r.id] = { response: String(r.response_time_minutes), resolution: String(r.resolution_time_minutes) } })
      setDrafts(d)
    } catch (e) {
      setError(getMsg(e))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const setDraft = (id: string, field: keyof DraftRow, value: string) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value.replace(/[^0-9]/g, '') } }))
  }

  const isDirty = (r: SLAPolicyRow): boolean => {
    const d = drafts[r.id]
    return !!d && (Number(d.response) !== r.response_time_minutes || Number(d.resolution) !== r.resolution_time_minutes)
  }

  const handleSave = async (r: SLAPolicyRow) => {
    const d = drafts[r.id]
    const response = Number(d.response), resolution = Number(d.resolution)
    if (!response || !resolution) {
      const msg = 'Os tempos de resposta e solução devem ser maiores que zero.'; setError(msg); toast.error(msg); return
    }
    setSavingId(r.id); setError(null)
    try {
      const updated = await slaPolicyService.update(r.id, companyId, {
        response_time_minutes: response, resolution_time_minutes: resolution,
      })
      setPolicies(prev => prev.map(p => p.id === r.id ? updated : p))
      toast.success(`Política ${PRIORITY_META[r.priority]?.label ?? `P${r.priority}`} atualizada.`)
    } catch (e) {
      const msg = getMsg(e); setError(msg); toast.error(msg)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">Políticas de Prazo por Prioridade</h3>
          <span className="ml-auto text-xs text-slate-400">Tempos em minutos úteis (respeitam o calendário do cliente)</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-slate-100">
            <tr className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <th className="px-6 py-3 text-left">Prioridade</th>
              <th className="px-6 py-3 text-left">Tempo de Resposta (min)</th>
              <th className="px-6 py-3 text-left">Tempo de Solução (min)</th>
              <th className="px-6 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 animate-pulse">Carregando…</td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Nenhuma política encontrada. Aplique as migrations do motor de SLA.</td></tr>
            ) : policies.map(r => {
              const meta = PRIORITY_META[r.priority] ?? { label: `P${r.priority}`, color: 'bg-slate-100 text-slate-600' }
              const d = drafts[r.id] ?? { response: '', resolution: '' }
              return (
                <tr key={r.id} className="text-slate-600 hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={d.response}
                        onChange={e => setDraft(r.id, 'response', e.target.value)}
                        inputMode="numeric"
                        className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-400">{humanize(Number(d.response))}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={d.resolution}
                        onChange={e => setDraft(r.id, 'resolution', e.target.value)}
                        inputMode="numeric"
                        className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-400">{humanize(Number(d.resolution))}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleSave(r)}
                      disabled={!isDirty(r) || savingId === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      <Save className="w-4 h-4" /> {savingId === r.id ? 'Salvando…' : 'Salvar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
