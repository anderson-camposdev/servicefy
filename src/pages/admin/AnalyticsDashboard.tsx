// ============================================================
// ServiceFY — Fase 23: Analytics e Relatórios Executivos
//
// Toda a agregação (contagens, % de conformidade de SLA, MTTR) roda em SQL
// via get_executive_metrics (migration 120) — este componente só busca e
// exibe. Nenhuma matemática de negócio acontece aqui.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, Target, TrendingUp } from 'lucide-react'
import { executiveAnalyticsService } from '../../lib/services'
import type { ExecutiveMetrics } from '../../lib/database.types'
import { buildExecutiveBrief, buildExecutiveInsight, translateExecutiveStatus } from '../../lib/executive-insights'
import { formatOperationalMinutes } from '../../lib/bi-presentation'

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultRange(): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: isoDate(start), end: isoDate(end) }
}

const STATUS_ORDER = ['New', 'In Progress', 'Pending Approval', 'On Hold', 'Pending User', 'Resolved', 'Closed']

export default function AnalyticsDashboard() {
  const initial = defaultRange()
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setMetrics(await executiveAnalyticsService.getMetrics(startDate, endDate))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar métricas.')
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { void load() }, [load])

  const opened = typeof metrics?.total_opened === 'number' ? metrics.total_opened : 0
  const resolved = typeof metrics?.total_resolved === 'number' ? metrics.total_resolved : 0
  const compliance = typeof metrics?.sla_compliance_pct === 'number' ? metrics.sla_compliance_pct : null
  const mttrHours = typeof metrics?.mttr_hours === 'number' ? metrics.mttr_hours : null
  const mttrMinutes = typeof metrics?.mttr_minutes === 'number' ? metrics.mttr_minutes : null
  const backlogAtEnd = metrics?.backlog_at_end ?? 0
  const backlogAtStart = metrics?.backlog_at_start ?? 0
  const criticalBacklog = metrics?.critical_backlog ?? 0
  const mttrMedianMinutes = metrics?.mttr_median_minutes ?? null
  const complianceTone = compliance === null
    ? 'text-on-surface-variant'
    : compliance >= 90
      ? 'text-resolved-fg'
      : compliance >= 70
        ? 'text-amber-700'
        : 'text-error'

  const statusEntries = metrics
    ? Object.entries(metrics.by_status ?? {}).sort((a, b) => {
        const ia = STATUS_ORDER.indexOf(a[0])
        const ib = STATUS_ORDER.indexOf(b[0])
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      })
    : []
  const insight = metrics ? buildExecutiveInsight({
    total_opened: opened,
    total_resolved: resolved,
    sla_compliance_pct: compliance,
    by_status: metrics.by_status ?? {},
  }) : null
  const brief = metrics ? buildExecutiveBrief({
    total_opened: opened,
    total_resolved: resolved,
    sla_compliance_pct: compliance,
    mttr_hours: mttrHours,
    mttr_minutes: mttrMinutes,
    previous_total_opened: metrics.previous_total_opened,
    previous_total_resolved: metrics.previous_total_resolved,
    previous_sla_compliance_pct: metrics.previous_sla_compliance_pct,
    previous_mttr_minutes: metrics.previous_mttr_minutes,
    backlog_at_end: metrics.backlog_at_end,
    backlog_at_start: metrics.backlog_at_start,
    critical_backlog: metrics.critical_backlog,
    breached_resolved: metrics.breached_resolved,
    reopen_rate_pct: metrics.reopen_rate_pct,
    aging_buckets: metrics.aging_buckets,
    by_status: metrics.by_status ?? {},
  }) : null
  const maxStatusValue = Math.max(1, ...statusEntries.map(([, quantity]) => quantity))

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant pb-5">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Visão executiva</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Desempenho operacional e riscos que precisam de decisão.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-slate-600">
            De
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              className="block mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Até
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="block mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>
      </header>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span><strong>Não foi possível carregar os indicadores.</strong> {error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline underline-offset-2">Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div className="py-24 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando métricas…
        </div>
      ) : metrics ? (
        <>
          {insight && brief && (
            <section className="overflow-hidden rounded-2xl bg-slate-950 text-white">
              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(14rem,0.7fr)] lg:items-center">
                <div>
                  <p className="text-xs font-semibold text-slate-400">Briefing do período</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{insight.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{insight.description}</p>
                  <p className="mt-4 inline-flex items-start gap-2 text-sm font-semibold text-white">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {insight.action}
                  </p>
                </div>
                <div className="border-t border-slate-800 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <p className="text-xs font-semibold text-slate-400">Comparação com o período anterior</p>
                  <dl className="mt-3 space-y-2.5 text-sm">
                    <ComparisonRow label="Aberturas" value={brief.openedChangePct === null ? 'Sem base' : `${brief.openedChangePct > 0 ? '+' : ''}${brief.openedChangePct}%`} />
                    <ComparisonRow label="SLA" value={brief.slaDeltaPp === null ? 'Sem base' : `${brief.slaDeltaPp > 0 ? '+' : ''}${brief.slaDeltaPp} p.p.`} />
                    <ComparisonRow label="MTTR médio" value={brief.mttrDeltaMinutes === null ? 'Sem base' : `${brief.mttrDeltaMinutes > 0 ? '+' : brief.mttrDeltaMinutes < 0 ? '−' : ''}${formatOperationalMinutes(Math.abs(brief.mttrDeltaMinutes))}`} />
                  </dl>
                  {brief.leadingQueue && (
                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      Maior fila ativa: <strong className="text-slate-200">{translateExecutiveStatus(brief.leadingQueue.status)}</strong> com {brief.leadingQueue.count} chamados.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="grid overflow-hidden rounded-xl border border-outline-variant bg-surface sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Backlog no fechamento"
              value={backlogAtEnd.toLocaleString('pt-BR')}
              subValue={`${brief && brief.backlogDelta > 0 ? '+' : ''}${brief?.backlogDelta ?? 0} vs. início (${backlogAtStart})`}
              tone="text-primary"
            />
            <MetricCard
              icon={compliance !== null && compliance < 70 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              label="Conformidade de SLA"
              value={compliance === null ? '—' : `${compliance.toFixed(1)}%`}
              subValue={metrics.previous_sla_compliance_pct === null ? 'Sem comparação anterior' : `Anterior: ${metrics.previous_sla_compliance_pct.toFixed(1)}%`}
              tone={complianceTone}
              emphasized
            />
            <MetricCard
              icon={<Clock className="w-5 h-5" />}
              label="MTTR mediano"
              value={formatOperationalMinutes(mttrMedianMinutes)}
              subValue={mttrMinutes === null ? 'Sem amostra' : `Média: ${formatOperationalMinutes(mttrMinutes)}`}
              tone="text-sky-700"
            />
            <MetricCard
              icon={<AlertTriangle className="w-5 h-5" />}
              label="Backlog P1/P2"
              value={criticalBacklog.toLocaleString('pt-BR')}
              subValue={`${metrics.breached_resolved} resolvidos fora do SLA`}
              tone={criticalBacklog > 0 ? 'text-error' : 'text-resolved-fg'}
            />
          </div>

          <section className="grid divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            <FlowMetric label="Abertos no período" value={opened} comparison={metrics.previous_total_opened} />
            <FlowMetric label="Resolvidos no período" value={resolved} comparison={metrics.previous_total_resolved} />
            <FlowMetric label="Taxa de absorção" value={brief?.resolutionRate ?? null} suffix="%" />
            <FlowMetric label="Taxa de reabertura" value={metrics.reopen_rate_pct} suffix="%" />
          </section>

          {brief && (
            <section>
              <div className="mb-4">
                <h2 className="text-base font-bold text-on-surface">Decisões recomendadas</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Prioridades ordenadas pelo impacto nos resultados do período.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {brief.decisions.map((decision, index) => (
                  <article key={decision.title} className="rounded-xl border border-outline-variant bg-surface p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-on-surface-variant">Prioridade {index + 1}</span>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        decision.tone === 'critical' ? 'bg-red-50 text-red-700' :
                        decision.tone === 'warning' ? 'bg-amber-50 text-amber-700' :
                        decision.tone === 'positive' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {decision.tone === 'critical' ? <AlertTriangle className="h-4 w-4" /> :
                          decision.tone === 'positive' ? <CheckCircle2 className="h-4 w-4" /> :
                          <Target className="h-4 w-4" />}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-on-surface">{decision.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-on-surface-variant">{decision.rationale}</p>
                    <p className="mt-3 border-t border-outline-variant pt-3 text-xs font-semibold leading-5 text-on-surface">{decision.recommendation}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="border-t border-outline-variant pt-5">
            <div className="mb-4">
              <h2 className="text-base font-bold text-on-surface">Onde o trabalho está concentrado</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Distribuição atual dos chamados por etapa operacional.</p>
            </div>
            {statusEntries.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum chamado no período selecionado. Amplie as datas para visualizar a distribuição.</p>
            ) : (
              <div className="divide-y divide-outline-variant border-y border-outline-variant">
                {statusEntries.map(([status, qty]) => (
                  <div key={status} className="grid grid-cols-[minmax(7rem,1fr)_minmax(4rem,2fr)_auto] items-center gap-3 py-3">
                    <span className="text-sm font-semibold text-on-surface">{translateExecutiveStatus(status)}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (qty / maxStatusValue) * 100)}%` }} />
                    </div>
                    <span className="min-w-8 text-right text-sm font-bold tabular-nums text-on-surface">{qty.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  tone: string
  emphasized?: boolean
}

function MetricCard({ icon, label, value, subValue, tone, emphasized }: MetricCardProps) {
  return (
    <div className={`border-b border-outline-variant p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0 ${tone} ${emphasized ? 'bg-surface-container' : ''}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {subValue && <p className="mt-0.5 text-xs font-semibold opacity-75">{subValue}</p>}
    </div>
  )
}

function ComparisonRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-slate-400">{label}</dt><dd className="font-semibold tabular-nums text-white">{value}</dd></div>
}

function FlowMetric({ label, value, comparison, suffix = '' }: { label: string; value: number | null; comparison?: number; suffix?: string }) {
  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-on-surface">{value === null ? '—' : `${value.toLocaleString('pt-BR')}${suffix}`}</p>
      {comparison !== undefined && <p className="mt-1 text-xs text-on-surface-variant">Anterior: {comparison.toLocaleString('pt-BR')}</p>}
    </div>
  )
}
