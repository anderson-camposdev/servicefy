// ============================================================
// ServiceFY BI v2 — Widget de gráfico genérico
// Recebe linhas agregadas do bi_cube e o tipo visual do widget e
// monta a option ECharts correspondente. Clique numa categoria
// dispara onDrill com a dimensão/valor clicado (drill-down).
// ============================================================

import { useMemo } from 'react'
import EChart, { type EChartClickParams } from './EChart'
import type { BiCubeRow, BiMeasureDef } from '../../../lib/bi/types'
import { formatMeasure } from '../../../lib/bi/types'
import type { BiWidgetDef } from '../../../lib/bi/dashboards'
import { type BiChartTheme, baseOption } from '../theme/echartsTheme'
import { isBiCubeRowReady } from '../../../lib/bi-presentation'

const WEEKDAY_LABELS: Record<string, string> = {
  '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb', '7': 'Dom',
}

function dimLabel(key: string, raw: string | null): string {
  if (raw == null || raw === '') return '(vazio)'
  if (key === 'created_weekday') return WEEKDAY_LABELS[raw] ?? raw
  if (key === 'created_hour') return `${raw}h`
  if (raw === 'true') return 'Sim'
  if (raw === 'false') return 'Não'
  return raw
}

interface ChartWidgetProps {
  widget: BiWidgetDef
  rows: BiCubeRow[]
  theme: BiChartTheme
  measureDefs: Map<string, BiMeasureDef>
  onDrill?: (dimFilters: Array<{ dim: string; value: string }>) => void
}

export default function ChartWidget({ widget, rows, theme, measureDefs, onDrill }: ChartWidgetProps) {
  const safeRows = rows.filter(isBiCubeRowReady) as BiCubeRow[]
  const option = useMemo(
    () => buildOption(widget, safeRows, theme, measureDefs),
    [widget, safeRows, theme, measureDefs],
  )

  const handleClick = (params: EChartClickParams) => {
    if (!onDrill) return
    const [d1, d2] = widget.dimensions
    if (!d1) return
    if (widget.visual === 'heatmap' && d2 && Array.isArray(params.data)) {
      const [x, y] = params.data as [string, string, number]
      onDrill([{ dim: d1, value: x }, { dim: d2, value: y }])
      return
    }
    if (widget.visual === 'line') {
      onDrill([{ dim: d1, value: params.name }])
      return
    }
    // bar/donut: nome exibido pode ter sido traduzido; usamos o raw guardado
    const raw = (params.data as { rawValue?: string } | undefined)?.rawValue ?? params.name
    onDrill([{ dim: d1, value: raw }])
  }

  if (!safeRows.length) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-sm" style={{ color: theme.mutedColor }}>
        Sem dados no período selecionado
      </div>
    )
  }

  return <EChart option={option} height={widget.visual === 'gauge' ? 220 : 280} onClickItem={handleClick} />
}

// ─── Builders por tipo visual ────────────────────────────────

function buildOption(
  widget: BiWidgetDef,
  rows: BiCubeRow[],
  t: BiChartTheme,
  measureDefs: Map<string, BiMeasureDef>,
): Record<string, unknown> {
  switch (widget.visual) {
    case 'bar':     return barOption(widget, rows, t, measureDefs)
    case 'donut':   return donutOption(widget, rows, t, measureDefs)
    case 'line':    return lineOption(widget, rows, t, measureDefs)
    case 'heatmap': return heatmapOption(widget, rows, t, measureDefs)
    case 'gauge':   return gaugeOption(widget, rows, t)
    default:        return barOption(widget, rows, t, measureDefs)
  }
}

function fmt(measureDefs: Map<string, BiMeasureDef>, key: string, value: number | null): string {
  return formatMeasure(value, measureDefs.get(key)?.format ?? 'number')
}

