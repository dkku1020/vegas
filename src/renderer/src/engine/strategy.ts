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

export function flatBet(spot: BetSpot, amount: number): Strategy {
  return () => {
    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    bets[spot] = amount
    return bets
  }
}

function deriveLabouchereSequence(
  initialSequence: number[],
  unit: number,
  spot: BetSpot,
  history: SimHandRecord[]
): number[] {
  let sequence = initialSequence
  for (const record of history) {
    const wager = record.bets[spot]
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

export function labouchere(spot: BetSpot, sequence: number[], unit: number): Strategy {
  if (spot === 'tie') {
    throw new Error(`Labouchere requires spot to be 'player' or 'banker', got 'tie'`)
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

  const initialSequence = [...sequence]

  return (context) => {
    let current = deriveLabouchereSequence(initialSequence, unit, spot, context.sessionHistory)
    if (current.length === 0) {
      current = initialSequence
    }

    const units = current.length === 1 ? current[0] : current[0] + current[current.length - 1]
    const betAmount = Math.min(units * unit, TABLE_MAX_BET)

    const bets: Bets = { player: 0, banker: 0, tie: 0 }
    bets[spot] = betAmount
    return bets
  }
}
