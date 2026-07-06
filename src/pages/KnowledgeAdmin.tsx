// ============================================================
// ServiceFY — Administração da Base de Conhecimento
// Aberto pela Central de Configurações (seção 'knowledge'). CRUD de
// categorias e artigos, editor Markdown + preview, workflow
// (rascunho/revisão/publicado/arquivado), concessões para restrito,
// versões e auditoria. A segurança real é a RLS/RPC; a UI é o gate
// de conveniência (apenas company_admin/sysadmin chegam aqui).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, Plus, Search, Eye, EyeOff, Archive, Copy, Trash2, Save, Lock,
  BookOpen, History, FolderTree, X, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { knowledgeService, type ArticleInput } from '../lib/knowledge-service'
import { renderMarkdown } from '../lib/markdown'
import type {
  KnowledgeArticleRow, KnowledgeCategoryRow, KnowledgeVisibility, KnowledgeStatus,
  KnowledgeArticleVersionRow, KnowledgeArticleGrantRow, KnowledgeGrantSubject,
} from '../lib/database.types'

interface Props { companyId: string; activeRole: string; onBack: () => void }
interface Domain { id: string; name: string }
interface Group { id: string; name: string }
interface Person { id: string; name: string }

const STATUS_META: Record<KnowledgeStatus, { label: string; cls: string }> = {
  draft:     { label: 'Rascunho',  cls: 'bg-slate-100 text-slate-600' },
  review:    { label: 'Em revisão', cls: 'bg-amber-100 text-amber-700' },
  published: { label: 'Publicado', cls: 'bg-emerald-100 text-emerald-700' },
  archived:  { label: 'Arquivado', cls: 'bg-slate-200 text-slate-500' },
}
const VIS_META: Record<KnowledgeVisibility, { label: string }> = {
  public:     { label: 'Público' },
  tenant:     { label: 'Tenant' },
  internal:   { label: 'Interno' },
  restricted: { label: 'Restrito' },
}
const PAGE = 12

