import type { Bets, BetSpot, Outcome } from '@shared/types'

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
