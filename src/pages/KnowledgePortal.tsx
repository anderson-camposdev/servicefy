// ============================================================
// ServiceFY — Base de Conhecimento no Portal do Usuário
// Home pesquisável + leitura de artigo + feedback "Foi útil?".
// A visibilidade/tenant é aplicada pela RLS (kb_search_articles e
// a policy de SELECT): usuário final só vê público/tenant publicado;
// interno/restrito são bloqueados no banco, inclusive por URL direta.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Search, ChevronRight, ThumbsUp, ThumbsDown, ArrowLeft, BookOpen, Loader2 } from 'lucide-react'
import { knowledgeService } from '../lib/knowledge-service'
import { renderMarkdown } from '../lib/markdown'
import type { KnowledgeSearchResult, KnowledgeArticleRow } from '../lib/database.types'

interface Props {
  companyId: string
  profileId: string | null
  accent: string
}

export default function KnowledgePortal({ companyId, profileId, accent }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KnowledgeSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [article, setArticle] = useState<KnowledgeArticleRow | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const runSearch = useCallback(async (q: string) => {
    setLoading(true); setError(null)
    try {
      const { rows } = await knowledgeService.search(companyId, { query: q || undefined, limit: 30 })
      setResults(rows)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [companyId])

  // Busca na montagem (query='') e a cada digitação, com debounce.
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), query ? 300 : 0)
    return () => clearTimeout(t)
  }, [query, runSearch])

  const open = async (id: string) => {
    setOpeningId(id); setError(null)
    try {
      const opened = await knowledgeService.getArticle(id)
      setArticle(opened)
      void knowledgeService.touchArticle(id, false).catch(() => undefined)
    }
    catch { setError('Este artigo não está disponível.') }
    finally { setOpeningId(null) }
  }

  if (article) {
    return <ArticleReader
      article={article}
      accent={accent}
      companyId={companyId}
      profileId={profileId}
      onBack={() => setArticle(null)}
    />
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-2 flex items-center gap-2">
        <BookOpen className="h-5 w-5" style={{ color: accent }} />
        <h2 className="text-xl font-bold text-slate-900">Base de Conhecimento</h2>
      </div>
      <p className="mb-5 text-sm text-slate-500">Encontre tutoriais, FAQs e guias de autoatendimento.</p>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Buscar artigos… (ex.: redefinir senha, VPN)"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm shadow-sm outline-none focus:ring-2"
          style={{ '--tw-ring-color': `${accent}44` } as React.CSSProperties}
        />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-600">{query ? 'Nenhum artigo encontrado' : 'Ainda não há artigos publicados'}</p>
          <p className="mt-1 text-sm text-slate-400">{query ? 'Tente outros termos de busca.' : 'Volte em breve.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {!query && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Artigos em destaque</p>}
          {results.map(r => (
            <button key={r.id} onClick={() => open(r.id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-800">{r.title}</p>
                {r.summary && <p className="mt-0.5 truncate text-sm text-slate-500">{r.summary}</p>}
                {r.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.tags.slice(0, 4).map(t => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{t}</span>)}
                  </div>
                )}
              </div>
              {openingId === r.id ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-300" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ArticleReader({ article, accent, companyId, profileId, onBack }: {
  article: KnowledgeArticleRow; accent: string; companyId: string; profileId: string | null; onBack: () => void
}) {
  const [sent, setSent] = useState(false)
  const [choice, setChoice] = useState<boolean | null>(null)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const send = async (helpful: boolean) => {
    setChoice(helpful)
    if (!profileId) { setSent(true); return }
    try {
      await knowledgeService.submitFeedback(companyId, article.id, profileId, helpful, comment.trim() || null)
      setSent(true)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-400">
        <BookOpen className="h-3.5 w-3.5" /> <span>Base de Conhecimento</span>
        <ChevronRight className="h-3.5 w-3.5" /> <span className="font-semibold text-slate-500">{article.title}</span>
      </nav>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">{article.title}</h1>
        {article.summary && <p className="mt-2 text-slate-500">{article.summary}</p>}
        <div className="kb-prose mt-6 text-[15px] leading-relaxed text-slate-700"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }} />
      </article>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        {sent ? (
          <p className="text-center text-sm font-semibold" style={{ color: accent }}>Obrigado pelo seu feedback! {choice ? '👍' : '🙏'}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold text-slate-700">Este artigo foi útil?</p>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
              placeholder="Comentário (opcional)…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2" style={{ '--tw-ring-color': `${accent}44` } as React.CSSProperties} />
            <div className="flex gap-2">
              <button onClick={() => send(true)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: accent }}>
                <ThumbsUp className="h-4 w-4" /> Sim
              </button>
              <button onClick={() => send(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">
                <ThumbsDown className="h-4 w-4" /> Não
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
