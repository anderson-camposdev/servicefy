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

  const compliance = metrics?.sla_compliance_pct ?? null
  const complianceTone = compliance === null
    ? 'bg-slate-50 border-slate-200 text-slate-500'
    : compliance >= 90
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : compliance >= 70
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-rose-50 border-rose-200 text-rose-700'

  const statusEntries = metrics
    ? Object.entries(metrics.by_status).sort((a, b) => {
        const ia = STATUS_ORDER.indexOf(a[0])
        const ib = STATUS_ORDER.indexOf(b[0])
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      })
    : []

  return (
    <div className="mx-auto w-full max-w-6xl p-5 lg:p-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Analytics Executivo</h1>
          <p className="text-sm text-slate-500 mt-1">Visão consolidada de ITSM para a camada gerencial.</p>
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="py-24 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando métricas…
        </div>
      ) : metrics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Tickets Abertos"
              value={metrics.total_opened.toLocaleString('pt-BR')}
              tone="bg-indigo-50 border-indigo-200 text-indigo-700"
            />
            <MetricCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              label="Tickets Resolvidos"
              value={metrics.total_resolved.toLocaleString('pt-BR')}
              tone="bg-slate-50 border-slate-200 text-slate-700"
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
              value={metrics.mttr_hours === null ? '—' : `${metrics.mttr_hours.toFixed(1)}h`}
              subValue={metrics.mttr_minutes === null ? undefined : `${metrics.mttr_minutes.toFixed(0)} min`}
              tone="bg-sky-50 border-sky-200 text-sky-700"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-bold text-slate-800 mb-4">Distribuição por Status</h2>
            {statusEntries.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum ticket no período selecionado.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {statusEntries.map(([status, qty]) => (
                  <div key={status} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-600">{status}</span>
                    <span className="text-lg font-black text-slate-900">{qty.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
    <div className={`rounded-2xl border p-5 shadow-sm ${tone} ${emphasized ? 'ring-2 ring-offset-2 ring-current/20' : ''}`}>
      <div className="flex items-center gap-2 opacity-80">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
      {subValue && <p className="mt-0.5 text-xs font-semibold opacity-70">{subValue}</p>}
    </div>
  )
}
