// ============================================================
// ServiceFY — Agente Virtual transacional (serviço tipado)
// Fala com as tabelas/RPCs da migration 085. A RLS/RPC é a barreira
// real de tenant, dono da conversa e admin — este serviço nunca é
// a única proteção. Sem `any`.
// ============================================================

import { supabase } from './supabase'
import type { VirtualAgentActionRow, VirtualAgentExecutionRow, VirtualAgentReply } from './database.types'

function unwrap<T>(res: { data: T | null; error: unknown }): T {
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

  // ─── Conversação (widget do portal + console de teste) ──────
  async processMessage(text: string, conversationId?: string | null): Promise<VirtualAgentReply> {
    return unwrap(await supabase.rpc('virtual_agent_process_message', {
      p_text: text,
      p_conversation_id: conversationId ?? null,
    }))
  },

  async confirmAction(executionId: string, confirmed: boolean): Promise<VirtualAgentReply> {
    return unwrap(await supabase.rpc('virtual_agent_confirm_action', {
      p_execution_id: executionId,
      p_confirmed: confirmed,
    }))
  },
}