export default function KnowledgeAdmin({ companyId, onBack }: Props) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [categories, setCategories] = useState<KnowledgeCategoryRow[]>([])
  const [rows, setRows] = useState<KnowledgeArticleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [fStatus, setFStatus] = useState<KnowledgeStatus | ''>('')
  const [fVis, setFVis] = useState<KnowledgeVisibility | ''>('')
  const [fCat, setFCat] = useState('')
  const [query, setQuery] = useState('')

  const [editing, setEditing] = useState<KnowledgeArticleRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [showCats, setShowCats] = useState(false)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500) }

  const loadArticles = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { rows, total } = await knowledgeService.listArticles(companyId, {
        status: fStatus || undefined, visibility: fVis || undefined,
        categoryId: fCat || undefined, query: query || undefined,
        limit: PAGE, offset: page * PAGE,
      })
      setRows(rows); setTotal(total)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [companyId, fStatus, fVis, fCat, query, page])

  useEffect(() => {
    let cancel = false
    Promise.all([
      knowledgeService.listCategories(companyId),
      supabase.from('service_domains').select('id,name').eq('company_id', companyId).eq('active', true).order('name'),
    ]).then(([cats, dom]) => {
      if (cancel) return
      setCategories(cats)
      setDomains((dom.data ?? []) as Domain[])
    }).catch(e => setError((e as Error).message))
    return () => { cancel = true }
  }, [companyId])

  useEffect(() => { loadArticles() }, [loadArticles])

  const pages = Math.max(1, Math.ceil(total / PAGE))
  const catName = (id: string | null) => categories.find(c => c.id === id)?.name ?? '—'

  const doAction = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); flash(msg); loadArticles() }
    catch (e) { setError((e as Error).message) }
  }

  if (editing || creating) {
    return (
      <ArticleEditor
        companyId={companyId}
        article={editing}
        categories={categories}
        domains={domains}
        onClose={() => { setEditing(null); setCreating(false) }}
        onSaved={(msg) => { setEditing(null); setCreating(false); flash(msg); loadArticles() }}
      />
    )
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-7xl p-5 lg:p-8">
        <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600">
          <ArrowLeft className="w-4 h-4" /> Central de Configurações
        </button>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><BookOpen className="w-6 h-6" /></span>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Base de Conhecimento</h1>
              <p className="text-sm text-slate-500">Artigos, revisão, publicação e feedback.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowCats(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">
              <FolderTree className="w-4 h-4" /> Categorias
            </button>
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">
              <Plus className="w-4 h-4" /> Novo artigo
            </button>
          </div>
        </header>

        {/* Filtros */}
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={query} onChange={e => { setPage(0); setQuery(e.target.value) }} placeholder="Buscar por título…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <select value={fStatus} onChange={e => { setPage(0); setFStatus(e.target.value as KnowledgeStatus | '') }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_META) as KnowledgeStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select value={fVis} onChange={e => { setPage(0); setFVis(e.target.value as KnowledgeVisibility | '') }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="">Todas as visibilidades</option>
            {(Object.keys(VIS_META) as KnowledgeVisibility[]).map(v => <option key={v} value={v}>{VIS_META[v].label}</option>)}
          </select>
          <select value={fCat} onChange={e => { setPage(0); setFCat(e.target.value) }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="">Todas as categorias</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Lista */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-400">Carregando artigos…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <BookOpen className="mx-auto mb-3 w-10 h-10 text-slate-300" />
              <p className="font-bold text-slate-600">Nenhum artigo encontrado</p>
              <p className="mt-1 text-sm text-slate-400">Ajuste os filtros ou crie um novo artigo.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map(a => (
                <div key={a.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <button onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-slate-800">{a.title}</span>
                      {a.visibility === 'restricted' && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_META[a.status].cls}`}>{STATUS_META[a.status].label}</span>
                      <span>{VIS_META[a.visibility].label}</span>
                      <span>· {catName(a.category_id)}</span>
                      <span>· v{a.version}</span>
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {a.status !== 'published'
                      ? <IconBtn title="Publicar" onClick={() => doAction(() => knowledgeService.publish(a.id, companyId), 'Artigo publicado.')}><Eye className="w-4 h-4 text-emerald-600" /></IconBtn>
                      : <IconBtn title="Despublicar" onClick={() => doAction(() => knowledgeService.unpublish(a.id, companyId), 'Artigo despublicado.')}><EyeOff className="w-4 h-4 text-slate-500" /></IconBtn>}
                    <IconBtn title="Duplicar" onClick={() => doAction(() => knowledgeService.duplicate(a.id, companyId), 'Artigo duplicado.')}><Copy className="w-4 h-4 text-slate-500" /></IconBtn>
                    <ConfirmBtn title="Arquivar" confirm={`Arquivar "${a.title}"? Ele deixará de aparecer no portal.`} onConfirm={() => doAction(() => knowledgeService.archive(a.id, companyId), 'Artigo arquivado.')}>
                      <Archive className="w-4 h-4 text-amber-600" />
                    </ConfirmBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paginação */}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-400">{total} artigo(s) · página {page + 1}/{pages}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Anterior</button>
              <button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {showCats && <CategoriesModal companyId={companyId} domains={domains} categories={categories} onClose={() => setShowCats(false)} onChange={setCategories} />}
      {toast && <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg"><CheckCircle2 className="w-4 h-4 text-emerald-400" />{toast}</div>}
    </div>
  )
}

// ─── Editor de artigo ──────────────────────────────────────────
function ArticleEditor({ companyId, article, categories, domains, onClose, onSaved }: {
  companyId: string; article: KnowledgeArticleRow | null
  categories: KnowledgeCategoryRow[]; domains: Domain[]
  onClose: () => void; onSaved: (msg: string) => void
}) {
  const [title, setTitle] = useState(article?.title ?? '')
  const [summary, setSummary] = useState(article?.summary ?? '')
  const [body, setBody] = useState(article?.body ?? '')
  const [categoryId, setCategoryId] = useState(article?.category_id ?? '')
  const [domainId, setDomainId] = useState(article?.service_domain_id ?? '')
  const [visibility, setVisibility] = useState<KnowledgeVisibility>(article?.visibility ?? 'tenant')
  const [tags, setTags] = useState((article?.tags ?? []).join(', '))
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState(article?.id ?? null)
  const [tab, setTab] = useState<'edit' | 'grants' | 'versions'>('edit')

  const input = (): ArticleInput => ({
    title: title.trim(), summary: summary.trim() || null, body,
    categoryId: categoryId || null, serviceDomainId: domainId || null,
    visibility, tags: tags.split(',').map(t => t.trim()).filter(Boolean),
  })

  const save = async (): Promise<string | null> => {
    if (!title.trim()) { setError('Informe um título.'); return null }
    if (!body.trim()) { setError('O conteúdo não pode ficar vazio.'); return null }
    setSaving(true); setError(null)
    try {
      if (currentId) { await knowledgeService.updateArticle(currentId, input()); return currentId }
      const created = await knowledgeService.createArticle(companyId, input())
      setCurrentId(created.id)
      return created.id
    } catch (e) { setError((e as Error).message); return null }
    finally { setSaving(false) }
  }

  const saveAndClose = async () => { const id = await save(); if (id) onSaved('Artigo salvo.') }
  const saveAndPublish = async () => {
    const id = await save()
    if (!id) return
    try { await knowledgeService.publish(id, companyId); onSaved('Artigo publicado.') }
    catch (e) { setError((e as Error).message) }
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-6xl p-5 lg:p-8">
        <button onClick={onClose} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600">
          <ArrowLeft className="w-4 h-4" /> Voltar aos artigos
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-slate-900">{currentId ? 'Editar artigo' : 'Novo artigo'}</h1>
          <div className="flex gap-2">
            <button disabled={saving} onClick={saveAndClose} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button disabled={saving} onClick={saveAndPublish} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              <Eye className="w-4 h-4" /> Salvar e publicar
            </button>
          </div>
        </div>

        {currentId && (
          <div className="mt-5 flex gap-1 border-b border-slate-200">
            {([['edit', 'Conteúdo'], ['grants', 'Concessões'], ['versions', 'Versões']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab === k ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}>
                {k === 'grants' && <Lock className="mr-1 inline w-3.5 h-3.5" />}
                {k === 'versions' && <History className="mr-1 inline w-3.5 h-3.5" />}
                {l}
              </button>
            ))}
          </div>
        )}

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {tab === 'edit' && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px] items-start">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Título
                <input value={title} onChange={e => setTitle(e.target.value)} className={`mt-1 ${inputCls}`} placeholder="Ex.: Como redefinir a senha da VPN" />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Resumo
                <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} className={`mt-1 ${inputCls} resize-y`} placeholder="Sinopse curta exibida na busca (opcional)." />
              </label>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Conteúdo (Markdown)</span>
                  <button onClick={() => setPreview(p => !p)} className="text-xs font-bold text-indigo-600">{preview ? 'Editar' : 'Pré-visualizar'}</button>
                </div>
                {preview
                  ? <div className="kb-prose min-h-[320px] rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
                  : <textarea value={body} onChange={e => setBody(e.target.value)} rows={16} className={`${inputCls} resize-y font-mono`} placeholder={'# Título\n\nPasso a passo em **Markdown**.\n\n- item 1\n- item 2'} />}
              </div>
            </div>

            <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Visibilidade
                <select value={visibility} onChange={e => setVisibility(e.target.value as KnowledgeVisibility)} className={`mt-1 ${inputCls}`}>
                  {(Object.keys(VIS_META) as KnowledgeVisibility[]).map(v => <option key={v} value={v}>{VIS_META[v].label}</option>)}
                </select>
              </label>
              {visibility === 'restricted' && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> Restrito: só quem tiver concessão (aba Concessões) poderá ler, mesmo publicado.
                </p>
              )}
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Domínio de serviço
                <select value={domainId} onChange={e => setDomainId(e.target.value)} className={`mt-1 ${inputCls}`}>
                  <option value="">— Nenhum —</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Categoria
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={`mt-1 ${inputCls}`}>
                  <option value="">— Nenhuma —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Tags (separadas por vírgula)
                <input value={tags} onChange={e => setTags(e.target.value)} className={`mt-1 ${inputCls}`} placeholder="vpn, acesso, senha" />
              </label>
            </aside>
          </div>
        )}

        {tab === 'grants' && currentId && <GrantsPanel companyId={companyId} articleId={currentId} />}
        {tab === 'versions' && currentId && <VersionsPanel articleId={currentId} />}
      </div>
    </div>
  )
}

// ─── Concessões (restricted) ───────────────────────────────────
function GrantsPanel({ companyId, articleId }: { companyId: string; articleId: string }) {
  const [grants, setGrants] = useState<KnowledgeArticleGrantRow[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [type, setType] = useState<KnowledgeGrantSubject>('group')
  const [subjectId, setSubjectId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    knowledgeService.listGrants(articleId).then(setGrants).catch(e => setError((e as Error).message))
  }, [articleId])

  useEffect(() => {
    load()
    supabase.from('assignment_groups').select('id,name').eq('company_id', companyId).order('name').then(r => setGroups((r.data ?? []) as Group[]))
    supabase.from('profiles').select('id,name').eq('company_id', companyId).order('name').limit(500).then(r => setPeople((r.data ?? []) as Person[]))
  }, [companyId, load])

  const options = type === 'group' ? groups : people
  const nameOf = (g: KnowledgeArticleGrantRow) =>
    (g.subject_type === 'group' ? groups : people).find(o => o.id === g.subject_id)?.name ?? g.subject_id

  const add = async () => {
    if (!subjectId) return
    try { await knowledgeService.addGrant(companyId, articleId, type, subjectId, null); setSubjectId(''); load() }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="mt-5 max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm text-slate-500">Conceda leitura deste artigo restrito a perfis ou grupos específicos.</p>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</div>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={type} onChange={e => { setType(e.target.value as KnowledgeGrantSubject); setSubjectId('') }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm sm:w-40">
          <option value="group">Grupo</option>
          <option value="profile">Pessoa</option>
        </select>
        <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <option value="">Selecione…</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button onClick={add} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="w-4 h-4" /> Conceder</button>
      </div>
      <div className="divide-y divide-slate-100">
        {grants.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nenhuma concessão ainda.</p>}
        {grants.map(g => (
          <div key={g.id} className="flex items-center justify-between py-2.5 text-sm">
            <span><b className="text-slate-700">{nameOf(g)}</b> <span className="text-slate-400">· {g.subject_type === 'group' ? 'Grupo' : 'Pessoa'}</span></span>
            <button onClick={() => knowledgeService.removeGrant(g.id).then(load)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Versões ───────────────────────────────────────────────────
function VersionsPanel({ articleId }: { articleId: string }) {
  const [versions, setVersions] = useState<KnowledgeArticleVersionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { knowledgeService.listVersions(articleId).then(setVersions).catch(e => setError((e as Error).message)) }, [articleId])
  return (
    <div className="mt-5 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6">
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</div>}
      {versions.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">Sem versões anteriores — o histórico é criado a cada alteração de conteúdo.</p> : (
        <div className="divide-y divide-slate-100">
          {versions.map(v => (
            <div key={v.id} className="py-3">
              <p className="text-sm font-bold text-slate-700">v{v.version} · {v.status} · {v.visibility}</p>
              <p className="text-xs text-slate-400">{new Date(v.created_at).toLocaleString('pt-BR')}</p>
              <p className="mt-1 truncate text-sm text-slate-500">{v.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Categorias ────────────────────────────────────────────────
function CategoriesModal({ companyId, domains, categories, onClose, onChange }: {
  companyId: string; domains: Domain[]; categories: KnowledgeCategoryRow[]
  onClose: () => void; onChange: (next: KnowledgeCategoryRow[]) => void
}) {
  const [items, setItems] = useState(categories)
  const [name, setName] = useState('')
  const [domainId, setDomainId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sync = (next: KnowledgeCategoryRow[]) => { setItems(next); onChange(next) }
  const add = async () => {
    if (!name.trim()) return
    try { const c = await knowledgeService.createCategory(companyId, name.trim(), domainId || null); sync([...items, c]); setName('') }
    catch (e) { setError((e as Error).message) }
  }
  const del = async (id: string) => {
    try { await knowledgeService.deleteCategory(id); sync(items.filter(c => c.id !== id)) }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">Categorias</h2>
          <button onClick={onClose} className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</div>}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {items.length === 0 && <p className="py-3 text-center text-sm text-slate-400">Nenhuma categoria.</p>}
          {items.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-700">{c.name}</span>
              <button onClick={() => del(c.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nova categoria" className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <select value={domainId} onChange={e => setDomainId(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm sm:w-40">
            <option value="">Sem domínio</option>
            {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={add} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Adicionar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Botões utilitários ────────────────────────────────────────
function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50">{children}</button>
}
function ConfirmBtn({ title, confirm, onConfirm, children }: { title: string; confirm: string; onConfirm: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={() => { if (window.confirm(confirm)) onConfirm() }} className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50">{children}</button>
}
