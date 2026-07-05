// ============================================================
// Flowfy BI v2 — Definições dos dashboards prontos (ServiceNow-like)
// Cada widget declara sua consulta ao cubo (dimensões/medidas) e o
// tipo visual; DashboardPage executa e renderiza genericamente.
// Os filtros globais (período, grupo, prioridade) são combinados
// pela página em runtime.
// ============================================================

import type { BiRecordType, BiFilter, BiDateField } from './types'

export type BiWidgetVisual =
  | 'kpi'          // scorecard: 1 medida, 0 dimensões
  | 'bar'          // 1 dimensão + 1 medida
  | 'stacked_bar'  // 2 dimensões + 1 medida
  | 'donut'        // 1 dimensão + 1 medida
  | 'line'         // 1 dimensão temporal (+ opcional série) + 1..2 medidas
  | 'heatmap'      // 2 dimensões + 1 medida
  | 'gauge'        // 1 medida percent, 0 dimensões
  | 'backlog_trend'// especial: bi_backlog_trend

export interface BiWidgetDef {
  id: string
  title: string
  visual: BiWidgetVisual
  /** colunas ocupadas num grid de 12 (default 4) */
  span?: number
  recordTypes: BiRecordType[]
  dimensions: string[]
  measures: string[]
  filters?: BiFilter[]
  dateField?: BiDateField
  /** limite de categorias exibidas (top N) */
  topN?: number
  /** medida usada como valor principal do KPI/gauge */
  primaryMeasure?: string
}

export interface BiDashboardDef {
  id: string
  title: string
  subtitle: string
  recordTypes: BiRecordType[]
  widgets: BiWidgetDef[]
}

// ─── Incident Overview ────────────────────────────────────────
const incidentOverview: BiDashboardDef = {
  id: 'incident_overview',
  title: 'Visão Geral de Incidentes',
  subtitle: 'Volume, SLA e envelhecimento do módulo de incidentes',
  recordTypes: ['incident'],
  widgets: [
    { id: 'inc_backlog',   title: 'Backlog Aberto',       visual: 'kpi', span: 2, recordTypes: ['incident'], dimensions: [], measures: ['backlog'], primaryMeasure: 'backlog' },
    { id: 'inc_total',     title: 'Criados no Período',   visual: 'kpi', span: 2, recordTypes: ['incident'], dimensions: [], measures: ['count'], primaryMeasure: 'count' },
    { id: 'inc_mttr',      title: 'MTTR Médio',           visual: 'kpi', span: 2, recordTypes: ['incident'], dimensions: [], measures: ['mttr_avg'], primaryMeasure: 'mttr_avg' },
    { id: 'inc_mtta',      title: 'MTTA Médio',           visual: 'kpi', span: 2, recordTypes: ['incident'], dimensions: [], measures: ['mtta_avg'], primaryMeasure: 'mtta_avg' },
    { id: 'inc_sla',       title: '% SLA Resolução',      visual: 'kpi', span: 2, recordTypes: ['incident'], dimensions: [], measures: ['sla_resolution_pct'], primaryMeasure: 'sla_resolution_pct' },
    { id: 'inc_reopen',    title: '% Reabertura',         visual: 'kpi', span: 2, recordTypes: ['incident'], dimensions: [], measures: ['reopen_rate'], primaryMeasure: 'reopen_rate' },
    { id: 'inc_by_prio',   title: 'Por Prioridade',       visual: 'bar',   span: 4, recordTypes: ['incident'], dimensions: ['priority'], measures: ['count'] },
    { id: 'inc_by_group',  title: 'Por Grupo Solucionador', visual: 'donut', span: 4, recordTypes: ['incident'], dimensions: ['group_name'], measures: ['count'], topN: 8 },
    { id: 'inc_aging',     title: 'Envelhecimento do Backlog', visual: 'bar', span: 4, recordTypes: ['incident'], dimensions: ['aging_bucket'], measures: ['backlog'] },
    { id: 'inc_daily',     title: 'Criados vs Resolvidos por Dia', visual: 'line', span: 6, recordTypes: ['incident'], dimensions: ['created_date'], measures: ['count', 'resolved_count'] },
    { id: 'inc_backtrend', title: 'Tendência de Backlog', visual: 'backlog_trend', span: 6, recordTypes: ['incident'], dimensions: [], measures: [] },
    { id: 'inc_heat',      title: 'Demanda: Dia da Semana × Hora', visual: 'heatmap', span: 6, recordTypes: ['incident'], dimensions: ['created_weekday', 'created_hour'], measures: ['count'] },
    { id: 'inc_by_service', title: 'Top Serviços',        visual: 'bar', span: 6, recordTypes: ['incident'], dimensions: ['service_name'], measures: ['count'], topN: 10 },
  ],
}

