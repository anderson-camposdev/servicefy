// ============================================================
// ServiceFY — Agente Virtual transacional (serviço tipado)
// Fala com as tabelas/RPCs da migration 085. A RLS/RPC é a barreira
// real de tenant, dono da conversa e admin — este serviço nunca é
// a única proteção. Sem `any`.
// ============================================================

import { supabase } from './supabase'
import type { Json } from './database.generated'
import type { VirtualAgentActionRow, VirtualAgentExecutionRow, VirtualAgentReply } from './database.types'

function unwrap<T>(res: { data: unknown; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

export interface SaveActionInput {
  id?: string
  companyId: string
  actionKey: string
  name: string
  enabled: boolean
  requiresConfirmation: boolean
  minConfidence: number
  keywords: string[]
}

export interface ItsmReadinessCheck {
  key: string
  label: string
  ready: boolean
  details: string
}

export interface ItsmReadiness {
  companyId: string
  companyName: string
  ready: boolean
  checks: ItsmReadinessCheck[]
  checkedAt: string
}

export const virtualAgentService = {
  // ─── Admin: catálogo de ações ───────────────────────────────
  async listActions(companyId: string): Promise<VirtualAgentActionRow[]> {
    return unwrap(await supabase
      .from('virtual_agent_actions').select('*')
      .eq('company_id', companyId).order('name'))
  },

  async saveAction(input: SaveActionInput): Promise<VirtualAgentActionRow> {
    const payload = {
      company_id: input.companyId,
      action_key: input.actionKey,
      name: input.name,
      enabled: input.enabled,
      requires_confirmation: input.requiresConfirmation,
      min_confidence: input.minConfidence,
      config: { keywords: input.keywords },
    }
    const query = input.id
      ? supabase.from('virtual_agent_actions').update(payload).eq('id', input.id).select().single()
      : supabase.from('virtual_agent_actions').insert(payload).select().single()
    return unwrap(await query)
  },

  async deleteAction(id: string): Promise<void> {
    const { error } = await supabase.from('virtual_agent_actions').delete().eq('id', id)
    if (error) throw error
  },

  // ─── Admin: histórico de execuções (console de teste / auditoria) ──
  async listExecutions(companyId: string, limit = 50): Promise<VirtualAgentExecutionRow[]> {
    return unwrap(await supabase
      .from('virtual_agent_executions').select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit))
  },

  async getReadiness(companyId: string): Promise<ItsmReadiness> {
    return unwrap(await supabase.rpc('itsm_service_desk_readiness', {
      p_company_id: companyId,
    }))
  },

  // ─── Conversação (widget do portal + console de teste) ──────
  async processMessage(text: string, conversationId?: string | null): Promise<VirtualAgentReply> {
    return unwrap(await supabase.rpc('virtual_agent_process_message', {
      p_text: text,
      p_conversation_id: conversationId ?? undefined,
    }))
  },

  async confirmAction(executionId: string, confirmed: boolean): Promise<VirtualAgentReply> {
    return unwrap(await supabase.rpc('virtual_agent_confirm_action', {
      p_execution_id: executionId,
      p_confirmed: confirmed,
    }))
  },

  // ─── Condutor de triagem (widget + console admin) ───────────────
  // Persiste a transcrição + o estado do wizard (conversations.metadata->triage)
  // e devolve o id da conversa (reaproveitável entre turnos e sessões).
  async triageSync(input: {
    conversationId?: string | null
    state: Record<string, unknown>
    inbound?: string
    outbound?: string
  }): Promise<string> {
    return unwrap(await supabase.rpc('virtual_agent_triage_sync', {
      // p_conversation_id não tem DEFAULT (migration 085), mas a função
      // aceita NULL para o caso "nova conversa" — o gerador de tipos não
      // expõe nullability de parâmetro de RPC, só presença/DEFAULT.
      p_conversation_id: (input.conversationId ?? null) as unknown as string,
      p_state: input.state as unknown as Json,
      p_inbound: input.inbound ?? '',
      p_outbound: input.outbound ?? '',
    }))
  },

  // Registra no histórico/auditoria a abertura concluída pela triagem.
  async triageComplete(conversationId: string, incidentId: string, summary: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.rpc('virtual_agent_triage_complete', {
      p_conversation_id: conversationId,
      p_incident_id: incidentId,
      p_summary: summary as unknown as Json,
    })
    if (error) throw error
  },
}
