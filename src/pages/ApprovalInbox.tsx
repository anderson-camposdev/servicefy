import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, RefreshCw, X } from 'lucide-react'
import { useAuth } from '../auth'
import { useToast } from '../context'
import { requestApprovalsService } from '../lib/services'
import type { RequestApprovalRow } from '../lib/database.types'

export default function ApprovalInbox() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const profileId = profile?.id
  const [rows, setRows] = useState<RequestApprovalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profileId) return
    setLoading(true)
    try {
      setRows(await requestApprovalsService.listMine(profileId, 'pending'))
    } catch (error) {
      toast.error(`Falha ao carregar aprovações: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
    } finally {
      setLoading(false)
    }
  }, [profileId, toast])

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    requestApprovalsService.listMine(profileId, 'pending')
      .then(data => { if (!cancelled) setRows(data) })
      .catch(error => {
        if (!cancelled) toast.error(`Falha ao carregar aprovações: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [profileId, toast])

  const decide = async (row: RequestApprovalRow, approve: boolean) => {
    const note = approve
      ? undefined
      : window.prompt('Informe o motivo da rejeição:')?.trim()
    if (!approve && !note) return

    setDecidingId(row.id)
    try {
      await requestApprovalsService.decide(row.id, approve, note)
      setRows(current => current.filter(item => item.id !== row.id))
      toast.success(approve ? 'Requisição aprovada.' : 'Requisição rejeitada.')
    } catch (error) {
      toast.error(`Não foi possível registrar a decisão: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
    } finally {
      setDecidingId(null)
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-on-surface">Minhas aprovações</h1>
          <p className="text-sm text-on-surface-variant mt-1">Requisições de serviço aguardando sua decisão.</p>
        </div>
        <button onClick={() => void load()} className="p-2.5 rounded-xl border border-outline-variant bg-surface hover:bg-surface-container transition-colors" title="Atualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {loading ? (
        <div className="py-16 text-center text-sm text-on-surface-variant">Carregando aprovações…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-outline-variant bg-surface">
          <Check className="w-9 h-9 mx-auto text-emerald-500 mb-3" />
          <p className="font-bold text-on-surface">Nenhuma aprovação pendente</p>
          <p className="text-sm text-on-surface-variant mt-1">Sua fila está em dia.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(row => (
            <article key={row.id} className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-mono font-bold text-primary">{row.incident?.number ?? 'REQ'}</span>
                  <h2 className="font-bold text-on-surface mt-1">{row.incident?.short_description ?? 'Requisição de serviço'}</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Solicitante: {row.incident?.caller_name ?? '—'}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-[11px] font-bold border border-amber-200">
                  <Clock3 className="w-3 h-3" /> Pendente
                </span>
              </div>
              <div className="flex gap-2 pt-2 border-t border-outline-variant">
                <button disabled={decidingId === row.id} onClick={() => void decide(row, false)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 py-2.5 text-sm font-bold disabled:opacity-50">
                  <X className="w-4 h-4" /> Rejeitar
                </button>
                <button disabled={decidingId === row.id} onClick={() => void decide(row, true)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-bold disabled:opacity-50">
                  <Check className="w-4 h-4" /> Aprovar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
