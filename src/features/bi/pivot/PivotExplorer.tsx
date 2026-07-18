// ============================================================
// ServiceFY BI v2 — PivotExplorer (self-service)
// O usuário monta qualquer visão: escolhe tipos de registro,
// período, arrasta qualquer campo (incluindo campos de formulário
// do catálogo) para Linhas/Colunas/Filtros, escolhe medidas e o
// visual (tabela pivô ou gráfico). Tudo agregado no servidor via
// bi_cube; drill-down em qualquer célula.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Play, Save, Table2, BarChart3, PieChart, LineChart, Grid3X3, Hash } from 'lucide-react'
import { cubeService } from '../../../lib/bi/cubeService'
import { catalogService } from '../../../lib/bi/catalogService'
import { reportsService, DEFAULT_PIVOT_CONFIG, type BiPivotConfig, type BiPivotVisual } from '../../../lib/bi/reportsService'
import type { BiCubeRow, BiDimensionDef, BiMeasureDef, BiRecordType } from '../../../lib/bi/types'
import { RECORD_TYPE_LABELS, formatMeasure } from '../../../lib/bi/types'
import type { BiWidgetDef } from '../../../lib/bi/dashboards'
import type { BiChartTheme } from '../theme/echartsTheme'
import FieldCatalog, { type ShelfTarget } from './FieldCatalog'
import Shelves from './Shelves'
import PivotTable from './PivotTable'
import { buildPivotModel } from './pivotEngine'
import ChartWidget from '../components/ChartWidget'
import DrilldownPanel, { type DrilldownContext } from '../components/DrilldownPanel'
import { PERIOD_PRESETS } from '../components/FilterBar'

const VISUALS: Array<{ key: BiPivotVisual; label: string; icon: React.ReactNode }> = [
  { key: 'table',   label: 'Tabela',  icon: <Table2 size={13} /> },
  { key: 'bar',     label: 'Barras',  icon: <BarChart3 size={13} /> },
  { key: 'donut',   label: 'Rosca',   icon: <PieChart size={13} /> },
  { key: 'line',    label: 'Linha',   icon: <LineChart size={13} /> },
  { key: 'heatmap', label: 'Heatmap', icon: <Grid3X3 size={13} /> },
  { key: 'kpi',     label: 'KPI',     icon: <Hash size={13} /> },
]

const ALL_RECORD_TYPES: BiRecordType[] = ['incident', 'request', 'problem', 'change']

interface PivotExplorerProps {
  companyId: string
  theme: BiChartTheme
  /** relatório aberto (edição); null = novo */
  initialConfig?: BiPivotConfig | null
  initialReport?: { id: string; name: string; isPublic: boolean } | null
  onSaved?: () => void
}

