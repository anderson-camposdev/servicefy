// ============================================================
// ServiceFY — Base de Conhecimento (serviço tipado)
// Fala com as tabelas/RPCs das migrations 079 + 082. A RLS é a
// barreira real de tenant e visibilidade — este serviço nunca é
// a única proteção. Sem `any`.
// ============================================================

import { supabase } from './supabase'
import type {
  KnowledgeArticleRow, KnowledgeCategoryRow, KnowledgeArticleFeedbackRow,
  KnowledgeArticleVersionRow, KnowledgeArticleGrantRow, KnowledgeArticleCaseRow,
  KnowledgeSearchResult, KnowledgeSuggestion, KnowledgeStatus, KnowledgeVisibility,
  KnowledgeGrantSubject, KnowledgeUsage,
} from './database.types'

function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

/** Slug URL-safe a partir do título (sem acentos, minúsculo, hifenizado). */
export function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'artigo'
}

export interface ArticleListFilters {
  status?: KnowledgeStatus
  visibility?: KnowledgeVisibility
  categoryId?: string
  domainId?: string
  query?: string
  limit?: number
  offset?: number
  /** Fase 20 (KEDB): só rascunhos gerados automaticamente por resolução de ticket (source_ticket_id preenchido). */
  sourceTicketOnly?: boolean
}

export interface ArticleInput {
  title: string
  summary: string | null
  body: string
  categoryId: string | null
  serviceDomainId: string | null
  visibility: KnowledgeVisibility
  tags: string[]
}

