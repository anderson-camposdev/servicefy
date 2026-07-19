import type { ReactNode } from 'react'
import { ArrowLeft, Building2 } from 'lucide-react'

interface SettingsPageShellProps {
  title: string
  description: string
  scopeLabel: string
  onBack: () => void
  children: ReactNode
  actions?: ReactNode
  status?: ReactNode
}

export default function SettingsPageShell({
  title,
  description,
  scopeLabel,
  onBack,
  children,
  actions,
  status,
}: SettingsPageShellProps) {
  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Central de Configurações
        </button>

        <header className="mt-4 border-b border-slate-200 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  <Building2 className="h-3.5 w-3.5" />
                  {scopeLabel}
                </span>
                {status}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="pt-6">{children}</main>
      </div>
    </div>
  )
}
