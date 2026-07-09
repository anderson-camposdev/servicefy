// ============================================================
// ServiceFY ITSM — Supabase Data Services
// All CRUD + real-time subscriptions for ITIL modules
// Supports PostgreSQL schema-based tenant isolation & views
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  CompanyRow, ProfileRow, IncidentRow, IncidentHistoryRow, PortalTicketDetail, TicketMessageRow,
  ProblemRow, ChangeRow, CatalogItemRow, CatalogCategoryRow,
  CatalogServiceRow, SystemSymptomRow, CatalogServiceSymptomRow,
  RequestCategoryRow, RequestItemRow, RequestFormField, FormTemplateRow,
  TicketPriority, IncidentState, IncidentCategory,
  ChangeType, ChangeRisk,
  IncidentCatalogItemRow, IncidentCatalogSubitemRow, IncidentCatalogSymptomRow,
  RequestCatalogItemRow, RequestCatalogSubitemRow, ApprovalTokenRow,
  ActiveSessionRow, ChatbotWhitelistRow, ChatbotMessageRow, ChatbotConfigRow,
  AssignmentGroupRow, PendingReasonRow, DepartmentRow, RequestSubcategoryRow, TicketTaskRow, RequestApprovalRow, CsatSurveyRow, ResponseMacroRow,
  SlaCalendarRow, SlaCalendarShiftRow, SlaCalendarHolidayRow, SLAPolicyRow, SlaEventRow,
  WorkflowRuleRow, WorkflowExecutionLogRow, WorkflowActionQueueRow,
} from './database.types'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Dynamic schema clients cache to avoid recreating them constantly
const schemaClientsCache: Record<string, any> = {}

// TODO(security): Migrar para verificação via is_provider_tenant no perfil do usuário.
// Hoje a lógica MSP depende deste UUID hardcoded, o que cria um ponto de falha
// único: qualquer brecha na RLS com este ID bypassa o filtro de company_id.
// Quando o backend implementar verificação server-side, remover este UUID.
export const MSP_COMPANY_ID = '44444444-4444-4444-4444-444444444444'

// Registro dinâmico companyId → schemaName do PostgreSQL.
// Alimentado em runtime por setCompanySchemas() (ver useAppData).
// Empresas ausentes do mapa usam o schema 'public' por padrão, de
// modo que novos tenants provisionados funcionam automaticamente.
let companySchemaMap: Record<string, string> = {}

export const setCompanySchemas = (mapping: Record<string, string>) => {
  companySchemaMap = { ...companySchemaMap, ...mapping }
}

// Schemas reservados do Supabase que nunca devem ser usados como schema de tenant.
const RESERVED_SCHEMAS = new Set(['auth', 'storage', 'extensions', 'graphql', 'graphql_public', 'realtime', 'supabase_functions', 'vault'])
const SCHEMA_NAME_RE = /^[a-z][a-z0-9_]{0,62}$/

export function getSupabaseForSchema(schemaName?: string | null) {
  if (!schemaName || schemaName === 'public') {
    return supabase
  }
  if (!SCHEMA_NAME_RE.test(schemaName) || RESERVED_SCHEMAS.has(schemaName)) {
    console.error(`[security] Schema inválido ou reservado ignorado: "${schemaName}"`)
    return supabase
  }
  if (!schemaClientsCache[schemaName]) {
    schemaClientsCache[schemaName] = createClient<any>(url, key, {
      db: { schema: schemaName as any },
      auth: { persistSession: false, autoRefreshToken: false }
    })
  }
  return schemaClientsCache[schemaName]
}

const getClientForCompany = (companyId: string) => {
  const schema = companySchemaMap[companyId]
  return getSupabaseForSchema(schema)
}

// ─── Generic error helper ─────────────────────────────────────

function throwIfError<T>(data: T | null, error: unknown): T {
  if (error) throw error
  return data as T
}

// ─── COMPANIES ────────────────────────────────────────────────

import {
  validateBrandingFile,
  buildBrandAssetPath,
} from './branding.types'
import type { BrandingSettings, CatalogUiConfig } from './branding.types'

