// ============================================================
// ServiceFY — Fase 26: Motor de Macros (Quick Actions)
//
// Dropdown compacto para aplicar uma ticket_macro no chamado aberto no
// AnalystCockpit. Toda a mutação (set_fields/add_comment) roda em SQL via
// apply_ticket_macro — este componente só lista, dispara e reage.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, Zap } from 'lucide-react'
import { ticketMacrosService } from '../../lib/services'
import type { TicketMacroRow } from '../../lib/database.types'

interface MacroDropdownProps {
  companyId: string
  ticketId: string
  onApplied: () => void
  onError: (message: string) => void
  onSuccess: (message: string) => void
}

export default function MacroDropdown({ companyId, ticketId, onApplied, onError, onSuccess }: MacroDropdownProps) {
  const [macros, setMacros] = useState<TicketMacroRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const callbacksRef = useRef({ onApplied, onError, onSuccess })
  useEffect(() => {
    callbacksRef.current = { onApplied, onError, onSuccess }
  })

  useEffect(() => {
    if (!companyId || companyId.trim() === '') {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ticketMacrosService.list(companyId)
      .then(rows => { if (!cancelled) setMacros(rows) })
      .catch(err => { 
        if (!cancelled) {
          callbacksRef.current.onError(err instanceof Error ? err.message : 'Falha ao carregar macros.')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const applyMacro = useCallback(async (macro: TicketMacroRow) => {
    setApplyingId(macro.id)
    setOpen(false)
    try {
      await ticketMacrosService.apply(ticketId, macro.id)
      onSuccess(`Macro "${macro.name}" aplicada com sucesso.`)
      onApplied()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao aplicar macro.')
    } finally {
      setApplyingId(null)
    }
  }, [ticketId, onApplied, onError, onSuccess])

  if (!loading && macros.length === 0) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(current => !current)}
        disabled={loading || applyingId !== null}
        className="flex items-center gap-1.5 px-3 py-2 border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-outline-variant text-text-main hover:bg-primary/10 hover:text-primary hover:border-primary/30 rounded-lg"
      >
        {applyingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        <span className="hidden lg:inline">Macros</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-xl border border-outline-variant bg-surface shadow-xl overflow-hidden">
          {loading ? (
            <div className="p-4 text-center text-xs text-on-surface-variant">Carregando macros…</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {macros.map(macro => (
                <li key={macro.id}>
                  <button
                    onClick={() => void applyMacro(macro)}
                    disabled={applyingId !== null}
                    className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="font-semibold text-text-main">{macro.name}</div>
                    {macro.description && <div className="text-xs text-on-surface-variant mt-0.5">{macro.description}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
