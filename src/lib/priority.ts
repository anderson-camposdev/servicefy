// ============================================================
// ServiceFY ITSM — Regra de Prioridade (padrão ServiceNow)
//
// FONTE ÚNICA da regra Priority = Impacto × Urgência.
//
// Princípio ServiceNow: o solicitante/analista NÃO escolhe a prioridade
// nem o nível cru de impacto/urgência — ele RESPONDE PERGUNTAS de negócio,
// e o sistema deriva Impacto, Urgência e, por consequência, a Prioridade.
//
// As linhas High/Medium/Low desta matriz são IDÊNTICAS à matriz 3×3 padrão
// do ServiceNow (e ao seed da migration 033). "Critical" é uma 4ª linha de
// impacto (uma faixa acima de High), para o caso "O negócio / Clientes".
//
// Este módulo deve ser a ÚNICA implementação usada no front (Portal,
// Abertura Manual e Cockpit). O banco (sla_priority_matrix + trigger
// tg_calculate_ticket_sla, migrations 033/039) espelha exatamente esta
// matriz e é a autoridade que projeta os prazos de SLA.
// ============================================================

import type { TicketPriority } from './database.types'

export type ImpactLevel = 'Critical' | 'High' | 'Medium' | 'Low'
export type UrgencyLevel = 'High' | 'Medium' | 'Low'

// ─── PERGUNTAS (definição única reaproveitada em todas as telas) ──
export const IMPACT_QUESTION = 'Quem é afetado por este problema?'
export const URGENCY_QUESTION = 'Qual o impacto no seu trabalho agora?'

// Opções no formato [valor, rótulo-da-pergunta] (usado pelos <select>).
export const IMPACT_OPTIONS: [ImpactLevel, string][] = [
  ['Low',      'Apenas eu'],
  ['Medium',   'Meu departamento'],
  ['High',     'Toda a empresa'],
  ['Critical', 'O negócio / Clientes'],
]

export const URGENCY_OPTIONS: [UrgencyLevel, string][] = [
  ['Low',    'Consigo trabalhar, mas incomoda'],
  ['Medium', 'Uma tarefa importante está parada'],
  ['High',   'Estou totalmente travado'],
]

// ─── MATRIZ Impacto × Urgência → Prioridade (1..5) ──────────────
const MATRIX: Record<ImpactLevel, Record<UrgencyLevel, number>> = {
  Critical: { High: 1, Medium: 1, Low: 1 },
  High:     { High: 1, Medium: 2, Low: 3 },
  Medium:   { High: 2, Medium: 3, Low: 4 },
  Low:      { High: 3, Medium: 4, Low: 5 },
}

// Rótulo canônico por nível (P5 = Planning, padrão ServiceNow).
export const PRIORITY_LABEL: Record<number, TicketPriority> = {
  1: 'P1 - Critical',
  2: 'P2 - High',
  3: 'P3 - Moderate',
  4: 'P4 - Low',
  5: 'P5 - Planning',
}

// Normaliza um texto livre (rótulo, enum, PT/EN) para o nível canônico.
function normImpact(s: string | null | undefined): ImpactLevel {
  const t = (s ?? '').trim().toLowerCase()
  if (t.startsWith('crit')) return 'Critical'
  if (t.startsWith('high') || t.includes('alt')) return 'High'
  if (t.startsWith('med') || t.includes('méd')) return 'Medium'
  if (t.startsWith('low') || t.includes('baix')) return 'Low'
  return 'Medium'
}
function normUrgency(s: string | null | undefined): UrgencyLevel {
  const t = (s ?? '').trim().toLowerCase()
  if (t.startsWith('high') || t.includes('alt') || t.startsWith('crit')) return 'High'
  if (t.startsWith('med') || t.includes('méd')) return 'Medium'
  if (t.startsWith('low') || t.includes('baix')) return 'Low'
  return 'Medium'
}

// Nível de prioridade (1..5) a partir de impacto/urgência.
export function priorityLevel(impact: string | null | undefined, urgency: string | null | undefined): number {
  return MATRIX[normImpact(impact)][normUrgency(urgency)] ?? 3
}

// Prioridade canônica (string "P1 - Critical".."P5 - Planning").
export function priorityString(impact: string | null | undefined, urgency: string | null | undefined): TicketPriority {
  return PRIORITY_LABEL[priorityLevel(impact, urgency)]
}
