import { describe, it, expect } from 'vitest'
import { flatBet, labouchere, computePeakSequenceNumber, type StrategyContext } from './strategy'
import type { SimHandRecord } from './strategy'
import { TABLE_MAX_BET } from '../state/gameReducer'

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

describe('labouchere', () => {
  it('bets (first + last) * unit on the configured spot', () => {
    const strategy = labouchere('banker', [1, 2, 3, 4], 5)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 25, tie: 0 })
  })

  it('bets the single remaining number * unit when only one number is left', () => {
    const strategy = labouchere('player', [7], 10)
    expect(strategy(emptyContext)).toEqual({ player: 70, banker: 0, tie: 0 })
  })

  it('crosses off the first and last numbers after a win', () => {
    const strategy = labouchere('banker', [1, 2, 3, 6], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 35, tie: 0 }, outcome: 'banker', netChange: 33.25 }
      ]
    }
    expect(strategy(context).banker).toBe(25)
  })

  it('appends the staked units to the sequence after a loss', () => {
    const strategy = labouchere('banker', [1, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'player', netChange: -25 }
      ]
    }
    expect(strategy(context).banker).toBe(30)
  })

  it('leaves the sequence unchanged after a push', () => {
    const strategy = labouchere('banker', [1, 2, 3, 6], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 35, tie: 0 }, outcome: 'tie', netChange: 0 }
      ]
    }
    expect(strategy(context).banker).toBe(35)
  })

  it('resets to the initial sequence after being fully crossed off', () => {
    const strategy = labouchere('banker', [3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 0, banker: 35, tie: 0 }, outcome: 'banker', netChange: 33.25 }
      ]
    }
    expect(strategy(context).banker).toBe(35)
  })

  it('ignores history hands where this spot was not wagered on', () => {
    const strategy = labouchere('banker', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 10, banker: 0, tie: 0 }, outcome: 'player', netChange: 10 }
      ]
    }
    expect(strategy(context).banker).toBe(25)
  })

  it('clamps the bet to the table max', () => {
    const strategy = labouchere('banker', [TABLE_MAX_BET + 1], 1)
    expect(strategy(emptyContext).banker).toBe(TABLE_MAX_BET)
  })

  it('throws when spot is tie', () => {
    expect(() => labouchere('tie', [1, 2], 5)).toThrow()
  })

  it('follow bets the same side as the previous decisive winner', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 }
      ],
      sessionHistory: []
    }
    const bets = strategy(context)
    expect(bets.player).toBe(25)
    expect(bets.banker).toBe(0)
  })

  it('counter bets the opposite side of the previous decisive winner', () => {
    const strategy = labouchere('counter', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 }
      ],
      sessionHistory: []
    }
    const bets = strategy(context)
    expect(bets.player).toBe(25)
    expect(bets.banker).toBe(0)
  })

  it('places no bet on the first hand of a shoe for follow', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('places no bet on the first hand of a shoe for counter', () => {
    const strategy = labouchere('counter', [1, 2, 3, 4], 5)
    expect(strategy(emptyContext)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('places no bet when only ties have occurred so far this shoe', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('skips a tie mid-streak and keeps following the last decisive hand', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 },
        { bets: { player: 0, banker: 25, tie: 0 }, outcome: 'tie', netChange: 0 }
      ],
      sessionHistory: []
    }
    const bets = strategy(context)
    expect(bets.banker).toBe(25)
    expect(bets.player).toBe(0)
  })

  it('resets to no bet at the start of a new shoe even with prior session history', () => {
    const strategy = labouchere('follow', [1, 2, 3, 4], 5)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'player', netChange: 25 }
      ]
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('throws when the sequence is empty', () => {
    expect(() => labouchere('banker', [], 5)).toThrow()
  })

  it('throws when the sequence contains a non-positive number', () => {
    expect(() => labouchere('banker', [1, 0, 2], 5)).toThrow()
  })

  it('throws when unit is not positive', () => {
    expect(() => labouchere('banker', [1, 2], 0)).toThrow()
  })

  it('skips the bet after N consecutive losses on a fixed spot', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('keeps betting while the loss streak is below the skip-after threshold', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 3)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context).player).toBeGreaterThan(0)
  })

  it('does not count ties toward the skip-after loss streak', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('keeps sitting out through a tie while the loss streak is active', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'tie', netChange: 0 }
      ],
      sessionHistory: []
    }
    expect(strategy(context)).toEqual({ player: 0, banker: 0, tie: 0 })
  })

  it('resumes betting the hand after the spot wins outright', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'player', netChange: 0 }
      ],
      sessionHistory: []
    }
    expect(strategy(context).player).toBeGreaterThan(0)
  })

  it('resets the loss streak at the start of a new shoe', () => {
    const strategy = labouchere('player', [1, 2, 3, 4], 5, 2)
    const context: StrategyContext = {
      bankroll: 1000,
      shoeHistory: [],
      sessionHistory: [
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
        { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
      ]
    }
    expect(strategy(context).player).toBeGreaterThan(0)
  })

  it('throws when skip-after is combined with a follow spot', () => {
    expect(() => labouchere('follow', [1, 2], 5, 2)).toThrow()
  })

  it('throws when skip-after is combined with a counter spot', () => {
    expect(() => labouchere('counter', [1, 2], 5, 2)).toThrow()
  })

  it('throws when skip-after is zero', () => {
    expect(() => labouchere('player', [1, 2], 5, 0)).toThrow()
  })

  it('throws when skip-after is negative', () => {
    expect(() => labouchere('player', [1, 2], 5, -1)).toThrow()
  })

  it('throws when skip-after is not an integer', () => {
    expect(() => labouchere('player', [1, 2], 5, 1.5)).toThrow()
  })
})

describe('computePeakSequenceNumber', () => {
  it('returns the starting sequence max when there is no history', () => {
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, [])).toBe(4)
  })

  it('tracks a new peak after a loss appends a larger number', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 }
    ]
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, history)).toBe(5)
  })

  it('keeps the peak after a later win removes the number that set it', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
      { bets: { player: 30, banker: 0, tie: 0 }, outcome: 'player', netChange: 28.5 }
    ]
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, history)).toBe(5)
  })

  it('keeps tracking the peak correctly after the sequence resets to a new line', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 35, banker: 0, tie: 0 }, outcome: 'player', netChange: 33.25 },
      { bets: { player: 35, banker: 0, tie: 0 }, outcome: 'banker', netChange: -35 }
    ]
    expect(computePeakSequenceNumber([3, 4], 5, history)).toBe(7)
  })

  it('is unaffected by a zero-wager hand from a Skip Bet After sit-out', () => {
    const history: SimHandRecord[] = [
      { bets: { player: 25, banker: 0, tie: 0 }, outcome: 'banker', netChange: -25 },
      { bets: { player: 0, banker: 0, tie: 0 }, outcome: 'banker', netChange: 0 }
    ]
    expect(computePeakSequenceNumber([1, 2, 3, 4], 5, history)).toBe(5)
  })
})
