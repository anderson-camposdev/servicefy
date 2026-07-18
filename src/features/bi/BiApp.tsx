// ============================================================
// ServiceFY BI v2 — Shell do módulo de Analytics
// Três abas:
//   Dashboards — painéis prontos ServiceNow-like por módulo ITIL
//   Explorar   — pivot self-service sobre TODOS os campos (cubo)
//   Relatórios — visões salvas (v2 + relatórios v1 convertidos)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, LayoutDashboard, Compass, FolderOpen, Trash2, Globe2, Lock, Plus, RefreshCw } from 'lucide-react'
import { BI_DASHBOARDS } from '../../lib/bi/dashboards'
import { catalogService } from '../../lib/bi/catalogService'
import { reportsService, type BiSavedReport, type BiPivotConfig } from '../../lib/bi/reportsService'
import type { BiMeasureDef } from '../../lib/bi/types'
import { buildChartTheme } from './theme/echartsTheme'
import DashboardPage from './dashboards/DashboardPage'
import PivotExplorer from './pivot/PivotExplorer'
import { getReportSummary, presentBiError } from '../../lib/bi-presentation'

type BiTab = 'dashboards' | 'explore' | 'reports'

interface BiAppProps {
  companyId: string
  /** tema white-label do tenant (theme-engine); default Midnight */
  themeName?: string
}

