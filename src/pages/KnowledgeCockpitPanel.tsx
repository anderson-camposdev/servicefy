// ============================================================
// ServiceFY — Painel de Base de Conhecimento no Cockpit do Analista
// Drawer pesquisável: sugere artigos pelo texto do chamado, permite
// visualizar e inserir link/resumo/conteúdo na resposta ao usuário,
// registrando uso para métricas de deflexão. Respeita a RLS (só
// retorna artigos que o analista pode ler).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { X, Search, ChevronDown, ChevronRight, Link2, FileText, Loader2, BookOpen } from 'lucide-react'
import { knowledgeService } from '../lib/knowledge-service'
import { renderMarkdown } from '../lib/markdown'
import type { KnowledgeSearchResult, KnowledgeArticleRow } from '../lib/database.types'

interface Props {
  companyId: string
  caseId?: string | null
  /** texto do chamado (assunto + descrição) para sugestão automática */
  initialQuery: string
  /** insere texto na resposta ao usuário (compositor do cockpit) */
  onInsert: (text: string) => void
  onClose: () => void
}

export default function KnowledgeCockpitPanel({ companyId, caseId, initialQuery, onInsert, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<KnowledgeSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [article, setArticle] = useState<KnowledgeArticleRow | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    setLoading(true); setError(null)
    try {
      const { rows } = await knowledgeService.search(companyId, { query: q || undefined, limit: 20 })
      setRows(rows)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [companyId])

  // Quando o incidente já possui Case canônico, usa a sugestão contextual e
  // registra vínculos reais; durante a transição mantém a busca textual.
  const loadInitial = useCallback(async () => {
    if (!caseId) {
      await search(initialQuery.slice(0, 200))
      return
    }
    setLoading(true); setError(null)
    try {
      const suggestions = await knowledgeService.suggestForCase(caseId, 20)
      setRows(suggestions.map((item, index) => ({
        ...item,
        category_id: null,
        service_domain_id: null,
        status: 'published',
        tags: [],
        view_count: 0,
        updated_at: '',
        total_count: suggestions.length,
        rank: item.rank ?? (suggestions.length - index),
      })))
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [caseId, initialQuery, search])

  useEffect(() => { void loadInitial() }, [loadInitial])

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id); setArticle(null)
    try { setArticle(await knowledgeService.getArticle(id)) }
    catch { setError('Não foi possível abrir o artigo.') }
  }

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 2000) }
  const track = async (articleId: string, usage: 'linked' | 'sent_to_user') => {
    try {
      if (caseId) await knowledgeService.registerUsage(articleId, caseId, usage)
      else await knowledgeService.touchArticle(articleId, usage === 'sent_to_user')
    } catch { /* métrica não bloqueia o atendimento */ }
  }

  const insertRef = async (r: KnowledgeSearchResult) => {
    onInsert(`📚 Artigo: **${r.title}**${r.summary ? ` — ${r.summary}` : ''}`)
    await track(r.id, 'sent_to_user')
    flash('Referência inserida na resposta.')
  }
  const insertBody = async (a: KnowledgeArticleRow) => {
    onInsert(`${a.title}\n\n${a.body}`)
    await track(a.id, 'sent_to_user')
    flash('Conteúdo inserido na resposta.')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800">Base de Conhecimento</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        {/* Busca */}
        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') search(query) }}
              placeholder="Buscar artigos…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {!query && <p className="mt-2 text-xs text-slate-400">Sugestões pelo assunto do chamado.</p>}
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Nenhum artigo relevante encontrado.</div>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className="rounded-xl border border-slate-200">
                  <button onClick={() => toggle(r.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-800">{r.title}</span>
                      {r.summary && <span className="block truncate text-xs text-slate-500">{r.summary}</span>}
                    </span>
                    {expanded === r.id ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                  </button>

                  {expanded === r.id && (
                    <div className="border-t border-slate-100 p-3">
                      {article && article.id === r.id
                        ? <div className="kb-prose max-h-64 overflow-y-auto text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }} />
                        : <div className="flex items-center gap-2 py-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando…</div>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {caseId && (
                          <button onClick={() => { void track(r.id, 'linked'); flash('Artigo vinculado ao caso.') }} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700">
                            <BookOpen className="h-3.5 w-3.5" /> Vincular ao caso
                          </button>
                        )}
                        <button onClick={() => insertRef(r)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">
                          <Link2 className="h-3.5 w-3.5" /> Inserir referência
                        </button>
                        {article && article.id === r.id && (
                          <button onClick={() => insertBody(article)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">
                            <FileText className="h-3.5 w-3.5" /> Inserir conteúdo
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {note && <div className="border-t border-slate-100 bg-emerald-50 px-4 py-2.5 text-center text-xs font-bold text-emerald-700">{note}</div>}
      </div>
    </div>
  )
}
