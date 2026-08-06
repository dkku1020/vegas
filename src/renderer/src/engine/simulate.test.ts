import { describe, it, expect } from 'vitest'
import { mulberry32 } from './rng'
import { flatBet } from './strategy'
import type { SimHandRecord } from './strategy'
import { simulateSession, runSimulation } from './simulate'
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

  it('busts, rather than throwing, when the strategy requests more than the bankroll can cover', () => {
    const strategy = () => ({ player: 200, banker: 0, tie: 0 })
    const result = simulateSession({
      strategy,
      startingBankroll: 100,
      shoesPerSession: 1,
      randomFn: mulberry32(1)
    })
    expect(result.busted).toBe(true)
    expect(result.finalBankroll).toBe(100)
    expect(result.handsPlayed).toBe(0)
  })

  it('busts a flat-bet strategy that can no longer afford its fixed bet, without throwing', () => {
    const result = simulateSession({
      strategy: flatBet('banker', 10),
      startingBankroll: 8,
      shoesPerSession: 1,
      randomFn: mulberry32(1)
    })
    expect(result.busted).toBe(true)
    expect(result.finalBankroll).toBe(8)
    expect(result.handsPlayed).toBe(0)
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

  it('calls onSessionComplete once with the full session history', () => {
    const histories: SimHandRecord[][] = []
    const result = simulateSession({
      strategy: flatBet('banker', 5),
      startingBankroll: 1000,
      shoesPerSession: 1,
      randomFn: mulberry32(1),
      onSessionComplete: (sessionHistory) => histories.push(sessionHistory)
    })
    expect(histories).toHaveLength(1)
    expect(histories[0]).toHaveLength(result.handsPlayed)
  })
})

describe('runSimulation', () => {
  it('runs the requested number of trials', () => {
    const result = runSimulation({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 5,
      seed: 1
    })
    expect(result.trials).toHaveLength(5)
    expect(result.summary.trialCount).toBe(5)
  })

  it('produces identical results for the same seed', () => {
    const config = {
      strategy: flatBet('banker', 10),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 3,
      seed: 123
    }
    const a = runSimulation(config)
    const b = runSimulation(config)
    expect(a).toEqual(b)
  })

  it('produces different results for different seeds', () => {
    const base = {
      strategy: flatBet('banker', 10),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 3
    }
    const a = runSimulation({ ...base, seed: 1 })
    const b = runSimulation({ ...base, seed: 2 })
    expect(a.trials).not.toEqual(b.trials)
  })

  it('computes a bust rate of 1 when every trial starts below the table minimum', () => {
    const result = runSimulation({
      strategy: flatBet('banker', 5),
      startingBankroll: TABLE_MIN_BET - 1,
      shoesPerSession: 1,
      trials: 4,
      seed: 1
    })
    expect(result.summary.bustRate).toBe(1)
  })

  it('computes zeroed profit stats when nothing is ever wagered', () => {
    const result = runSimulation({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 4,
      seed: 1
    })
    expect(result.summary.avgNetProfit).toBe(0)
    expect(result.summary.medianNetProfit).toBe(0)
    expect(result.summary.bestNetProfit).toBe(0)
    expect(result.summary.worstNetProfit).toBe(0)
    expect(result.summary.bustRate).toBe(0)
  })

  it('throws when trials is less than 1', () => {
    expect(() =>
      runSimulation({
        strategy: flatBet('banker', 0),
        startingBankroll: 1000,
        shoesPerSession: 1,
        trials: 0,
        seed: 1
      })
    ).toThrow()
  })

  it('calls onSessionComplete once per trial', () => {
    let callCount = 0
    runSimulation({
      strategy: flatBet('banker', 0),
      startingBankroll: 1000,
      shoesPerSession: 1,
      trials: 3,
      seed: 1,
      onSessionComplete: () => {
        callCount += 1
      }
    })
    expect(callCount).toBe(3)
  })
})
