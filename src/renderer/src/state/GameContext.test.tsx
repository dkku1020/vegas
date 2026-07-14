// src/renderer/src/state/GameContext.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GameProvider, useGame } from './GameContext'

function TestConsumer() {
  const { state, dispatch } = useGame()
  return (
    <div>
      <span data-testid="bankroll">{state.bankroll}</span>
      <button onClick={() => dispatch({ type: 'PLACE_BET', spot: 'player', amount: 25 })}>
        bet
      </button>
    </div>
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadBankroll: vi.fn().mockResolvedValue(750),
      saveBankroll: vi.fn().mockResolvedValue(undefined)
    },
    writable: true
  })
})

describe('GameProvider', () => {
  it('loads the persisted bankroll on mount', async () => {
    render(
      <GameProvider>
        <TestConsumer />
      </GameProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('bankroll')).toHaveTextContent('750')
    })
  })

  it('dispatches actions through the reducer', async () => {
    render(
      <GameProvider>
        <TestConsumer />
      </GameProvider>
    )
    await waitFor(() => expect(screen.getByTestId('bankroll')).toHaveTextContent('750'))
    screen.getByText('bet').click()
    await waitFor(() => expect(screen.getByTestId('bankroll')).toHaveTextContent('725'))
  })

  it('does not save the bankroll before the initial load resolves', async () => {
    let resolveLoad: (value: number) => void
    const loadPromise = new Promise<number>((resolve) => {
      resolveLoad = resolve
    })
    const saveBankroll = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'electronAPI', {
      value: {
        loadBankroll: vi.fn().mockReturnValue(loadPromise),
        saveBankroll
      },
      writable: true
    })

    render(
      <GameProvider>
        <TestConsumer />
      </GameProvider>
    )

    // Give any pre-load effects a chance to run.
    await Promise.resolve()
    expect(saveBankroll).not.toHaveBeenCalled()

    resolveLoad!(250)
    await waitFor(() => expect(screen.getByTestId('bankroll')).toHaveTextContent('250'))
    expect(saveBankroll).toHaveBeenCalledWith(250)
    expect(saveBankroll).not.toHaveBeenCalledWith(1000)
  })

  it('throws if useGame is called outside a GameProvider', () => {
    function Broken() {
      useGame()
      return null
    }
    expect(() => render(<Broken />)).toThrow('useGame must be used within a GameProvider')
  })
})
