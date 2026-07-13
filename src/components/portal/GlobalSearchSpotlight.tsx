// ============================================================
// ServiceFY — Fase 22: Busca Omnichannel Inteligente (Global Search)
//
// Spotlight (Ctrl/Cmd+K) que cruza catálogo de incidentes e KB publicada
// numa única lista de resultados. Debounce de 300ms evita afogar o banco a
// cada tecla — só dispara a RPC depois que o usuário para de digitar.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Loader2, Search, Wrench, X } from 'lucide-react'
import { globalSearchService } from '../../lib/services'
import type { GlobalSearchResult } from '../../lib/database.types'

const DEBOUNCE_MS = 300

interface GlobalSearchSpotlightProps {
  onSelectArticle?: (result: GlobalSearchResult) => void
  onSelectCatalogSymptom?: (result: GlobalSearchResult) => void
}

export default function GlobalSearchSpotlight({ onSelectArticle, onSelectCatalogSymptom }: GlobalSearchSpotlightProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setError('')
  }, [])

  // Atalho global Ctrl/Cmd+K para abrir o spotlight de qualquer tela.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Debounce: só busca 300ms depois da última tecla pressionada.
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      globalSearchService.search(trimmed)
        .then(setResults)
        .catch(err => setError(err instanceof Error ? err.message : 'Falha ao buscar.'))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, open])

  const handleSelect = (result: GlobalSearchResult) => {
    if (result.type === 'kb_article') onSelectArticle?.(result)
    else onSelectCatalogSymptom?.(result)
    close()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Buscar (Ctrl+K)"
        className="relative p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all cursor-pointer"
      >
        <Search className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 pt-[10vh]" onClick={close}>
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar artigos e catálogo de incidentes…"
                className="flex-1 min-w-0 text-sm outline-none placeholder:text-slate-400 text-slate-900"
              />
              {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />}
              <button onClick={close} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {error && (
                <div className="px-4 py-3 text-xs font-semibold text-red-700 bg-red-50">{error}</div>
              )}
              {!error && !loading && query.trim() && results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">Nenhum resultado para "{query.trim()}".</div>
              )}
              {!query.trim() && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">Digite para buscar em artigos e no catálogo de incidentes.</div>
              )}
              {results.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {results.map(result => (
                    <li key={`${result.type}-${result.id}`}>
                      <button
                        onClick={() => handleSelect(result)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        {result.type === 'kb_article'
                          ? <BookOpen className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                          : <Wrench className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800 truncate">{result.title}</span>
                            <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${result.type === 'kb_article' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-700'}`}>
                              {result.type === 'kb_article' ? 'Artigo' : 'Catálogo'}
                            </span>
                          </div>
                          {result.snippet && <p className="mt-0.5 text-xs text-slate-500 truncate">{result.snippet}</p>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
