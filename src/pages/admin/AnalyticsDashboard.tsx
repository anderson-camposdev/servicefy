// ============================================================
// ServiceFY — Fase 23: Analytics e Relatórios Executivos
//
// Toda a agregação (contagens, % de conformidade de SLA, MTTR) roda em SQL
// via get_executive_metrics (migration 120) — este componente só busca e
// exibe. Nenhuma matemática de negócio acontece aqui.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, TrendingUp } from 'lucide-react'
import { executiveAnalyticsService } from '../../lib/services'
import type { ExecutiveMetrics } from '../../lib/database.types'
import { buildExecutiveInsight, translateExecutiveStatus } from '../../lib/executive-insights'

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
          {insight && (
            <section className={`border-y px-1 py-5 ${
              insight.tone === 'critical' ? 'border-red-200 text-red-900' :
              insight.tone === 'warning' ? 'border-amber-200 text-amber-900' :
              insight.tone === 'positive' ? 'border-emerald-200 text-emerald-900' :
              'border-outline-variant text-on-surface'
            }`}>
              <div className="flex items-start gap-3">
                {insight.tone === 'critical' || insight.tone === 'warning'
                  ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
                <div>
                  <p className="text-base font-bold">{insight.title}</p>
                  <p className="mt-1 text-sm opacity-85">{insight.description}</p>
                  <p className="mt-2 text-sm font-semibold">{insight.action}</p>
                </div>
              </div>
            </section>
          )}

          <div className="grid overflow-hidden rounded-xl border border-outline-variant bg-surface sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Chamados abertos"
              value={opened.toLocaleString('pt-BR')}
              tone="text-primary"
            />
            <MetricCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              label="Chamados resolvidos"
              value={resolved.toLocaleString('pt-BR')}
              tone="text-on-surface"
            />
            <MetricCard
              icon={compliance !== null && compliance < 70 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              label="Conformidade de SLA"
              value={compliance === null ? '—' : `${compliance.toFixed(1)}%`}
              tone={complianceTone}
              emphasized
            />
            <MetricCard
              icon={<Clock className="w-5 h-5" />}
              label="MTTR (tempo útil médio)"
              value={mttrHours === null ? '—' : `${mttrHours.toFixed(1)}h`}
              subValue={mttrMinutes === null ? undefined : `${mttrMinutes.toFixed(0)} min`}
              tone="text-sky-700"
            />
          </div>

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
