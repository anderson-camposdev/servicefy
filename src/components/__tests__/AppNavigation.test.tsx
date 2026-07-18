import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AppNavigation, { type AppNavigationItem } from '../AppNavigation'

const items: AppNavigationItem[] = [
  { view: 'incidents', label: 'Incidentes', icon: <span aria-hidden="true">I</span>, group: 'operation' },
  { view: 'requests', label: 'Requisições', icon: <span aria-hidden="true">R</span>, group: 'operation' },
  { view: 'knowledge', label: 'Base de Conhecimento', icon: <span aria-hidden="true">K</span>, group: 'access' },
]

describe('AppNavigation', () => {
  it('exposes the active destination and tenant context accessibly', () => {
    render(
      <AppNavigation
        items={items}
        activeView="incidents"
        company={{ name: 'Acme Corp', domain: 'acme.com' }}
        onNavigate={() => undefined}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Incidentes' })[0]?.getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
  })

  it('opens the mobile navigation, selects a destination and closes it', () => {
    const onNavigate = vi.fn()
    render(
      <AppNavigation
        items={items}
        activeView="incidents"
        company={{ name: 'Acme Corp', domain: 'acme.com' }}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegação' }))
    expect(screen.getByRole('dialog', { name: 'Navegação' })).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Base de Conhecimento' }).at(-1)!)
    expect(onNavigate).toHaveBeenCalledWith('knowledge')
    expect(screen.queryByRole('dialog', { name: 'Navegação' })).toBeNull()
  })

  it('closes the mobile navigation with Escape', () => {
    render(
      <AppNavigation
        items={items}
        activeView="incidents"
        company={{ name: 'Acme Corp', domain: 'acme.com' }}
        onNavigate={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegação' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Navegação' })).toBeNull()
  })
})
