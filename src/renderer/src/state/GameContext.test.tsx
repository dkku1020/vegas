// src/renderer/src/state/GameContext.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
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

  it('throws if useGame is called outside a GameProvider', () => {
    function Broken() {
      useGame()
      return null
    }
    expect(() => render(<Broken />)).toThrow('useGame must be used within a GameProvider')
  })
})
