// ============================================================
// ServiceFY — Administração da Base de Conhecimento
// Alcançável tanto pela Central de Configurações (seção 'knowledge',
// admin-only) quanto pela Central de Conhecimento (KnowledgeCenter,
// aberta a agent/ops_manager/governance_manager). CRUD de categorias
// e artigos, editor Markdown + preview, workflow (rascunho/revisão/
// publicado/arquivado) com máquina de estados por papel, concessões
// para restrito, versões e auditoria. A segurança real é a RLS/RPC
// (migrations 131-133); a UI só espelha as capacidades de cada papel
// via src/lib/kb-access.ts.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Plus, Search, Eye, EyeOff, Archive, Copy, Trash2, Save, Lock,
  BookOpen, History, FolderTree, X, CheckCircle2, AlertTriangle, Sparkles, RotateCcw,
  Link2, ListChecks, ShieldCheck, Circle, Check, ChevronRight, Wrench,
  HelpCircle, Stethoscope, GitPullRequestArrow, CalendarClock, CircleDot,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import {
  knowledgeService,
  type ArticleInput,
  type KnowledgeRelationOption,
  type KnowledgeRelationSelection,
} from '../lib/knowledge-service'
import {
  KNOWLEDGE_TEMPLATES,
  applyKnowledgeTemplate,
  calculateKnowledgeQuality,
  groupRelationSelections,
  hasUnsavedArticleChanges,
  resolveReviewStatus,
  type ArticleDraftSnapshot,
  type KnowledgeTemplateId,
} from '../lib/knowledge-authoring'
import { renderMarkdown } from '../lib/markdown'
import { isAdminRole } from '../lib/admin-access'
import { hasKbCapability } from '../lib/kb-access'
import type {
  KnowledgeArticleRow, KnowledgeCategoryRow, KnowledgeVisibility, KnowledgeStatus,
  KnowledgeArticleVersionRow, KnowledgeArticleGrantRow, KnowledgeGrantSubject,
  KnowledgeRelationKind, KnowledgeRelationTargetType,
} from '../lib/database.types'

interface Props { companyId: string; activeRole: string; onBack: () => void; backLabel?: string }
interface Domain { id: string; name: string }
interface Group { id: string; name: string }
interface Person { id: string; name: string }

const STATUS_META: Record<KnowledgeStatus, { label: string; cls: string }> = {
  draft:     { label: 'Rascunho',  cls: 'bg-slate-100 text-slate-600' },
  review:    { label: 'Em revisão', cls: 'bg-amber-100 text-amber-700' },
  published: { label: 'Publicado', cls: 'bg-emerald-100 text-emerald-700' },
  archived:  { label: 'Arquivado', cls: 'bg-slate-200 text-slate-500' },
}
const VIS_META: Record<KnowledgeVisibility, { label: string; help: string }> = {
  public:     { label: 'Público', help: 'Qualquer visitante do portal, mesmo sem estar logado' },
  tenant:     { label: 'Toda a empresa', help: 'Todos os colaboradores logados desta empresa' },
  internal:   { label: 'Interno', help: 'Apenas equipes de TI/atendimento' },
  restricted: { label: 'Restrito', help: 'Só quem receber concessão de acesso' },
}
const PAGE = 12

