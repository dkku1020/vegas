// src/renderer/src/App.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from './App'

class FakeOscillator {
  type = 'sine'
  frequency = { value: 0 }
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  connect = vi.fn()
}

class FakeAudioContext {
  currentTime = 0
  destination = {}
  createOscillator(): FakeOscillator {
    return new FakeOscillator()
  }
  createGain(): FakeGain {
    return new FakeGain()
  }
}

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

  it('shows an empty state on the Analyze tab when no board has been sent yet', async () => {
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(screen.getByTestId('analyze-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('table')).not.toBeInTheDocument()
  })

  it('sends the current board to the Analyze tab when Analyze Big Road is clicked', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    mockElectronAPI(1000)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    expect(screen.queryByText('Analyze Big Road')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Deal'))
    await waitFor(() => expect(screen.getByText('Analyze Big Road')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Analyze Big Road'))

    expect(screen.getByTestId('analyze-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('analyze-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('table')).not.toBeInTheDocument()
  })

  it('keeps the Analyze tab snapshot frozen after playing another hand on the Play tab', async () => {
    // Force a deterministic, non-tie shoe so every hand produces a big-road cell.
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    vi.stubGlobal('AudioContext', FakeAudioContext)
    mockElectronAPI(1000)
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByTestId('table')).toBeInTheDocument())

    // Deal the first hand.
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Deal'))
    await waitFor(() => expect(screen.getByText('Next Hand')).toBeInTheDocument())

    // Return to the betting phase, then snapshot the board onto the Analyze tab.
    fireEvent.click(screen.getByText('Next Hand'))
    fireEvent.click(screen.getByText('Analyze Big Road'))

    expect(screen.getByTestId('analyze-panel')).toBeInTheDocument()
    // The Analyze tab only renders its big road once the analysis form is submitted.
    fireEvent.click(screen.getByText('Start Analysis'))
    const firstCellCount = container.querySelectorAll(
      '.big-road__cell--player, .big-road__cell--banker'
    ).length
    expect(firstCellCount).toBe(1)

    // Go back to Play and deal a second hand without ever re-triggering the snapshot.
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByTestId('table')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByTestId('bet-spot-player')).toHaveTextContent('$25'))
    fireEvent.click(screen.getByText('Deal'))
    await waitFor(() => expect(screen.getByText('Next Hand')).toBeInTheDocument())

    // Navigate to Analyze via the mode toggle only -- do NOT click "Analyze Big Road" again.
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))

    expect(screen.getByTestId('analyze-panel')).toBeInTheDocument()
    // The panel remounted, so its local analysis state is gone; submit the form again to reveal
    // the board -- this does not re-snapshot the history, it only re-renders what's already frozen.
    fireEvent.click(screen.getByText('Start Analysis'))
    const secondCellCount = container.querySelectorAll(
      '.big-road__cell--player, .big-road__cell--banker'
    ).length
    expect(secondCellCount).toBe(firstCellCount)
  })
})