export default function PivotExplorer({ companyId, theme, initialConfig, initialReport, onSaved }: PivotExplorerProps) {
  const [config, setConfig] = useState<BiPivotConfig>(initialConfig ?? DEFAULT_PIVOT_CONFIG)
  const [dimensions, setDimensions] = useState<BiDimensionDef[]>([])
  const [measures, setMeasures] = useState<BiMeasureDef[]>([])
  const [rows, setRows] = useState<BiCubeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<DrilldownContext | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(initialReport?.name ?? '')
  const [savePublic, setSavePublic] = useState(initialReport?.isPublic ?? false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialConfig) setConfig(initialConfig)
    setSaveName(initialReport?.name ?? '')
    setSavePublic(initialReport?.isPublic ?? false)
  }, [initialConfig, initialReport])

  // Catálogo de campos (padrão + form.* do tenant)
  useEffect(() => {
    Promise.all([
      catalogService.getDimensions(companyId),
      catalogService.getMeasures(),
    ])
      .then(([dims, meas]) => { setDimensions(dims); setMeasures(meas) })
      .catch(err => setError(err.message ?? String(err)))
  }, [companyId])

  const dimensionsByKey = useMemo(() => new Map(dimensions.map(d => [d.key, d])), [dimensions])
  const measuresByKey = useMemo(() => new Map(measures.map(m => [m.key, m])), [measures])

  const { dateFrom, dateTo } = useMemo(() => {
    const to = new Date()
    return { dateFrom: new Date(to.getTime() - config.periodDays * 86400_000), dateTo: to }
  }, [config.periodDays])

  // ── Execução da consulta ────────────────────────────────────
  const run = useCallback(async () => {
    const dims = [...config.rows, ...config.cols]
    if (!config.measures.length) { setError('Selecione ao menos uma medida.'); return }
    setLoading(true)
    setError(null)
    try {
      const result = await cubeService.runCube({
        companyId,
        recordTypes: config.recordTypes,
        dimensions: dims,
        measures: config.measures,
        filters: config.filters,
        dateFrom, dateTo,
        dateField: config.dateField,
        limit: 2000,
      })
      setRows(result)
    } catch (err) {
      setError((err as Error).message ?? String(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [companyId, config, dateFrom, dateTo])

  // auto-executa quando a definição muda (debounce leve)
  useEffect(() => {
    const t = setTimeout(run, 350)
    return () => clearTimeout(t)
  }, [run])

  // ── Mutações da definição ───────────────────────────────────
  const addDimension = (key: string, target: ShelfTarget) => {
    setConfig(c => {
      if (target === 'filters') {
        if (c.filters.some(f => f.dim === key)) return c
        return { ...c, filters: [...c.filters, { dim: key, op: 'eq' as const, value: undefined }] }
      }
      if (c.rows.includes(key) || c.cols.includes(key)) return c
      if (target === 'rows') {
        if (c.rows.length >= 2) return { ...c, rows: [c.rows[0], key] } // substitui o 2º nível
        return { ...c, rows: [...c.rows, key] }
      }
      return { ...c, cols: [key] } // colunas: 1 campo
    })
  }

  const model = useMemo(
    () => buildPivotModel(rows, config.rows, config.cols[0] ?? null, config.measures),
    [rows, config.rows, config.cols, config.measures],
  )

  const dimLabels = useMemo(() => {
    const m = new Map<string, string>()
    dimensions.forEach(d => m.set(d.key, d.label))
    return m
  }, [dimensions])

  // Widget sintético para reusar o ChartWidget nos modos gráficos
  const chartWidget: BiWidgetDef = useMemo(() => ({
    id: 'pivot_chart',
    title: '',
    visual: config.visual === 'heatmap' ? 'heatmap'
      : config.visual === 'donut' ? 'donut'
      : config.visual === 'line' ? 'line' : 'bar',
    recordTypes: config.recordTypes,
    dimensions: config.visual === 'heatmap' && config.cols[0]
      ? [config.rows[0], config.cols[0]]
      : [config.rows[0]],
    measures: config.measures,
    topN: 15,
  }), [config])

  const openDrill = (extra: Array<{ dim: string; value: string }>) => {
    setDrill({
      title: 'Registros selecionados',
      companyId,
      recordTypes: config.recordTypes,
      filters: [
        ...config.filters,
        ...extra.map(e => ({ dim: e.dim, op: 'eq' as const, value: e.value })),
      ],
      dateFrom, dateTo,
      dateField: config.dateField,
    })
  }

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      await reportsService.save({
        companyId,
        name: saveName.trim(),
        config,
        isPublic: savePublic,
        id: initialReport?.id,
      })
      setSaveOpen(false)
      onSaved?.()
    } catch (err) {
      setError((err as Error).message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  const borderColor = theme.isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.18)'
  const controlStyle: React.CSSProperties = {
    backgroundColor: theme.isDark ? 'rgba(255,255,255,.05)' : '#ffffff',
    color: theme.textColor,
    borderColor,
  }

  const kpiValue = config.visual === 'kpi' && rows.length
    ? rows[0].measures[config.measures[0]]
    : null

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* Painel esquerdo: catálogo de campos */}
      <div className="w-full shrink-0 lg:w-64 lg:self-stretch">
        <FieldCatalog
          dimensions={dimensions}
          measures={measures}
          recordTypes={config.recordTypes}
          theme={theme}
          onAddDimension={addDimension}
          onToggleMeasure={key => setConfig(c => ({
            ...c,
            measures: c.measures.includes(key)
              ? c.measures.filter(m => m !== key)
              : [...c.measures, key].slice(0, 8),
          }))}
          activeMeasures={config.measures}
        />
      </div>

      {/* Painel direito: definição + resultado */}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-xl border bg-white p-3" style={{ borderColor }}>
          <h2 className="text-sm font-semibold" style={{ color: theme.textColor }}>Editor de análise</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: theme.mutedColor }}>
            Escolha os registros e o período, adicione campos em linhas, colunas ou filtros e selecione o formato do resultado. As alterações são recalculadas automaticamente.
          </p>
        </div>
        {/* Controles superiores */}
        <div className="flex flex-wrap items-center gap-2">
          {ALL_RECORD_TYPES.map(rt => {
            const active = config.recordTypes.includes(rt)
            return (
              <button
                key={rt}
                type="button"
                onClick={() => setConfig(c => ({
                  ...c,
                  recordTypes: active
                    ? (c.recordTypes.length > 1 ? c.recordTypes.filter(x => x !== rt) : c.recordTypes)
                    : [...c.recordTypes, rt],
                }))}
                className="rounded-full border px-3 py-1 text-[11px] font-semibold"
                style={{
                  color: active ? theme.primary : theme.mutedColor,
                  borderColor: active ? theme.primary : borderColor,
                  backgroundColor: active ? `${theme.primary}14` : 'transparent',
                }}
              >
                {RECORD_TYPE_LABELS[rt]}
              </button>
            )
          })}

          <select
            className="rounded-lg border px-2 py-1 text-[11px] focus:outline-none"
            style={controlStyle}
            value={config.periodDays}
            onChange={e => setConfig(c => ({ ...c, periodDays: Number(e.target.value) }))}
          >
            {PERIOD_PRESETS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
            <option value={365}>Últimos 12 meses</option>
          </select>

          <select
            className="rounded-lg border px-2 py-1 text-[11px] focus:outline-none"
            style={controlStyle}
            value={config.dateField}
            onChange={e => setConfig(c => ({ ...c, dateField: e.target.value as BiPivotConfig['dateField'] }))}
          >
            <option value="created_at">Por data de criação</option>
            <option value="resolved_at">Por data de resolução</option>
            <option value="closed_at">Por data de fechamento</option>
          </select>

          <div className="ml-auto flex items-center gap-1.5">
            {VISUALS.map(v => (
              <button
                key={v.key}
                type="button"
                title={v.label}
                onClick={() => setConfig(c => ({ ...c, visual: v.key }))}
                className="rounded-lg border p-1.5"
                style={{
                  color: config.visual === v.key ? theme.primary : theme.mutedColor,
                  borderColor: config.visual === v.key ? theme.primary : borderColor,
                }}
              >
                {v.icon}
              </button>
            ))}
            <button
              type="button"
              onClick={run}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              <Play size={12} /> Executar
            </button>
            <button
              type="button"
              onClick={() => setSaveOpen(o => !o)}
              className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-bold"
              style={{ color: theme.primary, borderColor: theme.primary }}
            >
              <Save size={12} /> Salvar
            </button>
          </div>
        </div>

        {/* Diálogo de salvar */}
        {saveOpen && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor }}>
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Nome do relatório…"
              className="min-w-[220px] flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-xs focus:outline-none"
              style={controlStyle}
            />
            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: theme.mutedColor }}>
              <input type="checkbox" checked={savePublic} onChange={e => setSavePublic(e.target.checked)} />
              Visível para analistas
            </label>
            <button
              type="button"
              disabled={saving || !saveName.trim()}
              onClick={handleSave}
              className="rounded-lg px-4 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}
            >
              {saving ? 'Salvando…' : initialReport?.id ? 'Atualizar' : 'Salvar relatório'}
            </button>
          </div>
        )}

        {/* Shelves */}
        <Shelves
          rows={config.rows}
          cols={config.cols}
          measures={config.measures}
          filters={config.filters}
          dimensionsByKey={dimensionsByKey}
          measuresByKey={measuresByKey}
          companyId={companyId}
          recordTypes={config.recordTypes}
          theme={theme}
          onRemoveRow={key => setConfig(c => ({ ...c, rows: c.rows.filter(r => r !== key) }))}
          onRemoveCol={key => setConfig(c => ({ ...c, cols: c.cols.filter(x => x !== key) }))}
          onRemoveMeasure={key => setConfig(c => ({ ...c, measures: c.measures.filter(m => m !== key) }))}
          onUpdateFilter={(i, f) => setConfig(c => ({ ...c, filters: c.filters.map((x, xi) => xi === i ? f : x) }))}
          onRemoveFilter={i => setConfig(c => ({ ...c, filters: c.filters.filter((_, xi) => xi !== i) }))}
        />

        {/* Resultado */}
        <div className="rounded-xl border p-4"
             style={{ borderColor, backgroundColor: theme.isDark ? 'rgba(255,255,255,.03)' : '#ffffff' }}>
          {error && <div className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>}
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs" style={{ color: theme.mutedColor }}>
              Consultando o cubo…
            </div>
          ) : config.visual === 'kpi' ? (
            <div className="flex h-40 flex-col items-center justify-center gap-1">
              <span className="text-5xl font-bold tabular-nums" style={{ color: theme.textColor }}>
                {formatMeasure(
                  kpiValue == null ? null : Number(kpiValue),
                  measuresByKey.get(config.measures[0])?.format ?? 'number',
                )}
              </span>
              <span className="text-xs" style={{ color: theme.mutedColor }}>
                {measuresByKey.get(config.measures[0])?.label}
              </span>
            </div>
          ) : config.visual === 'table' || !config.rows.length ? (
            <PivotTable
              model={model}
              dimLabels={dimLabels}
              measureDefs={measuresByKey}
              theme={theme}
              onCellClick={(rowValues, colValue) =>
                openDrill([...rowValues, ...(colValue ? [colValue] : [])])}
            />
          ) : (
            <ChartWidget
              widget={chartWidget}
              rows={rows}
              theme={theme}
              measureDefs={measuresByKey}
              onDrill={openDrill}
            />
          )}
        </div>
      </div>

      {drill && <DrilldownPanel context={drill} theme={theme} onClose={() => setDrill(null)} />}
    </div>
  )
}
