// src/renderer/src/App.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

function mockElectronAPI(bankroll: number): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadBankroll: vi.fn().mockResolvedValue(bankroll),
      saveBankroll: vi.fn().mockResolvedValue(undefined)
    },
    writable: true
  })
}

describe('App', () => {
  it('renders the table, big road, and stats panel', async () => {
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())
    expect(screen.getByTestId('big-road')).toBeInTheDocument()
    expect(screen.getByTestId('stats-panel')).toBeInTheDocument()
  })

  it('shows the rebuy dialog when the bankroll is zero', async () => {
    mockElectronAPI(0)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Rebuy' })).toBeInTheDocument()
    })
  })

  it('hides the rebuy dialog once funds are added', async () => {
    mockElectronAPI(0)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Rebuy' })).toBeInTheDocument()
    })
    screen.getByText('Reset to $1000').click()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rebuy' })).not.toBeInTheDocument()
    })
  })
})