export default function KnowledgeAdmin({ companyId, activeRole, onBack, backLabel = 'Central de Configurações' }: Props) {
  const { profile } = useAuth()
  const isAdmin = isAdminRole(activeRole)
  const canEditAny = hasKbCapability(activeRole, 'kb.edit_any')
  const [domains, setDomains] = useState<Domain[]>([])
  const [categories, setCategories] = useState<KnowledgeCategoryRow[]>([])
  const [rows, setRows] = useState<KnowledgeArticleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [reviewNow] = useState(() => Date.now())

  const [fStatus, setFStatus] = useState<KnowledgeStatus | ''>('')
  const [fVis, setFVis] = useState<KnowledgeVisibility | ''>('')
  const [fCat, setFCat] = useState('')
  const [query, setQuery] = useState('')
  // Fase 20 (KEDB): rascunhos gerados automaticamente por resolução de ticket.
  const [fSourceTicketOnly, setFSourceTicketOnly] = useState(false)
  const [pendingDrafts, setPendingDrafts] = useState(0)

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
        sourceTicketOnly: fSourceTicketOnly || undefined,
        limit: PAGE, offset: page * PAGE,
      })
      setRows(rows); setTotal(total)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [companyId, fStatus, fVis, fCat, query, fSourceTicketOnly, page])

  const refreshPendingDrafts = useCallback(() => {
    knowledgeService.countPendingDrafts(companyId).then(setPendingDrafts).catch(e => setError((e as Error).message))
  }, [companyId])

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
  useEffect(() => { refreshPendingDrafts() }, [refreshPendingDrafts])

  const toggleSourceTicketFilter = () => {
    setPage(0)
    setFSourceTicketOnly(prev => {
      const next = !prev
      if (next) setFStatus('draft')
      return next
    })
  }

  const pages = Math.max(1, Math.ceil(total / PAGE))
  const catName = (id: string | null) => categories.find(c => c.id === id)?.name ?? '—'

  const doAction = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); flash(msg); loadArticles(); refreshPendingDrafts() }
    catch (e) { setError((e as Error).message) }
  }

  // Ações por linha seguem a máquina de estados de kb_set_article_status
  // (migration 133): quem escreve nunca aprova o próprio artigo, revisão
  // continua reservada a ops_manager/governance_manager/admin, e reinstaurar
  // um arquivado é privilégio de governança.
  const renderStatusActions = (a: KnowledgeArticleRow) => {
    const isOwn = a.author_id === profile?.id
    const actions: React.ReactNode[] = []

    if (a.status === 'draft') {
      if (isOwn || canEditAny) {
        actions.push(
          <IconBtn key="submit" title="Enviar para revisão" onClick={() => doAction(() => knowledgeService.submitReview(a.id, companyId), 'Artigo enviado para revisão.')}>
            <Eye className="w-4 h-4 text-primary" />
          </IconBtn>,
        )
      }
      if (isAdmin) {
        actions.push(
          <IconBtn key="publish" title="Publicar diretamente (pula revisão)" onClick={() => doAction(() => knowledgeService.publish(a.id, companyId), 'Artigo publicado.')}>
            <Eye className="w-4 h-4 text-emerald-600" />
          </IconBtn>,
        )
      }
      if (isOwn || hasKbCapability(activeRole, 'kb.archive')) {
        actions.push(
          <ConfirmBtn key="archive" title="Arquivar" confirm={`Arquivar "${a.title}"? Ele deixará de aparecer no portal.`} onConfirm={() => doAction(() => knowledgeService.archive(a.id, companyId), 'Artigo arquivado.')}>
            <Archive className="w-4 h-4 text-amber-600" />
          </ConfirmBtn>,
        )
      }
    } else if (a.status === 'review') {
      if (hasKbCapability(activeRole, 'kb.approve_publish') && (isAdmin || !isOwn)) {
        actions.push(
          <IconBtn key="approve" title="Aprovar e publicar" onClick={() => doAction(() => knowledgeService.publish(a.id, companyId), 'Artigo publicado.')}>
            <Eye className="w-4 h-4 text-emerald-600" />
          </IconBtn>,
        )
      }
      if (isOwn || hasKbCapability(activeRole, 'kb.reject_to_draft')) {
        actions.push(
          <IconBtn key="reject" title="Devolver para rascunho" onClick={() => doAction(() => knowledgeService.unpublish(a.id, companyId), 'Artigo devolvido para rascunho.')}>
            <EyeOff className="w-4 h-4 text-slate-500" />
          </IconBtn>,
        )
      }
    } else if (a.status === 'published') {
      if (hasKbCapability(activeRole, 'kb.unpublish')) {
        actions.push(
          <IconBtn key="unpublish" title="Despublicar" onClick={() => doAction(() => knowledgeService.unpublish(a.id, companyId), 'Artigo despublicado.')}>
            <EyeOff className="w-4 h-4 text-slate-500" />
          </IconBtn>,
        )
      }
      if (hasKbCapability(activeRole, 'kb.archive')) {
        actions.push(
          <ConfirmBtn key="archive" title="Arquivar" confirm={`Arquivar "${a.title}"? Ele deixará de aparecer no portal.`} onConfirm={() => doAction(() => knowledgeService.archive(a.id, companyId), 'Artigo arquivado.')}>
            <Archive className="w-4 h-4 text-amber-600" />
          </ConfirmBtn>,
        )
      }
    } else if (a.status === 'archived' && hasKbCapability(activeRole, 'kb.reinstate_archived')) {
      actions.push(
        <IconBtn key="reinstate" title="Reinstaurar como rascunho" onClick={() => doAction(() => knowledgeService.unpublish(a.id, companyId), 'Artigo reinstaurado como rascunho.')}>
          <RotateCcw className="w-4 h-4 text-primary" />
        </IconBtn>,
      )
    }

    if (hasKbCapability(activeRole, 'kb.create_draft')) {
      actions.push(
        <IconBtn key="dup" title="Duplicar" onClick={() => doAction(() => knowledgeService.duplicate(a.id, companyId), 'Artigo duplicado.')}>
          <Copy className="w-4 h-4 text-slate-500" />
        </IconBtn>,
      )
    }

    return actions
  }

  if (editing || creating) {
    return (
      <ArticleEditor
        companyId={companyId}
        article={editing}
        categories={categories}
        domains={domains}
        activeRole={activeRole}
        currentProfileId={profile?.id}
        onClose={() => { setEditing(null); setCreating(false) }}
        onSaved={(msg) => { setEditing(null); setCreating(false); flash(msg); loadArticles() }}
      />
    )
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-7xl p-5 lg:p-8">
        <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </button>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary-container p-3 text-on-primary-container"><BookOpen className="w-6 h-6" /></span>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Base de Conhecimento</h1>
              <p className="text-sm text-slate-500">Artigos, revisão, publicação e feedback.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingDrafts > 0 && (
              <button
                onClick={toggleSourceTicketFilter}
                title="Rascunhos gerados automaticamente ao resolver tickets marcados como candidatos a KB (Fase 20)"
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${
                  fSourceTicketOnly ? 'border-primary bg-primary text-on-primary' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                {pendingDrafts} Rascunho{pendingDrafts === 1 ? '' : 's'} Pendente{pendingDrafts === 1 ? '' : 's'}
              </button>
            )}
            {hasKbCapability(activeRole, 'kb.manage_categories') && (
              <button onClick={() => setShowCats(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">
                <FolderTree className="w-4 h-4" /> Categorias
              </button>
            )}
            {hasKbCapability(activeRole, 'kb.create_draft') && (
              <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:opacity-90">
                <Plus className="w-4 h-4" /> Novo artigo
              </button>
            )}
          </div>
        </header>

        {/* Filtros */}
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={query} onChange={e => { setPage(0); setQuery(e.target.value) }} placeholder="Buscar por título…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
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
                      {a.source_ticket_id && (
                        <span title="Gerado automaticamente ao resolver um ticket (Fase 20)" className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Sparkles className="w-3 h-3" /> Auto-gerado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_META[a.status].cls}`}>{STATUS_META[a.status].label}</span>
                      {resolveReviewStatus(a.review_due_at, reviewNow).status === 'overdue' && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">Revisão vencida</span>
                      )}
                      <span>{VIS_META[a.visibility].label}</span>
                      <span>· {catName(a.category_id)}</span>
                      <span>· v{a.version}</span>
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {renderStatusActions(a)}
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
function ArticleEditor({ companyId, article, categories, domains, activeRole, currentProfileId, onClose, onSaved }: {
  companyId: string; article: KnowledgeArticleRow | null
  categories: KnowledgeCategoryRow[]; domains: Domain[]
  activeRole: string; currentProfileId: string | null | undefined
  onClose: () => void; onSaved: (msg: string) => void
}) {
  const [title, setTitle] = useState(article?.title ?? '')
  const [summary, setSummary] = useState(article?.summary ?? '')
  const [body, setBody] = useState(article?.body ?? '')
  const [categoryId, setCategoryId] = useState(article?.category_id ?? '')
  const [domainId, setDomainId] = useState(article?.service_domain_id ?? '')
  const [visibility, setVisibility] = useState<KnowledgeVisibility>(article?.visibility ?? 'tenant')
  const [tags, setTags] = useState((article?.tags ?? []).join(', '))
  const [reviewDueAt, setReviewDueAt] = useState(article?.review_due_at?.slice(0, 10) ?? '')
  const [reviewNow] = useState(() => Date.now())
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState(article?.id ?? null)
  const [tab, setTab] = useState<'edit' | 'relations' | 'governance' | 'grants' | 'versions'>('edit')
  const [templateId, setTemplateId] = useState<KnowledgeTemplateId>('procedure')
  const [relationOptions, setRelationOptions] = useState<KnowledgeRelationOption[]>([])
  const [relations, setRelations] = useState<KnowledgeRelationSelection[]>([])
  const [relationsLoading, setRelationsLoading] = useState(true)
  const [relationType, setRelationType] = useState<KnowledgeRelationTargetType>('incident')
  const [relationQuery, setRelationQuery] = useState('')
  const [authorName, setAuthorName] = useState<string | null>(null)
  // Última versão persistida — base de comparação do indicador de
  // "alterações não salvas". Atualizada quando os vínculos carregam e a cada
  // salvamento bem-sucedido.
  const [baseline, setBaseline] = useState<ArticleDraftSnapshot>(() => ({
    title: article?.title ?? '',
    summary: article?.summary ?? '',
    body: article?.body ?? '',
    categoryId: article?.category_id ?? '',
    domainId: article?.service_domain_id ?? '',
    visibility: article?.visibility ?? 'tenant',
    tags: article?.tags ?? [],
    reviewDueAt: article?.review_due_at?.slice(0, 10) ?? '',
    relations: [],
  }))

  useEffect(() => {
    let cancelled = false
    setRelationsLoading(true)
    knowledgeService.listRelationOptions(companyId)
      .then(options => { if (!cancelled) setRelationOptions(options) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setRelationsLoading(false) })
    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => {
    if (!article?.id) return
    let cancelled = false
    knowledgeService.listRelations(article.id)
      .then(rows => {
        if (cancelled) return
        const loaded = rows.map(row => ({
          targetType: row.target_type,
          targetId: row.target_id,
          relationship: row.relationship,
        }))
        setRelations(loaded)
        setBaseline(current => ({ ...current, relations: loaded }))
      })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [article?.id])

  useEffect(() => {
    if (!article?.author_id) return
    let cancelled = false
    supabase.from('profiles').select('name').eq('id', article.author_id).maybeSingle()
      .then(({ data }) => { if (!cancelled && data?.name) setAuthorName(data.name) })
    return () => { cancelled = true }
  }, [article?.author_id])

  const parsedTags = useMemo(
    () => tags.split(',').map(tag => tag.trim()).filter(Boolean),
    [tags],
  )
  const quality = useMemo(() => calculateKnowledgeQuality({
    title,
    summary,
    body,
    tags: parsedTags,
    categoryId,
    domainId,
    relationCount: relations.length,
  }), [title, summary, body, parsedTags, categoryId, domainId, relations.length])

  const filteredRelationOptions = useMemo(() => {
    const query = relationQuery.trim().toLocaleLowerCase('pt-BR')
    return relationOptions
      .filter(option => option.targetType === relationType)
      .filter(option => !query || option.searchText.includes(query))
      .slice(0, 60)
  }, [relationOptions, relationQuery, relationType])

  const relationGroups = useMemo(
    () => groupRelationSelections(relations, relationOptions),
    [relations, relationOptions],
  )

  const currentSnapshot = useMemo<ArticleDraftSnapshot>(() => ({
    title, summary, body, categoryId, domainId, visibility,
    tags: parsedTags, reviewDueAt, relations,
  }), [title, summary, body, categoryId, domainId, visibility, parsedTags, reviewDueAt, relations])

  const dirty = useMemo(
    () => hasUnsavedArticleChanges(baseline, currentSnapshot),
    [baseline, currentSnapshot],
  )

  const review = useMemo(() => resolveReviewStatus(reviewDueAt, reviewNow), [reviewDueAt, reviewNow])

  const input = (): ArticleInput => ({
    title: title.trim(), summary: summary.trim() || null, body,
    categoryId: categoryId || null, serviceDomainId: domainId || null,
    visibility, tags: parsedTags, reviewDueAt: reviewDueAt || null,
  })

  const save = async (): Promise<string | null> => {
    if (!title.trim()) { setError('Informe um título.'); return null }
    if (!body.trim()) { setError('O conteúdo não pode ficar vazio.'); return null }
    setSaving(true); setError(null)
    try {
      let id = currentId
      if (id) {
        await knowledgeService.updateArticle(id, input())
      } else {
        const created = await knowledgeService.createArticle(companyId, input())
        id = created.id
        setCurrentId(id)
      }
      await knowledgeService.replaceRelations(id, companyId, relations)
      setBaseline(currentSnapshot)
      return id
    } catch (e) { setError((e as Error).message); return null }
    finally { setSaving(false) }
  }

  const saveAndClose = async () => { const id = await save(); if (id) onSaved('Artigo salvo.') }

  const closeGuarded = () => {
    if (dirty && !window.confirm('Há alterações não salvas neste artigo. Descartar e voltar?')) return
    onClose()
  }

  // Botão de ação primária segue a máquina de estados: um artigo novo/em
  // rascunho vai para revisão (exceto admin, que pode pular direto para
  // publicado); um artigo em revisão só ganha o botão de aprovar se quem
  // está editando não for o próprio autor (regra dos quatro olhos).
  const status = article?.status ?? 'draft'
  const isOwn = !article || article.author_id === currentProfileId
  const isAdmin = isAdminRole(activeRole)
  const canApprove = hasKbCapability(activeRole, 'kb.approve_publish') && (isAdmin || !isOwn)
  const showAdvanceButton = status === 'draft' || (status === 'review' && canApprove)
  const advanceLabel = status === 'draft' ? (isAdmin ? 'Salvar e publicar' : 'Salvar e enviar para revisão') : 'Salvar e aprovar'

  const saveAndAdvance = async () => {
    const id = await save()
    if (!id) return
    try {
      if (status === 'draft') {
        if (isAdmin) await knowledgeService.publish(id, companyId)
        else await knowledgeService.submitReview(id, companyId)
      } else {
        await knowledgeService.publish(id, companyId)
      }
      onSaved(status === 'draft' && !isAdmin ? 'Artigo enviado para revisão.' : 'Artigo publicado.')
    } catch (e) { setError((e as Error).message) }
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30'

  const addRelation = (option: KnowledgeRelationOption) => {
    setRelations(current => current.some(item =>
      item.targetType === option.targetType && item.targetId === option.targetId)
      ? current
      : [...current, {
          targetType: option.targetType,
          targetId: option.targetId,
          relationship: option.relationship,
        }])
  }

  const removeRelation = (targetType: KnowledgeRelationTargetType, targetId: string) => {
    setRelations(current => current.filter(item =>
      item.targetType !== targetType || item.targetId !== targetId))
  }

  const updateRelationKind = (
    targetType: KnowledgeRelationTargetType,
    targetId: string,
    relationship: KnowledgeRelationKind,
  ) => {
    setRelations(current => current.map(item =>
      item.targetType === targetType && item.targetId === targetId
        ? { ...item, relationship }
        : item))
  }

  const chooseTemplate = (next: KnowledgeTemplateId) => {
    setTemplateId(next)
    const nextBody = applyKnowledgeTemplate(next, body)
    if (nextBody === body && body.trim()) {
      setError('O modelo não substituiu o conteúdo existente. Apague o texto para começar com outra estrutura.')
      return
    }
    setError(null)
    setBody(nextBody)
  }

  const insertMarkdown = (snippet: string) => {
    setBody(current => `${current}${current.trim() ? '\n\n' : ''}${snippet}`)
  }

  const tabs: Array<[typeof tab, string]> = [
    ['relations', `Vínculos operacionais${relations.length ? ` (${relations.length})` : ''}`],
    ['governance', 'Governança'],
    ['edit', 'Conteúdo'],
    ...(hasKbCapability(activeRole, 'kb.manage_grants') ? ([['grants', 'Concessões']] as Array<[typeof tab, string]>) : []),
    ['versions', 'Versões'],
  ]

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-6xl p-5 lg:p-8">
        <button onClick={closeGuarded} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600">
          <ArrowLeft className="w-4 h-4" /> Voltar aos artigos
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900">{currentId ? 'Editar artigo' : 'Novo artigo'}</h1>
            {/* Situação editorial: o que está sendo editado, em que estado e se há trabalho não salvo. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
              <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_META[status].cls}`}>{STATUS_META[status].label}</span>
              {article && <span>v{article.version}</span>}
              {authorName && <span>Autor: <b className="font-semibold text-slate-600">{authorName}</b></span>}
              {article?.published_at && <span>Publicado em {new Date(article.published_at).toLocaleDateString('pt-BR')}</span>}
              {review.status !== 'none' && (
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  review.status === 'overdue' ? 'text-red-600' : review.status === 'due_soon' ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  <CalendarClock className="h-3.5 w-3.5" /> {review.label}
                </span>
              )}
              {dirty && (
                <span className="inline-flex items-center gap-1 font-bold text-amber-600" role="status">
                  <CircleDot className="h-3 w-3" /> Alterações não salvas
                </span>
              )}
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
            <button disabled={saving} onClick={saveAndClose} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Salvando…' : status === 'draft' ? 'Salvar rascunho' : 'Salvar alterações'}
            </button>
            {showAdvanceButton && (
              <button disabled={saving} onClick={saveAndAdvance} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                <Eye className="w-4 h-4" /> {advanceLabel}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Seções do artigo">
            {tabs
              .filter(([key]) => key === 'edit' || key === 'relations' || key === 'governance' || Boolean(currentId))
              .sort(([a], [b]) => ['edit', 'relations', 'governance', 'grants', 'versions'].indexOf(a) - ['edit', 'relations', 'governance', 'grants', 'versions'].indexOf(b))
              .map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3 py-2 text-sm font-bold sm:px-4 ${tab === k ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}>
                {k === 'grants' && <Lock className="mr-1 inline w-3.5 h-3.5" />}
                {k === 'versions' && <History className="mr-1 inline w-3.5 h-3.5" />}
                <span className="sm:hidden">
                  {k === 'relations' ? `Vínculos${relations.length ? ` (${relations.length})` : ''}` : l}
                </span>
                <span className="hidden sm:inline">{l}</span>
              </button>
            ))}
        </div>

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
                  <button onClick={() => setPreview(p => !p)} className="text-xs font-bold text-primary">{preview ? 'Editar' : 'Pré-visualizar'}</button>
                </div>
                {!preview && (
                  <div className="mb-2 flex flex-wrap gap-1 rounded-lg bg-slate-50 p-1.5" aria-label="Ferramentas do editor">
                    <button type="button" onClick={() => insertMarkdown('## Nova seção\n\n')} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">Seção</button>
                    <button type="button" onClick={() => insertMarkdown('1. Primeiro passo\n2. Segundo passo\n3. Validar resultado')} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">Passos</button>
                    <button type="button" onClick={() => insertMarkdown('- [ ] Verificação obrigatória')} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">Checklist</button>
                    <button type="button" onClick={() => insertMarkdown('> **Atenção:** descreva o risco ou cuidado operacional.')} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">Alerta</button>
                    <button type="button" onClick={() => insertMarkdown('```\ncomando ou evidência\n```')} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">Código</button>
                  </div>
                )}
                {preview
                  ? <div className="kb-prose min-h-[320px] rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
                  : <textarea value={body} onChange={e => setBody(e.target.value)} rows={16} className={`${inputCls} resize-y font-mono`} placeholder={'# Título\n\nPasso a passo em **Markdown**.\n\n- item 1\n- item 2'} />}
              </div>
            </div>

            <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="knowledge-template">Estrutura do artigo</label>
                <select
                  id="knowledge-template"
                  value={templateId}
                  onChange={event => chooseTemplate(event.target.value as KnowledgeTemplateId)}
                  className={`mt-1 ${inputCls}`}
                >
                  {KNOWLEDGE_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.label}</option>)}
                </select>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  {KNOWLEDGE_TEMPLATES.find(template => template.id === templateId)?.description}
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Qualidade para publicação</p>
                    <p className="mt-1 text-xs text-slate-500">Complete os sinais operacionais antes da revisão.</p>
                  </div>
                  <span className={`text-xl font-black ${quality.score >= 80 ? 'text-emerald-600' : quality.score >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {quality.score}%
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full transition-[width] duration-200 ${quality.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${quality.score}%` }} />
                </div>
                <div className="mt-3 space-y-2">
                  {quality.items.map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs">
                      {item.complete ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-slate-300" />}
                      <span className={item.complete ? 'text-slate-700' : 'text-slate-500'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs leading-5 text-slate-500">
                  Visibilidade, domínio, categoria, palavras-chave e a data de revisão ficam na aba{' '}
                  <button type="button" onClick={() => setTab('governance')} className="font-bold text-primary underline-offset-2 hover:underline">Governança</button>.
                </p>
              </div>
            </aside>
          </div>
        )}

        {tab === 'relations' && (
          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-5">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-primary-container p-2.5 text-on-primary-container"><Link2 className="h-5 w-5" /></span>
                  <div>
                    <h2 className="font-black text-slate-900">Conecte o artigo ao trabalho real</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                      Os vínculos melhoram busca, sugestões no cockpit e rastreabilidade entre conhecimento e operação.
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Tipos de vínculo operacional">
                  {([
                    ['incident', 'Incidentes', Stethoscope],
                    ['request', 'Solicitações', ListChecks],
                    ['problem', 'Problemas', Wrench],
                    ['change', 'Mudanças', GitPullRequestArrow],
                  ] as Array<[KnowledgeRelationTargetType, string, typeof Stethoscope]>).map(([key, label, Icon]) => {
                    const count = relationOptions.filter(option => option.targetType === key).length
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setRelationType(key); setRelationQuery('') }}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                          relationType === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Icon className="h-4 w-4" /> {label}
                        <span className={relationType === key ? 'text-slate-300' : 'text-slate-400'}>{count}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={relationQuery}
                    onChange={event => setRelationQuery(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Buscar no catálogo por nome, número, sintoma ou descrição"
                    aria-label="Buscar no catálogo"
                  />
                </div>
              </div>

              <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                {relationsLoading && <div className="p-8 text-center text-sm text-slate-500">Carregando catálogo operacional…</div>}
                {!relationsLoading && filteredRelationOptions.length === 0 && (
                  <div className="p-10 text-center">
                    <HelpCircle className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 font-bold text-slate-700">Nenhum item encontrado</p>
                    <p className="mt-1 text-sm text-slate-500">Revise a busca ou cadastre o item no catálogo correspondente.</p>
                  </div>
                )}
                {filteredRelationOptions.map(option => {
                  const selected = relations.some(item =>
                    item.targetType === option.targetType && item.targetId === option.targetId)
                  return (
                    <button
                      key={`${option.targetType}:${option.targetId}`}
                      type="button"
                      onClick={() => addRelation(option)}
                      disabled={selected}
                      className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-default disabled:bg-emerald-50/50"
                    >
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        selected
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <b className="text-sm text-slate-800">{option.title}</b>
                          <span className="text-xs font-semibold text-primary">{option.subtitle}</span>
                        </span>
                        {option.description && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{option.description}</span>}
                        <span className="mt-1.5 block text-[11px] font-semibold text-slate-400">{option.meta}</span>
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  )
                })}
              </div>
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 xl:sticky xl:top-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-black text-slate-900">Escopo do artigo</h2>
                  <p className="mt-1 text-sm text-slate-500">{relations.length} vínculo(s) selecionado(s)</p>
                </div>
                <span className="rounded-lg bg-primary-container px-2.5 py-1 text-sm font-black text-on-primary-container">{relations.length}/50</span>
              </div>
              {relationGroups.length === 0 ? (
                <div className="mt-5 rounded-xl bg-slate-50 p-5 text-center">
                  <Link2 className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-700">Sem vínculos ainda</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Selecione ao menos um objeto para tornar o artigo encontrável no contexto certo.</p>
                </div>
              ) : (
                <div className="mt-4 max-h-[520px] space-y-4 overflow-y-auto">
                  {relationGroups.map(group => (
                    <section key={group.targetType} aria-label={group.label}>
                      <div className="mb-1.5 flex items-baseline justify-between border-b border-slate-100 pb-1">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.label}</h3>
                        <span className="text-xs font-semibold text-slate-400">{group.items.length}</span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map(({ relation, option }) => (
                          <div key={`${relation.targetType}:${relation.targetId}`} className="rounded-xl border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-800">{option?.title ?? relation.targetId}</p>
                                <p className="truncate text-xs text-slate-500">{option?.subtitle ?? group.label}</p>
                              </div>
                              <button type="button" onClick={() => removeRelation(relation.targetType, relation.targetId)} className="rounded-md p-1 text-red-600/70 hover:bg-red-50 hover:text-red-700" aria-label={`Remover vínculo com ${option?.title ?? relation.targetId}`}>
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <select
                              value={relation.relationship}
                              onChange={event => updateRelationKind(relation.targetType, relation.targetId, event.target.value as KnowledgeRelationKind)}
                              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600"
                              aria-label="Finalidade do vínculo"
                            >
                              <option value="applies_to">Aplica-se a</option>
                              <option value="resolves">Resolve</option>
                              <option value="workaround">Oferece workaround</option>
                              <option value="reference">Referência para</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}

        {tab === 'governance' && (
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-black text-slate-900">Classificação e alcance</h2>
                  <p className="mt-1 text-sm text-slate-500">Defina onde o conhecimento aparece e quem pode consumi-lo.</p>
                </div>
              </div>
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Visibilidade
                  <select value={visibility} onChange={event => setVisibility(event.target.value as KnowledgeVisibility)} className={`mt-1 ${inputCls}`}>
                    {(Object.keys(VIS_META) as KnowledgeVisibility[]).map(value => <option key={value} value={value}>{VIS_META[value].label}</option>)}
                  </select>
                  <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-400">{VIS_META[visibility].help}</span>
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Domínio de serviço
                  <select value={domainId} onChange={event => setDomainId(event.target.value)} className={`mt-1 ${inputCls}`}>
                    <option value="">Selecione o domínio</option>
                    {domains.map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Categoria de conhecimento
                  <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className={`mt-1 ${inputCls}`}>
                    <option value="">Selecione a categoria</option>
                    {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Palavras-chave
                  <input value={tags} onChange={event => setTags(event.target.value)} className={`mt-1 ${inputCls}`} placeholder="vpn, acesso remoto, autenticação" />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Próxima revisão do conteúdo
                  <input
                    type="date"
                    value={reviewDueAt}
                    onChange={event => setReviewDueAt(event.target.value)}
                    className={`mt-1 ${inputCls}`}
                    aria-describedby="review-due-hint"
                  />
                  <span id="review-due-hint" className={`mt-1 block text-xs font-medium normal-case tracking-normal ${
                    review.status === 'overdue' ? 'text-red-600' : review.status === 'due_soon' ? 'text-amber-600' : 'text-slate-500'
                  }`}>
                    {review.status === 'none' ? 'Sem data definida — o artigo não expira.' : review.label}
                  </span>
                </label>
              </div>
              {visibility === 'restricted' && (
                <div className="mt-5 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Artigos restritos só ficam disponíveis para pessoas e grupos definidos em Concessões, mesmo depois da publicação.</p>
                </div>
              )}
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Qualidade para publicação</p>
                  <p className="mt-1 text-sm text-slate-500">Prontidão editorial e operacional</p>
                </div>
                <span className={`text-2xl font-black ${quality.score >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{quality.score}%</span>
              </div>
              <div className="mt-4 space-y-3">
                {quality.items.map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      {item.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                      {item.label}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">+{item.points}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const pending = quality.items.find(item => !item.complete)?.label
                  if (pending === 'Vínculo operacional') setTab('relations')
                  else if (pending === 'Domínio e categoria' || pending === 'Palavras-chave') setTab('governance')
                  else setTab('edit')
                }}
                className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Revisar pendências
              </button>
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
        <button onClick={add} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:opacity-90"><Plus className="w-4 h-4" /> Conceder</button>
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
              <p className="text-sm font-bold text-slate-700">v{v.version} · {STATUS_META[v.status as KnowledgeStatus]?.label ?? v.status} · {VIS_META[v.visibility as KnowledgeVisibility]?.label ?? v.visibility}</p>
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
          <button onClick={add} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:opacity-90">Adicionar</button>
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
