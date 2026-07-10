import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, MailWarning } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface EmailDeliveryHistoryTableProps {
  companyId: string
}

const PAGE_SIZE = 10

type OutboxEventType = 'ticket_opened' | 'status_changed' | 'assignment_changed' | 'ticket_closed' | 'public_comment'
type OutboxStatus = 'pending' | 'processing' | 'sent' | 'dead_letter'
type DeliveryTransport = 'tenant_smtp' | 'global_smtp' | 'none'

interface OutboxRow {
  id: string
  created_at: string
  ticket_id: string
  event_type: OutboxEventType
  recipient_email: string
  status: OutboxStatus
  last_error: string | null
  tickets: { number: string } | null
}

interface DeliveryEventRow {
  outbox_id: string
  transport: DeliveryTransport
}

interface HistoryRow {
  id: string
  createdAt: string
  ticketNumber: string
  eventType: OutboxEventType
  recipientEmail: string
  status: OutboxStatus
  usedFallback: boolean
  errorBadge: string | null
}

const EVENT_LABELS: Record<OutboxEventType, string> = {
  ticket_opened: 'Abertura',
  status_changed: 'Atualização de status',
  assignment_changed: 'Atribuição',
  ticket_closed: 'Fechamento',
  public_comment: 'Comentário público',
}

const STATUS_STYLE: Record<OutboxStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pendente', bg: '#fef9c3', fg: '#a16207' },
  processing: { label: 'Processando', bg: '#dbeafe', fg: '#1d4ed8' },
  sent: { label: 'Enviado', bg: '#dcfce7', fg: '#15803d' },
  dead_letter: { label: 'Falhou', bg: '#fee2e2', fg: '#dc2626' },
}

// Traduz as mensagens técnicas emitidas pelo worker (dispatch-ticket-email-outbox)
// para algo legível ao administrador do tenant.
const ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/Autenticacao SMTP recusada/i, 'Conexão rejeitada pelo servidor do cliente'],
  [/Servidor SMTP indisponivel temporariamente/i, 'Servidor SMTP do cliente indisponível'],
  [/Falha de comunicacao com o servidor SMTP/i, 'Falha de comunicação com o servidor SMTP do cliente'],
  [/SMTP do tenant nao configurado/i, 'SMTP do cliente não configurado'],
  [/Provedor global de e-mail nao configurado/i, 'Canal de contingência não configurado'],
  [/Provedor global recusou a notificacao/i, 'Canal de contingência recusou o envio'],
  [/Provedor global indisponivel temporariamente/i, 'Canal de contingência indisponível'],
]

function humanizeError(lastError: string | null, status: OutboxStatus, usedFallback: boolean): string | null {
  if (!lastError && !usedFallback) return null
  const translated = lastError
    ? ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(lastError))?.[1] ?? lastError
    : null

  if (status === 'sent' && usedFallback) {
    return translated ? `${translated} — Enviado via contingência` : 'Enviado via contingência'
  }
  if (status === 'dead_letter') {
    return translated ? `${translated} — Falha definitiva` : 'Falha definitiva'
  }
  return translated
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function EmailDeliveryHistoryTable({ companyId }: EmailDeliveryHistoryTableProps) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data: outboxData, error: outboxError, count } = await supabase
        .from('ticket_email_outbox')
        .select('id,created_at,ticket_id,event_type,recipient_email,status,last_error,tickets(number)', { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (cancelled) return
      if (outboxError) {
        setError(outboxError.message)
        setLoading(false)
        return
      }

      const outboxRows = (outboxData ?? []) as unknown as OutboxRow[]
      const outboxIds = outboxRows.map(row => row.id)

      let fallbackOutboxIds = new Set<string>()
      if (outboxIds.length) {
        const { data: eventsData, error: eventsError } = await supabase
          .from('ticket_email_delivery_events')
          .select('outbox_id,transport')
          .eq('company_id', companyId)
          .eq('transport', 'global_smtp')
          .in('outbox_id', outboxIds)

        if (cancelled) return
        if (eventsError) {
          setError(eventsError.message)
          setLoading(false)
          return
        }
        const deliveryEvents = (eventsData ?? []) as unknown as DeliveryEventRow[]
        fallbackOutboxIds = new Set(deliveryEvents.map(event => event.outbox_id))
      }

      const nextRows: HistoryRow[] = outboxRows.map(row => {
        const usedFallback = fallbackOutboxIds.has(row.id)
        return {
          id: row.id,
          createdAt: row.created_at,
          ticketNumber: row.tickets?.number ?? row.ticket_id.slice(0, 8),
          eventType: row.event_type,
          recipientEmail: row.recipient_email,
          status: row.status,
          usedFallback,
          errorBadge: humanizeError(row.last_error, row.status, usedFallback),
        }
      })

      setRows(nextRows)
      setTotalCount(count ?? nextRows.length)
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [companyId, page])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-extrabold text-slate-900">Histórico de entrega de e-mails</h2>
        <p className="mt-1 text-sm text-slate-500">E-mails disparados por eventos de chamados e o resultado de cada tentativa de envio.</p>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico de entrega...
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <MailWarning className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nenhum e-mail disparado ainda para este tenant.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Data/Hora</th>
                <th className="py-2 pr-4">Ticket</th>
                <th className="py-2 pr-4">Evento</th>
                <th className="py-2 pr-4">Destinatário</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Fallback</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const statusStyle = STATUS_STYLE[row.status]
                return (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">{formatDateTime(row.createdAt)}</td>
                    <td className="py-3 pr-4 font-mono text-xs font-semibold text-slate-700">#{row.ticketNumber}</td>
                    <td className="py-3 pr-4 text-slate-700">{EVENT_LABELS[row.eventType] ?? row.eventType}</td>
                    <td className="py-3 pr-4 text-slate-700">{row.recipientEmail}</td>
                    <td className="py-3 pr-4">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-1.5">
                        {row.usedFallback && (
                          <span className="inline-flex w-fit items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                            Via contingência
                          </span>
                        )}
                        {row.errorBadge && (
                          <span className="inline-flex w-fit max-w-xs items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {row.errorBadge}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          <span className="text-slate-500">Página {page + 1} de {totalPages} · {totalCount} envio{totalCount !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Página anterior"
              onClick={() => setPage(current => Math.max(0, current - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </button>
            <button
              type="button"
              aria-label="Próxima página"
              onClick={() => setPage(current => Math.min(totalPages - 1, current + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40"
            >
              Próxima <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
