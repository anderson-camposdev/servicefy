import { useState } from 'react'
import { CalendarClock, Gauge, PauseCircle } from 'lucide-react'
import SlaCalendarManager from './SlaCalendarManager'
import SlaPolicyManager from './SlaPolicyManager'
import PendingReasonManager from './PendingReasonManager'

type SlaTab = 'calendars' | 'policies' | 'pending_reasons'

const TABS: { key: SlaTab; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: 'calendars',       label: 'Calendários',         icon: <CalendarClock className="w-4 h-4" />, hint: 'Horários úteis, turnos e feriados por cliente' },
  { key: 'policies',        label: 'Políticas de SLA',    icon: <Gauge className="w-4 h-4" />,         hint: 'Tempos de resposta e solução por prioridade' },
  { key: 'pending_reasons', label: 'Motivos de Pendência', icon: <PauseCircle className="w-4 h-4" />,   hint: 'Motivos que pausam o relógio de SLA' },
]

export default function SlaSettings({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<SlaTab>('calendars')
  const active = TABS.find(t => t.key === tab)!

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Motor de SLA</h2>
        <p className="text-sm text-slate-500">Governança de prazos, calendários úteis e regras de pausa do tenant.</p>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 -mt-2">{active.hint}</p>

      {tab === 'calendars' && <SlaCalendarManager companyId={companyId} />}
      {tab === 'policies' && <SlaPolicyManager companyId={companyId} />}
      {tab === 'pending_reasons' && <PendingReasonManager companyId={companyId} />}
    </div>
  )
}
