import { STATE_LABELS_PT } from '../../lib/statusLabels'
import type { IncidentRow } from '../../lib/database.types'
import { getPortalTicketGuidance } from '../../lib/portal-ticket-guidance'

const STATE_STYLE: Record<string, { bg: string; fg: string }> = {
  'New':          { bg:'#eff6ff', fg:'#1d4ed8' },
  'In Progress':  { bg:'#ecfdf5', fg:'#059669' },
  'On Hold':      { bg:'#fef9c3', fg:'#a16207' },
  'Pending User': { bg:'#fff7ed', fg:'#c2410c' },
  'Resolved':     { bg:'#f0fdf4', fg:'#15803d' },
  'Closed':       { bg:'#f1f5f9', fg:'#475569' },
}

const PRIO_STYLE: Record<string, { bg: string; fg: string }> = {
  'P1 - Critical': { bg:'#fee2e2', fg:'#dc2626' },
  'P2 - High':     { bg:'#ffedd5', fg:'#ea580c' },
  'P3 - Moderate': { bg:'#fef9c3', fg:'#d97706' },
  'P4 - Low':      { bg:'#dbeafe', fg:'#2563eb' },
  'P5 - Planning': { bg:'#f1f5f9', fg:'#6b7280' },
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
}

interface UserTicketListProps {
  ticketsLoading: boolean
  tickets: IncidentRow[]
  brand: string
  isHistory: boolean
  onSelectTicket: (t: IncidentRow) => void
  onReportProblem: () => void
}

export function UserTicketList({
  ticketsLoading,
  tickets,
  brand,
  isHistory,
  onSelectTicket,
  onReportProblem,
}: UserTicketListProps) {
  if (ticketsLoading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, font:'500 14px sans-serif', color:'#94a3b8' }}>
        {isHistory ? 'Carregando histórico...' : 'Carregando chamados...'}
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, textAlign:'center' }}>
        <span style={{ fontSize:40 }}>{isHistory ? '📊' : '🎫'}</span>
        <div style={{ font:'600 16px sans-serif', color:'#0f172a' }}>
          {isHistory ? 'Nenhum chamado no histórico' : 'Nenhum chamado aberto'}
        </div>
        <div style={{ font:'400 13px sans-serif', color:'#94a3b8' }}>
          {isHistory ? 'Chamados resolvidos e fechados aparecerão aqui.' : 'Você não possui chamados ativos no momento.'}
        </div>
        {!isHistory && (
          <button onClick={onReportProblem}
            style={{ marginTop:8, padding:'10px 20px', background:brand, borderRadius:10, font:'600 14px sans-serif', color:'#fff', border:'none', cursor:'pointer' }}>
            Reportar problema
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ font:'700 11px sans-serif', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
        {tickets.length} chamado{tickets.length !== 1 ? 's' : ''} {isHistory ? 'no histórico' : 'ativo' + (tickets.length !== 1 ? 's' : '')}
      </div>
      {tickets.map(t => {
        const ss = STATE_STYLE[t.state] || { bg:'#f1f5f9', fg:'#475569' }
        const ps = PRIO_STYLE[t.priority || ''] || { bg:'#f1f5f9', fg:'#6b7280' }
        const guidance = getPortalTicketGuidance(t)
        return (
          <button key={t.id} onClick={() => onSelectTicket(t)}
            style={{
              display:'flex',
              flexDirection:'column',
              gap:10,
              padding:'16px 18px',
              background:'#fff',
              border:'1.5px solid #e2e8f0',
              borderRadius:14,
              textAlign:'left',
              boxShadow:'0 1px 2px rgba(15,23,42,.04)',
              cursor:'pointer',
              transition:'box-shadow .15s',
              opacity: isHistory ? 0.85 : 1,
            }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span style={{ font:'700 12px monospace', color: isHistory ? '#64748b' : brand }}>{t.number}</span>
              <span style={{ font:'600 11px sans-serif', padding:'2px 9px', borderRadius:99, background:ss.bg, color:ss.fg }}>
                {STATE_LABELS_PT[t.state] || t.state}
              </span>
              <span style={{ font:'600 11px sans-serif', padding:'2px 9px', borderRadius:99, background:ps.bg, color:ps.fg, marginLeft:'auto' }}>
                {t.priority}
              </span>
            </div>
            <div style={{ font:'600 15px sans-serif', color: isHistory ? '#334155' : '#0f172a' }}>{t.short_description}</div>
            <div style={{
              display:'flex',
              gap:9,
              alignItems:'flex-start',
              padding:'10px 12px',
              borderRadius:10,
              background: guidance.requiresUserAction ? '#fff7ed' : '#f8fafc',
              border: `1px solid ${guidance.requiresUserAction ? '#fed7aa' : '#e2e8f0'}`,
            }}>
              <span aria-hidden="true" style={{ color: guidance.requiresUserAction ? '#c2410c' : brand, lineHeight:1.2 }}>
                {guidance.requiresUserAction ? '●' : '→'}
              </span>
              <div style={{ minWidth:0 }}>
                <div style={{ font:'700 12px sans-serif', color: guidance.requiresUserAction ? '#9a3412' : '#334155', marginBottom:2 }}>
                  {guidance.title}
                </div>
                <div style={{ font:'400 12px/1.45 sans-serif', color:'#64748b' }}>
                  {guidance.description}
                </div>
              </div>
            </div>
            <div style={{ font:'400 12px sans-serif', color:'#94a3b8' }}>
              {t.ticket_type === 'incident' ? 'Incidente' : 'Requisição'} · {isHistory ? 'Atualizado' : 'Aberto'} em {fmtDate(isHistory ? t.updated_at : t.created_at)}
              {!isHistory && t.sla_breached && <span style={{ marginLeft:10, color:'#dc2626', fontWeight:700 }}>⚠ SLA vencido</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
