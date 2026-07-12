import { useState } from 'react'
import { X, CheckCircle2, Loader2 } from 'lucide-react'

// Fase 18 — Motor de Resolução Estruturada (ITIL v4). O banco (migration 115,
// trg_guard_resolution_governance) é a fonte de verdade da validação: rejeita
// a transição para Resolved/Closed se resolution_code/resolution_notes vierem
// vazios. Este modal só evita a viagem ao servidor para o caso óbvio.
export const RESOLUTION_CODES = [
  'Solução Definitiva',
  'Contorno/Workaround',
  'Falha de Hardware',
  'Treinamento/Orientação',
  'Falha de Terceiros',
] as const

export type ResolutionCode = typeof RESOLUTION_CODES[number]

interface ResolutionModalProps {
  open: boolean
  ticketLabel: string
  onClose: () => void
  onConfirm: (resolutionCode: string, resolutionNotes: string, kbCandidate: boolean) => Promise<void>
}

export default function ResolutionModal({ open, ticketLabel, onClose, onConfirm }: ResolutionModalProps) {
  const [resolutionCode, setResolutionCode] = useState<string>('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [kbCandidate, setKbCandidate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const reset = () => {
    setResolutionCode('')
    setResolutionNotes('')
    setKbCandidate(false)
    setError('')
  }

  const close = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    const notes = resolutionNotes.trim()
    if (!resolutionCode) {
      setError('Selecione um código de resolução.')
      return
    }
    if (!notes) {
      setError('As notas de resolução são obrigatórias.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(resolutionCode, notes, kbCandidate)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao resolver o ticket.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <h2 className="text-sm font-bold text-slate-900 truncate">Resolver {ticketLabel}</h2>
          </div>
          <button
            onClick={close}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="resolution-code" className="block text-xs font-bold text-slate-700 mb-1.5">
              Código de Resolução <span className="text-red-500">*</span>
            </label>
            <select
              id="resolution-code"
              value={resolutionCode}
              onChange={e => setResolutionCode(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Selecione um código…</option>
              {RESOLUTION_CODES.map(code => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="resolution-notes" className="block text-xs font-bold text-slate-700 mb-1.5">
              Notas de Resolução <span className="text-red-500">*</span>
            </label>
            <textarea
              id="resolution-notes"
              value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
              disabled={submitting}
              rows={5}
              placeholder="Descreva o que foi feito para resolver este ticket…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={kbCandidate}
              onChange={e => setKbCandidate(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <span className="text-xs font-semibold text-slate-700">
              Candidato à Base de Conhecimento
              <span className="block font-normal text-slate-500 mt-0.5">Marca esta resolução para revisão como possível artigo de KB.</span>
            </span>
          </label>

          {error && (
            <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={close}
            disabled={submitting}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? 'Resolvendo…' : 'Confirmar Resolução'}
          </button>
        </div>
      </div>
    </div>
  )
}
