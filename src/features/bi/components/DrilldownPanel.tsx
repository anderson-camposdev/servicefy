// ============================================================
// Flowfy BI v2 — Painel de drill-down
// Clicou num KPI/fatia/barra -> lista paginada dos tickets por
// trás do número (RPC bi_drilldown), com os filtros herdados.
// ============================================================

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { cubeService } from '../../../lib/bi/cubeService'
import type { BiDrilldownRow, BiFilter, BiRecordType, BiDateField } from '../../../lib/bi/types'
import { RECORD_TYPE_LABELS } from '../../../lib/bi/types'
import type { BiChartTheme } from '../theme/echartsTheme'

const PAGE_SIZE = 25

export interface DrilldownContext {
  title: string
  companyId: string
  recordTypes: BiRecordType[]
  filters: BiFilter[]
  dateFrom: Date
  dateTo: Date
  dateField?: BiDateField
}

interface DrilldownPanelProps {
  context: DrilldownContext
  theme: BiChartTheme
  onClose: () => void
  /** abre o ticket no workspace (opcional) */
  onOpenTicket?: (row: BiDrilldownRow) => void
}

export default function DrilldownPanel({ context, theme, onClose, onOpenTicket }: DrilldownPanelProps) {
  const [rows, setRows] = useState<BiDrilldownRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setPage(0) }, [context])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    cubeService.drilldown({
      companyId: context.companyId,
      recordTypes: context.recordTypes,
      filters: context.filters,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      dateField: context.dateField,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then(({ rows, total }) => {
        if (cancelled) return
        setRows(rows)
        setTotal(total)
      })
      .catch(err => { if (!cancelled) setError(err.message ?? String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [context, page])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col shadow-2xl"
        style={{ backgroundColor: theme.isDark ? '#0f172a' : '#ffffff' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4"
             style={{ borderColor: theme.isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.18)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: theme.textColor }}>{context.title}</h3>
            <p className="text-xs" style={{ color: theme.mutedColor }}>
              {total.toLocaleString('pt-BR')} registro(s)
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:opacity-70" style={{ color: theme.mutedColor }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-4 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {loading && !rows.length ? (
            <div className="p-6 text-sm" style={{ color: theme.mutedColor }}>Carregando…</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="sticky top-0" style={{ backgroundColor: theme.isDark ? '#0f172a' : '#ffffff', color: theme.mutedColor }}>
                  <th className="px-4 py-2 font-medium">Número</th>
                  <th className="px-2 py-2 font-medium">Descrição</th>
                  <th className="px-2 py-2 font-medium">Tipo</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Prioridade</th>
                  <th className="px-2 py-2 font-medium">Grupo</th>
                  <th className="px-2 py-2 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody style={{ color: theme.textColor }}>
                {rows.map(r => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t transition-colors hover:opacity-80"
                    style={{ borderColor: theme.isDark ? 'rgba(148,163,184,.10)' : 'rgba(100,116,139,.12)' }}
                    onClick={() => onOpenTicket?.(r)}
                  >
                    <td className="whitespace-nowrap px-4 py-2 font-mono" style={{ color: theme.primary }}>{r.number}</td>
                    <td className="max-w-[220px] truncate px-2 py-2">{r.short_description}</td>
                    <td className="whitespace-nowrap px-2 py-2">{RECORD_TYPE_LABELS[r.record_type] ?? r.record_type}</td>
                    <td className="whitespace-nowrap px-2 py-2">{r.state}</td>
                    <td className="whitespace-nowrap px-2 py-2">{r.priority ?? '—'}</td>
                    <td className="max-w-[140px] truncate px-2 py-2">{r.group_name ?? '—'}</td>
                    <td className="px-2 py-2">
                      {r.sla_breached && <AlertTriangle size={14} className="text-red-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-5 py-3"
             style={{ borderColor: theme.isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.18)' }}>
          <span className="text-xs" style={{ color: theme.mutedColor }}>
            Página {page + 1} de {pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="rounded border p-1 disabled:opacity-30"
              style={{ color: theme.textColor, borderColor: theme.isDark ? 'rgba(148,163,184,.2)' : 'rgba(100,116,139,.25)' }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={page + 1 >= pages}
              onClick={() => setPage(p => p + 1)}
              className="rounded border p-1 disabled:opacity-30"
              style={{ color: theme.textColor, borderColor: theme.isDark ? 'rgba(148,163,184,.2)' : 'rgba(100,116,139,.25)' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
