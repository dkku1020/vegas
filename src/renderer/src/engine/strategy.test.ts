import { describe, it, expect } from 'vitest'
import { flatBet, type StrategyContext } from './strategy'

const emptyContext: StrategyContext = { bankroll: 1000, shoeHistory: [], sessionHistory: [] }

describe('flatBet', () => {
  it('always bets the fixed amount on the configured spot', () => {
    const strategy = flatBet('banker', 25)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 25, tie: 0 })
  })

  it('bets zero on the other two spots', () => {
    const strategy = flatBet('tie', 5)
    const bets = strategy(emptyContext)
    expect(bets.player).toBe(0)
    expect(bets.banker).toBe(0)
    expect(bets.tie).toBe(5)
  })

  it('ignores bankroll and history', () => {
    const strategy = flatBet('player', 10)
    const context: StrategyContext = {
      bankroll: 5,
      shoeHistory: [
        { bets: { player: 10, banker: 0, tie: 0 }, outcome: 'banker', netChange: -10 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 10, banker: 0, tie: 0 })
  })
})
