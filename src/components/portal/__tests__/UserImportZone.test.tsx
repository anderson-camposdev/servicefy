import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UserImportZone } from '../UserImportZone'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/services', () => ({
  profilesService: {
    batchInvite: vi.fn(),
  },
}))

describe('UserImportZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders correctly', () => {
    render(<UserImportZone companyId="test-co" tenantDomain="test.local" />)
    expect(screen.getByText(/Arraste um arquivo CSV ou clique/i)).toBeTruthy()
  })

  it('validates and parses a valid CSV file', async () => {
    render(<UserImportZone companyId="test-co" tenantDomain="test.local" />)
    
    const file = new File([
      'email,name,role\n' +
      'user1@test.local,User One,agent\n' +
      'user2@test.local,User Two,sysadmin'
    ], 'users.csv', { type: 'text/csv' })

    const input = screen.getByTestId('file-upload') as HTMLInputElement // We need to add test id to input
    Object.defineProperty(input, 'files', {
      value: [file]
    })
    fireEvent.change(input)

    await waitFor(() => {
      expect(screen.getByText('User One')).toBeTruthy()
      expect(screen.getByText('User Two')).toBeTruthy()
      expect(screen.getByText('2 válidos')).toBeTruthy()
    })
  })
})
