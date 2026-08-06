import type { Bets, BetSpot, Outcome } from '@shared/types'
import { TABLE_MAX_BET } from '../state/gameReducer'

export interface SimHandRecord {
  bets: Bets
  outcome: Outcome
  netChange: number
}

export interface StrategyContext {
  bankroll: number
  shoeHistory: SimHandRecord[]
  sessionHistory: SimHandRecord[]
}

export type Strategy = (context: StrategyContext) => Bets

export type LabouchereSpotMode = BetSpot | 'follow' | 'counter'

export function flatBet(spot: BetSpot, amount: number): Strategy {
  return () => {
    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    bets[spot] = amount
    return bets
  }
}

export function deriveLabouchereSequence(
  initialSequence: number[],
  unit: number,
  history: SimHandRecord[]
): number[] {
  let sequence = initialSequence
  for (const record of history) {
    const wager = record.bets.player + record.bets.banker
    if (wager <= 0) continue
    if (sequence.length === 0) {
      sequence = initialSequence
    }
    if (record.netChange > 0) {
      sequence = sequence.length <= 2 ? [] : sequence.slice(1, -1)
    } else if (record.netChange < 0) {
      sequence = [...sequence, wager / unit]
    }
  }
  return sequence
}

function resolveDynamicSpot(
  mode: 'follow' | 'counter',
  shoeHistory: SimHandRecord[]
): BetSpot | null {
  for (let i = shoeHistory.length - 1; i >= 0; i--) {
    const outcome = shoeHistory[i].outcome
    if (outcome === 'tie') continue
    return mode === 'follow' ? outcome : outcome === 'player' ? 'banker' : 'player'
  }
  return null
}

function countLossStreak(spot: BetSpot, shoeHistory: SimHandRecord[]): number {
  let streak = 0
  for (let i = shoeHistory.length - 1; i >= 0; i--) {
    const outcome = shoeHistory[i].outcome
    if (outcome === 'tie') continue
    if (outcome === spot) break
    streak += 1
  }
  return streak
}

function countDynamicLossStreak(mode: 'follow' | 'counter', shoeHistory: SimHandRecord[]): number {
  const decisive = shoeHistory.map((r) => r.outcome).filter((o) => o !== 'tie')
  let streak = 0
  for (let i = decisive.length - 1; i >= 1; i--) {
    const predicted = mode === 'follow' ? decisive[i - 1] : decisive[i - 1] === 'player' ? 'banker' : 'player'
    if (decisive[i] === predicted) break
    streak += 1
  }
  return streak
}

export function labouchere(
  spotMode: LabouchereSpotMode,
  sequence: number[],
  unit: number,
  skipAfter?: number
): Strategy {
  if (spotMode === 'tie') {
    throw new Error(
      `Labouchere requires spot to be 'player', 'banker', 'follow', or 'counter', got 'tie'`
    )
  }
  if (sequence.length === 0) {
    throw new Error('Labouchere requires a non-empty starting sequence')
  }
  if (sequence.some((n) => n <= 0)) {
    throw new Error('Labouchere sequence entries must all be positive')
  }
  if (unit <= 0) {
    throw new Error(`Labouchere requires a positive unit, got ${unit}`)
  }
  if (skipAfter !== undefined) {
    if (!Number.isInteger(skipAfter) || skipAfter <= 0) {
      throw new Error(`Skip-after must be a positive integer, got ${skipAfter}`)
    }
  }

  const initialSequence = [...sequence]

  return (context) => {
    const spot =
      spotMode === 'player' || spotMode === 'banker'
        ? spotMode
        : resolveDynamicSpot(spotMode, context.shoeHistory)

    let current = deriveLabouchereSequence(initialSequence, unit, context.sessionHistory)
    if (current.length === 0) {
      current = initialSequence
    }

    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    if (spot === null) {
      return bets
    }

    if (skipAfter !== undefined) {
      const streak =
        spotMode === 'player' || spotMode === 'banker'
          ? countLossStreak(spot, context.shoeHistory)
          : countDynamicLossStreak(spotMode, context.shoeHistory)
      if (streak >= skipAfter) {
        return bets
      }
    }

    const units = current.length === 1 ? current[0] : current[0] + current[current.length - 1]
    const betAmount = Math.min(units * unit, TABLE_MAX_BET)
    bets[spot] = betAmount
    return bets
  }
}

export function computePeakSequenceNumber(
  initialSequence: number[],
  unit: number,
  history: SimHandRecord[]
): number {
  let peak = Math.max(...initialSequence)
  const seen: SimHandRecord[] = []
  for (const record of history) {
    seen.push(record)
    const remaining = deriveLabouchereSequence(initialSequence, unit, seen)
    if (remaining.length > 0) {
      peak = Math.max(peak, ...remaining)
    }
  }
  return peak
}
