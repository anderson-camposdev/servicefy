// ============================================================
// ServiceFY BI v2 — Página de dashboard pronto
// Executa as consultas do cubo declaradas na definição do
// dashboard (dashboards.ts), combina filtros globais e renderiza
// KPIs, charts e o drill-down. KPIs sem filtro próprio são
// agrupados numa única chamada (atual + período anterior).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cubeService } from '../../../lib/bi/cubeService'
import type { BiCubeRow, BiFilter, BiMeasureDef } from '../../../lib/bi/types'
import type { BiDashboardDef, BiWidgetDef } from '../../../lib/bi/dashboards'
import type { BiChartTheme } from '../theme/echartsTheme'
import ChartWidget from '../components/ChartWidget'
import KpiCard from '../components/KpiCard'
import EChart from '../components/EChart'
import FilterBar, { type GlobalFilters } from '../components/FilterBar'
import DrilldownPanel, { type DrilldownContext } from '../components/DrilldownPanel'
import { baseOption } from '../theme/echartsTheme'

const LOWER_IS_BETTER = new Set([
  'mttr_avg', 'mttr_median', 'mtta_avg', 'mtta_median', 'breached_count',
  'reopen_rate', 'reopened_count', 'avg_paused_minutes', 'avg_age_minutes', 'backlog',
])

interface DashboardPageProps {
  dashboard: BiDashboardDef
  companyId: string
  theme: BiChartTheme
  measureDefs: Map<string, BiMeasureDef>
}

interface WidgetData {
  rows: BiCubeRow[]
  previousRows?: BiCubeRow[]
  error?: string
}