// ─── Request Fulfillment ──────────────────────────────────────
const requestFulfillment: BiDashboardDef = {
  id: 'request_fulfillment',
  title: 'Atendimento de Solicitações',
  subtitle: 'Volume e desempenho do catálogo de requisições',
  recordTypes: ['request'],
  widgets: [
    { id: 'req_backlog', title: 'Backlog Aberto',     visual: 'kpi', span: 3, recordTypes: ['request'], dimensions: [], measures: ['backlog'], primaryMeasure: 'backlog' },
    { id: 'req_total',   title: 'Criadas no Período', visual: 'kpi', span: 3, recordTypes: ['request'], dimensions: [], measures: ['count'], primaryMeasure: 'count' },
    { id: 'req_mttr',    title: 'Tempo Médio de Atendimento', visual: 'kpi', span: 3, recordTypes: ['request'], dimensions: [], measures: ['mttr_avg'], primaryMeasure: 'mttr_avg' },
    { id: 'req_sla',     title: '% SLA Resolução',    visual: 'kpi', span: 3, recordTypes: ['request'], dimensions: [], measures: ['sla_resolution_pct'], primaryMeasure: 'sla_resolution_pct' },
    { id: 'req_top_items', title: 'Top Itens do Catálogo', visual: 'bar', span: 6, recordTypes: ['request'], dimensions: ['request_item_name'], measures: ['count'], topN: 10 },
    { id: 'req_by_dept',   title: 'Por Departamento',      visual: 'donut', span: 6, recordTypes: ['request'], dimensions: ['department_name'], measures: ['count'], topN: 8 },
    { id: 'req_daily',     title: 'Criadas vs Atendidas por Dia', visual: 'line', span: 6, recordTypes: ['request'], dimensions: ['created_date'], measures: ['count', 'resolved_count'] },
    { id: 'req_by_channel', title: 'Por Canal de Abertura', visual: 'donut', span: 6, recordTypes: ['request'], dimensions: ['opened_via'], measures: ['count'] },
  ],
}

// ─── SLA Performance ──────────────────────────────────────────
const slaPerformance: BiDashboardDef = {
  id: 'sla_performance',
  title: 'Desempenho de SLA',
  subtitle: 'Compliance de resposta e resolução, violações e pausas',
  recordTypes: ['incident', 'request'],
  widgets: [
    { id: 'sla_resp_gauge', title: 'Compliance de Resposta',  visual: 'gauge', span: 3, recordTypes: ['incident', 'request'], dimensions: [], measures: ['sla_response_pct'], primaryMeasure: 'sla_response_pct' },
    { id: 'sla_reso_gauge', title: 'Compliance de Resolução', visual: 'gauge', span: 3, recordTypes: ['incident', 'request'], dimensions: [], measures: ['sla_resolution_pct'], primaryMeasure: 'sla_resolution_pct' },
    { id: 'sla_breached',   title: 'SLAs Violados',           visual: 'kpi',   span: 3, recordTypes: ['incident', 'request'], dimensions: [], measures: ['breached_count'], primaryMeasure: 'breached_count' },
    { id: 'sla_paused',     title: 'Tempo Médio em Pausa',    visual: 'kpi',   span: 3, recordTypes: ['incident', 'request'], dimensions: [], measures: ['avg_paused_minutes'], primaryMeasure: 'avg_paused_minutes' },
    { id: 'sla_by_group',   title: 'Violações por Grupo',      visual: 'bar', span: 6, recordTypes: ['incident', 'request'], dimensions: ['group_name'], measures: ['breached_count'], topN: 10 },
    { id: 'sla_by_prio',    title: 'Violações por Prioridade', visual: 'bar', span: 6, recordTypes: ['incident', 'request'], dimensions: ['priority'], measures: ['breached_count'] },
    { id: 'sla_daily',      title: 'Violações por Dia',        visual: 'line', span: 6, recordTypes: ['incident', 'request'], dimensions: ['created_date'], measures: ['breached_count'] },
    { id: 'sla_heat',       title: '% SLA por Grupo × Prioridade', visual: 'heatmap', span: 6, recordTypes: ['incident', 'request'], dimensions: ['group_name', 'priority'], measures: ['sla_resolution_pct'] },
  ],
}