export default function BiApp({ companyId, themeName }: BiAppProps) {
  const [tab, setTab] = useState<BiTab>('dashboards')
  const [activeDashboardId, setActiveDashboardId] = useState(BI_DASHBOARDS[0].id)
  const [measureDefs, setMeasureDefs] = useState<Map<string, BiMeasureDef>>(new Map())
  const [reports, setReports] = useState<BiSavedReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [openReport, setOpenReport] = useState<BiSavedReport | null>(null)
  const [explorerConfig, setExplorerConfig] = useState<BiPivotConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const theme = useMemo(() => buildChartTheme(themeName), [themeName])
  const dashboard = BI_DASHBOARDS.find(d => d.id === activeDashboardId) ?? BI_DASHBOARDS[0]

  useEffect(() => {
    catalogService.getMeasures()
      .then(measures => setMeasureDefs(new Map(measures.map(m => [m.key, m]))))
      .catch(err => setError(presentBiError(err.message ?? String(err))))
  }, [])

  const loadReports = useCallback(() => {
    setReportsLoading(true)
    reportsService.list(companyId)
      .then(setReports)
      .catch(err => setError(presentBiError(err.message ?? String(err))))
      .finally(() => setReportsLoading(false))
  }, [companyId])

  useEffect(() => {
    if (tab === 'reports') loadReports()
  }, [tab, loadReports])

  const handleOpenReport = (r: BiSavedReport) => {
    setOpenReport(r)
    setExplorerConfig(r.config)
    setTab('explore')
  }

  const handleDeleteReport = async (id: string) => {
    if (!window.confirm('Excluir este relatório salvo? Esta ação não pode ser desfeita.')) return
    await reportsService.remove(id)
    loadReports()
  }

  const borderColor = theme.isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.18)'

  const tabs: Array<{ key: BiTab; label: string; icon: React.ReactNode }> = [
    { key: 'dashboards', label: 'Dashboards', icon: <LayoutDashboard size={13} /> },
    { key: 'explore',    label: 'Explorar',   icon: <Compass size={13} /> },
    { key: 'reports',    label: 'Relatórios', icon: <FolderOpen size={13} /> },
  ]

  return (
    <div
      className="min-h-full rounded-2xl bg-slate-50 p-4 sm:p-5"
    >
      {/* Cabeçalho do módulo */}
      <div className="mb-5 flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center" style={{ borderColor }}>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${theme.primary}22`, color: theme.primary }}
        >
          <BarChart3 size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: theme.textColor }}>ServiceFY Analytics</h1>
          <p className="text-xs" style={{ color: theme.mutedColor }}>
            Performance Analytics — incidentes, solicitações, problemas e mudanças
          </p>
        </div>

        {/* Abas principais */}
        <div className="flex w-full gap-1 overflow-x-auto rounded-xl border p-1 sm:ml-auto sm:w-auto" style={{ borderColor }}>
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key)
                if (t.key === 'explore' && tab !== 'explore') { /* mantém config atual */ }
              }}
              className="flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none"
              style={{
                color: tab === t.key ? '#ffffff' : theme.mutedColor,
                backgroundColor: tab === t.key ? theme.primary : 'transparent',
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-red-100">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      )}

      {/* ── Dashboards prontos ── */}
      {tab === 'dashboards' && (
        <>
          <div className="mb-5 flex flex-wrap gap-1 border-b pb-0" style={{ borderColor }}>
            {BI_DASHBOARDS.map(d => {
              const active = d.id === activeDashboardId
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveDashboardId(d.id)}
                  className="rounded-t-lg px-4 py-2 text-xs font-semibold transition-colors"
                  style={{
                    color: active ? theme.primary : theme.mutedColor,
                    borderBottom: active ? `2px solid ${theme.primary}` : '2px solid transparent',
                    backgroundColor: active
                      ? (theme.isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)')
                      : 'transparent',
                  }}
                >
                  {d.title}
                </button>
              )
            })}
          </div>
          <DashboardPage
            key={`${dashboard.id}-${companyId}`}
            dashboard={dashboard}
            companyId={companyId}
            theme={theme}
            measureDefs={measureDefs}
          />
        </>
      )}

      {/* ── Explorar (pivot self-service) ── */}
      {tab === 'explore' && (
        <PivotExplorer
          companyId={companyId}
          theme={theme}
          initialConfig={explorerConfig}
          initialReport={openReport ? { id: openReport.id, name: openReport.name, isPublic: openReport.isPublic } : null}
          onSaved={() => { setOpenReport(null); setExplorerConfig(null); setTab('reports') }}
        />
      )}

      {/* ── Relatórios salvos ── */}
      {tab === 'reports' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" style={{ color: theme.mutedColor }}>
              {reports.length === 1 ? '1 relatório salvo' : `${reports.length} relatórios salvos`}
            </p>
            <button
              type="button"
              onClick={() => { setOpenReport(null); setExplorerConfig(null); setTab('explore') }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              <Plus size={14} /> Novo relatório
            </button>
          </div>

          {reportsLoading ? (
            <p className="py-8 text-center text-xs" style={{ color: theme.mutedColor }}>Carregando…</p>
          ) : reports.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor }}>
              <FolderOpen className="mx-auto mb-3" size={24} style={{ color: theme.mutedColor }} />
              <h2 className="text-sm font-semibold" style={{ color: theme.textColor }}>Nenhum relatório salvo</h2>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5" style={{ color: theme.mutedColor }}>
                Monte uma análise com dimensões, medidas e filtros próprios. Depois salve para acompanhar novamente.
              </p>
              <button
                type="button"
                onClick={() => { setOpenReport(null); setExplorerConfig(null); setTab('explore') }}
                className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                style={{ backgroundColor: theme.primary }}
              >
                <Compass size={14} /> Criar primeira análise
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {reports.map(r => (
                <div
                  key={r.id}
                  className="group flex items-start justify-between rounded-xl border p-4 transition-colors hover:border-slate-300"
                  style={{ borderColor, backgroundColor: theme.isDark ? 'rgba(255,255,255,.04)' : '#ffffff' }}
                >
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleOpenReport(r)}>
                    <p className="truncate text-sm font-semibold" style={{ color: theme.textColor }}>{r.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: theme.mutedColor }}>
                      {r.isPublic ? <Globe2 size={12} /> : <Lock size={12} />}
                      {getReportSummary(r.config.recordTypes, r.config.visual)}
                      {r.migratedFromV1 && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                          Importado
                        </span>
                      )}
                    </p>
                  </button>
                  <button
                    type="button"
                    title="Excluir relatório"
                    aria-label={`Excluir relatório ${r.name}`}
                    onClick={e => { e.stopPropagation(); handleDeleteReport(r.id) }}
                    className="shrink-0 rounded-lg p-2 text-red-600/70 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