export const knowledgeService = {
  // ─── Categorias ─────────────────────────────────────────────
  async listCategories(companyId: string): Promise<KnowledgeCategoryRow[]> {
    return unwrap(await supabase
      .from('knowledge_categories').select('*')
      .eq('company_id', companyId).order('name'))
  },

  async createCategory(companyId: string, name: string, serviceDomainId: string | null): Promise<KnowledgeCategoryRow> {
    return unwrap(await supabase
      .from('knowledge_categories')
      .insert({ company_id: companyId, name, slug: slugify(name), service_domain_id: serviceDomainId })
      .select().single())
  },

  async updateCategory(id: string, patch: Partial<Pick<KnowledgeCategoryRow, 'name' | 'service_domain_id'>>): Promise<KnowledgeCategoryRow> {
    const next: Record<string, unknown> = { ...patch }
    if (patch.name) next.slug = slugify(patch.name)
    return unwrap(await supabase.from('knowledge_categories').update(next).eq('id', id).select().single())
  },

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('knowledge_categories').delete().eq('id', id)
    if (error) throw error
  },

  // ─── Artigos (admin) ────────────────────────────────────────
  async listArticles(companyId: string, filters: ArticleListFilters = {}): Promise<{ rows: KnowledgeArticleRow[]; total: number }> {
    const limit = filters.limit ?? 20
    const offset = filters.offset ?? 0
    let q = supabase
      .from('knowledge_articles')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.visibility) q = q.eq('visibility', filters.visibility)
    if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
    if (filters.domainId) q = q.eq('service_domain_id', filters.domainId)
    if (filters.query && filters.query.trim()) q = q.ilike('title', `%${filters.query.trim()}%`)
    if (filters.sourceTicketOnly) q = q.not('source_ticket_id', 'is', null)
    const { data, error, count } = await q.order('updated_at', { ascending: false }).range(offset, offset + limit - 1)
    if (error) throw error
    return { rows: (data ?? []) as KnowledgeArticleRow[], total: count ?? 0 }
  },

  /** Fase 20 (KEDB): rascunhos gerados automaticamente por resolução de ticket, ainda não revisados. */
  async countPendingDrafts(companyId: string): Promise<number> {
    const { count, error } = await supabase
      .from('knowledge_articles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .not('source_ticket_id', 'is', null)
    if (error) throw error
    return count ?? 0
  },

  async getArticle(id: string): Promise<KnowledgeArticleRow> {
    return unwrap(await supabase.from('knowledge_articles').select('*').eq('id', id).single())
  },

  async getArticleBySlug(companyId: string, slug: string): Promise<KnowledgeArticleRow | null> {
    const { data, error } = await supabase
      .from('knowledge_articles').select('*')
      .eq('company_id', companyId).eq('slug', slug).maybeSingle()
    if (error) throw error
    return (data as KnowledgeArticleRow) ?? null
  },

  /** Garante slug único por tenant (acrescenta sufixo curto em colisão). */
  async uniqueSlug(companyId: string, base: string, ignoreId?: string): Promise<string> {
    const root = slugify(base)
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`
      const { data } = await supabase
        .from('knowledge_articles').select('id')
        .eq('company_id', companyId).eq('slug', candidate).maybeSingle()
      if (!data || (ignoreId && (data as { id: string }).id === ignoreId)) return candidate
    }
    return `${root}-${Date.now().toString(36)}`
  },

  async createArticle(companyId: string, input: ArticleInput): Promise<KnowledgeArticleRow> {
    const slug = await this.uniqueSlug(companyId, input.title)
    return unwrap(await supabase.from('knowledge_articles').insert({
      company_id: companyId,
      title: input.title, slug, summary: input.summary, body: input.body,
      category_id: input.categoryId, service_domain_id: input.serviceDomainId,
      visibility: input.visibility, tags: input.tags, status: 'draft',
    }).select().single())
  },

  async updateArticle(id: string, input: Partial<ArticleInput>): Promise<KnowledgeArticleRow> {
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.summary !== undefined) patch.summary = input.summary
    if (input.body !== undefined) patch.body = input.body
    if (input.categoryId !== undefined) patch.category_id = input.categoryId
    if (input.serviceDomainId !== undefined) patch.service_domain_id = input.serviceDomainId
    if (input.visibility !== undefined) patch.visibility = input.visibility
    if (input.tags !== undefined) patch.tags = input.tags
    return unwrap(await supabase.from('knowledge_articles').update(patch).eq('id', id).select().single())
  },

  // ─── Workflow (RPCs atômicas + auditadas) ───────────────────
  async setStatus(articleId: string, companyId: string, status: KnowledgeStatus): Promise<KnowledgeArticleRow> {
    return unwrap(await supabase.rpc('kb_set_article_status', {
      p_article_id: articleId, p_company_id: companyId, p_status: status,
    }))
  },
  publish(id: string, companyId: string) { return this.setStatus(id, companyId, 'published') },
  unpublish(id: string, companyId: string) { return this.setStatus(id, companyId, 'draft') },
  archive(id: string, companyId: string) { return this.setStatus(id, companyId, 'archived') },
  submitReview(id: string, companyId: string) { return this.setStatus(id, companyId, 'review') },

  async duplicate(articleId: string, companyId: string): Promise<KnowledgeArticleRow> {
    return unwrap(await supabase.rpc('kb_duplicate_article', {
      p_article_id: articleId, p_company_id: companyId,
    }))
  },

  async listVersions(articleId: string): Promise<KnowledgeArticleVersionRow[]> {
    return unwrap(await supabase
      .from('knowledge_article_versions').select('*')
      .eq('article_id', articleId).order('version', { ascending: false }))
  },

  // ─── Concessões (restricted) ────────────────────────────────
  async listGrants(articleId: string): Promise<KnowledgeArticleGrantRow[]> {
    return unwrap(await supabase
      .from('knowledge_article_grants').select('*')
      .eq('article_id', articleId).order('created_at', { ascending: false }))
  },

  async addGrant(companyId: string, articleId: string, subjectType: KnowledgeGrantSubject, subjectId: string, expiresAt: string | null): Promise<KnowledgeArticleGrantRow> {
    return unwrap(await supabase.from('knowledge_article_grants').insert({
      company_id: companyId, article_id: articleId,
      subject_type: subjectType, subject_id: subjectId, expires_at: expiresAt,
    }).select().single())
  },

  async removeGrant(id: string): Promise<void> {
    const { error } = await supabase.from('knowledge_article_grants').delete().eq('id', id)
    if (error) throw error
  },

  // ─── Busca (portal/admin) ───────────────────────────────────
  async search(companyId: string, params: { query?: string; domainId?: string; categoryId?: string; limit?: number; offset?: number } = {}): Promise<{ rows: KnowledgeSearchResult[]; total: number }> {
    const rows = unwrap(await supabase.rpc('kb_search_articles', {
      p_company_id: companyId,
      p_query: params.query ?? null,
      p_domain_id: params.domainId ?? null,
      p_category_id: params.categoryId ?? null,
      p_limit: params.limit ?? 20,
      p_offset: params.offset ?? 0,
    })) as KnowledgeSearchResult[]
    return { rows, total: rows[0]?.total_count ?? 0 }
  },

  // ─── Feedback (portal) ──────────────────────────────────────
  async submitFeedback(companyId: string, articleId: string, profileId: string, helpful: boolean, comment: string | null): Promise<KnowledgeArticleFeedbackRow> {
    return unwrap(await supabase.from('knowledge_article_feedback').insert({
      company_id: companyId, article_id: articleId, profile_id: profileId, helpful, comment,
    }).select().single())
  },

  // ─── Cockpit (sugestão, vínculo, deflexão) ──────────────────
  async suggestForCase(caseId: string, limit = 8): Promise<KnowledgeSuggestion[]> {
    return unwrap(await supabase.rpc('kb_suggest_for_case', { p_case_id: caseId, p_limit: limit })) as KnowledgeSuggestion[]
  },

  async registerUsage(articleId: string, caseId: string, usage: KnowledgeUsage): Promise<KnowledgeArticleCaseRow> {
    return unwrap(await supabase.rpc('kb_register_article_usage', {
      p_article_id: articleId, p_case_id: caseId, p_usage: usage,
    }))
  },

  /** Registro leve de uso/deflexão sem caso ESM (cockpit de incidentes). */
  async touchArticle(articleId: string, deflected: boolean): Promise<void> {
    const { error } = await supabase.rpc('kb_touch_article', { p_article_id: articleId, p_deflected: deflected })
    if (error) throw error
  },

  async listCaseLinks(caseId: string): Promise<KnowledgeArticleCaseRow[]> {
    return unwrap(await supabase
      .from('knowledge_article_cases').select('*')
      .eq('case_id', caseId).order('created_at', { ascending: false }))
  },
}
