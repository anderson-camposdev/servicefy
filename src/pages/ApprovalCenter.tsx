// ============================================================
// ServiceFY — Fase 21: Central de Aprovações Departamentais
//
// Sucede ApprovalInbox.tsx: mesma fila (request_approvals do aprovador
// logado, status=pending), mas com modal componentizado de Aprovar/Rejeitar
// (em vez de window.prompt) e um canal Realtime dedicado — uma nova
// aprovação atribuída ao usuário aparece na fila sem precisar recarregar a
// página, e uma decisão tomada por outro aprovador (modo "any"/grupo)
// remove a linha da fila em tempo real.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, RefreshCw, X } from 'lucide-react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useAuth } from '../auth'
import { useToast } from '../context'
import { requestApprovalsService } from '../lib/services'
import { supabase } from '../lib/supabase'
import ApprovalDecisionModal from '../components/portal/ApprovalDecisionModal'
import type { RequestApprovalRow } from '../lib/database.types'

export default function ApprovalCenter() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const profileId = profile?.id
  const [rows, setRows] = useState<RequestApprovalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDecision, setPendingDecision] = useState<{ row: RequestApprovalRow; mode: 'approve' | 'reject' } | null>(null)

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

  useEffect(() => { void load() }, [load])

  // Canal único por sessão: uma nova linha de request_approvals para este
  // aprovador chega via INSERT; uma decisão tomada em paralelo (outro
  // aprovador, modo "any"/grupo) chega via UPDATE (status sai de pending) e
  // remove a linha da fila sem esperar um refetch manual.
  useEffect(() => {
    if (!profileId) return
    let cancelled = false

    const channel = supabase
      .channel(`request-approvals:${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'request_approvals', filter: `approver_id=eq.${profileId}` },
        (payload: RealtimePostgresChangesPayload<RequestApprovalRow>) => {
          if (cancelled) return
          const row = payload.new as RequestApprovalRow
          if (row.status !== 'pending') return
          setRows(current => current.some(item => item.id === row.id) ? current : [row, ...current])
          toast.info('Nova aprovação pendente na sua fila.')
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'request_approvals', filter: `approver_id=eq.${profileId}` },
        (payload: RealtimePostgresChangesPayload<RequestApprovalRow>) => {
          if (cancelled) return
          const row = payload.new as RequestApprovalRow
          if (row.status === 'pending') return
          setRows(current => current.filter(item => item.id !== row.id))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [profileId, toast])

  const openDecision = (row: RequestApprovalRow, mode: 'approve' | 'reject') => setPendingDecision({ row, mode })

  const confirmDecision = async (note: string | undefined) => {
    if (!pendingDecision) return
    const { row, mode } = pendingDecision
    await requestApprovalsService.decide(row.id, mode === 'approve', note)
    setRows(current => current.filter(item => item.id !== row.id))
    toast.success(mode === 'approve' ? 'Requisição aprovada.' : 'Requisição rejeitada.')
    setPendingDecision(null)
  }

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-on-surface">Central de Aprovações</h1>
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
                <div className="min-w-0">
                  <span className="text-xs font-mono font-bold text-primary">{row.incident?.number ?? 'REQ'}</span>
                  <h2 className="font-bold text-on-surface mt-1 truncate">{row.incident?.short_description ?? 'Requisição de serviço'}</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Solicitante: {row.incident?.caller_name ?? '—'}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-[11px] font-bold border border-amber-200 shrink-0">
                  <Clock3 className="w-3 h-3" /> Pendente
                </span>
              </div>
              <div className="flex gap-2 pt-2 border-t border-outline-variant">
                <button onClick={() => openDecision(row, 'reject')} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 py-2.5 text-sm font-bold hover:bg-rose-100 transition-colors">
                  <X className="w-4 h-4" /> Rejeitar
                </button>
                <button onClick={() => openDecision(row, 'approve')} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-bold hover:bg-emerald-700 transition-colors">
                  <Check className="w-4 h-4" /> Aprovar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {pendingDecision && (
        <ApprovalDecisionModal
          row={pendingDecision.row}
          mode={pendingDecision.mode}
          onClose={() => setPendingDecision(null)}
          onConfirm={confirmDecision}
        />
      )}
    </section>
  )
}