export default function DashboardPage({ dashboard, companyId, theme, measureDefs }: DashboardPageProps) {
  const [filters, setFilters] = useState<GlobalFilters>({ periodDays: 30, groupName: null, priority: null })
  const [data, setData] = useState<Record<string, WidgetData>>({})
  const [trend, setTrend] = useState<Array<{ date: string; open: number; breached: number }>>([])
  const [groups, setGroups] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [drill, setDrill] = useState<DrilldownContext | null>(null)

  const { dateFrom, dateTo, prevFrom, prevTo } = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - filters.periodDays * 86400_000)
    const pFrom = new Date(from.getTime() - filters.periodDays * 86400_000)
    return { dateFrom: from, dateTo: to, prevFrom: pFrom, prevTo: from }
  }, [filters.periodDays])

  const globalFilters = useMemo<BiFilter[]>(() => {
    const f: BiFilter[] = []
    if (filters.groupName) f.push({ dim: 'group_name', op: 'eq', value: filters.groupName })
    if (filters.priority) f.push({ dim: 'priority', op: 'eq', value: filters.priority })
    return f
  }, [filters.groupName, filters.priority])

  const widgetFilters = useCallback(
    (w: BiWidgetDef): BiFilter[] => [...(w.filters ?? []), ...globalFilters],
    [globalFilters],
  )

  // ── Carga de dados ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const kpiPlain = dashboard.widgets.filter(w => w.visual === 'kpi' && !w.filters?.length)
    const kpiCustom = dashboard.widgets.filter(w => (w.visual === 'kpi' || w.visual === 'gauge') && w.filters?.length)
    const gaugesPlain = dashboard.widgets.filter(w => w.visual === 'gauge' && !w.filters?.length)
    const charts = dashboard.widgets.filter(w => !['kpi', 'gauge', 'backlog_trend'].includes(w.visual))
    const hasTrend = dashboard.widgets.some(w => w.visual === 'backlog_trend')

    const tasks: Promise<void>[] = []
    const next: Record<string, WidgetData> = {}

    // KPIs/gauges sem filtro próprio: uma única chamada com todas as medidas (atual + anterior)
    const combined = [...kpiPlain, ...gaugesPlain]
    if (combined.length) {
      const measures = [...new Set(combined.flatMap(w => w.measures))]
      const base = {
        companyId, recordTypes: dashboard.recordTypes, dimensions: [], measures,
        filters: globalFilters,
      }
      tasks.push(
        Promise.all([
          cubeService.runCube({ ...base, dateFrom, dateTo }),
          cubeService.runCube({ ...base, dateFrom: prevFrom, dateTo: prevTo }),
        ]).then(([cur, prev]) => {
          combined.forEach(w => { next[w.id] = { rows: cur, previousRows: prev } })
        }).catch(err => {
          combined.forEach(w => { next[w.id] = { rows: [], error: err.message ?? String(err) } })
        }),
      )
    }

    // KPIs com filtro próprio: chamadas individuais
    kpiCustom.forEach(w => {
      const base = {
        companyId, recordTypes: w.recordTypes, dimensions: [], measures: w.measures,
        filters: widgetFilters(w),
      }
      tasks.push(
        Promise.all([
          cubeService.runCube({ ...base, dateFrom, dateTo }),
          cubeService.runCube({ ...base, dateFrom: prevFrom, dateTo: prevTo }),
        ]).then(([cur, prev]) => { next[w.id] = { rows: cur, previousRows: prev } })
          .catch(err => { next[w.id] = { rows: [], error: err.message ?? String(err) } }),
      )
    })

    // Charts
    charts.forEach(w => {
      tasks.push(
        cubeService.runCube({
          companyId, recordTypes: w.recordTypes, dimensions: w.dimensions,
          measures: w.measures, filters: widgetFilters(w), dateFrom, dateTo,
        }).then(rows => { next[w.id] = { rows } })
          .catch(err => { next[w.id] = { rows: [], error: err.message ?? String(err) } }),
      )
    })

    // Tendência de backlog (snapshots)
    if (hasTrend) {
      tasks.push(
        cubeService.getBacklogTrend({ companyId, recordTypes: dashboard.recordTypes, dateFrom, dateTo })
          .then(points => {
            if (cancelled) return
            const byDate = new Map<string, { open: number; breached: number }>()
            points.forEach(p => {
              const cur = byDate.get(p.snapshot_date) ?? { open: 0, breached: 0 }
              cur.open += Number(p.open_count)
              cur.breached += Number(p.breached_count)
              byDate.set(p.snapshot_date, cur)
            })
            setTrend([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
              .map(([date, v]) => ({ date, ...v })))
          })
          .catch(() => { if (!cancelled) setTrend([]) }),
      )
    }

    // Lista de grupos para o filtro
    tasks.push(
      cubeService.runCube({
        companyId, recordTypes: dashboard.recordTypes, dimensions: ['group_name'],
        measures: ['count'], dateFrom, dateTo,
      }).then(rows => {
        if (!cancelled) setGroups(rows.map(r => r.dims.group_name).filter((g): g is string => !!g).sort())
      }).catch(() => {}),
    )

    Promise.all(tasks).finally(() => {
      if (cancelled) return
      setData(next)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [dashboard, companyId, dateFrom, dateTo, prevFrom, prevTo, globalFilters, widgetFilters])

  // ── Drill-down ──────────────────────────────────────────────
  const openDrill = (w: BiWidgetDef, extra: Array<{ dim: string; value: string }> = []) => {
    setDrill({
      title: w.title,
      companyId,
      recordTypes: w.recordTypes,
      filters: [
        ...widgetFilters(w),
        ...extra.map(e => ({ dim: e.dim, op: 'eq' as const, value: e.value })),
      ],
      dateFrom, dateTo,
    })
  }

  const kpiValue = (w: BiWidgetDef, rows?: BiCubeRow[]): number | null => {
    const mea = w.primaryMeasure ?? w.measures[0]
    const v = rows?.[0]?.measures[mea]
    return v == null ? null : Number(v)
  }

  const trendOption = useMemo(() => ({
    ...baseOption(theme),
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    tooltip: { ...baseOption(theme).tooltip as object, trigger: 'axis' },
    legend: { ...baseOption(theme).legend as object, top: 0 },
    xAxis: {
      type: 'category', data: trend.map(t => t.date), boundaryGap: false,
      axisLabel: { color: theme.mutedColor, fontSize: 10 },
      axisLine: { lineStyle: { color: theme.axisLineColor } },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: theme.splitLineColor } },
      axisLabel: { color: theme.mutedColor, fontSize: 10 },
    },
    series: [
      { name: 'Backlog', type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.1 }, data: trend.map(t => t.open) },
      { name: 'Violados', type: 'line', smooth: true, showSymbol: false, lineStyle: { color: theme.bad }, itemStyle: { color: theme.bad }, data: trend.map(t => t.breached) },
    ],
  }), [trend, theme])

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(100,116,139,.12)',
    boxShadow: '0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)',
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: theme.textColor }}>{dashboard.title}</h2>
          <p className="text-xs" style={{ color: theme.mutedColor }}>{dashboard.subtitle}</p>
        </div>
        <FilterBar
          filters={filters}
          groups={groups}
          theme={theme}
          showPriority={dashboard.id !== 'change_management'}
          onChange={setFilters}
        />
      </div>

      {/* Grid de widgets */}
      <div className="grid grid-cols-12 gap-3">
        {dashboard.widgets.map((w, wi) => {
          const wd = data[w.id]
          const span = w.span ?? 4

          if (w.visual === 'kpi') {
            const mea = w.primaryMeasure ?? w.measures[0]
            return (
              <div key={w.id} className="col-span-6 md:col-span-3" style={{ gridColumn: `span ${span} / span ${span}` }}>
                <KpiCard
                  title={w.title}
                  value={kpiValue(w, wd?.rows)}
                  previousValue={kpiValue(w, wd?.previousRows)}
                  format={measureDefs.get(mea)?.format ?? 'number'}
                  lowerIsBetter={LOWER_IS_BETTER.has(mea)}
                  theme={theme}
                  accentColor={theme.palette[wi % theme.palette.length]}
                  loading={loading && !wd}
                  onClick={() => openDrill(w)}
                />
              </div>
            )
          }

          return (
            <div
              key={w.id}
              className="rounded-xl border p-4"
              style={{ ...cardStyle, gridColumn: `span ${span} / span ${span}` }}
            >
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: theme.mutedColor }}>
                {w.title}
              </h3>
              {wd?.error ? (
                <div className="py-8 text-center text-xs text-red-400">{wd.error}</div>
              ) : w.visual === 'backlog_trend' ? (
                trend.length ? (
                  <EChart option={trendOption} height={280} />
                ) : (
                  <div className="flex h-[280px] items-center justify-center text-xs" style={{ color: theme.mutedColor }}>
                    Sem snapshots ainda — o histórico é acumulado diariamente
                  </div>
                )
              ) : loading && !wd ? (
                <div className="flex h-[280px] items-center justify-center text-xs" style={{ color: theme.mutedColor }}>
                  Carregando…
                </div>
              ) : (
                <ChartWidget
                  widget={w}
                  rows={wd?.rows ?? []}
                  theme={theme}
                  measureDefs={measureDefs}
                  onDrill={extra => openDrill(w, extra)}
                />
              )}
            </div>
          )
        })}
      </div>

      {drill && (
        <DrilldownPanel context={drill} theme={theme} onClose={() => setDrill(null)} />
      )}
    </div>
  )
}