export const companiesService = {
  async list(): Promise<CompanyRow[]> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name')
    return throwIfError(data, error)
  },

  async create(payload: Partial<CompanyRow>): Promise<CompanyRow> {
    const { data, error } = await supabase
      .from('companies')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async update(id: string, payload: Partial<CompanyRow>): Promise<CompanyRow> {
    const { data, error } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  /**
   * Uploads a brand asset (logo or background) to the `branding_assets` bucket
   * using a **deterministic, idempotent path** so that repeated uploads for the
   * same tenant always overwrite the previous file rather than accumulating
   * orphaned objects in storage.
   *
   * Path format: `brands/{companyId}/{assetType}.{ext}`
   *
   * @param companyId - The tenant's UUID (used to scope the storage path).
   * @param file      - The File selected by the user.
   * @param assetType - `'logo'` or `'background'` (defaults to `'logo'`).
   * @returns Public URL of the uploaded asset.
   * @throws `Error` if file validation fails or Supabase storage returns an error.
   */
  async uploadBrandAsset(
    companyId: string,
    file: File,
    assetType: 'logo' | 'background' = 'logo',
  ): Promise<string> {
    const validation = validateBrandingFile(file)
    if (!validation.valid) throw new Error(validation.error!)

    const path = buildBrandAssetPath(companyId, assetType, file.type)

    const { error } = await supabase.storage
      .from('branding_assets')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (error) throw new Error(`Upload falhou: ${error.message}`)

    const { data } = supabase.storage
      .from('branding_assets')
      .getPublicUrl(path)

    return data.publicUrl
  },

  /**
   * Persists all branding settings for a tenant in a single atomic update,
   * mapping the `BrandingSettings` payload to the existing `companies` columns.
   *
   * RLS on the `companies` table ensures only the authenticated admin of the
   * tenant can mutate their own row — cross-tenant mutations are blocked by the
   * database, not by this function.
   *
   * @param companyId - UUID of the company/tenant to update.
   * @param settings  - Strongly-typed branding payload.
   * @returns The updated `CompanyRow`.
   * @throws `Error` if Supabase returns an error.
   */
  async updateBrandingSettings(
    companyId: string,
    settings: BrandingSettings,
    existingCatalogUiConfig: CatalogUiConfig | null = null,
  ): Promise<CompanyRow> {
    const baseConfig: CatalogUiConfig = existingCatalogUiConfig ?? {
      card_settings:  { layout: 'grid' },
      portal_buttons: {},
    }

    const updatedConfig: CatalogUiConfig = {
      ...baseConfig,
      card_settings: {
        ...baseConfig.card_settings,
        layout: settings.cardLayout,
      },
      portal_buttons: {
        ...baseConfig.portal_buttons,
        ...(settings.incidentButton?.label       != null && { incident_label: settings.incidentButton.label }),
        ...(settings.incidentButton?.description != null && { incident_desc:  settings.incidentButton.description }),
        ...(settings.incidentButton?.emoji       != null && { incident_emoji: settings.incidentButton.emoji }),
        ...(settings.requestButton?.label        != null && { request_label:  settings.requestButton.label }),
        ...(settings.requestButton?.description  != null && { request_desc:   settings.requestButton.description }),
        ...(settings.requestButton?.emoji        != null && { request_emoji:  settings.requestButton.emoji }),
      },
    }

    const payload: Partial<CompanyRow> = {
      primary_color:    settings.themeName,
      title_size:       settings.fontScale,
      logo_url:         settings.logoUrl,
      background_url:   settings.backgroundUrl,
      brand_name:       settings.brandName,
      welcome_title:    settings.welcomeTitle ?? undefined,
      welcome_subtitle: settings.welcomeSubtitle ?? undefined,
      bg_color:         settings.loginBackground ?? '',
      greeting_prefix:  settings.greetingPrefix,
      greeting_color:   settings.greetingColor,
      catalog_ui_config: updatedConfig as unknown as import('./database.types').Json,
    }

    return this.update(companyId, payload)
  },
}

// ─── PROFILES ────────────────────────────────────────────────

export const profilesService = {
  async listByCompany(companyId: string): Promise<ProfileRow[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('name')
    return throwIfError(data, error)
  },

  async getById(id: string): Promise<ProfileRow | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
    if (error?.code === 'PGRST116') return null
    return throwIfError(data, error)
  },

  async listAll(): Promise<ProfileRow[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name')
    return throwIfError(data, error)
  },

  async create(payload: Partial<ProfileRow>): Promise<ProfileRow> {
    const { data, error } = await supabase
      .from('profiles')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async update(id: string, payload: Partial<ProfileRow>): Promise<ProfileRow> {
    const { data, error } = await supabase
      .rpc('update_profile_secure', { p_profile_id: id, p_patch: payload })
    return throwIfError(data, error)
  },
}

// ─── INCIDENTS ────────────────────────────────────────────────

export type IncidentFilters = {
  companyId: string
  search?: string
  state?: IncidentState | 'all'
  priority?: TicketPriority | 'all'
  slaBreached?: boolean
  assignedToId?: string | null
  callerId?: string
  limit?: number
  offset?: number
  filterCompanyId?: string
  ticketType?: 'incident' | 'request' | 'all'
}

export const incidentsService = {
  /** Fetch a filtered, paginated list of incidents */
  async list(filters: IncidentFilters): Promise<IncidentRow[]> {
    const isMSP = filters.companyId === MSP_COMPANY_ID
    let client = getClientForCompany(filters.companyId)
    let q = client.from('incidents').select('*')

    if (isMSP) {
      if (filters.filterCompanyId && filters.filterCompanyId !== 'all') {
        q = q.eq('company_id', filters.filterCompanyId)
      }
    } else {
      q = q.eq('company_id', filters.companyId)
    }

    q = q.order('updated_at', { ascending: false })

    if (filters.state && filters.state !== 'all')    q = q.eq('state', filters.state)
    if (filters.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority)
    if (filters.slaBreached !== undefined)            q = q.eq('sla_breached', filters.slaBreached)
    if (filters.search)                               q = q.ilike('short_description', `%${filters.search}%`)
    if (filters.callerId)                             q = q.eq('caller_id', filters.callerId)
    if (filters.ticketType && filters.ticketType !== 'all') q = q.eq('ticket_type', filters.ticketType)
    if (filters.limit)                                q = q.limit(filters.limit)
    if (filters.offset)                               q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1)

    const { data, error } = await q
    return throwIfError(data, error)
  },

  /** Get a single incident with its history */
  async getById(id: string, companyId: string): Promise<IncidentRow & { history: IncidentHistoryRow[] }> {
    const client = getClientForCompany(companyId)
    const [{ data: inc, error: e1 }, { data: hist, error: e2 }] = await Promise.all([
      client.from('incidents').select('*').eq('id', id).single(),
      client.from('incident_history').select('*').eq('incident_id', id).order('created_at', { ascending: false }),
    ])
    if (e1) throw e1
    if (e2) throw e2
    return { ...inc!, history: hist ?? [] }
  },

  /** Histórico PÚBLICO do chamado (linha do tempo p/ o solicitante, sem notas internas). Mais recente primeiro. */
  async listPublicHistory(incidentId: string, companyId: string): Promise<IncidentHistoryRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('incident_history')
      .select('*')
      .eq('incident_id', incidentId)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    return throwIfError(data, error)
  },

  /** User-facing one-page detail with catalog context. */
  async getPortalDetail(id: string, companyId: string): Promise<PortalTicketDetail> {
    const client = getClientForCompany(companyId)
    const { data: incident, error: incidentError } = await client
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single()
    if (incidentError) throw incidentError

    let catalogCategoryName: string | null = null
    let catalogSelectionName: string | null = null

    if (incident?.ticket_type === 'request' && incident.request_item_id) {
      const { data } = await supabase
        .from('request_items')
        .select('name, category:request_categories(name)')
        .eq('id', incident.request_item_id)
        .maybeSingle()
      const row = data as any
      catalogSelectionName = row?.name ?? null
      catalogCategoryName = row?.category?.name ?? null
    } else if (incident?.catalog_service_id) {
      const { data } = await supabase
        .from('catalog_services')
        .select('name, category:catalog_categories(name)')
        .eq('id', incident.catalog_service_id)
        .maybeSingle()
      const row = data as any
      catalogSelectionName = row?.name ?? null
      catalogCategoryName = row?.category?.name ?? null
    }

    return {
      ...incident!,
      catalog_category_name: catalogCategoryName,
      catalog_selection_name: catalogSelectionName,
    }
  },

  /** KPI aggregates for the dashboard */
  async getKPIs(companyId: string, filterCompanyId?: string, ticketType?: 'incident' | 'request') {
    const isMSP = companyId === MSP_COMPANY_ID
    let q = getClientForCompany(companyId)
      .from('incidents')
      .select('state, priority, sla_breached, assigned_to_id, company_id, ticket_type')

    if (isMSP) {
      if (filterCompanyId && filterCompanyId !== 'all') {
        q = q.eq('company_id', filterCompanyId)
      }
    } else {
      q = q.eq('company_id', companyId)
    }

    if (ticketType) {
      q = q.eq('ticket_type', ticketType)
    }

    const { data, error } = await q
    if (error) throw error
    const rows = data ?? []
    return {
      total:       rows.length,
      critical:    rows.filter((r: any) => r.priority === 'P1 - Critical').length,
      inProgress:  rows.filter((r: any) => r.state === 'In Progress').length,
      slaBreached: rows.filter((r: any) => r.sla_breached).length,
      unassigned:  rows.filter((r: any) => !r.assigned_to_id).length,
    }
  },

  /** Create a new incident — number is auto-generated by DB trigger */
  async create(payload: {
    companyId: string
    shortDescription: string
    description?: string
    priority: TicketPriority
    category: IncidentCategory
    callerName: string
    callerId?: string
    assignedToName?: string
    assignedToId?: string
    assignedGroupName?: string
    assignedGroupId?: string
  }): Promise<IncidentRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('incidents')
      .insert({
        company_id:          payload.companyId,
        short_description:   payload.shortDescription,
        description:         payload.description ?? null,
        priority:            payload.priority,
        category:            payload.category,
        caller_name:         payload.callerName,
        caller_id:           payload.callerId ?? null,
        assigned_to_name:    payload.assignedToName ?? null,
        assigned_to_id:      payload.assignedToId ?? null,
        assigned_group_name: payload.assignedGroupName ?? null,
        assigned_group_id:   payload.assignedGroupId ?? null,
        ticket_type:         'incident',
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  /**
   * Abertura MANUAL (atendimento telefônico/direto) por um analista.
   * Numeração INC/REQ e auditoria de 'Criação' (mensagem manual) são
   * geradas por triggers. O grupo solucionador herdado do catálogo é
   * gravado e NÃO é alterado (governança de roteamento).
   */
  async openManual(payload: {
    companyId: string
    ticketType: 'incident' | 'request'
    callerId: string | null
    callerName: string
    shortDescription: string
    description?: string | null
    catalogServiceId?: string | null
    symptomId?: string | null
    requestItemId?: string | null
    assignmentGroupId?: string | null
    assignmentGroupName?: string | null
    slaHours?: number | null
    impact?: string | null
    urgency?: string | null
    priority?: string | null
    formData?: Record<string, unknown> | null
    startNow: boolean
    analystId: string
    analystName: string
  }): Promise<IncidentRow> {
    const now = new Date().toISOString()
    const slaDeadline = payload.slaHours ? new Date(Date.now() + payload.slaHours * 3600 * 1000).toISOString() : null
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('incidents')
      .insert({
        company_id:          payload.companyId,
        ticket_type:         payload.ticketType,
        short_description:   payload.shortDescription,
        description:         payload.description ?? null,
        category:            'Inquiry',
        caller_id:           payload.callerId ?? null,
        caller_name:         payload.callerName,
        catalog_service_id:  payload.catalogServiceId ?? null,
        symptom_id:          payload.symptomId ?? null,
        request_item_id:     payload.requestItemId ?? null,
        // Governança: grupo solucionador herdado do catálogo (imutável).
        assignment_group_id: payload.assignmentGroupId ?? null,
        assigned_group_name: payload.assignmentGroupName ?? null,
        sla_deadline:        slaDeadline,
        impact:              payload.impact ?? null,
        urgency:             payload.urgency ?? null,
        priority:            payload.priority ?? 'P3 - Moderate',
        form_data:           payload.formData ?? null,
        // SLA de Resposta liquidado + atribuição imediata quando "Iniciar já".
        state:               payload.startNow ? 'In Progress' : 'New',
        assigned_to_id:      payload.startNow ? payload.analystId : null,
        assigned_to_name:    payload.startNow ? payload.analystName : null,
        responded_at:        payload.startNow ? now : null,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  /** Update incident fields and log to incident_history */
  async update(
    id: string,
    companyId: string,
    changes: Partial<Pick<IncidentRow, 'state' | 'priority' | 'assigned_to_id' | 'assigned_to_name' | 'assigned_group_id' | 'assigned_group_name' | 'assignment_group_id' | 'description' | 'impact' | 'urgency'>>,
    actorName: string,
    comment?: string
  ): Promise<IncidentRow> {
    const client = getClientForCompany(companyId)

    // Fetch the current incident state to log old_value and new_value
    const { data: current, error: getErr } = await client
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single()
    if (getErr) throw getErr

    // Record history for each field changed
    const historyInserts: object[] = []
    for (const [field, newValue] of Object.entries(changes)) {
      const oldValue = current ? (current as any)[field] : null
      const strOld = oldValue !== null && oldValue !== undefined ? String(oldValue) : null
      const strNew = newValue !== null && newValue !== undefined ? String(newValue) : null

      // Only record history if values actually differ
      if (strOld !== strNew) {
        historyInserts.push({
          incident_id:     id,
          changed_by_name: actorName,
          field_name:      field,
          old_value:       strOld,
          new_value:       strNew,
          comment:         comment ?? null,
          is_public:       true,
        })
      }
    }

    const [{ data, error: updateErr }, { error: histErr }] = await Promise.all([
      client.from('incidents').update(changes).eq('id', id).select().single(),
      historyInserts.length > 0
        ? client.from('incident_history').insert(historyInserts)
        : Promise.resolve({ error: null }),
    ])
    if (updateErr) throw updateErr
    if (histErr)   throw histErr
    return data!
  },

  /** Unifies saving a comment/note, updating incident fields, and writing audit logs in one transaction flow */
  async conduct(
    id: string,
    companyId: string,
    payload: {
      changes: Partial<Pick<IncidentRow, 'state' | 'assigned_to_id' | 'assigned_to_name' | 'assigned_group_name' | 'assignment_group_id' | 'close_code' | 'close_notes' | 'resolved_at' | 'closed_at' | 'priority' | 'impact' | 'urgency' | 'pending_reason' | 'pending_reason_id'>>,
      comment?: string,
      isInternal?: boolean,
      senderId?: string | null,
      senderName?: string | null,
    }
  ): Promise<IncidentRow> {
    const client = getClientForCompany(companyId)

    // 1. Fetch current incident row to compare old/new values
    const { data: current, error: getErr } = await client
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single()
    if (getErr) throw getErr

    // 2. Prepare history logs for changed fields
    const historyInserts: any[] = []
    const actorName = payload.senderName ?? 'Analista'
    const isPublic = !payload.isInternal

    for (const [field, newValue] of Object.entries(payload.changes)) {
      const oldValue = current ? (current as any)[field] : null
      const strOld = oldValue !== null && oldValue !== undefined ? String(oldValue) : null
      const strNew = newValue !== null && newValue !== undefined ? String(newValue) : null

      if (strOld !== strNew) {
        historyInserts.push({
          incident_id:     id,
          changed_by_name: actorName,
          changed_by_id:   payload.senderId ?? null,
          field_name:      field,
          old_value:       strOld,
          new_value:       strNew,
          comment:         payload.comment?.trim() || null,
          is_public:       isPublic,
        })
      }
    }

    // 3. If there is a comment, add it to history inserts as a comment field
    if (payload.comment?.trim()) {
      historyInserts.push({
        incident_id:     id,
        changed_by_name: actorName,
        changed_by_id:   payload.senderId ?? null,
        field_name:      'comment',
        comment:         payload.comment.trim(),
        new_value:       payload.comment.trim(),
        is_public:       isPublic,
      })
    }

    // 4. Perform database updates sequentially
    let updatedIncident = current

    if (Object.keys(payload.changes).length > 0) {
      const { data, error: updateErr } = await client
        .from('incidents')
        .update(payload.changes)
        .eq('id', id)
        .select()
        .single()
      if (updateErr) throw updateErr
      updatedIncident = data!
    }

    if (historyInserts.length > 0) {
      const { error: histErr } = await client
        .from('incident_history')
        .insert(historyInserts)
      if (histErr) throw histErr
    }

    if (payload.comment?.trim()) {
      const { error: msgErr } = await supabase
        .from('ticket_messages')
        .insert({
          incident_id: id,
          company_id:  companyId,
          body:        payload.comment.trim(),
          is_internal: payload.isInternal ?? false,
          sender_id:   payload.senderId ?? null,
          sender_name: payload.senderName ?? null,
          actor_type:  'analyst',
        })
      if (msgErr) throw msgErr
    }

    return updatedIncident
  },

  /** Add a comment/note without changing any field */
  async addComment(incidentId: string, companyId: string, comment: string, actorName: string, isPublic = true) {
    const { error } = await getClientForCompany(companyId).from('incident_history').insert({
      incident_id:     incidentId,
      changed_by_name: actorName,
      field_name:      'comment',
      comment,
      is_public:       isPublic,
    })
    if (error) throw error
  },

  /** Starts service atomically and closes the first-response SLA clock. */
  async startService(id: string, companyId: string): Promise<IncidentRow> {
    void companyId
    const { data, error } = await supabase
      .rpc('start_ticket_service', { p_incident_id: id })
    return throwIfError(data, error)
  },

  /** Encerramento padrão ServiceNow: grava close_code/close_notes e move para "Resolved". */
  async resolve(id: string, companyId: string, closeCode: string, closeNotes: string, actorName: string): Promise<IncidentRow> {
    const client = getClientForCompany(companyId)
    const { data, error } = await client
      .from('incidents')
      .update({ state: 'Resolved', close_code: closeCode, close_notes: closeNotes, resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    await client.from('incident_history').insert({
      incident_id: id, changed_by_name: actorName, field_name: 'state',
      new_value: 'Resolved', comment: `Encerrado (${closeCode}): ${closeNotes ?? ''}`.trim(), is_public: true,
    })
    return data!
  },

  /** Solicitante aceita a solução → fecha o chamado (Closed). */
  async acceptResolution(id: string, companyId: string, actorName: string): Promise<void> {
    void companyId
    void actorName
    const { error } = await supabase.rpc('accept_incident_resolution', {
      p_incident_id: id,
    })
    if (error) throw error
  },

  /**
   * Reabertura pelo solicitante: grava a justificativa no chat (ticket_messages,
   * actor 'user') — o trigger reopen_incident_on_user_message volta o estado para
   * In Progress, zera resolved_at e registra a transição no histórico.
   */
  async userReopen(id: string, companyId: string, justification: string, senderId: string | null, senderName: string): Promise<void> {
    const reason = justification.trim()
    // 1) Mensagem no chat (dispara o trigger de reabertura no banco)
    await messagesService.send({
      incidentId: id, companyId, body: `🔄 Reabertura solicitada: ${reason}`,
      isInternal: false, senderId, senderName, actorType: 'user',
    })
  },

  /** Subscribe to real-time changes on incidents for a company */
  subscribeToCompany(
    companyId: string,
    onInsert: (row: IncidentRow) => void,
    onUpdate: (row: IncidentRow) => void,
    callerId?: string,
  ) {
    const schema = companySchemaMap[companyId] || 'public'
    const isMSP = companyId === MSP_COMPANY_ID
    const channelName = callerId ? `incidents:caller:${callerId}` : isMSP ? 'incidents:msp' : `incidents:${companyId}`
    const callerFilter = callerId ? `caller_id=eq.${callerId}` : null
    const insertConfig: any = callerFilter
      ? { event: 'INSERT', schema, table: 'incidents', filter: callerFilter }
      : isMSP
      ? { event: 'INSERT', schema, table: 'incidents' }
      : { event: 'INSERT', schema, table: 'incidents', filter: `company_id=eq.${companyId}` }
    const updateConfig: any = callerFilter
      ? { event: 'UPDATE', schema, table: 'incidents', filter: callerFilter }
      : isMSP
      ? { event: 'UPDATE', schema, table: 'incidents' }
      : { event: 'UPDATE', schema, table: 'incidents', filter: `company_id=eq.${companyId}` }

    return getClientForCompany(companyId)
      .channel(channelName)
      .on(
        'postgres_changes',
        insertConfig,
        (payload: any) => onInsert(payload.new as IncidentRow)
      )
      .on(
        'postgres_changes',
        updateConfig,
        (payload: any) => onUpdate(payload.new as IncidentRow)
      )
      .subscribe()
  },

  /** Subscribe to history changes for an incident */
  subscribeToHistory(incidentId: string, companyId: string, onInsert: (row: IncidentHistoryRow) => void) {
    const schema = companySchemaMap[companyId] || 'public'
    return getClientForCompany(companyId)
      .channel(`incident_history:${incidentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema, table: 'incident_history', filter: `incident_id=eq.${incidentId}` },
        (payload: any) => onInsert(payload.new as IncidentHistoryRow),
      )
      .subscribe()
  },
}

// ─── ASSIGNMENT GROUPS (Equipes Solucionadoras) ──────────────

export const assignmentGroupsService = {
  /** List active groups for a company */
  async list(companyId: string): Promise<AssignmentGroupRow[]> {
    const { data, error } = await supabase
      .from('assignment_groups')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    return throwIfError(data, error)
  },

  /** List only active groups */
  async listActive(companyId: string): Promise<AssignmentGroupRow[]> {
    const { data, error } = await supabase
      .from('assignment_groups')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')
    return throwIfError(data, error)
  },

  /** Create a new group */
  async create(payload: { companyId: string; name: string; description?: string }): Promise<AssignmentGroupRow> {
    const { data, error } = await supabase
      .from('assignment_groups')
      .insert({
        company_id: payload.companyId,
        name: payload.name,
        description: payload.description ?? null,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  /** Update group */
  async update(id: string, payload: Partial<Pick<AssignmentGroupRow, 'name' | 'description' | 'is_active'>>): Promise<AssignmentGroupRow> {
    const { data, error } = await supabase
      .from('assignment_groups')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  /** Delete group */
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('assignment_groups')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  /** List members of a group */
  async listMembers(groupId: string): Promise<ProfileRow[]> {
    // Fetch user_ids, then fetch profiles
    const { data: links, error: e1 } = await supabase
      .from('user_groups')
      .select('user_id')
      .eq('group_id', groupId)
    if (e1) throw e1
    if (!links || links.length === 0) return []
    const ids = links.map((l: any) => l.user_id)
    const { data: profiles, error: e2 } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids)
      .order('name')
    return throwIfError(profiles, e2)
  },

  /** List groups a user belongs to */
  async listForUser(userId: string): Promise<AssignmentGroupRow[]> {
    const { data: links, error: e1 } = await supabase
      .from('user_groups')
      .select('group_id')
      .eq('user_id', userId)
    if (e1) throw e1
    if (!links || links.length === 0) return []
    const ids = links.map((l: any) => l.group_id)
    const { data: groups, error: e2 } = await supabase
      .from('assignment_groups')
      .select('*')
      .in('id', ids)
      .eq('is_active', true)
      .order('name')
    return throwIfError(groups, e2)
  },

  /** Add a member to a group */
  async addMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_groups')
      .upsert({ user_id: userId, group_id: groupId }, { onConflict: 'user_id,group_id' })
    if (error) throw error
  },

  /** Remove a member from a group */
  async removeMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_groups')
      .delete()
      .eq('user_id', userId)
      .eq('group_id', groupId)
    if (error) throw error
  },
}

// ─── PENDING REASONS (Motivos de Pendência — Governança SLA) ──

export const pendingReasonsService = {
  /** Lista os motivos de pendência ativos do tenant (migration 035). */
  async list(companyId: string): Promise<PendingReasonRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('pending_reasons')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('name')
    return throwIfError(data, error)
  },

  /** Lista TODOS os motivos (inclui inativos) — uso administrativo. */
  async listAll(companyId: string): Promise<PendingReasonRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('pending_reasons')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    return throwIfError(data, error)
  },

  async create(payload: {
    companyId: string; name: string; slug: string; requiresCustomerAction: boolean; pausesSla?: boolean
  }): Promise<PendingReasonRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('pending_reasons')
      .insert({
        company_id: payload.companyId,
        name: payload.name,
        slug: payload.slug,
        requires_customer_action: payload.requiresCustomerAction,
        pauses_sla: payload.pausesSla !== false,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  async update(
    id: string,
    companyId: string,
    patch: Partial<Pick<PendingReasonRow, 'name' | 'slug' | 'requires_customer_action' | 'active' | 'pauses_sla'>>,
  ): Promise<PendingReasonRow> {
    const { data, error } = await getClientForCompany(companyId)
      .from('pending_reasons')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async remove(id: string, companyId: string): Promise<void> {
    const { error } = await getClientForCompany(companyId)
      .from('pending_reasons')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}

// ─── SLA POLICIES (Políticas de prazo por prioridade) ────────

export const slaPolicyService = {
  /** Lista as políticas do tenant ordenadas por prioridade (1..5). */
  async list(companyId: string): Promise<SLAPolicyRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('sla_policies')
      .select('*')
      .eq('company_id', companyId)
      .order('priority')
    return throwIfError(data, error)
  },

  async update(
    id: string,
    companyId: string,
    patch: Partial<Pick<SLAPolicyRow, 'response_time_minutes' | 'resolution_time_minutes' | 'active'>>,
  ): Promise<SLAPolicyRow> {
    const { data, error } = await getClientForCompany(companyId)
      .from('sla_policies')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },
}

// ─── SLA CALENDARS (Calendário útil + turnos + feriados) ─────

export const slaCalendarsService = {
  async list(companyId: string): Promise<SlaCalendarRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('sla_calendars')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    return throwIfError(data, error)
  },

  async create(payload: {
    companyId: string; name: string; timezone?: string; is24x7?: boolean
  }): Promise<SlaCalendarRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('sla_calendars')
      .insert({
        company_id: payload.companyId,
        name: payload.name,
        timezone: payload.timezone ?? 'America/Sao_Paulo',
        is_24x7: payload.is24x7 ?? false,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  async update(
    id: string,
    companyId: string,
    patch: Partial<Pick<SlaCalendarRow, 'name' | 'timezone' | 'is_24x7' | 'active'>>,
  ): Promise<SlaCalendarRow> {
    const { data, error } = await getClientForCompany(companyId)
      .from('sla_calendars')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async remove(id: string, companyId: string): Promise<void> {
    const { error } = await getClientForCompany(companyId)
      .from('sla_calendars')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ─ Turnos ─
  async listShifts(calendarId: string, companyId: string): Promise<SlaCalendarShiftRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('sla_calendar_shifts')
      .select('*')
      .eq('calendar_id', calendarId)
      .order('weekday')
    return throwIfError(data, error)
  },

  async addShift(payload: {
    companyId: string; calendarId: string; weekday: number; startTime: string; endTime: string
  }): Promise<SlaCalendarShiftRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('sla_calendar_shifts')
      .insert({
        calendar_id: payload.calendarId,
        weekday: payload.weekday,
        start_time: payload.startTime,
        end_time: payload.endTime,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  async removeShift(id: string, companyId: string): Promise<void> {
    const { error } = await getClientForCompany(companyId)
      .from('sla_calendar_shifts')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ─ Feriados ─
  async listHolidays(calendarId: string, companyId: string): Promise<SlaCalendarHolidayRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('sla_calendar_holidays')
      .select('*')
      .eq('calendar_id', calendarId)
      .order('holiday')
    return throwIfError(data, error)
  },

  async addHoliday(payload: {
    companyId: string; calendarId: string; holiday: string; name?: string | null
  }): Promise<SlaCalendarHolidayRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('sla_calendar_holidays')
      .insert({
        calendar_id: payload.calendarId,
        holiday: payload.holiday,
        name: payload.name ?? null,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  async removeHoliday(id: string, companyId: string): Promise<void> {
    const { error } = await getClientForCompany(companyId)
      .from('sla_calendar_holidays')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}

// ─── PROBLEMS ────────────────────────────────────────────────

export const problemsService = {
  async list(companyId: string): Promise<ProblemRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('problems')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    return throwIfError(data, error)
  },

  async getKPIs(companyId: string) {
    const { data, error } = await getClientForCompany(companyId)
      .from('problems')
      .select('state, root_cause, known_error')
      .eq('company_id', companyId)
    if (error) throw error
    const rows = data ?? []
    return {
      total:       rows.length,
      active:      rows.filter((r: any) => !['Resolved', 'Closed'].includes(r.state)).length,
      rootCause:   rows.filter((r: any) => r.root_cause).length,
      knownError:  rows.filter((r: any) => r.known_error).length,
    }
  },

  async create(payload: {
    companyId: string
    shortDescription: string
    description?: string
    priority?: TicketPriority
    category?: IncidentCategory
    assignedToName?: string
    assignedToId?: string
  }): Promise<ProblemRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('problems')
      .insert({
        company_id:        payload.companyId,
        short_description: payload.shortDescription,
        description:       payload.description ?? null,
        priority:          payload.priority ?? 'P3 - Moderate',
        category:          payload.category ?? 'Software',
        assigned_to_name:  payload.assignedToName ?? null,
        assigned_to_id:    payload.assignedToId ?? null,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  async update(id: string, companyId: string, changes: Partial<Pick<ProblemRow, 'state' | 'root_cause' | 'workaround' | 'known_error'>>, actorName: string): Promise<ProblemRow> {
    const client = getClientForCompany(companyId)
    const [{ data, error: ue }, { error: he }] = await Promise.all([
      client.from('problems').update(changes).eq('id', id).select().single(),
      client.from('problem_history').insert(
        Object.entries(changes).map(([field, val]) => ({ problem_id: id, changed_by_name: actorName, field_name: field, new_value: String(val ?? ''), is_public: true }))
      ),
    ])
    if (ue) throw ue
    if (he) throw he
    return data!
  },
}

// ─── CHANGES ─────────────────────────────────────────────────

export const changesService = {
  async list(companyId: string): Promise<ChangeRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('changes')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    return throwIfError(data, error)
  },

  async getKPIs(companyId: string) {
    const { data, error } = await getClientForCompany(companyId)
      .from('changes')
      .select('state, type, risk')
      .eq('company_id', companyId)
    if (error) throw error
    const rows = data ?? []
    return {
      total:       rows.length,
      awaitingCAB: rows.filter((r: any) => r.state === 'Awaiting CAB Approval').length,
      emergency:   rows.filter((r: any) => r.type === 'Emergency').length,
      highRisk:    rows.filter((r: any) => ['High', 'Critical'].includes(r.risk)).length,
      scheduled:   rows.filter((r: any) => r.state === 'Scheduled').length,
    }
  },

  async create(payload: {
    companyId: string
    shortDescription: string
    description?: string
    justification?: string
    type?: ChangeType
    risk?: ChangeRisk
    implementationPlan?: string
    testPlan?: string
    backoutPlan?: string
    changeWindowStart?: string
    changeWindowEnd?: string
    requestedByName: string
    requestedById?: string
    cabApprovers?: string[]
    cabApprovals?: any
  }): Promise<ChangeRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('changes')
      .insert({
        company_id:          payload.companyId,
        short_description:   payload.shortDescription,
        description:         payload.description ?? null,
        justification:       payload.justification ?? null,
        type:                payload.type ?? 'Normal',
        risk:                payload.risk ?? 'Low',
        implementation_plan: payload.implementationPlan ?? null,
        test_plan:           payload.testPlan ?? null,
        backout_plan:        payload.backoutPlan ?? null,
        change_window_start: payload.changeWindowStart ?? null,
        change_window_end:   payload.changeWindowEnd ?? null,
        requested_by_name:   payload.requestedByName,
        requested_by_id:     payload.requestedById ?? null,
        cab_approvers:       payload.cabApprovers ?? [],
        cab_approvals:       payload.cabApprovals ?? {},
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  async submitForCAB(id: string): Promise<ChangeRow> {
    const { data, error } = await supabase.rpc('submit_change_for_cab', {
      p_change_id: id,
    })
    return throwIfError(data, error)
  },

  async update(id: string, companyId: string, payload: Partial<ChangeRow>): Promise<ChangeRow> {
    const client = getClientForCompany(companyId)
    const { data, error } = await client
      .from('changes')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async submitApproval(id: string, approve: boolean): Promise<ChangeRow> {
    const { data, error } = await supabase.rpc('cast_change_cab_vote', {
      p_change_id: id,
      p_approve: approve,
    })
    return throwIfError(data, error)
  },

  async scheduleStandard(id: string): Promise<ChangeRow> {
    const { data, error } = await supabase.rpc('schedule_standard_change', {
      p_change_id: id,
    })
    return throwIfError(data, error)
  },

  async listIncidentIds(id: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('change_incidents')
      .select('incident_id')
      .eq('change_id', id)
    if (error) throw error
    return (data ?? []).map((row: { incident_id: string }) => row.incident_id)
  },

  async setIncidentLinks(id: string, incidentIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('set_change_incident_links', {
      p_change_id: id,
      p_incident_ids: incidentIds,
    })
    if (error) throw error
  },
}

// ─── REQUEST APPROVALS (modelo unificado incidents/request_items) ──

export const requestApprovalsService = {
  async listMine(profileId: string, status: RequestApprovalRow['status'] | 'all' = 'pending'): Promise<RequestApprovalRow[]> {
    let query = supabase
      .from('request_approvals')
      .select(`
        *,
        incident:incidents!request_approvals_incident_id_fkey(
          id, number, short_description, caller_name, created_at, approval_status
        )
      `)
      .eq('approver_id', profileId)
      .order('created_at', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query
    return throwIfError(data, error)
  },

  async decide(id: string, approve: boolean, note?: string): Promise<RequestApprovalRow> {
    const { data, error } = await supabase.rpc('decide_request_approval', {
      p_approval_id: id,
      p_approve: approve,
      p_note: note?.trim() || null,
    })
    return throwIfError(data, error)
  },
}

export const csatService = {
  async getForIncident(incidentId: string): Promise<CsatSurveyRow | null> {
    const { data, error } = await supabase
      .from('csat_surveys')
      .select('*')
      .eq('incident_id', incidentId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async submit(id: string, rating: number, comment?: string): Promise<CsatSurveyRow> {
    const { data, error } = await supabase.rpc('submit_csat', {
      p_survey_id: id,
      p_rating: rating,
      p_comment: comment?.trim() || null,
    })
    return throwIfError(data, error)
  },
}

export const responseMacrosService = {
  async list(companyId: string): Promise<ResponseMacroRow[]> {
    const { data, error } = await supabase
      .from('response_macros')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('usage_count', { ascending: false })
      .order('name')
    return throwIfError(data, error)
  },

  async recordUse(id: string): Promise<void> {
    const { error } = await supabase.rpc('record_response_macro_use', { p_macro_id: id })
    if (error) throw error
  },
}

// ─── CATALOG ─────────────────────────────────────────────────

export const catalogService = {
  async listByCompany(companyId: string): Promise<CatalogItemRow[]> {
    const { data, error } = await getClientForCompany(companyId)
      .from('catalog_items')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('name')
    return throwIfError(data, error)
  },

  async listAll(): Promise<CatalogItemRow[]> {
    const { data, error } = await supabase
      .from('catalog_items')
      .select('*')
      .order('name')
    return throwIfError(data, error)
  },

  async create(payload: Partial<CatalogItemRow>): Promise<CatalogItemRow> {
    const companyId = payload.company_id!
    const { data, error } = await getClientForCompany(companyId)
      .from('catalog_items')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async update(id: string, companyId: string, payload: Partial<CatalogItemRow>): Promise<CatalogItemRow> {
    const { data, error } = await getClientForCompany(companyId)
      .from('catalog_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },
}

// ─── CIO & EXECUTIVE SERVICES ─────────────────────────────────

export const cioService = {
  async getMetrics(companyId: string) {
    const client = getClientForCompany(companyId)
    const [{ data: incs }, { data: prbs }, { data: chgs }] = await Promise.all([
      client.from('incidents').select('created_at, resolved_at, state').eq('company_id', companyId),
      client.from('problems').select('state').eq('company_id', companyId),
      client.from('changes').select('state, risk, type').eq('company_id', companyId),
    ])

    const resolvedIncs = (incs ?? []).filter((i: any) => i.resolved_at && i.state === 'Resolved')
    let totalHours = 0
    resolvedIncs.forEach((i: any) => {
      const diff = new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()
      totalHours += diff / (1000 * 60 * 60)
    })
    const mttr = resolvedIncs.length > 0 ? Number((totalHours / resolvedIncs.length).toFixed(1)) : 2.4

    const activeProblems = (prbs ?? []).filter((p: any) => !['Resolved', 'Closed'].includes(p.state)).length
    const cabRiskCount = (chgs ?? []).filter((c: any) => ['High', 'Critical'].includes(c.risk) && c.state === 'Awaiting CAB Approval').length

    return {
      availability: 99.85,
      mttr,
      activeProblems,
      cabRiskCount,
      totalIncidents: (incs ?? []).length,
    }
  }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

export const notificationsService = {
  async listForUser(userId: string, limit = 20) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return throwIfError(data, error)
  },

  async markRead(id: string) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (error) throw error
  },
}

// ============================================================
// REGRA 1 — CATÁLOGO HIERÁRQUICO DE INCIDENTES (3 NÍVEIS + SLA)
// Item → Sub-item → Sintoma (com SLA de resposta e solução)
// ============================================================

export const incidentCatalogService = {

  // ─ Itens (Nível 1) ────────────────────────────────────────
  async listItems(companyId: string): Promise<IncidentCatalogItemRow[]> {
    const { data, error } = await supabase
      .from('incident_catalog_items')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('sort_order')
    return throwIfError(data, error)
  },

  async createItem(payload: Partial<IncidentCatalogItemRow>): Promise<IncidentCatalogItemRow> {
    const { data, error } = await supabase
      .from('incident_catalog_items')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async updateItem(id: string, payload: Partial<IncidentCatalogItemRow>): Promise<IncidentCatalogItemRow> {
    const { data, error } = await supabase
      .from('incident_catalog_items')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  // ─ Sub-itens (Nível 2) ───────────────────────────────────
  async listSubitems(itemId: string): Promise<IncidentCatalogSubitemRow[]> {
    const { data, error } = await supabase
      .from('incident_catalog_subitems')
      .select('*')
      .eq('item_id', itemId)
      .eq('active', true)
      .order('sort_order')
    return throwIfError(data, error)
  },

  async createSubitem(payload: Partial<IncidentCatalogSubitemRow>): Promise<IncidentCatalogSubitemRow> {
    const { data, error } = await supabase
      .from('incident_catalog_subitems')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  // ─ Sintomas (Nível 3 + SLA) ──────────────────────────────
  async listSymptoms(subitemId: string): Promise<IncidentCatalogSymptomRow[]> {
    const { data, error } = await supabase
      .from('incident_catalog_symptoms')
      .select('*')
      .eq('subitem_id', subitemId)
      .eq('active', true)
      .order('sort_order')
    return throwIfError(data, error)
  },

  async createSymptom(payload: Partial<IncidentCatalogSymptomRow>): Promise<IncidentCatalogSymptomRow> {
    const { data, error } = await supabase
      .from('incident_catalog_symptoms')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async updateSymptom(id: string, payload: Partial<IncidentCatalogSymptomRow>): Promise<IncidentCatalogSymptomRow> {
    const { data, error } = await supabase
      .from('incident_catalog_symptoms')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  // ─ Carga completa em cascata para o seletor de incidente ─
  async loadCascade(companyId: string) {
    const items = await this.listItems(companyId)
    const result = []
    for (const item of items) {
      const subitems = await this.listSubitems(item.id)
      const subitemsWithSymptoms = []
      for (const subitem of subitems) {
        const symptoms = await this.listSymptoms(subitem.id)
        subitemsWithSymptoms.push({ ...subitem, symptoms })
      }
      result.push({ item, subitems: subitemsWithSymptoms })
    }
    return result
  },
}

// ============================================================
// REGRA 2 — CATÁLOGO HIERÁRQUICO DE REQUISIÇÕES (2 NÍVEIS)
// Item → Sub-item (com flag 'exige_aprovacao_gestor')
// ============================================================

export const requestCatalogService = {

  // ─ Itens (Nível 1) ────────────────────────────────────────
  async listItems(companyId: string): Promise<RequestCatalogItemRow[]> {
    const { data, error } = await supabase
      .from('request_catalog_items')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('sort_order')
    return throwIfError(data, error)
  },

  async createItem(payload: Partial<RequestCatalogItemRow>): Promise<RequestCatalogItemRow> {
    const { data, error } = await supabase
      .from('request_catalog_items')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  // ─ Sub-itens (Nível 2 + Aprovação do Gestor) ────────────
  async listSubitems(itemId: string, role?: string): Promise<RequestCatalogSubitemRow[]> {
    let query = supabase
      .from('request_catalog_subitems')
      .select('*')
      .eq('item_id', itemId)
      .eq('active', true)
      .order('sort_order')

    // Filtra por visibilidade de papel se fornecido
    if (role) {
      query = query.contains('visible_to_roles', [role])
    }

    const { data, error } = await query
    return throwIfError(data, error)
  },

  async createSubitem(payload: Partial<RequestCatalogSubitemRow>): Promise<RequestCatalogSubitemRow> {
    const { data, error } = await supabase
      .from('request_catalog_subitems')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  async updateSubitem(id: string, payload: Partial<RequestCatalogSubitemRow>): Promise<RequestCatalogSubitemRow> {
    const { data, error } = await supabase
      .from('request_catalog_subitems')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },

  // ─ Carga completa em cascata para o seletor de requisição ─
  async loadCascade(companyId: string, role?: string) {
    const items = await this.listItems(companyId)
    const result = []
    for (const item of items) {
      const subitems = await this.listSubitems(item.id, role)
      result.push({ item, subitems })
    }
    return result
  },
}

// ============================================================
// SERVIÇO DE TOKENS DE APROVAÇÃO POR E-MAIL
// Gera link único de aprovação (72h) para o gestor do solicitante
// ============================================================

export const approvalTokenService = {

  async create(requestId: string, companyId: string, approverEmail: string, approverName?: string): Promise<ApprovalTokenRow> {
    const { data, error } = await supabase
      .from('approval_tokens')
      .insert({
        request_id:     requestId,
        company_id:     companyId,
        approver_email: approverEmail,
        approver_name:  approverName,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  async findByToken(token: string): Promise<ApprovalTokenRow | null> {
    const { data, error } = await supabase
      .from('approval_tokens')
      .select('*')
      .eq('token', token)
      .single()
    if (error) return null
    return data
  },

  async listByRequest(requestId: string): Promise<ApprovalTokenRow[]> {
    const { data, error } = await supabase
      .from('approval_tokens')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
    return throwIfError(data, error)
  },

  // Gera URL de aprovação/rejeição para incluir no e-mail
  buildApprovalUrl(token: string, decision: 'approved' | 'rejected'): string {
    const base = import.meta.env.VITE_APP_URL || window.location.origin
    return `${base}/approve?token=${token}&decision=${decision}`
  },
}

// ============================================================
// REGRA 3 — CONTROLE DE LICENÇAS CONCORRENTES (WebSocket)
// Gerencia sessões ativas com heartbeat e liberação automática
// ============================================================

export const licenseService = {

  // Verificar disponibilidade antes do login
  async checkAvailability(companyId: string): Promise<{ available: boolean; used: number; total: number; status: string }> {
    const { data, error } = await supabase
      .from('v_license_usage')
      .select('active_connections, license_limit, available_slots, license_status')
      .eq('company_id', companyId)
      .single()

    if (error || !data) {
      // Se a view não existir ainda (antes da migration), assume disponível
      return { available: true, used: 0, total: 10, status: 'OK' }
    }

    return {
      available: (data as any).license_status !== 'FULL',
      used:      (data as any).active_connections ?? 0,
      total:     (data as any).license_limit ?? 10,
      status:    (data as any).license_status ?? 'OK',
    }
  },

  // Registrar nova sessão após login bem-sucedido
  async registerSession(
    companyId: string,
    userId: string,
    sessionToken: string,
    deviceInfo?: { ip?: string; userAgent?: string; deviceType?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase
      .rpc('register_session', {
        p_company_id:    companyId,
        p_user_id:       userId,
        p_session_token: sessionToken,
        p_ip:            deviceInfo?.ip,
        p_user_agent:    deviceInfo?.userAgent,
        p_device_type:   deviceInfo?.deviceType ?? 'unknown',
      })

    if (error) return { success: false, error: error.message }
    return data as { success: boolean; error?: string }
  },

  // Heartbeat: mantém a sessão viva (chamar a cada 30s)
  async heartbeat(sessionToken: string): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('session_heartbeat', { p_session_token: sessionToken })
    return !error && Boolean(data)
  },

  // Liberar sessão no logout ou unmount
  async releaseSession(sessionToken: string, reason = 'logout'): Promise<void> {
    await supabase.rpc('release_session', {
      p_session_token: sessionToken,
      p_reason:        reason,
    })
  },

  // Listar todas as sessões ativas de uma empresa (para admin)
  async listActiveSessions(companyId: string): Promise<ActiveSessionRow[]> {
    const { data, error } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('company_id', companyId)
      .is('disconnected_at', null)
      .order('connected_at', { ascending: false })
    return throwIfError(data, error)
  },

  // Forçar encerramento de sessão (expulsar usuário — para admin)
  async kickSession(sessionToken: string): Promise<void> {
    await supabase.rpc('release_session', {
      p_session_token: sessionToken,
      p_reason:        'kicked',
    })
  },

  // Gerar token de sessão único
  generateSessionToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 16)}-${Math.random().toString(36).substr(2, 16)}`
  },
}

// ============================================================
// REGRA 4 — CHATBOT COM WHITELIST DE TELEFONE
// WhatsApp / Microsoft Teams — seguranca baseada em número E.164
// ============================================================

export const chatbotService = {

  // Verificar se número está autorizado
  async isWhitelisted(
    phoneE164: string,
    companyId: string,
    channel: 'whatsapp' | 'teams' | 'web' = 'whatsapp'
  ): Promise<{ authorized: boolean; reason?: string; userId?: string }> {
    const { data, error } = await supabase
      .rpc('is_chatbot_authorized', {
        p_phone_e164: phoneE164,
        p_company_id: companyId,
        p_channel:    channel,
      })

    if (error) return { authorized: false, reason: 'error' }
    return data as { authorized: boolean; reason?: string; userId?: string }
  },

  // Buscar whitelist completa de uma empresa
  async listWhitelist(companyId: string): Promise<ChatbotWhitelistRow[]> {
    const { data, error } = await supabase
      .from('chatbot_whitelist')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    return throwIfError(data, error)
  },

  // Adicionar número à whitelist
  async addToWhitelist(payload: Partial<ChatbotWhitelistRow>): Promise<ChatbotWhitelistRow> {
    const { data, error } = await supabase
      .from('chatbot_whitelist')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  // Revogar autorização de um número
  async revokeEntry(id: string, reason: string): Promise<void> {
    const { error } = await supabase
      .from('chatbot_whitelist')
      .update({
        active:         false,
        revoked_at:     new Date().toISOString(),
        revoked_reason: reason,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  },

  // Registrar mensagem no log
  async logMessage(payload: Partial<ChatbotMessageRow>): Promise<ChatbotMessageRow> {
    const { data, error } = await supabase
      .from('chatbot_messages')
      .insert(payload)
      .select()
      .single()
    return throwIfError(data, error)
  },

  // Registrar tentativa bloqueada
  async logBlockedAttempt(payload: {
    phoneE164?: string
    teamsUser?: string
    channel: 'whatsapp' | 'teams' | 'web'
    message?: string
    reason: string
    rawPayload?: unknown
  }): Promise<void> {
    await supabase.rpc('log_blocked_attempt', {
      p_phone:      payload.phoneE164,
      p_channel:    payload.channel,
      p_message:    payload.message,
      p_reason:     payload.reason,
      p_payload:    payload.rawPayload ? JSON.stringify(payload.rawPayload) : null,
      p_teams_user: payload.teamsUser,
    })
  },

  // Buscar histórico de mensagens de um usuário
  async listMessages(companyId: string, userId?: string, limit = 50): Promise<ChatbotMessageRow[]> {
    let query = supabase
      .from('chatbot_messages')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (userId) query = query.eq('user_id', userId)

    const { data, error } = await query
    return throwIfError(data, error)
  },

  // Buscar/criar configuração do chatbot para empresa
  async getConfig(companyId: string): Promise<ChatbotConfigRow | null> {
    const { data, error } = await supabase
      .from('chatbot_config')
      .select('id,company_id,whatsapp_enabled,whatsapp_phone_number_id,teams_enabled,teams_app_id,teams_tenant_id,bot_name,welcome_message,unauthorized_message,business_hours_start,business_hours_end,business_days,outside_hours_message,whatsapp_vault_secret_id,whatsapp_webhook_vault_secret_id,teams_vault_secret_id,rotation_required,created_at,updated_at')
      .eq('company_id', companyId)
      .single()
    if (error) return null
    return { ...data, whatsapp_token: null, whatsapp_webhook_secret: null, teams_app_secret: null }
  },

  async upsertConfig(companyId: string, payload: Partial<ChatbotConfigRow>): Promise<ChatbotConfigRow> {
    const {
      whatsapp_token, whatsapp_webhook_secret, teams_app_secret,
      ...safePayload
    } = payload
    if (whatsapp_token !== undefined || whatsapp_webhook_secret !== undefined || teams_app_secret !== undefined) {
      throw new Error('Credenciais devem ser gravadas somente pelo fluxo seguro de rotação.')
    }
    const { data, error } = await supabase
      .from('chatbot_config')
      .upsert({ ...safePayload, company_id: companyId, updated_at: new Date().toISOString() })
      .select('id,company_id,whatsapp_enabled,whatsapp_phone_number_id,teams_enabled,teams_app_id,teams_tenant_id,bot_name,welcome_message,unauthorized_message,business_hours_start,business_hours_end,business_days,outside_hours_message,whatsapp_vault_secret_id,whatsapp_webhook_vault_secret_id,teams_vault_secret_id,rotation_required,created_at,updated_at')
      .single()
    const safe = throwIfError(data, error)
    return { ...safe, whatsapp_token: null, whatsapp_webhook_secret: null, teams_app_secret: null }
  },

  // Normalizar número para E.164 (Brasil)
  normalizePhoneBR(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
    if (digits.length === 11 || digits.length === 10) return `+55${digits}`
    return `+${digits}`
  },
}

// ============================================================
// DEPARTMENTS (Nível 0 do catálogo) — migration 046
// ============================================================

export const departmentsService = {
  async list(companyId: string, opts?: { activeOnly?: boolean }): Promise<DepartmentRow[]> {
    let q = supabase.from('departments').select('*').eq('company_id', companyId)
    if (opts?.activeOnly) q = q.eq('is_active', true)
    const { data, error } = await q.order('sort_order')
    return throwIfError(data, error)
  },
  async create(payload: Partial<DepartmentRow>): Promise<DepartmentRow> {
    const { data, error } = await supabase.from('departments').insert(payload).select().single()
    return throwIfError(data, error)
  },
  async update(id: string, payload: Partial<DepartmentRow>): Promise<DepartmentRow> {
    const { data, error } = await supabase.from('departments').update(payload).eq('id', id).select().single()
    return throwIfError(data, error)
  },
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) throw error
  },
}

// ============================================================
// SERVICE CATALOG (categorias + itens) — migration 019
// Modelo unificado: requisições viram incidents (ticket_type='request').
// ============================================================

export const serviceCatalogService = {
  // Reusable form templates scoped by tenant
  async listFormTemplates(tenantId: string): Promise<FormTemplateRow[]> {
    const { data, error } = await supabase
      .from('form_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name')
    return throwIfError(data, error)
  },
  async createFormTemplate(payload: Pick<FormTemplateRow, 'tenant_id' | 'name' | 'fields'>): Promise<FormTemplateRow> {
    const { data, error } = await supabase.from('form_templates').insert(payload).select().single()
    return throwIfError(data, error)
  },
  async updateFormTemplate(id: string, payload: Partial<Pick<FormTemplateRow, 'name' | 'fields'>>): Promise<FormTemplateRow> {
    const { data, error } = await supabase
      .from('form_templates')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    return throwIfError(data, error)
  },
  async deleteFormTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('form_templates').delete().eq('id', id)
    if (error) throw error
  },

  // ─ Categorias ─────────────────────────────────────────────
  async listCategories(companyId: string, opts?: { activeOnly?: boolean }): Promise<CatalogCategoryRow[]> {
    let q = supabase.from('catalog_categories').select('*').eq('company_id', companyId)
    if (opts?.activeOnly) q = q.eq('is_active', true)
    const { data, error } = await q.order('sort_order')
    return throwIfError(data, error)
  },
  async createCategory(payload: Partial<CatalogCategoryRow>): Promise<CatalogCategoryRow> {
    const { data, error } = await supabase.from('catalog_categories').insert(payload).select().single()
    return throwIfError(data, error)
  },
  async updateCategory(id: string, payload: Partial<CatalogCategoryRow>): Promise<CatalogCategoryRow> {
    const { data, error } = await supabase.from('catalog_categories').update(payload).eq('id', id).select().single()
    return throwIfError(data, error)
  },
  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('catalog_categories').delete().eq('id', id)
    if (error) throw error
  },

  // ─ Serviços (Nível 2) ─────────────────────────────────────
  async listServices(companyId: string, opts?: { categoryId?: string; activeOnly?: boolean }): Promise<CatalogServiceRow[]> {
    let q = supabase.from('catalog_services').select('*').eq('company_id', companyId)
    if (opts?.categoryId) q = q.eq('category_id', opts.categoryId)
    if (opts?.activeOnly) q = q.eq('is_active', true)
    const { data, error } = await q.order('sort_order')
    return throwIfError(data, error)
  },
  async createService(payload: Partial<CatalogServiceRow>): Promise<CatalogServiceRow> {
    const { data, error } = await supabase.from('catalog_services').insert(payload).select().single()
    return throwIfError(data, error)
  },
  async updateService(id: string, payload: Partial<CatalogServiceRow>): Promise<CatalogServiceRow> {
    const { data, error } = await supabase.from('catalog_services').update(payload).eq('id', id).select().single()
    return throwIfError(data, error)
  },
  async deleteService(id: string): Promise<void> {
    const { error } = await supabase.from('catalog_services').delete().eq('id', id)
    if (error) throw error
  },

  // ─ Sintomas universais (tabela mestre) ────────────────────
  async listSymptoms(): Promise<SystemSymptomRow[]> {
    const { data, error } = await supabase.from('system_symptoms').select('*').order('sort_order')
    return throwIfError(data, error)
  },

  // ─ Upload de ícone para o Storage (bucket catalog-icons) ──
  async uploadIcon(companyId: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('catalog-icons').upload(path, file, { upsert: true, contentType: file.type || undefined })
    if (error) throw error
    const { data } = supabase.storage.from('catalog-icons').getPublicUrl(path)
    return data.publicUrl
  },

  // ─ Índice de busca: todos os sintomas (com serviço/grupo) ─
  async listAllServiceSymptoms(companyId: string, opts?: { activeOnly?: boolean }): Promise<CatalogServiceSymptomRow[]> {
    let q = supabase
      .from('catalog_service_symptoms')
      .select('*, symptom:system_symptoms(id,name,icon,sort_order), group:assignment_groups(id,name), service:catalog_services(id,name,category_id,icon)')
      .eq('company_id', companyId)
    if (opts?.activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    return throwIfError(data, error)
  },

  // ─ Junção Serviço × Sintoma (Nível 3 / governança) ────────
  async listServiceSymptoms(serviceId: string, opts?: { activeOnly?: boolean }): Promise<CatalogServiceSymptomRow[]> {
    let q = supabase
      .from('catalog_service_symptoms')
      .select('*, symptom:system_symptoms(id,name,icon,sort_order), group:assignment_groups(id,name)')
      .eq('service_id', serviceId)
    if (opts?.activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    return throwIfError(data, error)
  },
  async upsertServiceSymptom(payload: {
    companyId: string; serviceId: string; symptomId: string
    slaHours: number; assignmentGroupId?: string | null; active: boolean
    formFields?: RequestFormField[]; formTemplateId?: string | null; uiConfig?: CatalogServiceSymptomRow['ui_config']
    // Overrides de governança de SLA (migration 033; aplicados por trigger na abertura — migration 038)
    slaCalendarId?: string | null; fixedPriority?: number | null
  }): Promise<CatalogServiceSymptomRow> {
    const { data, error } = await supabase
      .from('catalog_service_symptoms')
      .upsert({
        company_id: payload.companyId,
        service_id: payload.serviceId,
        symptom_id: payload.symptomId,
        sla_hours: payload.slaHours,
        assignment_group_id: payload.assignmentGroupId ?? null,
        form_template_id: payload.formTemplateId ?? null,
        form_fields: payload.formFields ?? [],
        ui_config: payload.uiConfig ?? {},
        active: payload.active,
        sla_calendar_id: payload.slaCalendarId ?? null,
        fixed_priority: payload.fixedPriority ?? null,
      }, { onConflict: 'service_id,symptom_id' })
      .select('*, symptom:system_symptoms(id,name,icon,sort_order), group:assignment_groups(id,name)')
      .single()
    return throwIfError(data, error)
  },

  // ─ Abertura de Incidente com roteamento (SLA + Grupo herdados) ─
  async openRequest(payload: {
    companyId: string
    serviceId: string
    serviceName: string
    symptomId: string
    symptomName: string
    slaHours: number
    assignmentGroupId?: string | null
    assignmentGroupName?: string | null
    description?: string
    callerId?: string | null
    callerName: string
    impact?: string
    urgency?: string
    formData?: Record<string, unknown>
  }): Promise<IncidentRow> {
    const slaDeadline = new Date(Date.now() + (payload.slaHours || 24) * 3600 * 1000).toISOString()
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('incidents')
      .insert({
        company_id:          payload.companyId,
        short_description:   `${payload.serviceName} — ${payload.symptomName}`,
        description:         payload.description ?? null,
        priority:            'P3 - Moderate',
        category:            'Inquiry',
        caller_name:         payload.callerName,
        caller_id:           payload.callerId ?? null,
        ticket_type:         'incident',
        catalog_service_id:  payload.serviceId,
        symptom_id:          payload.symptomId,
        assignment_group_id: payload.assignmentGroupId ?? null,
        assigned_group_name: payload.assignmentGroupName ?? null,
        sla_deadline:        slaDeadline,
        impact:              payload.impact ?? null,
        urgency:             payload.urgency ?? null,
        form_data:           payload.formData ?? null,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },

  // ══════════════════════════════════════════════════════════
  // ESTEIRA DE REQUISIÇÕES (catálogo de 2 níveis) — migration 024
  // ══════════════════════════════════════════════════════════

  // ─ Categorias de Requisição (Nível 1) ─
  async listRequestCategories(companyId: string, opts?: { activeOnly?: boolean }): Promise<RequestCategoryRow[]> {
    let q = supabase.from('request_categories').select('*').eq('company_id', companyId)
    if (opts?.activeOnly) q = q.eq('active', true)
    const { data, error } = await q.order('sort_order')
    return throwIfError(data, error)
  },
  async createRequestCategory(payload: Partial<RequestCategoryRow>): Promise<RequestCategoryRow> {
    const { data, error } = await supabase.from('request_categories').insert(payload).select().single()
    return throwIfError(data, error)
  },
  async updateRequestCategory(id: string, payload: Partial<RequestCategoryRow>): Promise<RequestCategoryRow> {
    const { data, error } = await supabase.from('request_categories').update(payload).eq('id', id).select().single()
    return throwIfError(data, error)
  },
  async deleteRequestCategory(id: string): Promise<void> {
    const { error } = await supabase.from('request_categories').delete().eq('id', id)
    if (error) throw error
  },

  // ─ Subcategorias de Requisição (Nível 2) ─
  async listRequestSubcategories(companyId: string, opts?: { categoryId?: string; activeOnly?: boolean }): Promise<RequestSubcategoryRow[]> {
    let q = supabase.from('request_subcategories').select('*').eq('company_id', companyId)
    if (opts?.categoryId) q = q.eq('category_id', opts.categoryId)
    if (opts?.activeOnly) q = q.eq('active', true)
    const { data, error } = await q.order('sort_order')
    return throwIfError(data, error)
  },
  async createRequestSubcategory(payload: Partial<RequestSubcategoryRow>): Promise<RequestSubcategoryRow> {
    const { data, error } = await supabase.from('request_subcategories').insert(payload).select().single()
    return throwIfError(data, error)
  },
  async updateRequestSubcategory(id: string, payload: Partial<RequestSubcategoryRow>): Promise<RequestSubcategoryRow> {
    const { data, error } = await supabase.from('request_subcategories').update(payload).eq('id', id).select().single()
    return throwIfError(data, error)
  },
  async deleteRequestSubcategory(id: string): Promise<void> {
    const { error } = await supabase.from('request_subcategories').delete().eq('id', id)
    if (error) throw error
  },

  // ─ Itens de Requisição (Nível 3) ─
  async listRequestItems(companyId: string, opts?: { categoryId?: string; subcategoryId?: string; activeOnly?: boolean }): Promise<RequestItemRow[]> {
    let q = supabase
      .from('request_items')
      // request_items também referencia assignment_groups por approval_group_id.
      // Qualificar a FK evita o 300 Multiple Choices do PostgREST.
      .select('*, group:assignment_groups!request_items_assignment_group_id_fkey(id,name)')
      .eq('company_id', companyId)
    if (opts?.categoryId) q = q.eq('request_category_id', opts.categoryId)
    // Se tiver request_subcategory_id, podemos filtrar (migração 047)
    if (opts?.subcategoryId) q = q.eq('request_subcategory_id', opts.subcategoryId)
    if (opts?.activeOnly) q = q.eq('active', true)
    const { data, error } = await q.order('sort_order')
    return throwIfError(data, error)
  },
  async createRequestItem(payload: Partial<RequestItemRow>): Promise<RequestItemRow> {
    const { data, error } = await supabase.from('request_items').insert(payload).select('*, group:assignment_groups!request_items_assignment_group_id_fkey(id,name)').single()
    return throwIfError(data, error)
  },
  async updateRequestItem(id: string, payload: Partial<RequestItemRow>): Promise<RequestItemRow> {
    const { data, error } = await supabase.from('request_items').update(payload).eq('id', id).select('*, group:assignment_groups!request_items_assignment_group_id_fkey(id,name)').single()
    return throwIfError(data, error)
  },
  async deleteRequestItem(id: string): Promise<void> {
    const { error } = await supabase.from('request_items').delete().eq('id', id)
    if (error) throw error
  },

  // ─ Abertura de Requisição via item (roteia p/ assignment_group_id) ─
  async openServiceRequest(payload: {
    companyId: string
    item: Pick<RequestItemRow, 'id' | 'name' | 'assignment_group_id' | 'request_subcategory_id'> & { groupName?: string | null }
    formData?: Record<string, unknown>
    description?: string
    callerId?: string | null
    callerName: string
  }): Promise<IncidentRow> {
    const { data, error } = await getClientForCompany(payload.companyId)
      .from('incidents')
      .insert({
        company_id:          payload.companyId,
        short_description:   payload.item.name,
        description:         payload.description ?? null,
        priority:            'P3 - Moderate',
        category:            'Inquiry',
        caller_name:         payload.callerName,
        caller_id:           payload.callerId ?? null,
        ticket_type:         'request',
        request_item_id:     payload.item.id,
        request_subcategory_id: payload.item.request_subcategory_id ?? null,
        assignment_group_id: payload.item.assignment_group_id ?? null,
        assigned_group_name: payload.item.groupName ?? null,
        form_data:           payload.formData ?? null,
      })
      .select()
      .single()
    return throwIfError(data, error)
  },
}

// ============================================================
// MENSAGENS DO CHAMADO (chat público + notas internas)
// Tabela ticket_messages (migration 013) — com Supabase Realtime.
// ============================================================

export const messagesService = {
  /** Lista as interações de um chamado em ordem cronológica. */
  async list(incidentId: string): Promise<TicketMessageRow[]> {
    const { data, error } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true })
    return throwIfError(data, error)
  },

  /**
   * Insere uma interação (comentário público do analista ou nota interna).
   * A gravação é SOBERANA: fazemos só o INSERT (sem .select()), pois o
   * re-read pós-insert depende de o RLS conseguir reler a linha e pode
   * lançar erro mesmo com a gravação já comitada. A mensagem aparece na
   * timeline via Supabase Realtime. Falhas de notificação (trigger de
   * e-mail) são assíncronas (pg_net) e não afetam este INSERT.
   */
  async send(payload: {
    incidentId: string
    companyId: string
    body: string
    isInternal: boolean
    senderId?: string | null
    senderName?: string | null
    actorType?: 'analyst' | 'user' | 'system'
  }): Promise<void> {
    if (!payload.incidentId || !payload.companyId) {
      throw new Error('incidentId e companyId são obrigatórios para enviar a mensagem.')
    }
    const { error } = await supabase
      .from('ticket_messages')
      .insert({
        incident_id: payload.incidentId,
        company_id:  payload.companyId,
        body:        payload.body,
        is_internal: payload.isInternal,
        sender_id:   payload.senderId ?? null,
        sender_name: payload.senderName ?? null,
        actor_type:  payload.actorType ?? 'analyst',
      })
    if (error) throw error
  },

  /** Assina inserts em tempo real para um chamado (loop de e-mail/chat). */
  subscribeToIncident(incidentId: string, onInsert: (row: TicketMessageRow) => void) {
    return supabase
      .channel(`ticket_messages:${incidentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `incident_id=eq.${incidentId}` },
        (payload: any) => onInsert(payload.new as TicketMessageRow),
      )
      .subscribe()
  },
}

// ============================================================
// EVENTOS DE SLA (livro-caixa auditável)
// Tabela sla_events (migration 035) — com Supabase Realtime.
// ============================================================

export const slaEventsService = {
  /** Lista os eventos de SLA de um chamado, mais recente primeiro. */
  async list(incidentId: string): Promise<SlaEventRow[]> {
    const { data, error } = await supabase
      .from('sla_events')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false })
    return throwIfError(data, error)
  },

  /** Assina inserts em tempo real para eventos de SLA de um chamado. */
  subscribeToIncident(incidentId: string, onInsert: (row: SlaEventRow) => void) {
    return supabase
      .channel(`sla_events:${incidentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sla_events', filter: `incident_id=eq.${incidentId}` },
        (payload: any) => onInsert(payload.new as SlaEventRow),
      )
      .subscribe()
  },
}

// ============================================================
// MOTOR DE AUTOMAÇÃO (Workflow Builder) — regras + log de execução
// ============================================================
export const workflowService = {
  async list(companyId: string): Promise<WorkflowRuleRow[]> {
    const { data, error } = await supabase
      .from('workflow_rules')
      .select('*')
      .eq('company_id', companyId)
      .order('priority_order')
    return throwIfError(data, error)
  },
  async getById(id: string, companyId: string): Promise<WorkflowRuleRow> {
    const { data, error } = await supabase
      .from('workflow_rules')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()
    return throwIfError(data, error)
  },
  async create(payload: Partial<WorkflowRuleRow>): Promise<WorkflowRuleRow> {
    const { data, error } = await supabase.from('workflow_rules').insert(payload).select().single()
    return throwIfError(data, error)
  },
  async update(id: string, companyId: string, payload: Partial<WorkflowRuleRow>): Promise<WorkflowRuleRow> {
    const { data, error } = await supabase
      .from('workflow_rules')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()
    return throwIfError(data, error)
  },
  async remove(id: string, companyId: string): Promise<void> {
    const { error } = await supabase.from('workflow_rules').delete().eq('id', id).eq('company_id', companyId)
    if (error) throw error
  },
  /** Liga/desliga uma regra sem precisar reenviar o payload inteiro. */
  async setActive(id: string, companyId: string, active: boolean): Promise<WorkflowRuleRow> {
    return workflowService.update(id, companyId, { active })
  },
  /** Histórico real de execuções — substitui o MOCK_LOGS da UI. */
  async listExecutionLog(companyId: string, ruleId?: string, limit = 50): Promise<WorkflowExecutionLogRow[]> {
    let q = supabase
      .from('workflow_execution_log')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (ruleId) q = q.eq('rule_id', ruleId)
    const { data, error } = await q
    return throwIfError(data, error)
  },
  /** Assina inserts em tempo real para a aba "Histórico" atualizar ao vivo. */
  subscribeToExecutionLog(companyId: string, onInsert: (row: WorkflowExecutionLogRow) => void) {
    return supabase
      .channel(`workflow_execution_log:${companyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workflow_execution_log', filter: `company_id=eq.${companyId}` },
        (payload: any) => onInsert(payload.new as WorkflowExecutionLogRow),
      )
      .subscribe()
  },
  /** Fila de ações assíncronas pendentes/processadas — visão de diagnóstico opcional. */
  async listActionQueue(companyId: string, limit = 50): Promise<WorkflowActionQueueRow[]> {
    const { data, error } = await supabase
      .from('workflow_action_queue')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return throwIfError(data, error)
  },
}

// ============================================================
// SERVIÇOS DO SERVICEFY BI & ANALYTICS
// ============================================================
export const biService = {
  /** Busca métricas e formata a série temporal para gráficos dinâmicos do BI. */
  async getMetricsAndChartData(companyId: string, period: string, metricType: string) {
    let days = 30
    if (period === 'today') days = 0
    else if (period === 'last_7_days') days = 7
    else if (period === 'last_15_days') days = 15
    else if (period === 'last_30_days') days = 30

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // Provedor MSP enxerga todos os clientes (cross-company via RLS);
    // tenant comum só os próprios chamados.
    const isMSP = companyId === MSP_COMPANY_ID
    const client = getClientForCompany(companyId)

    // Consulta otimizada trazendo apenas as colunas úteis (+ company_id real).
    let query = client
      .from('incidents')
      .select(`
        id, number, short_description, description, created_at, resolved_at, closed_at, updated_at, state, ticket_type, sla_breached, is_response_breached, priority_level, impact, urgency, assigned_group_name, assigned_to_name, category, company_id,
        catalog_services:catalog_service_id(name),
        system_symptoms:symptom_id(name),
        caller_name
      `)
      .gte('created_at', startDate.toISOString())

    if (!isMSP) {
      query = query.eq('company_id', companyId)
    }

    if (metricType === 'incidents') {
      query = query.eq('ticket_type', 'incident')
    } else if (metricType === 'requests') {
      query = query.eq('ticket_type', 'request')
    }

    const { data: tickets, error } = await query
    if (error) throw error

    const list = tickets || []

    // 1. Totalizadores
    const total = list.length

    // 2. MTTR (Mean Time to Resolution) em horas
    const resolved = list.filter((t: any) => t.resolved_at && t.state === 'Resolved')
    let totalHours = 0
    resolved.forEach((t: any) => {
      const diff = new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()
      totalHours += diff / (1000 * 60 * 60)
    })
    const mttr = resolved.length > 0 ? Number((totalHours / resolved.length).toFixed(1)) : 0

    // 3. SLA Compliance Rate
    const metSLA = resolved.filter((t: any) => !t.sla_breached).length
    const slaCompliance = resolved.length > 0 ? Number(((metSLA / resolved.length) * 100).toFixed(1)) : 100

    // 4. Agrupamento temporal diário para o gráfico
    const dailyVolume: Record<string, { date: string; count: number; resolvedCount: number }> = {}
    
    // Inicializar os dias no range
    for (let i = days; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      dailyVolume[key] = { date: key, count: 0, resolvedCount: 0 }
    }

    list.forEach((t: any) => {
      const key = new Date(t.created_at).toISOString().split('T')[0]
      if (dailyVolume[key]) {
        dailyVolume[key].count++
        if (t.state === 'Resolved') {
          dailyVolume[key].resolvedCount++
        }
      }
    })

    const chartData = Object.values(dailyVolume).sort((a, b) => a.date.localeCompare(b.date))

    return {
      total,
      mttr,
      slaCompliance,
      chartData,
      tickets: list,
    }
  },

  /** Salva um modelo de relatório na tabela public.bi_saved_reports */
  async saveReport(payload: { company_id: string; name: string; chart_type: string; query_config: any; created_by: string; is_public: boolean }) {
    const { data, error } = await supabase.from('bi_saved_reports').insert(payload).select().single()
    return throwIfError(data, error)
  },

  /** Lista os relatórios salvos da companhia */
  async listReports(companyId: string) {
    const { data, error } = await supabase
      .from('bi_saved_reports')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    return throwIfError(data, error)
  },

  /** Deleta um modelo de relatório */
  async deleteReport(id: string) {
    const { error } = await supabase.from('bi_saved_reports').delete().eq('id', id)
    if (error) throw error
    return true
  },
}


// ============================================================
// TICKET TASKS (Tarefas Filhas e Subtarefas) — migration 048
// ============================================================
export const ticketTasksService = {
  async listForTicket(ticketId: string, ticketType: 'incident' | 'request'): Promise<TicketTaskRow[]> {
    const col = ticketType === 'incident' ? 'incident_id' : 'request_id'
    const { data, error } = await supabase
      .from('ticket_tasks')
      .select('*, assigned_to:profiles!ticket_tasks_assigned_to_id_fkey(name), assigned_group:assignment_groups!ticket_tasks_assigned_group_id_fkey(name)')
      .eq(col, ticketId)
      .order('created_at', { ascending: true })
    return throwIfError(data, error)
  },

  async listSubtasks(parentTaskId: string): Promise<TicketTaskRow[]> {
    const { data, error } = await supabase
      .from('ticket_tasks')
      .select('*, assigned_to:profiles!ticket_tasks_assigned_to_id_fkey(name), assigned_group:assignment_groups!ticket_tasks_assigned_group_id_fkey(name)')
      .eq('parent_task_id', parentTaskId)
      .order('created_at', { ascending: true })
    return throwIfError(data, error)
  },

  async create(payload: Partial<TicketTaskRow>): Promise<TicketTaskRow> {
    const { data, error } = await supabase.from('ticket_tasks').insert(payload).select().single()
    return throwIfError(data, error)
  },

  async update(id: string, payload: Partial<TicketTaskRow>): Promise<TicketTaskRow> {
    const { data, error } = await supabase.from('ticket_tasks').update(payload).eq('id', id).select().single()
    return throwIfError(data, error)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('ticket_tasks').delete().eq('id', id)
    if (error) throw error
  },
}

// ============================================================
// SERVIÇOS DO CMDB (Ativos e Relacionamentos) — migration 079 + 098
// ============================================================
export interface CmdbImpactRow {
  ci_id: string
  ci_name: string
  class_name: string
  criticality: 'low' | 'medium' | 'high' | 'critical'
  depth: number
  path: string[]
}

export const cmdbService = {
  /** Resolve o ID do item de configuração associado ao caso */
  async getCiForCase(caseId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('case_configuration_items')
      .select('configuration_item_id')
      .eq('case_id', caseId)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return data.configuration_item_id
  },

  /** Invoca a RPC de predição de impactos recursiva com cycle-prevention */
  async predictIncidentImpact(
    companyId: string,
    ciId: string,
    direction: 'upstream' | 'downstream' = 'upstream'
  ): Promise<CmdbImpactRow[]> {
    const { data, error } = await supabase.rpc('cmdb_predict_incident_impact', {
      p_company_id: companyId,
      p_root_ci_id: ciId,
      p_direction: direction,
      p_max_depth: 10
    })
    return throwIfError(data, error)
  }
}

