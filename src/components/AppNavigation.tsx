import { useEffect, useState, type ReactNode } from 'react'
import { Menu, X } from 'lucide-react'

export interface AppNavigationItem {
  view: string
  label: string
  icon: ReactNode
  group: 'operation' | 'access'
}

interface AppNavigationProps {
  items: AppNavigationItem[]
  activeView: string
  company: {
    name: string
    domain?: string
    logoUrl?: string
  }
  onNavigate: (view: string) => void
}

function DestinationList({
  items,
  activeView,
  onNavigate,
}: Pick<AppNavigationProps, 'items' | 'activeView' | 'onNavigate'>) {
  return (
    <div className="space-y-1">
      {items.map(item => {
        const active = activeView === item.view
        return (
          <button
            key={item.view}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate(item.view)}
            className={[
              'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold',
              'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              active
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            ].join(' ')}
          >
            <span className={active ? 'text-primary' : 'text-on-surface-variant'}>{item.icon}</span>
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function TenantContext({ company }: Pick<AppNavigationProps, 'company'>) {
  return (
    <div className="rounded-xl bg-surface-container p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface font-bold text-primary">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            company.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-on-surface">{company.name}</div>
          {company.domain && <div className="truncate text-xs text-on-surface-variant">{company.domain}</div>}
        </div>
      </div>
    </div>
  )
}

export default function AppNavigation({ items, activeView, company, onNavigate }: AppNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const operationItems = items.filter(item => item.group === 'operation')
  const accessItems = items.filter(item => item.group === 'access')
  const primaryMobileItems = operationItems.slice(0, 3)

  useEffect(() => {
    if (!mobileOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])

  const navigate = (view: string) => {
    onNavigate(view)
    setMobileOpen(false)
  }

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-outline-variant bg-surface px-3 py-4 lg:flex">
        <nav aria-label="Navegação principal" className="flex min-h-0 flex-1 flex-col">
          <DestinationList items={operationItems} activeView={activeView} onNavigate={navigate} />
          {accessItems.length > 0 && (
            <div className="mt-5 border-t border-outline-variant pt-5">
              <p className="mb-2 px-3 text-xs font-semibold text-on-surface-variant">Outras áreas</p>
              <DestinationList items={accessItems} activeView={activeView} onNavigate={navigate} />
            </div>
          )}
          <div className="mt-auto pt-5">
            <TenantContext company={company} />
          </div>
        </nav>
      </aside>

      <nav
        aria-label="Navegação móvel"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-outline-variant bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      >
        {primaryMobileItems.map(item => {
          const active = activeView === item.view
          return (
            <button
              key={item.view}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.view)}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold ${
                active ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              {item.icon}
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          aria-label="Abrir navegação"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold text-on-surface-variant"
        >
          <Menu className="h-5 w-5" />
          <span>Menu</span>
        </button>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar navegação"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navegação"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,22rem)] flex-col bg-surface p-4 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-on-surface">ServiceFY</p>
                <p className="text-xs text-on-surface-variant">Escolha uma área de trabalho</p>
              </div>
              <button
                type="button"
                aria-label="Fechar navegação"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DestinationList items={operationItems} activeView={activeView} onNavigate={navigate} />
              {accessItems.length > 0 && (
                <div className="mt-5 border-t border-outline-variant pt-5">
                  <p className="mb-2 px-3 text-xs font-semibold text-on-surface-variant">Outras áreas</p>
                  <DestinationList items={accessItems} activeView={activeView} onNavigate={navigate} />
                </div>
              )}
            </div>
            <div className="pt-4">
              <TenantContext company={company} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