// ─── Problem Management ───────────────────────────────────────
const problemManagement: BiDashboardDef = {
  id: 'problem_management',
  title: 'Gestão de Problemas',
  subtitle: 'Funil de investigação, erros conhecidos e causa raiz',
  recordTypes: ['problem'],
  widgets: [
    { id: 'prb_open',   title: 'Problemas Abertos',   visual: 'kpi', span: 3, recordTypes: ['problem'], dimensions: [], measures: ['backlog'], primaryMeasure: 'backlog' },
    { id: 'prb_total',  title: 'Criados no Período',  visual: 'kpi', span: 3, recordTypes: ['problem'], dimensions: [], measures: ['count'], primaryMeasure: 'count' },
    { id: 'prb_age',    title: 'Idade Média (Abertos)', visual: 'kpi', span: 3, recordTypes: ['problem'], dimensions: [], measures: ['avg_age_minutes'], primaryMeasure: 'avg_age_minutes' },
    { id: 'prb_mttr',   title: 'Tempo Médio de Resolução', visual: 'kpi', span: 3, recordTypes: ['problem'], dimensions: [], measures: ['mttr_avg'], primaryMeasure: 'mttr_avg' },
    { id: 'prb_funnel', title: 'Funil por Estado',    visual: 'bar', span: 6, recordTypes: ['problem'], dimensions: ['state'], measures: ['count'] },
    { id: 'prb_known',  title: 'Erros Conhecidos',    visual: 'donut', span: 3, recordTypes: ['problem'], dimensions: ['known_error'], measures: ['count'] },
    { id: 'prb_root',   title: 'Causa Raiz Registrada', visual: 'donut', span: 3, recordTypes: ['problem'], dimensions: ['has_root_cause'], measures: ['count'] },
    { id: 'prb_by_cat', title: 'Por Categoria',       visual: 'bar', span: 6, recordTypes: ['problem'], dimensions: ['category'], measures: ['count'] },
    { id: 'prb_by_group', title: 'Por Grupo',         visual: 'bar', span: 6, recordTypes: ['problem'], dimensions: ['group_name'], measures: ['count'], topN: 10 },
  ],
}

// ─── Change Management ────────────────────────────────────────
const changeManagement: BiDashboardDef = {
  id: 'change_management',
  title: 'Gestão de Mudanças',
  subtitle: 'Pipeline CAB, risco e taxa de sucesso',
  recordTypes: ['change'],
  widgets: [
    { id: 'chg_open',    title: 'Mudanças em Andamento', visual: 'kpi', span: 3, recordTypes: ['change'], dimensions: [], measures: ['backlog'], primaryMeasure: 'backlog' },
    { id: 'chg_total',   title: 'Criadas no Período',    visual: 'kpi', span: 3, recordTypes: ['change'], dimensions: [], measures: ['count'], primaryMeasure: 'count' },
    { id: 'chg_done',    title: 'Concluídas',            visual: 'kpi', span: 3, recordTypes: ['change'], dimensions: [], measures: ['resolved_count'], primaryMeasure: 'resolved_count',
      filters: [{ dim: 'state', op: 'eq', value: 'Completed' }] },
    { id: 'chg_failed',  title: 'Falhas / Canceladas',   visual: 'kpi', span: 3, recordTypes: ['change'], dimensions: [], measures: ['count'], primaryMeasure: 'count',
      filters: [{ dim: 'state', op: 'in', value: ['Failed', 'Cancelled'] }] },
    { id: 'chg_pipeline', title: 'Pipeline por Estado',  visual: 'bar', span: 6, recordTypes: ['change'], dimensions: ['state'], measures: ['count'] },
    { id: 'chg_by_type',  title: 'Por Tipo',             visual: 'donut', span: 3, recordTypes: ['change'], dimensions: ['change_type'], measures: ['count'] },
    { id: 'chg_by_risk',  title: 'Por Risco',            visual: 'donut', span: 3, recordTypes: ['change'], dimensions: ['risk'], measures: ['count'] },
    { id: 'chg_monthly',  title: 'Mudanças por Mês',     visual: 'line', span: 6, recordTypes: ['change'], dimensions: ['created_month'], measures: ['count', 'resolved_count'] },
    { id: 'chg_risk_state', title: 'Risco × Estado',     visual: 'heatmap', span: 6, recordTypes: ['change'], dimensions: ['risk', 'state'], measures: ['count'] },
  ],
}

export const BI_DASHBOARDS: BiDashboardDef[] = [
  incidentOverview,
  requestFulfillment,
  slaPerformance,
  problemManagement,
  changeManagement,
]
