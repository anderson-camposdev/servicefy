// ============================================================
// ServiceFY — Histórico de ação técnica (visão do solicitante).
// Lista as entradas PÚBLICAS de incident_history (abertura, mudanças de
// estado, comentários, início de atendimento) — nunca notas internas.
// Mesma fonte de dados do Cockpit do Analista (incidentsService.listPublicHistory),
// em um cartão de linha do tempo consistente com o Controle de SLA.
// ============================================================

import { useEffect, useState } from 'react'
import { History, MessageSquare, PlayCircle, Pencil, FilePlus2 } from 'lucide-react'
import { incidentsService } from '../lib/services'
import { STATE_LABELS_PT } from '../lib/statusLabels'
import type { IncidentHistoryRow } from '../lib/database.types'

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

const isOpeningHistory = (fieldName: string) => ['Criação', 'Abertura', 'created'].includes(fieldName)

function entryConfig(h: IncidentHistoryRow) {
  if (isOpeningHistory(h.field_name)) {
    return { icon: <FilePlus2 className="w-3.5 h-3.5 text-emerald-500" />, title: 'Chamado Aberto', body: h.comment || 'Chamado registrado.', bg: 'bg-emerald-500/10 border-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300' }
  }
  if (h.field_name === 'comment') {
    return { icon: <MessageSquare className="w-3.5 h-3.5 text-sky-500" />, title: 'Comentário', body: h.comment || '—', bg: 'bg-sky-500/10 border-sky-500/25', text: 'text-sky-700 dark:text-sky-300' }
  }
  if (h.field_name === 'Início de Atendimento') {
    return { icon: <PlayCircle className="w-3.5 h-3.5 text-indigo-500" />, title: 'Atendimento Iniciado', body: h.comment || 'Um analista começou a atender este chamado.', bg: 'bg-indigo-500/10 border-indigo-500/25', text: 'text-indigo-700 dark:text-indigo-300' }
  }
  const label = h.field_name === 'state' ? 'Estado' : h.field_name
  const translate = (v: string | null) => h.field_name === 'state' && v ? (STATE_LABELS_PT[v] || v) : v
  return {
    icon: <Pencil className="w-3.5 h-3.5 text-slate-500" />,
    title: 'Alteração',
    body: (
      <span>
        <b>{label}</b>
        {h.old_value ? <> de <span className="line-through opacity-70">{translate(h.old_value)}</span></> : null}
        {' '}para <b>{translate(h.new_value)}</b>
        {h.comment ? <span className="block mt-1 opacity-80">{h.comment}</span> : null}
      </span>
    ),
    bg: 'bg-slate-500/10 border-slate-500/25',
    text: 'text-slate-700 dark:text-slate-300',
  }
}

export default function IncidentActionHistory({ incidentId, companyId }: { incidentId: string; companyId: string }) {
  const [rows, setRows] = useState<IncidentHistoryRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!incidentId || !companyId) return
    let active = true
    setLoading(true)
    incidentsService.listPublicHistory(incidentId, companyId)
      .then(res => { if (active) setRows(res) })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false) })

    const channel = incidentsService.subscribeToHistory(incidentId, companyId, (row) => {
      if (!row.is_public) return
      setRows(prev => prev.some(h => h.id === row.id) ? prev : [...prev, row].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    })
    return () => { active = false; channel.unsubscribe() }
  }, [incidentId, companyId])

  if (loading && rows.length === 0) {
    return (
      <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-on-surface-variant animate-pulse">
          <History className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Carregando histórico de ações...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-outline-variant rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant bg-surface-container/30 flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">Histórico de Ações</h3>
      </div>
      <div className="p-6">
        {rows.length === 0 ? (
          <p className="text-xs text-on-surface-variant italic text-center py-4">Sem ações registradas para este chamado ainda.</p>
        ) : (
          <div className="relative border-l border-outline-variant ml-3 pl-6 space-y-6">
            {rows.map(h => {
              const cfg = entryConfig(h)
              return (
                <div key={h.id} className="relative group">
                  <span className="absolute -left-[35px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface border border-outline-variant shadow-sm">
                    {cfg.icon}
                  </span>
                  <div className={`p-4 rounded-lg border ${cfg.bg} ${cfg.text}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider">{cfg.title}</span>
                      <span className="text-[10px] text-on-surface-variant opacity-75 font-mono">{fmt(h.created_at)}</span>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{cfg.body}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
