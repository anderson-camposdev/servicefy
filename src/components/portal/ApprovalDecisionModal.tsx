import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import type { RequestApprovalRow } from '../../lib/database.types'

// Fase 21 — Motor de Aprovações Departamentais. Modal componentizado para
// Aprovar/Rejeitar, substituindo o window.prompt() usado antes. A validação
// de verdade (nota obrigatória na rejeição) é sempre a do banco — este modal
// só evita a viagem ao servidor para o caso óbvio.
interface ApprovalDecisionModalProps {
  row: RequestApprovalRow
  mode: 'approve' | 'reject'
  onClose: () => void
  onConfirm: (note: string | undefined) => Promise<void>
}

export default function ApprovalDecisionModal({ row, mode, onClose, onConfirm }: ApprovalDecisionModalProps) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isReject = mode === 'reject'

  const handleSubmit = async () => {
    const trimmed = note.trim()
    if (isReject && !trimmed) {
      setError('Informe o motivo da rejeição.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(isReject ? trimmed : trimmed || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar a decisão.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isReject ? 'border-rose-100 bg-rose-50' : 'border-emerald-100 bg-emerald-50'}`}>
          <div className="flex items-center gap-2 min-w-0">
            {isReject ? <X className="w-5 h-5 text-rose-600 shrink-0" /> : <Check className="w-5 h-5 text-emerald-600 shrink-0" />}
            <h2 className="text-sm font-bold text-slate-900 truncate">
              {isReject ? 'Rejeitar' : 'Aprovar'} {row.incident?.number ?? 'requisição'}
            </h2>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 truncate">{row.incident?.short_description ?? 'Requisição de serviço'}</p>
          <div>
            <label htmlFor="decision-note" className="block text-xs font-bold text-slate-700 mb-1.5">
              {isReject ? <>Motivo da rejeição <span className="text-red-500">*</span></> : 'Observação (opcional)'}
            </label>
            <textarea
              id="decision-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={submitting}
              rows={4}
              placeholder={isReject ? 'Explique por que esta requisição está sendo rejeitada…' : 'Alguma observação para o registro…'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
            />
          </div>
          {error && (
            <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${isReject ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? 'Enviando…' : isReject ? 'Confirmar Rejeição' : 'Confirmar Aprovação'}
          </button>
        </div>
      </div>
    </div>
  )
}
