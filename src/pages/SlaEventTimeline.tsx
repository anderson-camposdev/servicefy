import { useEffect, useState } from 'react'
import {
  Timer, CheckCircle2, Clock, Pause, Play, AlertTriangle, History, RotateCcw
} from 'lucide-react'
import { slaEventsService } from '../lib/services'
import type { SlaEventRow } from '../lib/database.types'

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

export default function SlaEventTimeline({ incidentId }: { incidentId: string }) {
  const [events, setEvents] = useState<SlaEventRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!incidentId) return
    let active = true
    setLoading(true)
    slaEventsService.list(incidentId)
      .then(res => {
        if (active) setEvents(res)
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false)
      })

    const channel = slaEventsService.subscribeToIncident(incidentId, (newEvent) => {
      setEvents(prev => {
        if (prev.some(e => e.id === newEvent.id)) return prev
        return [...prev, newEvent].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      })
    })

    return () => {
      active = false
      channel.unsubscribe()
    }
  }, [incidentId])

  const getEventConfig = (type: SlaEventRow['event_type'], metadata: any) => {
    switch (type) {
      case 'response_start':
        return {
          icon: <Timer className="w-3.5 h-3.5 text-slate-500" />,
          title: 'SLA de Resposta Iniciado',
          description: `Cronômetro de resposta ativado. Prazo limite projetado: ${metadata.deadline ? fmt(metadata.deadline) : '—'}.`,
          bgColor: 'bg-slate-500/10 border-slate-500/25',
          textColor: 'text-slate-700 dark:text-slate-300'
        }
      case 'response_achieved': {
        // `breached` só existe em eventos gravados após a migration 091 — para
        // eventos antigos (metadata sem esse campo), mantemos o texto neutro
        // em vez de arriscar rotular errado um evento histórico incompleto.
        const breached = metadata?.breached
        const cumprido = breached === false
        const estourado = breached === true
        return {
          icon: estourado
            ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
          title: estourado ? 'SLA de Resposta Cumprido — Fora do Prazo' : 'SLA de Resposta Cumprido',
          description: `Primeira resposta do analista registrada em ${metadata.at ? fmt(metadata.at) : '—'}`
            + (cumprido ? ' — dentro do prazo. ✅' : estourado ? ' — o prazo já havia sido ultrapassado. ⚠️' : '.'),
          bgColor: estourado ? 'bg-rose-500/10 border-rose-500/25' : 'bg-emerald-500/10 border-emerald-500/25',
          textColor: estourado ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
        }
      }
      case 'resolution_start':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-indigo-500" />,
          title: 'SLA de Solução Iniciado',
          description: `Cronômetro de solução ativado para Prioridade P${metadata.priority_level ?? '—'}. Prazo limite projetado: ${metadata.deadline ? fmt(metadata.deadline) : '—'}.`,
          bgColor: 'bg-indigo-500/10 border-indigo-500/25',
          textColor: 'text-indigo-700 dark:text-indigo-300'
        }
      case 'resolution_achieved': {
        const breached = metadata?.breached
        const cumprido = breached === false
        const estourado = breached === true
        return {
          icon: estourado
            ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
          title: estourado ? 'SLA de Solução Cumprido — Fora do Prazo' : 'SLA de Solução Cumprido',
          description: `Chamado resolvido em ${metadata.at ? fmt(metadata.at) : '—'}`
            + (cumprido ? ' — dentro do prazo. ✅' : estourado ? ' — o prazo já havia sido ultrapassado. ⚠️' : '.'),
          bgColor: estourado ? 'bg-rose-500/10 border-rose-500/25' : 'bg-emerald-500/10 border-emerald-500/25',
          textColor: estourado ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
        }
      }
      case 'paused':
        return {
          icon: <Pause className="w-3.5 h-3.5 text-amber-500" />,
          title: 'SLA Pausado',
          description: `Chamado colocado em pendência (${metadata.state ?? 'On Hold'}). Motivo: ${metadata.pending_reason ?? 'Ação externa/cliente'}.`,
          bgColor: 'bg-amber-500/10 border-amber-500/25',
          textColor: 'text-amber-700 dark:text-amber-300'
        }
      case 'resumed':
        return {
          icon: <Play className="w-3.5 h-3.5 text-emerald-500" />,
          title: 'SLA Retomado',
          description: `Cronômetro reativado. Tempo pausado acumulado: ${metadata.accumulated_paused_minutes ?? 0} min. Novo prazo de solução: ${metadata.resolution_deadline ? fmt(metadata.resolution_deadline) : '—'}.`,
          bgColor: 'bg-emerald-500/10 border-emerald-500/25',
          textColor: 'text-emerald-700 dark:text-emerald-300'
        }
      case 'breached':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />,
          title: 'SLA Violado / Estourado',
          description: `O limite de tempo para ${metadata.kind === 'response' ? 'resposta inicial' : 'solução final'} foi ultrapassado!`,
          bgColor: 'bg-rose-500/10 border-rose-500/25',
          textColor: 'text-rose-700 dark:text-rose-300'
        }
      case 'reopened':
        return {
          icon: <RotateCcw className="w-3.5 h-3.5 text-orange-500" />,
          title: 'Chamado Reaberto',
          description: `Reaberto de "${metadata.from_state ?? '—'}" para "${metadata.to_state ?? '—'}". Tempo fechado (${metadata.elapsed_minutes ?? 0} min úteis) somado ao prazo. Novo prazo de solução: ${metadata.resolution_deadline ? fmt(metadata.resolution_deadline) : '—'}.`,
          bgColor: 'bg-orange-500/10 border-orange-500/25',
          textColor: 'text-orange-700 dark:text-orange-300'
        }
      default:
        return {
          icon: <History className="w-3.5 h-3.5 text-slate-500" />,
          title: 'Evento do Chamado',
          description: 'Alteração registrada no chamado.',
          bgColor: 'bg-slate-500/10 border-slate-500/25',
          textColor: 'text-slate-700 dark:text-slate-300'
        }
    }
  }

  if (loading && events.length === 0) {
    return (
      <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-on-surface-variant animate-pulse">
          <History className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Carregando controle de SLA...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-outline-variant rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant bg-surface-container/30 flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">Controle de SLA</h3>
      </div>
      <div className="p-6">
        {events.length === 0 ? (
          <p className="text-xs text-on-surface-variant italic text-center py-4">Sem eventos de SLA registrados para este chamado.</p>
        ) : (
          <div className="relative border-l border-outline-variant ml-3 pl-6 space-y-6">
            {events.map((e) => {
              const config = getEventConfig(e.event_type, e.metadata)
              return (
                <div key={e.id} className="relative group">
                  {/* Marcador na linha do tempo */}
                  <span className="absolute -left-[35px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface border border-outline-variant shadow-sm">
                    {config.icon}
                  </span>
                  
                  {/* Bloco de Conteúdo */}
                  <div className={`p-4 rounded-lg border ${config.bgColor} ${config.textColor}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider">{config.title}</span>
                      <span className="text-[10px] text-on-surface-variant opacity-75 font-mono">{fmt(e.created_at)}</span>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{config.description}</p>
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
