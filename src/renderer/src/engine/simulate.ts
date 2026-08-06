import type { Bets } from '@shared/types'
import { TABLE_MIN_BET, TABLE_MAX_BET } from '../state/gameReducer'
import { createShoe, isPastCutCard, type Shoe } from './shoe'
import { playHand } from './rules'
import { computeSettlement } from './payouts'
import type { Strategy, StrategyContext, SimHandRecord } from './strategy'
import { mulberry32 } from './rng'

export interface SimSessionResult {
  finalBankroll: number
  netProfit: number
  busted: boolean
  handsPlayed: number
  shoesCompleted: number
}

export interface SimulateSessionConfig {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  randomFn: () => number
  onSessionComplete?: (sessionHistory: SimHandRecord[]) => void
}

function validateBetShape(bets: Bets): void {
  for (const amount of [bets.player, bets.banker, bets.tie]) {
    if (amount < 0) {
      throw new Error(`Strategy returned a negative bet: ${amount}`)
    }
    if (amount > TABLE_MAX_BET) {
      throw new Error(
        `Strategy returned a bet of ${amount}, exceeding the table max of ${TABLE_MAX_BET}`
      )
    }
  }
}

export function simulateSession(config: SimulateSessionConfig): SimSessionResult {
  const { strategy, startingBankroll, shoesPerSession, randomFn, onSessionComplete } = config

  let bankroll = startingBankroll
  let shoe: Shoe = createShoe(randomFn)
  let shoeHistory: SimHandRecord[] = []
  const sessionHistory: SimHandRecord[] = []
  let shoesCompleted = 0
  let busted = false

  while (shoesCompleted < shoesPerSession) {
    if (bankroll < TABLE_MIN_BET) {
      busted = true
      break
    }

    const context: StrategyContext = { bankroll, shoeHistory, sessionHistory }
    const bets = strategy(context)
    validateBetShape(bets)

    const totalWagered = bets.player + bets.banker + bets.tie
    if (totalWagered > bankroll) {
      // The strategy's requested bet outgrew the bankroll (typical for a
      // fixed-size strategy on a losing streak) — this is a bust, not a
      // strategy bug, so the session ends here rather than throwing.
      busted = true
      break
    }
    bankroll -= totalWagered

    const result = playHand(shoe)
    shoe = result.shoe
    const settlement = computeSettlement(bets, result.outcome)
    bankroll += settlement.payouts.player + settlement.payouts.banker + settlement.payouts.tie

    const record: SimHandRecord = { bets, outcome: result.outcome, netChange: settlement.netChange }
    shoeHistory = [...shoeHistory, record]
    sessionHistory.push(record)

    if (isPastCutCard(shoe)) {
      shoe = createShoe(randomFn)
      shoeHistory = []
      shoesCompleted += 1
    }
  }

  // Catches the case where the final hand of the last requested shoe drops
  // the bankroll below the table minimum on the same iteration the shoe
  // count target is reached — the loop condition exits before the top-of-loop
  // bust check runs again, so it's re-checked once more here.
  if (bankroll < TABLE_MIN_BET) {
    busted = true
  }

  onSessionComplete?.(sessionHistory)

  return {
    finalBankroll: bankroll,
    netProfit: bankroll - startingBankroll,
    busted,
    handsPlayed: sessionHistory.length,
    shoesCompleted
  }
}

export interface SimulationSummary {
  trialCount: number
  avgNetProfit: number
  medianNetProfit: number
  bustRate: number
  bestNetProfit: number
  worstNetProfit: number
  avgHandsPlayed: number
}

export interface SimulationResult {
  trials: SimSessionResult[]
  summary: SimulationSummary
}

export interface RunSimulationConfig {
  strategy: Strategy
  startingBankroll: number
  shoesPerSession: number
  trials: number
  seed?: number
  onSessionComplete?: (sessionHistory: SimHandRecord[]) => void
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function runSimulation(config: RunSimulationConfig): SimulationResult {
  const { strategy, startingBankroll, shoesPerSession, trials, seed, onSessionComplete } = config

  if (trials < 1) {
    throw new Error(`runSimulation requires trials >= 1, got ${trials}`)
  }

  const baseSeed = seed ?? Math.floor(Math.random() * 2 ** 31)

  const trialResults: SimSessionResult[] = []
  for (let i = 0; i < trials; i++) {
    trialResults.push(
      simulateSession({
        strategy,
        startingBankroll,
        shoesPerSession,
        randomFn: mulberry32(baseSeed + i),
        onSessionComplete
      })
    )
  }

  const netProfits = trialResults.map((t) => t.netProfit)
  const bustedCount = trialResults.filter((t) => t.busted).length
  const handsPlayedTotal = trialResults.reduce((sum, t) => sum + t.handsPlayed, 0)

  const summary: SimulationSummary = {
    trialCount: trials,
    avgNetProfit: netProfits.reduce((a, b) => a + b, 0) / trials,
    medianNetProfit: median(netProfits),
    bustRate: bustedCount / trials,
    bestNetProfit: Math.max(...netProfits),
    worstNetProfit: Math.min(...netProfits),
    avgHandsPlayed: handsPlayedTotal / trials
  }

  return { trials: trialResults, summary }
}
