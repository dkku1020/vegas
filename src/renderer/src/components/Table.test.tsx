// src/renderer/src/components/Table.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { GameProvider } from '../state/GameContext'
import { Table } from './Table'

// jsdom does not implement the Web Audio API. Table calls playChipSound/playDealSound
// on every bet/deal, so stub a minimal AudioContext (same pattern as soundManager.test.ts)
// to keep those calls from throwing during the click handlers under test.
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

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext)
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadBankroll: vi.fn().mockResolvedValue(1000),
      saveBankroll: vi.fn().mockResolvedValue(undefined)
    },
    writable: true
  })
})

async function renderTable() {
  render(
    <GameProvider>
      <Table />
    </GameProvider>
  )
  await waitFor(() => expect(screen.getByText('Bankroll: $1000.00')).toBeInTheDocument())
}

describe('Table', () => {
  it('places a bet on the clicked spot with the selected chip value', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
  })

  it('disables Deal until the table minimum is met', async () => {
    await renderTable()
    expect(screen.getByText('Deal')).toBeDisabled()
    fireEvent.click(screen.getByTestId('chip-5'))
    fireEvent.click(screen.getByTestId('bet-spot-banker'))
    await waitFor(() => expect(screen.getByText('Deal')).not.toBeDisabled())
  })

  it('clears all bets and refunds the bankroll', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Clear'))
    await waitFor(() => expect(screen.getByText('Bankroll: $1000.00')).toBeInTheDocument())
  })

  it('stops accepting chips on a spot once the $500 table max is reached', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-500'))
    fireEvent.click(screen.getByTestId('bet-spot-player')) // spot now at $500
    await waitFor(() => expect(screen.getByText('Bankroll: $500.00')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('bet-spot-player')) // should be rejected, spot already at max
    await waitFor(() => expect(screen.getByText('Bankroll: $500.00')).toBeInTheDocument())
  })

  it('renders the tie spot between player and banker', async () => {
    await renderTable()
    const spots = screen.getAllByTestId(/^bet-spot-/)
    expect(spots.map((el) => el.dataset.testid)).toEqual([
      'bet-spot-player',
      'bet-spot-tie',
      'bet-spot-banker'
    ])
  })

  it('plays a Free Hand without wagering, refunding any placed bets', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Free Hand'))
    await waitFor(() => expect(screen.getByText('Bankroll: $1000.00')).toBeInTheDocument())
    expect(screen.getByText('Next Hand')).toBeInTheDocument()
  })

  it('disables Rebet until a real bet has been wagered', async () => {
    await renderTable()
    expect(screen.getByText('Rebet')).toBeDisabled()
  })

  it('Rebet re-places the previous bet after Next Hand', async () => {
    await renderTable()
    fireEvent.click(screen.getByTestId('chip-25'))
    fireEvent.click(screen.getByTestId('bet-spot-player'))
    await waitFor(() => expect(screen.getByText('Bankroll: $975.00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Deal'))
    await waitFor(() => expect(screen.getByText('Next Hand')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Next Hand'))
    await waitFor(() => expect(screen.getByText('Rebet')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Rebet'))
    await waitFor(() => expect(screen.getByTestId('bet-spot-player')).toHaveTextContent('$25'))
  })
})
