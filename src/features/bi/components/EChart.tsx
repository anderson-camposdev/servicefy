// ============================================================
// ServiceFY BI v2 — Wrapper fino do ECharts para React 19
// Sem echarts-for-react (sem release ativa p/ React 19): init via
// ref + ResizeObserver + setOption em effect, com imports
// tree-shaken de echarts/core.
// ============================================================

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, HeatmapChart, GaugeChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, VisualMapComponent, TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsCoreOption } from 'echarts/core'

echarts.use([
  BarChart, LineChart, PieChart, HeatmapChart, GaugeChart,
  GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, VisualMapComponent, TitleComponent,
  CanvasRenderer,
])

export interface EChartClickParams {
  seriesName?: string
  name: string
  value: unknown
  dataIndex: number
  data?: unknown
}

interface EChartProps {
  option: EChartsCoreOption
  height?: number | string
  onClickItem?: (params: EChartClickParams) => void
  className?: string
}

export default function EChart({ option, height = 280, onClickItem, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const clickRef = useRef(onClickItem)

  useEffect(() => {
    clickRef.current = onClickItem
  }, [onClickItem])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = echarts.init(el)
    chartRef.current = chart

    chart.on('click', (params) => {
      clickRef.current?.(params as unknown as EChartClickParams)
    })

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={containerRef} className={className} style={{ width: '100%', height }} />
}
