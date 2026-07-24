/**
 * sidebar-collapse.spec.ts
 *
 * Sidebar de navegação (AppNavigation.tsx) recolhível para modo ícone-apenas,
 * padrão de mercado (ServiceNow/JSM/Freshservice) para o usuário ganhar
 * espaço de tela. Preferência persiste em localStorage entre recargas.
 */
import { test, expect } from '@playwright/test'
import { setupMockAuth } from './helpers/mockAuth'

test.describe('Sidebar de navegação — recolher/expandir', () => {
  test('recolhe para ícone-apenas, expande de volta, e persiste após reload', async ({ page }) => {
    await setupMockAuth(page)
    await page.goto('/')

    const sidebar = page.getByTestId('app-sidebar')
    const toggle = page.getByTestId('sidebar-collapse-toggle')
    await expect(sidebar).toBeVisible({ timeout: 15_000 })

    const sidebarWidth = () => sidebar.evaluate(el => el.getBoundingClientRect().width)

    // Estado inicial: expandida, rótulos visíveis
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    await expect(sidebar.getByText('Incidentes')).toBeVisible()
    await expect.poll(sidebarWidth).toBeGreaterThan(200)

    // Recolhe (aguarda a transicao CSS de largura assentar antes de medir)
    await toggle.click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await expect(sidebar.getByText('Incidentes')).toHaveCount(0)
    await expect.poll(sidebarWidth, { timeout: 5_000 }).toBeLessThan(100)

    // Persiste entre reloads
    await page.reload()
    await expect(sidebar).toBeVisible({ timeout: 15_000 })
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await expect(sidebar.getByText('Incidentes')).toHaveCount(0)

    // Expande de volta
    await toggle.click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    await expect(sidebar.getByText('Incidentes')).toBeVisible()
  })
})
