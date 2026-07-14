// src/renderer/src/App.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

  it('shows the rebuy dialog when the bankroll is below the table minimum', async () => {
    mockElectronAPI(3)
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

  it('places the big road in a full-width row above the stacked table and stats panel', async () => {
    mockElectronAPI(1000)
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    const layout = container.querySelector('.app__layout')
    expect(layout).not.toBeNull()

    const boardRow = layout!.querySelector('.app__board-row')
    const tableRow = layout!.querySelector('.app__table-row')
    expect(boardRow).not.toBeNull()
    expect(tableRow).not.toBeNull()

    expect(boardRow!.contains(screen.getByTestId('big-road'))).toBe(true)
    expect(tableRow!.contains(screen.getByTestId('table'))).toBe(true)
    expect(tableRow!.contains(screen.getByTestId('stats-panel'))).toBe(true)

    const layoutChildren = Array.from(layout!.children)
    expect(layoutChildren.indexOf(boardRow!)).toBeLessThan(layoutChildren.indexOf(tableRow!))
  })

  it('switches to simulate mode and back without losing the play-mode table', async () => {
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))
    expect(screen.getByTestId('simulate-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('table')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByTestId('table')).toBeInTheDocument()
    expect(screen.queryByTestId('simulate-panel')).not.toBeInTheDocument()
  })
})
