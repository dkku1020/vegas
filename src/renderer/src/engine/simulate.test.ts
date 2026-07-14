import { describe, it, expect } from 'vitest'
import { mulberry32 } from './rng'
import { flatBet } from './strategy'
import { simulateSession } from './simulate'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'

describe('simulateSession', () => {
  it('completes the requested number of shoes when nothing is ever wagered', () => {
    const result = simulateSession({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 2,
      randomFn: mulberry32(1)
    })
    expect(result.shoesCompleted).toBe(2)
    expect(result.busted).toBe(false)
    expect(result.netProfit).toBe(0)
    expect(result.finalBankroll).toBe(1000)
    expect(result.handsPlayed).toBeGreaterThan(0)
  })

  it('stops immediately, without playing a hand, when starting bankroll is already below the table minimum', () => {
    const result = simulateSession({
      strategy: flatBet('banker', 5),
      startingBankroll: TABLE_MIN_BET - 1,
      shoesPerSession: 1,
      randomFn: mulberry32(1)
    })
    expect(result.busted).toBe(true)
    expect(result.handsPlayed).toBe(0)
    expect(result.shoesCompleted).toBe(0)
    expect(result.finalBankroll).toBe(TABLE_MIN_BET - 1)
    expect(result.netProfit).toBe(0)
  })

  it('throws when the strategy returns a negative bet', () => {
    const strategy = () => ({ player: -5, banker: 0, tie: 0 })
    expect(() =>
      simulateSession({
        strategy,
        startingBankroll: 1000,
        shoesPerSession: 1,
        randomFn: mulberry32(1)
      })
    ).toThrow()
  })

  it('throws when the strategy returns a bet exceeding the table max for a spot', () => {
    const strategy = () => ({ player: TABLE_MAX_BET + 1, banker: 0, tie: 0 })
    expect(() =>
      simulateSession({
        strategy,
        startingBankroll: 1_000_000,
        shoesPerSession: 1,
        randomFn: mulberry32(1)
      })
    ).toThrow()
  })

  it('throws when the strategy returns a total bet exceeding the bankroll', () => {
    const strategy = () => ({ player: 200, banker: 0, tie: 0 })
    expect(() =>
      simulateSession({
        strategy,
        startingBankroll: 100,
        shoesPerSession: 1,
        randomFn: mulberry32(1)
      })
    ).toThrow()
  })

  it('plays more hands as shoesPerSession increases, given the same seed', () => {
    const baseConfig = {
      strategy: flatBet('banker', 5),
      startingBankroll: 100_000
    }
    const oneShoe = simulateSession({ ...baseConfig, shoesPerSession: 1, randomFn: mulberry32(99) })
    const twoShoes = simulateSession({ ...baseConfig, shoesPerSession: 2, randomFn: mulberry32(99) })
    expect(oneShoe.shoesCompleted).toBe(1)
    expect(twoShoes.shoesCompleted).toBe(2)
    expect(twoShoes.handsPlayed).toBeGreaterThan(oneShoe.handsPlayed)
  })
})