function barOption(w: BiWidgetDef, rows: BiCubeRow[], t: BiChartTheme, defs: Map<string, BiMeasureDef>) {
  const dim = w.dimensions[0]
  const mea = w.measures[0]
  const data = rows
    .map(r => ({ raw: r.dims[dim] ?? '', value: Number(r.measures[mea] ?? 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, w.topN ?? 12)
    .reverse() // barra horizontal: maior no topo
  return {
    ...baseOption(t),
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: t.axisLineColor } },
      splitLine: { lineStyle: { color: t.splitLineColor } },
      axisLabel: { color: t.mutedColor, fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: data.map(d => dimLabel(dim, d.raw)),
      axisLine: { lineStyle: { color: t.axisLineColor } },
      axisLabel: { color: t.mutedColor, fontSize: 11, width: 140, overflow: 'truncate' },
    },
    tooltip: {
      ...baseOption(t).tooltip as object,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => fmt(defs, mea, v),
    },
    series: [{
      type: 'bar',
      data: data.map(d => ({
        value: d.value,
        rawValue: d.raw,
        itemStyle: { color: t.primary, borderRadius: [0, 4, 4, 0] },
      })),
      barMaxWidth: 22,
      label: {
        show: true, position: 'right', color: t.mutedColor, fontSize: 10,
        formatter: (p: { value: number }) => fmt(defs, mea, p.value),
      },
    }],
  }
}

function donutOption(w: BiWidgetDef, rows: BiCubeRow[], t: BiChartTheme, defs: Map<string, BiMeasureDef>) {
  const dim = w.dimensions[0]
  const mea = w.measures[0]
  const data = rows
    .map(r => ({ raw: r.dims[dim] ?? '', value: Number(r.measures[mea] ?? 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, w.topN ?? 10)
  return {
    ...baseOption(t),
    tooltip: {
      ...baseOption(t).tooltip as object,
      trigger: 'item',
      valueFormatter: (v: number) => fmt(defs, mea, v),
    },
    legend: {
      ...baseOption(t).legend as object,
      orient: 'vertical', right: 0, top: 'middle',
      formatter: (name: string) => (name.length > 18 ? name.slice(0, 17) + '…' : name),
    },
    series: [{
      type: 'pie',
      radius: ['52%', '78%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: 'transparent', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 600, color: t.textColor } },
      data: data.map(d => ({ name: dimLabel(dim, d.raw), value: d.value, rawValue: d.raw })),
    }],
  }
}

function lineOption(w: BiWidgetDef, rows: BiCubeRow[], t: BiChartTheme, defs: Map<string, BiMeasureDef>) {
  const dim = w.dimensions[0]
  const sorted = [...rows].sort((a, b) => String(a.dims[dim] ?? '').localeCompare(String(b.dims[dim] ?? '')))
  const categories = sorted.map(r => dimLabel(dim, r.dims[dim] ?? ''))
  return {
    ...baseOption(t),
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    tooltip: { ...baseOption(t).tooltip as object, trigger: 'axis' },
    legend: { ...baseOption(t).legend as object, top: 0 },
    xAxis: {
      type: 'category', data: categories, boundaryGap: false,
      axisLine: { lineStyle: { color: t.axisLineColor } },
      axisLabel: { color: t.mutedColor, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: t.splitLineColor } },
      axisLabel: { color: t.mutedColor, fontSize: 10 },
    },
    series: w.measures.map(mea => ({
      name: defs.get(mea)?.label ?? mea,
      type: 'line',
      smooth: false,
      showSymbol: false,
      lineStyle: { width: 2 },
      symbol: 'circle',
      data: sorted.map(r => Number(r.measures[mea] ?? 0)),
    })),
  }
}

function heatmapOption(w: BiWidgetDef, rows: BiCubeRow[], t: BiChartTheme, defs: Map<string, BiMeasureDef>) {
  const [dx, dy] = w.dimensions
  const mea = w.measures[0]
  const xVals = [...new Set(rows.map(r => r.dims[dx] ?? ''))].sort()
  const yVals = [...new Set(rows.map(r => r.dims[dy] ?? ''))].sort()
  const values = rows.map(r => [
    r.dims[dx] ?? '', r.dims[dy] ?? '', Number(r.measures[mea] ?? 0),
  ])
  const max = Math.max(1, ...values.map(v => v[2] as number))
  return {
    ...baseOption(t),
    grid: { left: 8, right: 16, top: 8, bottom: 40, containLabel: true },
    tooltip: {
      ...baseOption(t).tooltip as object,
      formatter: (p: { data: [string, string, number] }) =>
        `${dimLabel(dx, p.data[0])} × ${dimLabel(dy, p.data[1])}: <b>${fmt(defs, mea, p.data[2])}</b>`,
    },
    xAxis: {
      type: 'category', data: xVals,
      axisLabel: { color: t.mutedColor, fontSize: 10, formatter: (v: string) => dimLabel(dx, v) },
      axisLine: { lineStyle: { color: t.axisLineColor } },
    },
    yAxis: {
      type: 'category', data: yVals,
      axisLabel: { color: t.mutedColor, fontSize: 10, formatter: (v: string) => dimLabel(dy, v) },
      axisLine: { lineStyle: { color: t.axisLineColor } },
    },
    visualMap: {
      min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: [t.isDark ? '#1e293b' : '#e2e8f0', t.primary] },
      textStyle: { color: t.mutedColor, fontSize: 10 },
    },
    series: [{
      type: 'heatmap',
      data: values,
      label: { show: xVals.length * yVals.length <= 120, color: t.textColor, fontSize: 9 },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.35)' } },
    }],
  }
}

function gaugeOption(w: BiWidgetDef, rows: BiCubeRow[], t: BiChartTheme) {
  const mea = w.primaryMeasure ?? w.measures[0]
  const value = Number(rows[0]?.measures[mea] ?? 0)
  const color = value >= 90 ? t.good : value >= 75 ? t.warn : t.bad
  return {
    ...baseOption(t),
    series: [{
      type: 'gauge',
      startAngle: 210, endAngle: -30,
      min: 0, max: 100,
      progress: { show: true, width: 12, itemStyle: { color } },
      axisLine: { lineStyle: { width: 12, color: [[1, t.isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      detail: {
        valueAnimation: true,
        formatter: (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
        color: t.textColor, fontSize: 26, fontWeight: 700, offsetCenter: [0, 0],
      },
      data: [{ value }],
    }],
  }
}
